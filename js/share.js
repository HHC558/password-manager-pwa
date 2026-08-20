/* 分享模块：优先 Android 系统分享面板（可选微信/QQ），失败或不可用时回退为下载 */
(function (global) {
  'use strict';

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* 分享任意文件；返回 'shared' | 'cancelled' | 'downloaded' */
  function shareFile(blob, filename, mimeType) {
    var file;
    try {
      file = new File([blob], filename, { type: mimeType || 'application/octet-stream' });
    } catch (e) {
      downloadBlob(blob, filename);
      return Promise.resolve('downloaded');
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: filename, text: '密码备份' })
        .then(function () { return 'shared'; })
        .catch(function (e) {
          if (e && e.name === 'AbortError') return 'cancelled';
          // 分享不可用/被拒绝时回退为下载，确保用户仍能拿到文件
          try { downloadBlob(blob, filename); } catch (e2) { /* 忽略 */ }
          return 'downloaded';
        });
    }
    downloadBlob(blob, filename);
    return Promise.resolve('downloaded');
  }

  global.ShareHelper = { shareFile: shareFile, downloadBlob: downloadBlob };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ShareHelper;
})(typeof window !== 'undefined' ? window : globalThis);