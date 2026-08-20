/* xlsx 模块：基于内置 SheetJS 的 .xlsx 导入导出（中文表头：平台名称/账号/密码/邮箱/创建时间） */
(function (global) {
  'use strict';

  var HEADERS = ['平台名称', '账号', '密码', '邮箱', '创建时间'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function parseTimeText(s) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/.exec(String(s || '').trim());
    if (!m) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  }

  function getXLSX() {
    if (typeof XLSX !== 'undefined') return XLSX;
    throw new Error('xlsx 引擎未加载');
  }

  function toBytes(out) {
    if (out instanceof ArrayBuffer) return new Uint8Array(out);
    if (Array.isArray(out)) return Uint8Array.from(out);
    if (out && out.buffer instanceof ArrayBuffer && typeof out.byteLength === 'number') return new Uint8Array(out);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(out)) return new Uint8Array(out);
    throw new Error('xlsx 输出格式异常');
  }

  /* 把单元格值规整为字符串 */
  function cellText(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  /* 解析"创建时间"单元格：Date / Excel 序列号 / 'YYYY-MM-DD HH:mm' 文本 */
  function parseCreatedAt(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      // Excel 日期序列号（自 1899-12-30）
      return Math.round((v - 25569) * 86400 * 1000);
    }
    return parseTimeText(cellText(v));
  }

  /* 解析 xlsx（ArrayBuffer）-> [{platform, account, password, email, createdAt}] */
  function parseWorkbook(arrayBuffer) {
    var XLSXLib = getXLSX();
    var wb;
    try {
      wb = XLSXLib.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
    } catch (e) {
      throw new Error('无法解析文件，请确认是有效的 .xlsx 文件');
    }
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error('文件中没有工作表');
    var ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('文件中没有工作表');
    var rows;
    try {
      rows = XLSXLib.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    } catch (e) {
      throw new Error('读取工作表失败');
    }
    if (!rows || rows.length < 2) throw new Error('文件中没有数据（至少需要表头和一行数据）');

    // 匹配表头列
    var header = rows[0].map(function (h) { return cellText(h).trim(); });
    var idx = {};
    header.forEach(function (h, i) { if (h) idx[h] = i; });
    var colPlatform = idx['平台名称'], colAccount = idx['账号'], colPassword = idx['密码'];
    var colEmail = idx['邮箱'], colCreated = idx['创建时间'];
    if (colPlatform === undefined || colAccount === undefined || colPassword === undefined) {
      throw new Error('表头缺少必需列：平台名称 / 账号 / 密码（可用：平台名称、账号、密码、邮箱、创建时间）');
    }

    var result = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var platform = cellText(r[colPlatform]).trim();
      var account = cellText(r[colAccount]).trim();
      var password = cellText(r[colPassword]);
      var email = colEmail !== undefined ? cellText(r[colEmail]).trim() : '';
      var createdAt = colCreated !== undefined ? parseCreatedAt(r[colCreated]) : 0;
      if (!platform && !account && !password && !email) continue; // 跳过空行
      if (!platform) throw new Error('第 ' + (i + 1) + ' 行：平台名称不能为空');
      if (!account) throw new Error('第 ' + (i + 1) + ' 行：账号不能为空');
      if (!password) throw new Error('第 ' + (i + 1) + ' 行：密码不能为空');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('第 ' + (i + 1) + ' 行：邮箱格式不正确');
      }
      result.push({ platform: platform, account: account, password: password, email: email, createdAt: createdAt });
    }
    return result;
  }

  /* 生成 xlsx（记录数组）-> Uint8Array */
  function buildWorkbook(records) {
    var XLSXLib = getXLSX();
    var data = [HEADERS.slice()];
    (records || []).forEach(function (r) {
      data.push([r.platform, r.account, r.password, r.email || '', formatTime(r.createdAt)]);
    });
    var ws = XLSXLib.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 26 }, { wch: 28 }, { wch: 18 }];
    var wb = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wb, ws, '账号密码');
    var out = XLSXLib.write(wb, { bookType: 'xlsx', type: 'array' });
    return toBytes(out);
  }

  global.XlsxIO = {
    HEADERS: HEADERS,
    formatTime: formatTime,
    parseWorkbook: parseWorkbook,
    buildWorkbook: buildWorkbook
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.XlsxIO;
})(typeof window !== 'undefined' ? window : globalThis);