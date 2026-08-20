/* 自检模块：在独立命名空间运行完整流程，不影响真实数据 */
(function (global) {
  'use strict';

  function readBlobHead(blob, n) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var bytes = new Uint8Array(fr.result);
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        resolve(s);
      };
      fr.onerror = function () { reject(new Error('读取文件失败')); };
      fr.readAsArrayBuffer(blob.slice(0, n));
    });
  }

  function run() {
    var results = [];
    function step(name, fn) {
      return Promise.resolve().then(fn).then(function () {
        results.push({ name: name, ok: true });
      }).catch(function (e) {
        results.push({ name: name, ok: false, err: (e && e.message) || String(e) });
      });
    }

    var savedSession = PwStorage.getSession();
    PwStorage.lock();
    PwStorage.setNamespace('pwv.test.');

    var p = Promise.resolve();

    p = p.then(function () {
      return step('首次设置（创建加密保险库）', function () {
        return PwStorage.createVault('test123456', '我的小学名称？', '实验小学');
      });
    });
    p = p.then(function () {
      return step('正确密码登录', function () {
        return PwStorage.login('test123456').then(function (recs) {
          if (PwStorage.isLocked()) throw new Error('不应锁定');
          if (recs.length !== 0) throw new Error('初始记录应为空');
        });
      });
    });
    p = p.then(function () {
      return step('错误密码被拒绝', function () {
        var threw = false;
        return PwStorage.login('badpass').catch(function () { threw = true; }).then(function () {
          if (!threw) throw new Error('错误密码不应登录成功');
        });
      });
    });
    p = p.then(function () {
      return step('新增/编辑/删除记录', function () {
        return PwStorage.addRecord({ platform: '微信', account: '13800138000', password: 'wxPass123', email: '' })
          .then(function () { return PwStorage.addRecord({ platform: 'QQ', account: '10001', password: 'qqPass456', email: 'me@qq.com' }); })
          .then(function () {
            if (PwStorage.getRecords().length !== 2) throw new Error('新增数量不对');
            var first = PwStorage.getRecords()[0];
            if (!first.createdAt || !first.updatedAt) throw new Error('未自动生成创建时间');
            return PwStorage.updateRecord(first.id, { platform: '微信', account: '13900139000', password: 'wxNew789', email: 'a@b.com' });
          })
          .then(function () {
            var recs = PwStorage.getRecords();
            if (recs[0].account !== '13900139000' || recs[0].password !== 'wxNew789') throw new Error('编辑未生效');
            return PwStorage.deleteRecord(recs[0].id);
          })
          .then(function () {
            if (PwStorage.getRecords().length !== 1) throw new Error('删除未生效');
          });
      });
    });
    p = p.then(function () {
      return step('数据以密文保存（本地无明文）', function () {
        var raw = localStorage.getItem('pwv.test.data');
        if (!raw) throw new Error('数据未落盘');
        if (raw.indexOf('qqPass456') >= 0 || raw.indexOf('微信') >= 0) throw new Error('本地出现明文');
      });
    });
    p = p.then(function () {
      return step('忘记密码：密保重置后数据仍在', function () {
        return PwStorage.unlockWithAnswer('实验小学', 'newpass888').then(function () {
          if (PwStorage.getRecords().length !== 1) throw new Error('重置后数据丢失');
          return PwStorage.login('newpass888');
        }).then(function (l) {
          if (l.length !== 1) throw new Error('新密码登录失败');
        });
      });
    });
    p = p.then(function () {
      return step('修改密码与修改密保', function () {
        return PwStorage.changePassword('newpass888', 'final999').then(function () {
          var threw = false;
          return PwStorage.login('newpass888').catch(function () { threw = true; }).then(function () {
            if (!threw) throw new Error('旧密码不应再能登录');
            return PwStorage.changeQuestion('final999', '我的宠物名字？', '旺财');
          });
        }).then(function () {
          var s = JSON.parse(localStorage.getItem('pwv.test.settings'));
          if (s.question !== '我的宠物名字？') throw new Error('密保问题未更新');
        });
      });
    });
    p = p.then(function () {
      return step('导出/导入备份往返', function () {
        var backup = PwStorage.exportBackup();
        PwStorage.wipeAll();
        return PwStorage.importBackup(backup, 'final999').then(function (recs) {
          if (recs.length !== 1) throw new Error('导入后记录数不对');
        });
      });
    });
    p = p.then(function () {
      return step('连续失败10次触发15分钟锁定', function () {
        PwStorage.wipeAll();
        return PwStorage.createVault('test123456', 'q', 'a').then(function () {
          var chain = Promise.resolve();
          for (var i = 0; i < 10; i++) {
            chain = chain.then(function () { return PwStorage.login('badpass').catch(function () { /* 预期 */ }); });
          }
          return chain;
        }).then(function () {
          if (!PwStorage.isLocked()) throw new Error('应已锁定');
          var threw = false;
          return PwStorage.login('test123456').catch(function () { threw = true; }).then(function () {
            if (!threw) throw new Error('锁定期内不应能登录');
            var s = JSON.parse(localStorage.getItem('pwv.test.settings'));
            s.lockUntil = 0;
            s.failedAttempts = 0;
            localStorage.setItem('pwv.test.settings', JSON.stringify(s));
          });
        });
      });
    });
    p = p.then(function () {
      return step('xlsx生成（合法且非空）', function () {
        PwStorage.wipeAll();
        return PwStorage.createVault('test123456', 'q', 'a')
          .then(function () { return PwStorage.login('test123456'); })
          .then(function () { return PwStorage.addRecord({ platform: '微信', account: '13800138000', password: 'wxPass123', email: 'me@qq.com' }); })
          .then(function () {
            var bytes = XlsxIO.buildWorkbook(PwStorage.getRecords());
            if (bytes.length < 500) throw new Error('xlsx过小');
            if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error('xlsx不是合法ZIP文件');
          });
      });
    });
    p = p.then(function () {
      return step('xlsx导入差异（新增/修改/删除）', function () {
        return PwStorage.addRecord({ platform: 'QQ', account: '10001', password: 'qqPass456', email: '' }).then(function () {
          // 构造导入文件：微信(修改) + 支付宝(新增)，不含 QQ -> QQ 应判删除
          var importRows = [
            { platform: '微信', account: '13900000000', password: 'wxPass123', email: 'me@qq.com', createdAt: 0 },
            { platform: '支付宝', account: '13800000000', password: 'zfbPass', email: '', createdAt: 0 }
          ];
          var diff = Importer.computeDiff(importRows, PwStorage.getRecords());
          if (diff.added.length !== 1 || diff.modified.length !== 1 || diff.deleted.length !== 1) {
            throw new Error('差异数量不对: 新增' + diff.added.length + ' 修改' + diff.modified.length + ' 删除' + diff.deleted.length);
          }
          if (diff.modified[0].rec.account !== '13900000000') throw new Error('修改内容不对');
          return PwStorage.applyImportDiff(diff).then(function () {
            var recs = PwStorage.getRecords();
            var wx = recs.filter(function (r) { return r.platform === '微信'; })[0];
            var zfb = recs.filter(function (r) { return r.platform === '支付宝'; })[0];
            var qq = recs.filter(function (r) { return r.platform === 'QQ'; })[0];
            if (!wx || wx.account !== '13900000000') throw new Error('修改未应用');
            if (!zfb) throw new Error('新增未应用');
            if (qq) throw new Error('删除未应用');
          });
        });
      });
    });

    return p.then(function () {
      localStorage.removeItem('pwv.test.settings');
      localStorage.removeItem('pwv.test.data');
      PwStorage.setNamespace('pwv.');
      PwStorage.setSession(savedSession);
      return results;
    }, function (e) {
      localStorage.removeItem('pwv.test.settings');
      localStorage.removeItem('pwv.test.data');
      PwStorage.setNamespace('pwv.');
      PwStorage.setSession(savedSession);
      throw e;
    });
  }

  global.SelfTest = { run: run };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SelfTest;
})(typeof window !== 'undefined' ? window : globalThis);