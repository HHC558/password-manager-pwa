/* 安装引导：捕获 Chrome beforeinstallprompt 提供一键安装；不支持时给出分步引导 */
(function (global) {
  'use strict';

  var deferredPrompt = null;
  var installed = false;

  function $(id) { return document.getElementById(id); }

  function showToast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function canInstall() { return !!deferredPrompt; }

  function closeModal() {
    var mask = $('modal-mask');
    if (!mask) return;
    mask.hidden = true;
    var ok = $('modal-ok'), cancel = $('modal-cancel');
    if (ok) ok.onclick = null;
    if (cancel) cancel.onclick = null;
  }

  /* 手动安装引导（Android Chrome / iPhone Safari 两条路径） */
  function showGuide() {
    var body = $('modal-body');
    var title = $('modal-title');
    var ok = $('modal-ok');
    var cancel = $('modal-cancel');
    if (!body || !title || !ok || !cancel) return;
    body.innerHTML = '';
    title.textContent = '安装到手机';
    var p = document.createElement('p');
    p.className = 'modal-msg';
    p.textContent = '把「密码管家」添加到手机桌面，之后断网也能用：';
    body.appendChild(p);
    var addSection = function (heading, steps) {
      var h = document.createElement('p');
      h.className = 'install-guide-title';
      h.textContent = heading;
      body.appendChild(h);
      var ul = document.createElement('ul');
      ul.className = 'install-guide';
      steps.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s;
        ul.appendChild(li);
      });
      body.appendChild(ul);
    };
    addSection('📱 Android（Chrome 浏览器）', [
      '请用系统 Chrome 打开本页面；微信/QQ 里打开时先点右上角"在浏览器打开"',
      '点浏览器右上角 ⋮ 菜单',
      '选择「安装应用」或「添加到主屏幕」',
      '桌面出现「密码管家」图标即完成'
    ]);
    addSection('🍎 iPhone（Safari 浏览器）', [
      '请用 Safari 打开本页面',
      '点底部「分享」按钮（方框 + 向上箭头）',
      '选择「添加到主屏幕」→「添加」',
      '桌面出现「密码管家」图标即完成'
    ]);
    $('modal-mask').hidden = false;
    ok.textContent = '知道了';
    ok.className = 'btn primary';
    cancel.style.display = 'none';
    ok.onclick = closeModal;
    cancel.onclick = closeModal;
  }

  function updateInstallEntry() {
    var mi = $('mi-install');
    if (!mi) return;
    if (installed) { mi.style.display = 'none'; return; }
    mi.style.display = '';
    var sub = mi.querySelector('.mi-sub');
    if (sub) sub.textContent = canInstall() ? '可一键安装' : '查看安装步骤';
  }

  function handleInstallClick() {
    if (deferredPrompt) {
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      p.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          installed = true;
          updateInstallEntry();
          showToast('正在安装到桌面…');
        }
      }).catch(function () { /* 忽略 */ });
      return;
    }
    showGuide();
  }

  function init() {
    var mi = $('mi-install');
    if (mi) mi.addEventListener('click', handleInstallClick);
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      updateInstallEntry();
    });
    window.addEventListener('appinstalled', function () {
      installed = true;
      updateInstallEntry();
      showToast('已安装到桌面，可离线使用');
    });
    setTimeout(updateInstallEntry, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.InstallHelper = { showGuide: showGuide, canInstall: canInstall };
})(typeof window !== 'undefined' ? window : globalThis);
