/* 存储模块：加密保险库保存在 localStorage；记录仅存在于内存，落盘均为密文 */
(function (global) {
  'use strict';

  var settingsKey = 'pwv.settings';
  var dataKey = 'pwv.data';
  var MAX_FAILED = 10;
  var LOCK_MS = 15 * 60 * 1000;
  var session = null; // { masterKey: Uint8Array, records: Array }

  /* 供自检使用：切换独立命名空间，不触碰真实数据 */
  function setNamespace(prefix) {
    settingsKey = (prefix || 'pwv.') + 'settings';
    dataKey = (prefix || 'pwv.') + 'data';
  }

  function getSettings() {
    try {
      var raw = localStorage.getItem(settingsKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSettings(s) { localStorage.setItem(settingsKey, JSON.stringify(s)); }

  function getDataBlob() {
    try {
      var raw = localStorage.getItem(dataKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveDataBlob(b) { localStorage.setItem(dataKey, JSON.stringify(b)); }

  function isInitialized() { return !!getSettings(); }
  function isLoggedIn() { return !!session; }
  function getSession() { return session; }
  function setSession(s) { session = s; }
  function lock() { session = null; }

  function lockRemainMin() {
    var s = getSettings();
    if (!s || !s.lockUntil) return 0;
    return Math.ceil(Math.max(0, s.lockUntil - Date.now()) / 60000);
  }
  function isLocked() { return lockRemainMin() > 0; }
  function checkLockError() {
    var m = lockRemainMin();
    return m > 0 ? '尝试次数过多，请 ' + m + ' 分钟后再试' : '';
  }

  function touchFailed() {
    var s = getSettings();
    if (!s) return;
    var failed = (s.failedAttempts || 0) + 1;
    if (failed >= MAX_FAILED) {
      s.failedAttempts = 0;
      s.lockUntil = Date.now() + LOCK_MS;
    } else {
      s.failedAttempts = failed;
    }
    s.updatedAt = Date.now();
    saveSettings(s);
  }
  function clearFailed() {
    var s = getSettings();
    if (!s) return;
    s.failedAttempts = 0;
    s.lockUntil = 0;
    s.updatedAt = Date.now();
    saveSettings(s);
  }

  function validateSetup(password, question, answer) {
    if (typeof password !== 'string' || password.length < 6) throw new Error('登录密码至少6位');
    if (!String(question || '').trim()) throw new Error('请设置密保问题');
    if (!String(answer || '').trim()) throw new Error('请填写密保答案');
  }

  /* 首次设置：生成主密钥，分别用登录密码和密保答案包裹 */
  function createVault(password, question, answer) {
    if (isInitialized()) throw new Error('已初始化，请直接登录');
    validateSetup(password, question, answer);
    var masterKey = PwCrypto.generateMasterKey();
    var passwordSalt = PwCrypto.randomBytes(16);
    var answerSalt = PwCrypto.randomBytes(16);
    return Promise.all([
      PwCrypto.wrapMasterKey(masterKey, password, passwordSalt),
      PwCrypto.wrapMasterKey(masterKey, answer, answerSalt),
      PwCrypto.encryptRecordsJson('[]', masterKey)
    ]).then(function (r) {
      var settings = {
        v: 1,
        kdfIterations: PwCrypto.KDF_ITERATIONS,
        passwordSalt: PwCrypto.bytesToHex(passwordSalt),
        answerSalt: PwCrypto.bytesToHex(answerSalt),
        wrappedMasterByPassword: r[0],
        wrappedMasterByAnswer: r[1],
        question: String(question).trim(),
        failedAttempts: 0,
        lockUntil: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      saveSettings(settings);
      saveDataBlob(r[2]);
    });
  }

  function decryptData(masterKey, blob) {
    if (!blob) return Promise.resolve([]);
    return PwCrypto.decryptRecordsJson(blob, masterKey)
      .then(function (json) {
        var arr = JSON.parse(json);
        return Array.isArray(arr) ? arr : [];
      });
  }

  function login(password) {
    var lockErr = checkLockError();
    if (lockErr) return Promise.reject(new Error(lockErr));
    var settings = getSettings();
    if (!settings) return Promise.reject(new Error('NEED_SETUP'));
    return PwCrypto.unwrapMasterKey(settings.wrappedMasterByPassword, password, PwCrypto.hexToBytes(settings.passwordSalt))
      .then(function (masterKey) {
        return decryptData(masterKey, getDataBlob()).then(function (records) {
          clearFailed();
          session = { masterKey: masterKey, records: records };
          return records;
        });
      })
      .catch(function (e) {
        if (e && e.message === 'WRONG_PASSWORD') {
          touchFailed();
          if (checkLockError()) throw new Error('尝试次数过多，请 15 分钟后再试');
          throw new Error('密码错误');
        }
        throw e;
      });
  }

  /* 忘记密码：答对密保后解开主密钥，用新密码重新包裹 */
  function unlockWithAnswer(answer, newPassword) {
    var lockErr = checkLockError();
    if (lockErr) return Promise.reject(new Error(lockErr));
    var settings = getSettings();
    if (!settings) return Promise.reject(new Error('NEED_SETUP'));
    if (typeof newPassword !== 'string' || newPassword.length < 6) return Promise.reject(new Error('新密码至少6位'));
    return PwCrypto.unwrapMasterKey(settings.wrappedMasterByAnswer, answer, PwCrypto.hexToBytes(settings.answerSalt))
      .then(function (masterKey) {
        var newSalt = PwCrypto.randomBytes(16);
        return PwCrypto.wrapMasterKey(masterKey, newPassword, newSalt).then(function (wrapped) {
          settings.passwordSalt = PwCrypto.bytesToHex(newSalt);
          settings.wrappedMasterByPassword = wrapped;
          settings.failedAttempts = 0;
          settings.lockUntil = 0;
          settings.updatedAt = Date.now();
          saveSettings(settings);
          return decryptData(masterKey, getDataBlob()).then(function (records) {
            session = { masterKey: masterKey, records: records };
            return records;
          });
        });
      })
      .catch(function (e) {
        if (e && e.message === 'WRONG_PASSWORD') {
          touchFailed();
          if (checkLockError()) throw new Error('尝试次数过多，请 15 分钟后再试');
          throw new Error('密保答案错误');
        }
        throw e;
      });
  }

  function changePassword(oldPassword, newPassword) {
    var settings = getSettings();
    if (!settings) return Promise.reject(new Error('NEED_SETUP'));
    if (typeof newPassword !== 'string' || newPassword.length < 6) return Promise.reject(new Error('新密码至少6位'));
    return PwCrypto.unwrapMasterKey(settings.wrappedMasterByPassword, oldPassword, PwCrypto.hexToBytes(settings.passwordSalt))
      .then(function (masterKey) {
        var newSalt = PwCrypto.randomBytes(16);
        return PwCrypto.wrapMasterKey(masterKey, newPassword, newSalt).then(function (wrapped) {
          settings.passwordSalt = PwCrypto.bytesToHex(newSalt);
          settings.wrappedMasterByPassword = wrapped;
          settings.updatedAt = Date.now();
          saveSettings(settings);
          if (session) session.masterKey = masterKey;
        });
      })
      .catch(function (e) {
        if (e && e.message === 'WRONG_PASSWORD') throw new Error('当前密码错误');
        throw e;
      });
  }

  function changeQuestion(password, question, answer) {
    var settings = getSettings();
    if (!settings) return Promise.reject(new Error('NEED_SETUP'));
    if (!String(question || '').trim()) return Promise.reject(new Error('请填写新密保问题'));
    if (!String(answer || '').trim()) return Promise.reject(new Error('请填写新密保答案'));
    return PwCrypto.unwrapMasterKey(settings.wrappedMasterByPassword, password, PwCrypto.hexToBytes(settings.passwordSalt))
      .then(function (masterKey) {
        var newAnswerSalt = PwCrypto.randomBytes(16);
        return PwCrypto.wrapMasterKey(masterKey, answer, newAnswerSalt).then(function (wrapped) {
          settings.answerSalt = PwCrypto.bytesToHex(newAnswerSalt);
          settings.wrappedMasterByAnswer = wrapped;
          settings.question = String(question).trim();
          settings.updatedAt = Date.now();
          saveSettings(settings);
        });
      })
      .catch(function (e) {
        if (e && e.message === 'WRONG_PASSWORD') throw new Error('登录密码错误');
        throw e;
      });
  }

  /* ---------- 记录 CRUD ---------- */
  function requireSession() {
    if (!session) throw new Error('未登录');
  }
  function getRecords() { requireSession(); return session.records; }
  function getRecord(id) {
    requireSession();
    for (var i = 0; i < session.records.length; i++) {
      if (session.records[i].id === id) return session.records[i];
    }
    return null;
  }
  function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function validateRecord(fields) {
    if (!fields || !String(fields.platform || '').trim()) throw new Error('平台名称不能为空');
    if (!String(fields.account || '').trim()) throw new Error('账号不能为空');
    if (typeof fields.password !== 'string' || !fields.password) throw new Error('密码不能为空');
    var email = String(fields.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确');
    return {
      platform: String(fields.platform).trim(),
      account: String(fields.account).trim(),
      password: fields.password,
      email: email
    };
  }

  function saveRecords() {
    requireSession();
    return PwCrypto.encryptRecordsJson(JSON.stringify(session.records), session.masterKey)
      .then(saveDataBlob);
  }

  function addRecord(fields) {
    requireSession();
    var v = validateRecord(fields);
    var now = Date.now();
    var record = {
      id: genId(),
      platform: v.platform,
      account: v.account,
      password: v.password,
      email: v.email,
      createdAt: now,
      updatedAt: now
    };
    session.records.unshift(record);
    return saveRecords().then(function () { return record; });
  }

  function updateRecord(id, fields) {
    requireSession();
    var rec = null;
    for (var i = 0; i < session.records.length; i++) {
      if (session.records[i].id === id) { rec = session.records[i]; break; }
    }
    if (!rec) return Promise.reject(new Error('记录不存在'));
    var v = validateRecord(fields);
    rec.platform = v.platform;
    rec.account = v.account;
    rec.password = v.password;
    rec.email = v.email;
    rec.updatedAt = Date.now();
    return saveRecords().then(function () { return rec; });
  }

  function deleteRecord(id) {
    requireSession();
    session.records = session.records.filter(function (r) { return r.id !== id; });
    return saveRecords();
  }

  /* ---------- 导入差异应用 ---------- */
  function applyImportDiff(diff) {
    requireSession();
    diff = diff || { added: [], modified: [], deleted: [] };
    var delIds = {};
    (diff.deleted || []).forEach(function (d) { delIds[d.id] = true; });
    var modById = {};
    (diff.modified || []).forEach(function (m) { modById[m.id] = m.rec; });

    var keep = [];
    session.records.forEach(function (r) {
      if (delIds[r.id]) return;
      var m = modById[r.id];
      if (m) {
        keep.push({
          id: r.id,
          platform: m.platform,
          account: m.account,
          password: m.password,
          email: m.email || '',
          createdAt: r.createdAt,
          updatedAt: Date.now()
        });
      } else {
        keep.push(r);
      }
    });
    (diff.added || []).forEach(function (rec) {
      keep.unshift({
        id: genId(),
        platform: rec.platform,
        account: rec.account,
        password: rec.password,
        email: rec.email || '',
        createdAt: rec.createdAt || Date.now(),
        updatedAt: Date.now()
      });
    });
    session.records = keep;
    return saveRecords().then(function () { return keep.length; });
  }
  /* ---------- 备份 / 恢复 ---------- */
  function exportBackup() {
    var settings = getSettings();
    var data = getDataBlob();
    if (!settings || !data) throw new Error('暂无数据可导出');
    return JSON.stringify({ app: 'pwvault', version: 1, exportedAt: Date.now(), settings: settings, data: data });
  }

  function importBackup(jsonText, password) {
    var obj = null;
    try { obj = JSON.parse(jsonText); } catch (e) { return Promise.reject(new Error('备份文件格式错误')); }
    if (!obj || obj.app !== 'pwvault' || !obj.settings || !obj.data) {
      return Promise.reject(new Error('备份文件格式错误'));
    }
    return PwCrypto.unwrapMasterKey(obj.settings.wrappedMasterByPassword, password, PwCrypto.hexToBytes(obj.settings.passwordSalt))
      .then(function (masterKey) {
        return decryptData(masterKey, obj.data).then(function (records) {
          localStorage.setItem(settingsKey, JSON.stringify(obj.settings));
          localStorage.setItem(dataKey, JSON.stringify(obj.data));
          session = { masterKey: masterKey, records: records };
          return records;
        });
      })
      .catch(function (e) {
        if (e && e.message === 'WRONG_PASSWORD') throw new Error('备份登录密码验证失败');
        throw e;
      });
  }

  function wipeAll() {
    localStorage.removeItem(settingsKey);
    localStorage.removeItem(dataKey);
    session = null;
  }

  global.PwStorage = {
    setNamespace: setNamespace,
    isInitialized: isInitialized,
    isLoggedIn: isLoggedIn,
    getSession: getSession,
    setSession: setSession,
    lock: lock,
    isLocked: isLocked,
    lockRemainMin: lockRemainMin,
    getSettings: getSettings,
    createVault: createVault,
    login: login,
    unlockWithAnswer: unlockWithAnswer,
    changePassword: changePassword,
    changeQuestion: changeQuestion,
    getRecords: getRecords,
    getRecord: getRecord,
    addRecord: addRecord,
    updateRecord: updateRecord,
    deleteRecord: deleteRecord,
    exportBackup: exportBackup,
    applyImportDiff: applyImportDiff,
    importBackup: importBackup,
    wipeAll: wipeAll
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PwStorage;
})(typeof window !== 'undefined' ? window : globalThis);