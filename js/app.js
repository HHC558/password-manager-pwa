/* 主应用：视图切换、事件绑定与交互逻辑 */
(function (global) {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  var showState = {};   // 记录id -> 密码是否显示
  var editingId = null;
  var editPwVisible = false;

  /* ---------- 工具 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function dateStamp() {
    var d = new Date();
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function showView(id) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
    var el = document.getElementById('view-' + id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  var toastTimer = null;
  function showToast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- 弹窗 ---------- */
  function showModal(opts) {
    return new Promise(function (resolve) {
      var mask = $('#modal-mask');
      var body = $('#modal-body');
      $('#modal-title').textContent = opts.title || '';
      body.innerHTML = '';
      if (opts.message) {
        var p = document.createElement('p');
        p.className = 'modal-msg';
        p.textContent = opts.message;
        body.appendChild(p);
      }
      (opts.fields || []).forEach(function (f) {
        var wrap = document.createElement('div');
        wrap.className = 'field';
        if (f.label) {
          var label = document.createElement('label');
          label.textContent = f.label;
          wrap.appendChild(label);
        }
        var input = document.createElement('input');
        input.type = f.type || 'text';
        input.placeholder = f.placeholder || '';
        input.id = f.id;
        input.autocomplete = 'off';
        wrap.appendChild(input);
        body.appendChild(wrap);
      });
      var okBtn = $('#modal-ok');
      okBtn.textContent = opts.okText || '确定';
      okBtn.className = 'btn ' + (opts.danger ? 'danger' : 'primary');
      $('#modal-cancel').style.display = opts.showCancel === false ? 'none' : '';
      mask.hidden = false;
      var done = function (result) {
        mask.hidden = true;
        okBtn.onclick = null;
        $('#modal-cancel').onclick = null;
        resolve(result);
      };
      okBtn.onclick = function () {
        var values = {};
        (opts.fields || []).forEach(function (f) { values[f.id] = $('#' + f.id).value; });
        done({ ok: true, values: values });
      };
      $('#modal-cancel').onclick = function () { done({ ok: false }); };
    });
  }

  function confirmDialog(title, message, okText, danger) {
    return showModal({ title: title, message: message, okText: okText || '确定', danger: !!danger, showCancel: true })
      .then(function (r) { return !!r.ok; });
  }

  /* ---------- 导航 ---------- */
  function goLogin() {
    $('#login-password').value = '';
    showView('login');
  }
  function goSetup() {
    $('#setup-password').value = '';
    $('#setup-password2').value = '';
    $('#setup-question').value = '';
    $('#setup-answer').value = '';
    showView('setup');
  }
  function goForgot() {
    var settings = PwStorage.getSettings();
    $('#forgot-question').textContent = settings ? settings.question : '';
    $('#forgot-answer').value = '';
    $('#forgot-password').value = '';
    $('#forgot-password2').value = '';
    showView('forgot');
  }
  function openList() {
    showState = {};
    renderList();
    showView('list');
  }

  /* ---------- 记录列表 ---------- */
  function renderList() {
    var records = PwStorage.getRecords();
    var container = $('#record-list');
    var empty = $('#list-empty');
    container.innerHTML = '';
    if (!records || records.length === 0) {
      container.style.display = 'none';
      empty.hidden = false;
      return;
    }
    container.style.display = '';
    empty.hidden = true;
    records.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'record-card';

      var head = document.createElement('div');
      head.className = 'rc-head';
      var name = document.createElement('span');
      name.className = 'rc-platform';
      name.textContent = r.platform;
      var time = document.createElement('span');
      time.className = 'rc-time';
      time.textContent = formatTime(r.createdAt);
      head.appendChild(name);
      head.appendChild(time);
      card.appendChild(head);

      var shown = !!showState[r.id];
      var rows = [
        { label: '账号', value: r.account, cls: 'rc-value' },
        { label: '密码', value: shown ? r.password : '••••••••', cls: 'rc-password', special: 'password' }
      ];
      if (r.email) rows.push({ label: '邮箱', value: r.email, cls: 'rc-value' });

      rows.forEach(function (line) {
        var row = document.createElement('div');
        row.className = 'rc-row';
        var lbl = document.createElement('span');
        lbl.className = 'rc-label';
        lbl.textContent = line.label + '：';
        var val = document.createElement('span');
        val.className = line.cls;
        val.textContent = line.value;
        row.appendChild(lbl);
        row.appendChild(val);
        if (line.special === 'password') {
          var eye = document.createElement('button');
          eye.className = 'icon-btn small';
          eye.textContent = shown ? '🙈' : '👁';
          eye.title = shown ? '隐藏密码' : '显示密码';
          eye.addEventListener('click', function () {
            showState[r.id] = !showState[r.id];
            renderList();
          });
          row.appendChild(eye);
          if (shown) {
            var copy = document.createElement('button');
            copy.className = 'icon-btn small';
            copy.textContent = '📋';
            copy.title = '复制密码';
            copy.addEventListener('click', function () { copyText(r.password); });
            row.appendChild(copy);
          }
        }
        card.appendChild(row);
      });

      var actions = document.createElement('div');
      actions.className = 'rc-actions';
      var editBtn = document.createElement('button');
      editBtn.className = 'btn small ghost';
      editBtn.textContent = '✏️ 编辑';
      editBtn.addEventListener('click', function () { openEdit(r.id); });
      var delBtn = document.createElement('button');
      delBtn.className = 'btn small ghost danger-text';
      delBtn.textContent = '🗑 删除';
      delBtn.addEventListener('click', function () {
        confirmDialog('确认删除', '删除「' + r.platform + '」后不可恢复，确定删除吗？', '删除', true).then(function (ok) {
          if (!ok) return;
          PwStorage.deleteRecord(r.id).then(function () {
            showToast('已删除');
            renderList();
          }).catch(function (e) { showToast(e.message || '删除失败'); });
        });
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function copyText(text) {
    var done = function () { showToast('已复制'); };
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { showToast('复制失败'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- 编辑页 ---------- */
  function openEdit(id) {
    editingId = id || null;
    var r = id ? PwStorage.getRecord(id) : null;
    $('#edit-title').textContent = r ? '编辑记录' : '新增记录';
    $('#edit-platform').value = r ? r.platform : '';
    $('#edit-account').value = r ? r.account : '';
    $('#edit-password').value = r ? r.password : '';
    $('#edit-email').value = r ? (r.email || '') : '';
    $('#edit-created').value = r ? formatTime(r.createdAt) : '';
    $('#edit-created-wrap').hidden = !r;
    $('#btn-edit-delete').classList.toggle('hidden', !r);
    editPwVisible = false;
    $('#edit-password').type = 'password';
    $('#btn-edit-toggle').textContent = '👁';
    showView('edit');
  }

  function handleSave() {
    var fields = {
      platform: $('#edit-platform').value,
      account: $('#edit-account').value,
      password: $('#edit-password').value,
      email: $('#edit-email').value
    };
    var p = editingId ? PwStorage.updateRecord(editingId, fields) : PwStorage.addRecord(fields);
    p.then(function () {
      showToast(editingId ? '已保存' : '已添加');
      openList();
    }).catch(function (e) { showToast(e.message || '保存失败'); });
  }

  function toggleEditPw() {
    editPwVisible = !editPwVisible;
    $('#edit-password').type = editPwVisible ? 'text' : 'password';
    $('#btn-edit-toggle').textContent = editPwVisible ? '🙈' : '👁';
  }

  function handleEditDelete() {
    if (!editingId) return;
    var rec = PwStorage.getRecord(editingId);
    confirmDialog('确认删除', '删除「' + (rec ? rec.platform : '该记录') + '」后不可恢复，确定删除吗？', '删除', true).then(function (ok) {
      if (!ok) return;
      PwStorage.deleteRecord(editingId).then(function () {
        showToast('已删除');
        openList();
      }).catch(function (e) { showToast(e.message || '删除失败'); });
    });
  }

  /* ---------- 登录 / 设置 / 找回 ---------- */
  function handleSetup() {
    var pw = $('#setup-password').value;
    var pw2 = $('#setup-password2').value;
    var q = $('#setup-question').value;
    var a = $('#setup-answer').value;
    if (pw !== pw2) return showToast('两次输入的密码不一致');
    PwStorage.createVault(pw, q, a).then(function () {
      return PwStorage.login(pw);
    }).then(function () {
      showToast('设置成功');
      openList();
    }).catch(function (e) { showToast(e.message || '设置失败'); });
  }

  function handleLogin() {
    var pw = $('#login-password').value;
    if (!pw) return showToast('请输入登录密码');
    PwStorage.login(pw).then(function () {
      $('#login-password').value = '';
      openList();
    }).catch(function (e) {
      if (e.message === 'NEED_SETUP') { goSetup(); return; }
      showToast(e.message || '登录失败');
    });
  }

  function handleForgot() {
    var a = $('#forgot-answer').value;
    var pw = $('#forgot-password').value;
    var pw2 = $('#forgot-password2').value;
    if (pw !== pw2) return showToast('两次输入的新密码不一致');
    PwStorage.unlockWithAnswer(a, pw).then(function () {
      showToast('密码已重置，已自动登录');
      openList();
    }).catch(function (e) { showToast(e.message || '重置失败'); });
  }

  /* ---------- 分享 PDF ---------- */
  function handleShare() {
    var records = PwStorage.getRecords();
    if (!records || records.length === 0) return showToast('暂无记录可导出');
    showToast('正在生成xlsx…');
    var bytes = XlsxIO.buildWorkbook(records);
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var name = '账号密码备份_' + dateStamp() + '.xlsx';
    ShareHelper.shareFile(blob, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').then(function (r) {
      if (r === 'downloaded') showToast('xlsx已保存，请在文件管理中分享给好友');
    }).catch(function (e) {
      console.error(e);
      showToast('导出失败：' + (e.message || '未知错误'));
    });
  }

  /* ---------- 备份 / 恢复 ---------- */
  function handleExport() {
    try {
      var json = PwStorage.exportBackup();
      var blob = new Blob([json], { type: 'application/json' });
      ShareHelper.downloadBlob(blob, '密码管家备份_' + dateStamp() + '.json');
      showToast('备份已导出');
    } catch (e) {
      showToast(e.message || '导出失败');
    }
  }

  function requestImport() {
    var f = $('#file-import');
    f.value = '';
    f.click();
  }

  function handleImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      showModal({
        title: '导入备份',
        message: '请输入该备份的登录密码以验证并恢复数据。导入将覆盖当前数据。',
        fields: [{ id: 'imp-pw', label: '登录密码', type: 'password', placeholder: '备份的登录密码' }],
        okText: '导入'
      }).then(function (r) {
        if (!r.ok) return;
        PwStorage.importBackup(reader.result, r.values['imp-pw']).then(function () {
          showToast('导入成功');
          openList();
        }).catch(function (err) { showToast(err.message || '导入失败'); });
      });
    };
    reader.onerror = function () { showToast('读取文件失败'); };
    reader.readAsText(file);
  }

  /* ---------- xlsx 导入（差异预览） ---------- */
  var importDiff = null;

  function requestXlsxImport() {
    var f = $('#file-xlsx');
    f.value = '';
    f.click();
  }

  function handleXlsxFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var rows;
      try {
        rows = XlsxIO.parseWorkbook(reader.result);
      } catch (err) {
        showToast(err.message || '文件解析失败');
        return;
      }
      var diff = Importer.computeDiff(rows, PwStorage.getRecords());
      if (diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0) {
        showToast('文件与当前数据一致，没有需要导入的变化');
        return;
      }
      importDiff = diff;
      renderImportPreview(diff);
      showView('import');
    };
    reader.onerror = function () { showToast('读取文件失败'); };
    reader.readAsArrayBuffer(file);
  }

  function renderImportPreview(diff) {
    var summary = $('#import-summary');
    summary.textContent = '新增 ' + diff.added.length + ' 条 · 修改 ' + diff.modified.length +
      ' 条 · 删除 ' + diff.deleted.length + ' 条 · 无变化 ' + diff.unchanged + ' 条';
    var box = $('#import-preview-list');
    box.innerHTML = '';
    if (diff.added.length + diff.modified.length + diff.deleted.length === 0) {
      box.innerHTML = '<p class="st-hint">没有需要导入的变化。</p>';
      return;
    }

    diff.added.forEach(function (rec) { box.appendChild(buildIpCard('add', '新增', rec.platform, null, rec)); });
    diff.modified.forEach(function (m) {
      var cur = PwStorage.getRecord(m.id);
      box.appendChild(buildIpCard('mod', '修改', m.rec.platform, cur, m.rec));
    });
    diff.deleted.forEach(function (d) { box.appendChild(buildIpCard('del', '删除', d.rec.platform, d.rec, null)); });
  }

  function buildIpCard(kind, tag, platform, oldRec, newRec) {
    var card = document.createElement('div');
    card.className = 'ip-card ' + kind;
    var head = document.createElement('div');
    head.className = 'ip-head';
    var name = document.createElement('span');
    name.className = 'ip-platform';
    name.textContent = platform;
    var t = document.createElement('span');
    t.className = 'ip-tag';
    t.textContent = tag;
    head.appendChild(name);
    head.appendChild(t);
    card.appendChild(head);

    if (kind === 'del' && oldRec) {
      addIpRow(card, '账号', oldRec.account, 'del-line');
      addIpRow(card, '密码', oldRec.password, 'del-line');
      addIpRow(card, '邮箱', oldRec.email || '', 'del-line');
    } else if (kind === 'add' && newRec) {
      addIpRow(card, '账号', newRec.account, '');
      addIpRow(card, '密码', newRec.password, '');
      addIpRow(card, '邮箱', newRec.email || '', '');
    } else if (kind === 'mod' && oldRec && newRec) {
      addIpRow(card, '账号', newRec.account, '', oldRec.account, oldRec.account !== newRec.account);
      addIpRow(card, '密码', newRec.password, '', oldRec.password, oldRec.password !== newRec.password);
      addIpRow(card, '邮箱', newRec.email || '', '', oldRec.email || '', (oldRec.email || '') !== (newRec.email || ''));
    }
    return card;
  }

  function addIpRow(card, label, value, cls, oldValue, changed) {
    var row = document.createElement('div');
    row.className = 'ip-row ' + cls;
    var lbl = document.createElement('span');
    lbl.className = 'ip-label';
    lbl.textContent = label + '：';
    row.appendChild(lbl);
    if (oldValue !== undefined && changed) {
      var oldSpan = document.createElement('span');
      oldSpan.className = 'ip-old';
      oldSpan.textContent = oldValue;
      var arrow = document.createElement('span');
      arrow.className = 'ip-arrow';
      arrow.textContent = '→';
      var newSpan = document.createElement('span');
      newSpan.className = 'ip-change';
      newSpan.textContent = value;
      row.appendChild(oldSpan);
      row.appendChild(arrow);
      row.appendChild(newSpan);
    } else {
      row.appendChild(document.createTextNode(value));
    }
    card.appendChild(row);
  }

  function handleImportConfirm() {
    if (!importDiff) return;
    var diff = importDiff;
    importDiff = null;
    PwStorage.applyImportDiff(diff).then(function () {
      showToast('导入完成');
      openList();
    }).catch(function (e) { showToast(e.message || '导入失败'); });
  }

  function handleImportCancel() {
    importDiff = null;
    showView('list');
  }
  /* ---------- 设置页 ---------- */
  function handleChangePassword() {
    showModal({
      title: '修改登录密码',
      fields: [
        { id: 'cp-old', label: '当前密码', type: 'password' },
        { id: 'cp-new', label: '新密码（至少6位）', type: 'password' },
        { id: 'cp-new2', label: '确认新密码', type: 'password' }
      ],
      okText: '保存'
    }).then(function (r) {
      if (!r.ok) return;
      var v = r.values;
      if (v['cp-new'] !== v['cp-new2']) return showToast('两次输入的新密码不一致');
      PwStorage.changePassword(v['cp-old'], v['cp-new']).then(function () {
        showToast('密码已修改');
      }).catch(function (e) { showToast(e.message || '修改失败'); });
    });
  }

  function handleChangeQuestion() {
    showModal({
      title: '修改密保问题',
      fields: [
        { id: 'cq-pw', label: '登录密码', type: 'password' },
        { id: 'cq-q', label: '新密保问题' },
        { id: 'cq-a', label: '新密保答案', type: 'password' }
      ],
      okText: '保存'
    }).then(function (r) {
      if (!r.ok) return;
      var v = r.values;
      PwStorage.changeQuestion(v['cq-pw'], v['cq-q'], v['cq-a']).then(function () {
        showToast('密保问题已修改');
      }).catch(function (e) { showToast(e.message || '修改失败'); });
    });
  }

  function handleWipe() {
    confirmDialog('清空所有数据', '将删除本机保存的所有账号密码记录与设置，且不可恢复。确定继续吗？', '清空', true).then(function (ok) {
      if (!ok) return;
      PwStorage.wipeAll();
      showToast('已清空');
      goLogin();
    });
  }

  function handleLogout() {
    PwStorage.lock();
    showToast('已退出登录');
    goLogin();
  }

  /* ---------- 自检 ---------- */
  function openSelfTest() {
    $('#selftest-result').innerHTML = '';
    showView('selftest');
  }

  function handleSelfTest() {
    var box = $('#selftest-result');
    box.innerHTML = '<div class="st-running">正在自检，请稍候…</div>';
    SelfTest.run().then(function (results) {
      box.innerHTML = '';
      var pass = 0;
      results.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'st-item ' + (r.ok ? 'ok' : 'fail');
        row.textContent = (r.ok ? '✅ ' : '❌ ') + r.name + (r.ok ? '' : ' — ' + (r.err || '失败'));
        box.appendChild(row);
        if (r.ok) pass++;
      });
      var summary = document.createElement('div');
      summary.className = 'st-summary';
      summary.textContent = '自检完成：' + pass + '/' + results.length + ' 项通过';
      box.appendChild(summary);
      if (!PwStorage.isLoggedIn()) goLogin();
    }).catch(function (e) {
      box.innerHTML = '<div class="st-item fail">自检异常：' + (e.message || e) + '</div>';
    });
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('#btn-setup').addEventListener('click', handleSetup);
    $('#link-setup-import').addEventListener('click', requestImport);
    $('#btn-login').addEventListener('click', handleLogin);
    $('#login-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') handleLogin(); });
    $('#link-forgot').addEventListener('click', goForgot);
    $('#link-login-import').addEventListener('click', requestImport);
    $('#btn-forgot').addEventListener('click', handleForgot);
    $('#link-back-login').addEventListener('click', goLogin);
    $('#btn-share').addEventListener('click', handleShare);
    $('#btn-xlsx-import').addEventListener('click', requestXlsxImport);
    $('#btn-settings').addEventListener('click', function () { showView('settings'); });
    $('#btn-add').addEventListener('click', function () { openEdit(null); });
    $('#btn-edit-back').addEventListener('click', openList);
    $('#btn-save').addEventListener('click', handleSave);
    $('#btn-edit-toggle').addEventListener('click', toggleEditPw);
    $('#btn-edit-delete').addEventListener('click', handleEditDelete);
    $('#btn-settings-back').addEventListener('click', openList);
    $('#mi-change-password').addEventListener('click', handleChangePassword);
    $('#mi-change-question').addEventListener('click', handleChangeQuestion);
    $('#mi-export').addEventListener('click', handleExport);
    $('#mi-import').addEventListener('click', requestImport);
    $('#mi-selftest').addEventListener('click', openSelfTest);
    $('#mi-wipe').addEventListener('click', handleWipe);
    $('#mi-logout').addEventListener('click', handleLogout);
    $('#btn-selftest-back').addEventListener('click', function () { showView('settings'); });
    $('#btn-selftest-run').addEventListener('click', handleSelfTest);
    $('#file-import').addEventListener('change', handleImportFile);
    $('#file-xlsx').addEventListener('change', handleXlsxFile);
    $('#btn-import-back').addEventListener('click', handleImportCancel);
    $('#btn-import-cancel').addEventListener('click', handleImportCancel);
    $('#btn-import-confirm').addEventListener('click', handleImportConfirm);
  }

  /* ---------- Service Worker ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    var okProto = location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (okProto) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* 忽略 */ });
    }
  }

  /* ---------- 启动 ---------- */
  function init() {
    registerSW();
    bindEvents();
    if (PwStorage.isInitialized()) goLogin(); else goSetup();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);