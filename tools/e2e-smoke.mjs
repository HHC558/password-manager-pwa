// 端到端冒烟测试：用本机 Edge + Playwright 跑完整用户流程
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/14941/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
globalThis.XLSX = require(path.join(root, 'vendor', 'xlsx.full.min.js'));
const XlsxIO = require(path.join(root, 'js', 'xlsxio.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = urlPath === '/' ? '/index.html' : urlPath;
  const abs = path.join(root, file);
  if (!abs.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  });
});

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  ->  ' + extra : '')); }
}

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
});
const page = await browser.newPage({ acceptDownloads: true });
// headless 下强制走下载回退路径，真机上将调起系统分享面板（微信/QQ）
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
});
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });

try {
  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);

  check('首次打开显示"首次设置"页', await page.locator('#view-setup.active').count() === 1);

  await page.fill('#setup-password', 'test123456');
  await page.fill('#setup-password2', 'test123456');
  await page.fill('#setup-question', '我的小学名称？');
  await page.fill('#setup-answer', '实验小学');
  await page.click('#btn-setup');
  await page.waitForTimeout(700);
  check('设置后进入列表页', await page.locator('#view-list.active').count() === 1);

  await page.click('#btn-add');
  await page.waitForTimeout(200);
  check('进入新增页', await page.locator('#view-edit.active').count() === 1);
  await page.fill('#edit-platform', '微信');
  await page.fill('#edit-account', '13800138000');
  await page.fill('#edit-password', 'wxPass123');
  await page.fill('#edit-email', 'me@qq.com');
  await page.click('#btn-save');
  await page.waitForTimeout(500);
  check('列表出现记录卡片', await page.locator('.record-card').count() === 1);

  const masked = await page.locator('.rc-password').first().textContent();
  check('密码默认隐藏为圆点', masked.includes('••••'), JSON.stringify(masked));

  await page.locator('.record-card .rc-row .icon-btn').first().click();
  await page.waitForTimeout(200);
  const shown = await page.locator('.rc-password').first().textContent();
  check('点击眼睛显示密码', shown === 'wxPass123', JSON.stringify(shown));

  const dlPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#btn-share');
  const dl = await dlPromise;
  const dlPath = await dl.path();
  const dlSize = fs.statSync(dlPath).size;
  const dlHead = fs.readFileSync(dlPath).subarray(0, 2).toString('latin1');
  check('分享按钮生成并下载xlsx', dlSize > 500 && dl.suggestedFilename().endsWith('.xlsx') && dlHead === 'PK', dl.suggestedFilename() + ' ' + dlSize + 'B ' + dlHead);

  await page.locator('.record-card .rc-actions .btn').first().click();
  await page.waitForTimeout(300);
  check('进入编辑页', await page.locator('#view-edit.active').count() === 1);
  check('编辑页显示只读创建时间', await page.locator('#edit-created-wrap:not([hidden])').count() === 1);
  await page.fill('#edit-account', '13900139000');
  await page.click('#btn-save');
  await page.waitForTimeout(500);
  const acc = await page.locator('.rc-value').first().textContent();
  check('编辑保存生效', acc === '13900139000', JSON.stringify(acc));

  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  check('进入设置页', await page.locator('#view-settings.active').count() === 1);
  await page.click('#mi-selftest');
  await page.waitForTimeout(200);
  await page.click('#btn-selftest-run');
  await page.waitForTimeout(6000);
  const summary = await page.locator('.st-summary').textContent();
  const sm = summary.match(/自检完成：(\d+)\/(\d+) 项通过/);
  check('运行自检11项全部通过', !!(sm && sm[1] === sm[2] && sm[1] === '11'), summary);

  await page.click('#btn-selftest-back');
  await page.waitForTimeout(200);
  await page.click('#mi-logout');
  await page.waitForTimeout(300);
  check('退出后回到登录页', await page.locator('#view-login.active').count() === 1);
  await page.fill('#login-password', 'test123456');
  await page.click('#btn-login');
  await page.waitForTimeout(500);
  check('重新登录成功回到列表', await page.locator('#view-list.active').count() === 1);
  check('登录后数据仍在', await page.locator('.record-card').count() === 1);

  // 备份导出 -> 删空 -> 备份导入恢复
  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  const jsonDlPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#mi-export');
  const jsonDl = await jsonDlPromise;
  const jsonBytes = fs.readFileSync(await jsonDl.path());
  let parsedJson = null;
  try { parsedJson = JSON.parse(jsonBytes.toString()); } catch (e) { /* 无效JSON */ }
  check('导出加密备份JSON', jsonBytes.length > 200 && parsedJson && parsedJson.app === 'pwvault', jsonDl.suggestedFilename());

  await page.click('#btn-settings-back');
  await page.waitForTimeout(200);
  await page.locator('.record-card .rc-actions .btn').nth(1).click();
  await page.waitForTimeout(300);
  await page.click('#modal-ok');
  await page.waitForTimeout(400);
  check('删除记录后为空', await page.locator('#list-empty:not([hidden])').count() === 1);

  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  await page.click('#mi-import');
  await page.waitForTimeout(200);
  await page.setInputFiles('#file-import', { name: 'backup.json', mimeType: 'application/json', buffer: jsonBytes });
  await page.waitForTimeout(300);
  check('导入弹窗出现', await page.locator('#modal-mask:not([hidden])').count() === 1);
  await page.fill('#imp-pw', 'test123456');
  await page.click('#modal-ok');
  await page.waitForTimeout(600);
  check('导入后自动登录并恢复数据', await page.locator('#view-list.active').count() === 1 && await page.locator('.record-card').count() === 1);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  check('刷新后停在登录页（不自动登录）', await page.locator('#view-login.active').count() === 1);

  await page.click('#link-forgot');
  await page.waitForTimeout(200);
  const q = await page.locator('#forgot-question').textContent();
  check('忘记密码页显示密保问题', q === '我的小学名称？', JSON.stringify(q));
  await page.fill('#forgot-answer', '实验小学');
  await page.fill('#forgot-password', 'newpass888');
  await page.fill('#forgot-password2', 'newpass888');
  await page.click('#btn-forgot');
  await page.waitForTimeout(700);
  check('密保重置后自动登录进入列表', await page.locator('#view-list.active').count() === 1);
  check('重置后数据仍在', await page.locator('.record-card').count() === 1);

  await page.locator('.record-card .rc-actions .btn').nth(1).click();
  await page.waitForTimeout(300);
  check('删除二次确认弹窗出现', await page.locator('#modal-mask:not([hidden])').count() === 1);
  await page.click('#modal-ok');
  await page.waitForTimeout(500);
  check('删除后列表为空态', await page.locator('#list-empty:not([hidden])').count() === 1);
  // ===== xlsx 导入：差异预览 + 确认导入 =====
  await page.click('#btn-add');
  await page.waitForTimeout(200);
  await page.fill('#edit-platform', '微信');
  await page.fill('#edit-account', '13800138000');
  await page.fill('#edit-password', 'wxPass123');
  await page.click('#btn-save');
  await page.waitForTimeout(400);
  await page.click('#btn-add');
  await page.waitForTimeout(200);
  await page.fill('#edit-platform', 'QQ');
  await page.fill('#edit-account', '10001');
  await page.fill('#edit-password', 'qqPass456');
  await page.click('#btn-save');
  await page.waitForTimeout(400);
  check('导入前有2条记录', await page.locator('.record-card').count() === 2);

  const importBytes = XlsxIO.buildWorkbook([
    { platform: '微信', account: '15000000000', password: 'wxNew', email: 'me@qq.com', createdAt: Date.now() },
    { platform: '支付宝', account: '13800000000', password: 'zfbPass', email: '', createdAt: Date.now() }
  ]);
  await page.click('#btn-xlsx-import');
  await page.waitForTimeout(200);
  await page.setInputFiles('#file-xlsx', { name: 'import.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(importBytes) });
  await page.waitForTimeout(700);
  check('进入导入预览页', await page.locator('#view-import.active').count() === 1);
  check('预览显示蓝绿红图例', await page.locator('.legend .chip.blue').count() === 1 && await page.locator('.legend .chip.green').count() === 1 && await page.locator('.legend .chip.red').count() === 1);
  const sum = await page.locator('#import-summary').textContent();
  check('预览汇总：新增1/修改1/删除1', sum.includes('新增 1 条') && sum.includes('修改 1 条') && sum.includes('删除 1 条'), sum);
  check('预览卡片按蓝/绿/红分类', await page.locator('.ip-card.add').count() === 1 && await page.locator('.ip-card.mod').count() === 1 && await page.locator('.ip-card.del').count() === 1);
  check('删除卡片有删除标记', await page.locator('.ip-card.del .ip-row.del-line').count() >= 2);

  await page.click('#btn-import-confirm');
  await page.waitForTimeout(600);
  check('确认后回到列表', await page.locator('#view-list.active').count() === 1);
  const recNames = await page.evaluate(() => Array.from(document.querySelectorAll('.rc-platform')).map((e) => e.textContent));
  check('确认导入生效：支付宝新增/微信修改/QQ删除',
    recNames.includes('支付宝') && recNames.includes('微信') && !recNames.includes('QQ'), recNames.join(','));

  // ===== xlsx 导入：取消导入 =====
  const cancelBytes = XlsxIO.buildWorkbook([
    { platform: '微博', account: 'weibo1', password: 'wbPass', email: '', createdAt: Date.now() }
  ]);
  await page.click('#btn-xlsx-import');
  await page.waitForTimeout(200);
  await page.setInputFiles('#file-xlsx', { name: 'cancel.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(cancelBytes) });
  await page.waitForTimeout(700);
  check('再次进入导入预览页', await page.locator('#view-import.active').count() === 1);
  await page.click('#btn-import-cancel');
  await page.waitForTimeout(400);
  check('取消后回到列表且数据不变', await page.locator('#view-list.active').count() === 1 && await page.locator('.record-card').count() === 2);
  const namesAfterCancel = await page.evaluate(() => Array.from(document.querySelectorAll('.rc-platform')).map((e) => e.textContent));
  check('取消后未添加微博', !namesAfterCancel.includes('微博'), namesAfterCancel.join(','));

} catch (e) {
  fail++;
  console.log('  FAIL  异常中断: ' + e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('== E2E 结果：' + pass + ' 通过 / ' + fail + ' 失败 ==');
process.exit(fail === 0 ? 0 : 1);