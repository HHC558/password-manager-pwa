/* 加密模块：PBKDF2-SHA256 派生密钥 + AES-GCM-256 加密，全部使用浏览器内置 WebCrypto */
(function (global) {
  'use strict';

  var KDF_ITERATIONS = 100000;
  var KEY_LEN = 256;

  function bufToB64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64ToBuf(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += ('0' + bytes[i].toString(16)).slice(-2);
    return s;
  }

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function randomBytes(n) {
    var b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }

  /* 从密码派生 AES-GCM 密钥 */
  function deriveKey(password, saltBytes, iterations) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey'])
      .then(function (keyMaterial) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: saltBytes, iterations: iterations || KDF_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: KEY_LEN },
          false,
          ['encrypt', 'decrypt']
        );
      });
  }

  function aesEncrypt(key, dataBytes) {
    var iv = randomBytes(12);
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, dataBytes)
      .then(function (ct) {
        return { iv: bufToB64(iv), ct: bufToB64(ct) };
      });
  }

  function aesDecrypt(key, ivB64, ctB64) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(ivB64) }, key, b64ToBuf(ctB64));
  }

  /* 生成随机主密钥（32 字节） */
  function generateMasterKey() {
    return randomBytes(32);
  }

  /* 用密码派生的密钥包裹主密钥 */
  function wrapMasterKey(masterKeyBytes, password, saltBytes) {
    return deriveKey(password, saltBytes)
      .then(function (key) { return aesEncrypt(key, masterKeyBytes); });
  }

  /* 解包主密钥；密码错误时抛 WRONG_PASSWORD */
  function unwrapMasterKey(wrapped, password, saltBytes) {
    return deriveKey(password, saltBytes)
      .then(function (key) { return aesDecrypt(key, wrapped.iv, wrapped.ct); })
      .then(function (pt) { return new Uint8Array(pt); })
      .catch(function () { throw new Error('WRONG_PASSWORD'); });
  }

  /* 用主密钥加密记录 JSON */
  function encryptRecordsJson(json, masterKeyBytes) {
    return crypto.subtle.importKey('raw', masterKeyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
      .then(function (key) { return aesEncrypt(key, new TextEncoder().encode(json)); });
  }

  /* 用主密钥解密记录 JSON */
  function decryptRecordsJson(blob, masterKeyBytes) {
    return crypto.subtle.importKey('raw', masterKeyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
      .then(function (key) { return aesDecrypt(key, blob.iv, blob.ct); })
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }

  global.PwCrypto = {
    KDF_ITERATIONS: KDF_ITERATIONS,
    bufToB64: bufToB64,
    b64ToBuf: b64ToBuf,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    randomBytes: randomBytes,
    deriveKey: deriveKey,
    aesEncrypt: aesEncrypt,
    aesDecrypt: aesDecrypt,
    generateMasterKey: generateMasterKey,
    wrapMasterKey: wrapMasterKey,
    unwrapMasterKey: unwrapMasterKey,
    encryptRecordsJson: encryptRecordsJson,
    decryptRecordsJson: decryptRecordsJson
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PwCrypto;
})(typeof window !== 'undefined' ? window : globalThis);