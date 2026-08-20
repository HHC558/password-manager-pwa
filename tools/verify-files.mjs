// 静态校验：JS 语法、HTML 引用、manifest 与 sw 资源存在性
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
let fail = 0;
const err = (m) => { fail++; console.log('  FAIL  ' + m); };
const ok = (m) => console.log('  OK    ' + m);

console.log('== 静态校验 ==');

// 1. JS 语法
const jsFiles = ['crypto.js', 'storage.js', 'xlsxio.js', 'importer.js', 'share.js', 'selftest.js', 'app.js'];
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', path.join(root, 'js', f)], { stdio: 'pipe' }); ok('语法 ' + f); }
  catch (e) { err('语法 ' + f + ' -> ' + e.stderr); }
}

// 2. manifest 合法性
try {
  const m = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!m.name || !m.start_url) throw new Error('缺少 name/start_url');
  for (const ic of m.icons || []) {
    const p = path.join(root, ic.src.replace(/^\.\//, ''));
    if (!existsSync(p)) throw new Error('图标不存在: ' + ic.src);
  }
  ok('manifest.json 合法，图标存在');
} catch (e) { err('manifest.json -> ' + e.message); }

// 3. index.html 引用完整性
try {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = [];
  const reSrc = /(?:src|href)="\.\/([^"]+)"/g;
  let m;
  while ((m = reSrc.exec(html))) refs.push(m[1]);
  for (const r of refs) {
    if (!existsSync(path.join(root, r))) err('index.html 引用缺失: ' + r);
  }
  ok('index.html 引用的 ' + refs.length + ' 个资源均存在');
} catch (e) { err('index.html -> ' + e.message); }

// 4. sw.js 资源列表
try {
  const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
  const list = sw.match(/var ASSETS = \[([\s\S]*?)\];/)[1];
  const items = [...list.matchAll(/'\.\/([^']+)'/g)].map((x) => x[1]);
  for (const it of items) {
    if (!existsSync(path.join(root, it))) err('sw.js 资源缺失: ' + it);
  }
  ok('sw.js 预缓存 ' + items.length + ' 个资源均存在');
} catch (e) { err('sw.js -> ' + e.message); }

console.log(fail === 0 ? '== 静态校验全部通过 ==' : '== 静态校验有 ' + fail + ' 项失败 ==');
process.exit(fail === 0 ? 0 : 1);