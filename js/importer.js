/* 导入差异模块：将导入的记录与 APP 内数据按"平台名称"对比，得出 新增/修改/删除/无变化 */
(function (global) {
  'use strict';

  /* 两条记录是否完全相同（平台/账号/密码/邮箱），用于判断"修改" */
  function sameRecord(a, b) {
    return a.platform === b.platform &&
      a.account === b.account &&
      a.password === b.password &&
      (a.email || '') === (b.email || '');
  }

  /*
   * importedRows:  [{platform, account, password, email, createdAt}]
   * currentRecords:[{id, platform, account, password, email, createdAt, updatedAt}]
   * 返回:
   *   { added: [{platform,account,password,email,createdAt}],
   *     modified: [{id, rec:{platform,account,password,email,createdAt}}],
   *     deleted:  [{id, rec}],
   *     unchanged: 无变化条数 }
   */
  function computeDiff(importedRows, currentRecords) {
    var added = [], modified = [], deleted = [], seen = {};
    var unchanged = 0;
    var byPlatform = {};
    (currentRecords || []).forEach(function (r) { byPlatform[r.platform] = r; });

    (importedRows || []).forEach(function (row) {
      var platform = row.platform;
      if (platform == null || platform === '') return;
      if (seen[platform]) return; // 重复平台只取第一条
      seen[platform] = true;
      var cur = byPlatform[platform];
      var rec = {
        platform: platform,
        account: row.account,
        password: row.password,
        email: row.email || '',
        createdAt: row.createdAt || 0
      };
      if (!cur) {
        added.push(rec);
      } else if (sameRecord(cur, rec)) {
        unchanged++;
      } else {
        modified.push({ id: cur.id, rec: rec });
      }
    });

    (currentRecords || []).forEach(function (r) {
      if (!seen[r.platform]) deleted.push({ id: r.id, rec: r });
    });

    return { added: added, modified: modified, deleted: deleted, unchanged: unchanged };
  }

  /* 计算某字段是否有变化（用于预览展示 旧 -> 新） */
  function changedFields(cur, rec) {
    var out = [];
    if (cur.account !== rec.account) out.push('账号');
    if (cur.password !== rec.password) out.push('密码');
    if ((cur.email || '') !== (rec.email || '')) out.push('邮箱');
    return out;
  }

  global.Importer = { computeDiff: computeDiff, sameRecord: sameRecord, changedFields: changedFields };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Importer;
})(typeof window !== 'undefined' ? window : globalThis);