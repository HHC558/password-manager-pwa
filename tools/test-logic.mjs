// 功能逻辑自检：使用 Node 内置 WebCrypto 验证加密/存储/PDF 构建
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// localStorage 模拟
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; }
};

const require = createRequire(import.meta.url);
globalThis.XLSX = require(path.join(root, 'vendor', 'xlsx.full.min.js'));
const PwCrypto = require(path.join(root, 'js', 'crypto.js'));
const PwStorage = require(path.join(root, 'js', 'storage.js'));
const XlsxIO = require(path.join(root, 'js', 'xlsxio.js'));
const Importer = require(path.join(root, 'js', 'importer.js'));

let pass = 0, fail = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    pass++;
    console.log('  PASS  ' + name);
  }).catch((e) => {
    fail++;
    console.log('  FAIL  ' + name + '  -> ' + (e && e.message ? e.message : e));
  });
}

async function main() {
  console.log('== 功能逻辑自检 ==');
  PwStorage.setNamespace('pwv.test.');

  await check('首次设置创建加密保险库', async () => {
    await PwStorage.createVault('test123456', '我的小学名称？', '实验小学');
    if (!PwStorage.isInitialized()) throw new Error('未初始化');
  });

  await check('正确密码登录成功', async () => {
    const recs = await PwStorage.login('test123456');
    if (recs.length !== 0) throw new Error('初始记录应为空');
  });

  await check('错误密码被拒绝', async () => {
    let threw = false;
    try { await PwStorage.login('wrong-pass'); } catch (e) { threw = true; }
    if (!threw) throw new Error('错误密码不应登录成功');
  });

  await check('新增两条记录且自动生成创建时间', async () => {
    await PwStorage.addRecord({ platform: '微信', account: '13800138000', password: 'wxPass123', email: '' });
    await PwStorage.addRecord({ platform: 'QQ', account: '10001', password: 'qqPass456', email: 'me@qq.com' });
    const recs = PwStorage.getRecords();
    if (recs.length !== 2) throw new Error('应新增2条，实际 ' + recs.length);
    if (!recs[0].createdAt || !recs[0].updatedAt) throw new Error('应自动生成创建/更新时间');
    const wechat = recs.find((r) => r.platform === '微信');
    if (!wechat || wechat.email !== '') throw new Error('邮箱为空应保存为空字符串');
  });

  await check('邮箱格式校验', async () => {
    let threw = false;
    try { await PwStorage.addRecord({ platform: 'X', account: 'y', password: 'z', email: 'bad-email' }); } catch (e) { threw = true; }
    if (!threw) throw new Error('非法邮箱应报错');
  });

  await check('编辑记录生效', async () => {
    const first = PwStorage.getRecords()[0];
    await PwStorage.updateRecord(first.id, { platform: '微信', account: '13900139000', password: 'wxNew789', email: 'a@b.com' });
    const recs = PwStorage.getRecords();
    const hit = recs.find((r) => r.id === first.id);
    if (!hit || hit.account !== '13900139000' || hit.password !== 'wxNew789') throw new Error('编辑未生效');
    if (hit.createdAt !== first.createdAt) throw new Error('编辑不应改动创建时间');
  });

  await check('删除记录生效', async () => {
    const recs = PwStorage.getRecords();
    await PwStorage.deleteRecord(recs[0].id);
    if (PwStorage.getRecords().length !== 1) throw new Error('删除未生效');
  });

  await check('本地存储为密文（不含明文）', async () => {
    const raw = localStorage.getItem('pwv.test.data');
    if (!raw) throw new Error('数据未落盘');
    if (raw.includes('qqPass456') || raw.includes('微信')) throw new Error('本地出现明文');
  });

  await check('忘记密码：密保重置后数据仍在', async () => {
    await PwStorage.unlockWithAnswer('实验小学', 'newpass888');
    if (PwStorage.getRecords().length !== 1) throw new Error('重置后数据丢失');
    const l = await PwStorage.login('newpass888');
    if (l.length !== 1) throw new Error('新密码登录失败');
  });

  await check('修改登录密码', async () => {
    await PwStorage.changePassword('newpass888', 'final999');
    let threw = false;
    try { await PwStorage.login('newpass888'); } catch (e) { threw = true; }
    if (!threw) throw new Error('旧密码不应再能登录');
    await PwStorage.login('final999');
  });

  await check('修改密保问题/答案', async () => {
    await PwStorage.changeQuestion('final999', '我的宠物名字？', '旺财');
    const s = JSON.parse(localStorage.getItem('pwv.test.settings'));
    if (s.question !== '我的宠物名字？') throw new Error('密保问题未更新');
    await PwStorage.unlockWithAnswer('旺财', 'final9992');
    await PwStorage.login('final9992');
  });

  await check('导出/导入备份往返且仍为密文', async () => {
    const backup = PwStorage.exportBackup();
    PwStorage.wipeAll();
    const recs = await PwStorage.importBackup(backup, 'final9992');
    if (recs.length !== 1) throw new Error('导入后记录数不对');
    const raw = localStorage.getItem('pwv.test.data');
    if (raw.includes('qqPass456')) throw new Error('导入后本地出现明文');
  });

  await check('连续失败10次触发15分钟锁定', async () => {
    PwStorage.wipeAll();
    await PwStorage.createVault('test123456', 'q', 'a');
    for (let i = 0; i < 10; i++) {
      try { await PwStorage.login('badpass'); } catch (e) { /* 预期 */ }
    }
    if (!PwStorage.isLocked()) throw new Error('应已锁定');
    let threw = false;
    try { await PwStorage.login('test123456'); } catch (e) { threw = true; }
    if (!threw) throw new Error('锁定期内不应能登录');
    const s = JSON.parse(localStorage.getItem('pwv.test.settings'));
    s.lockUntil = 0; s.failedAttempts = 0;
    localStorage.setItem('pwv.test.settings', JSON.stringify(s));
  });

  await check('xlsx 导出/导入往返', async () => {
    const records = [
      { platform: '微信', account: '13800138000', password: 'wxPass123', email: 'me@qq.com', createdAt: Date.now() },
      { platform: 'QQ', account: '10001', password: 'qqPass456', email: '', createdAt: Date.now() }
    ];
    const bytes = XlsxIO.buildWorkbook(records);
    if (bytes.length < 500) throw new Error('xlsx过小');
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error('xlsx 非 ZIP 格式');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const rows = XlsxIO.parseWorkbook(ab);
    if (rows.length !== 2) throw new Error('解析行数不对: ' + rows.length);
    const r0 = rows[0];
    if (r0.platform !== '微信' || r0.account !== '13800138000' || r0.password !== 'wxPass123' || r0.email !== 'me@qq.com') {
      throw new Error('往返内容不一致: ' + JSON.stringify(r0));
    }
    writeFileSync(path.join(__dirname, 'sample.xlsx'), bytes);
    console.log('      sample.xlsx 大小: ' + bytes.length + ' 字节');
  });

  await check('导入差异：新增/修改/删除/无变化', async () => {
    const current = [
      { id: 'a', platform: '微信', account: '13800138000', password: 'wxPass123', email: 'me@qq.com', createdAt: 1 },
      { id: 'b', platform: 'QQ', account: '10001', password: 'qqPass456', email: '', createdAt: 2 }
    ];
    // 无变化：导入文件包含全部现有记录且内容一致
    const diff0 = Importer.computeDiff(
      [
        { platform: 'QQ', account: '10001', password: 'qqPass456', email: '', createdAt: 0 },
        { platform: '微信', account: '13800138000', password: 'wxPass123', email: 'me@qq.com', createdAt: 0 }
      ], current);
    if (diff0.unchanged !== 2 || (diff0.added.length + diff0.modified.length + diff0.deleted.length) !== 0) {
      throw new Error('无变化判定错误: ' + JSON.stringify(diff0));
    }
    // 导入文件缺少某条现有记录 -> 该记录应判删除
    const diffDel = Importer.computeDiff(
      [{ platform: '微信', account: '13800138000', password: 'wxPass123', email: 'me@qq.com', createdAt: 0 }], current);
    if (diffDel.deleted.length !== 1 || diffDel.deleted[0].id !== 'b') {
      throw new Error('删除判定错误: ' + JSON.stringify(diffDel));
    }
    const imported = [
      { platform: '微信', account: '13900000000', password: 'wxPass123', email: 'me@qq.com', createdAt: 0 },
      { platform: '支付宝', account: '13800000000', password: 'zfbPass', email: '', createdAt: 0 }
    ];
    const diff = Importer.computeDiff(imported, current);
    if (diff.added.length !== 1 || diff.added[0].platform !== '支付宝') throw new Error('新增判定错误');
    if (diff.modified.length !== 1 || diff.modified[0].id !== 'a') throw new Error('修改判定错误');
    if (diff.deleted.length !== 1 || diff.deleted[0].id !== 'b') throw new Error('删除判定错误');
    if (diff.unchanged !== 0) throw new Error('无变化计数错误');

    // 应用到真实会话
    PwStorage.wipeAll();
    await PwStorage.createVault('test123456', 'q', 'a');
    await PwStorage.login('test123456');
    await PwStorage.addRecord({ platform: '微信', account: '13800138000', password: 'wxPass123', email: 'me@qq.com' });
    await PwStorage.addRecord({ platform: 'QQ', account: '10001', password: 'qqPass456', email: '' });
    const diff2 = Importer.computeDiff(imported, PwStorage.getRecords());
    await PwStorage.applyImportDiff(diff2);
    const recs = PwStorage.getRecords();
    const byName = {};
    recs.forEach((r) => { byName[r.platform] = r; });
    if (!byName['支付宝']) throw new Error('新增未应用');
    if (!byName['微信'] || byName['微信'].account !== '13900000000') throw new Error('修改未应用');
    if (byName['QQ']) throw new Error('删除未应用');
  });

  localStorage.removeItem('pwv.test.settings');
  localStorage.removeItem('pwv.test.data');

  console.log('== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ==');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});