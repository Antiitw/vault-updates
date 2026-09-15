const crypto = require('crypto');
const { argon2id } = require('hash-wasm');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const CHACHA_ALGORITHM = 'chacha20-poly1305';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const FORMAT_VERSION = 2;
const MK_LENGTH = 32;

const HKDF_INFO_FILE = Buffer.from('vault-file-key-v2', 'utf8');
const HKDF_INFO_DB = Buffer.from('vault-db-key-v2', 'utf8');
const HKDF_INFO_THUMB = Buffer.from('vault-thumb-key-v2', 'utf8');
const HKDF_INFO_HMAC = Buffer.from('vault-hmac-key-v2', 'utf8');
const HKDF_INFO_VERIFY = Buffer.from('vault-verify-v2', 'utf8');

const ARGON2_OPTIONS = {
  memorySize: 65536,
  iterations: 3,
  parallelism: 4,
  hashLength: KEY_LENGTH
};

function secureClear(buffer) {
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  }
}

function computeHMAC(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

async function deriveKeyFromPassword(password, salt) {
  const result = await argon2id({
    password: typeof password === 'string' ? password : password.toString(),
    salt: salt,
    parallelism: ARGON2_OPTIONS.parallelism,
    iterations: ARGON2_OPTIONS.iterations,
    memorySize: ARGON2_OPTIONS.memorySize,
    hashLength: ARGON2_OPTIONS.hashLength,
    outputType: 'binary'
  });
  return Buffer.from(result);
}

function deriveSubKey(masterKey, info) {
  return Buffer.from(crypto.hkdfSync('sha512', masterKey, Buffer.alloc(0), info, KEY_LENGTH));
}

function generateMasterKey() {
  return crypto.randomBytes(MK_LENGTH);
}

async function encryptMasterKey(masterKey, password, salt) {
  const kek = await deriveKeyFromPassword(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, kek, iv);
  const encrypted = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  secureClear(kek);
  return { iv, encrypted, authTag };
}

async function decryptMasterKey(encryptedMK, password, salt, iv, authTag) {
  const kek = await deriveKeyFromPassword(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, kek, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedMK), decipher.final()]);
  secureClear(kek);
  return decrypted;
}

async function createAuthData(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const mk = generateMasterKey();
  const { iv, encrypted, authTag } = await encryptMasterKey(mk, password, salt);

  const verifyData = deriveSubKey(mk, HKDF_INFO_VERIFY);
  const verifyHash = computeHMAC(verifyData, Buffer.from('vault-verify'));
  secureClear(verifyData);

  const result = {
    version: FORMAT_VERSION,
    algorithm: 'argon2id',
    argon2: {
      memorySize: ARGON2_OPTIONS.memorySize,
      iterations: ARGON2_OPTIONS.iterations,
      parallelism: ARGON2_OPTIONS.parallelism
    },
    salt: salt.toString('hex'),
    mk_iv: iv.toString('hex'),
    mk_encrypted: encrypted.toString('hex'),
    mk_auth_tag: authTag.toString('hex'),
    mk_verify: verifyHash.toString('hex'),
    created_at: new Date().toISOString()
  };

  secureClear(mk);
  return result;
}

async function loadMasterKey(authData, password) {
  if (authData.version !== FORMAT_VERSION) {
    throw new Error(`Unsupported auth version: ${authData.version}`);
  }

  const salt = Buffer.from(authData.salt, 'hex');
  const iv = Buffer.from(authData.mk_iv, 'hex');
  const encryptedMK = Buffer.from(authData.mk_encrypted, 'hex');
  const authTag = Buffer.from(authData.mk_auth_tag, 'hex');

  const mk = await decryptMasterKey(encryptedMK, password, salt, iv, authTag);

  const verifyData = deriveSubKey(mk, HKDF_INFO_VERIFY);
  const expectedVerify = Buffer.from(authData.mk_verify, 'hex');
  const computedVerify = computeHMAC(verifyData, Buffer.from('vault-verify'));
  secureClear(verifyData);

  if (!crypto.timingSafeEqual(expectedVerify, computedVerify)) {
    secureClear(mk);
    throw new Error('Invalid password or corrupted auth data');
  }

  return mk;
}

function deriveFileKey(masterKey, fileId) {
  const info = Buffer.concat([HKDF_INFO_FILE, Buffer.from(String(fileId))]);
  return deriveSubKey(masterKey, info);
}

function deriveDbKey(masterKey) {
  return deriveSubKey(masterKey, HKDF_INFO_DB);
}

function deriveThumbKey(masterKey) {
  return deriveSubKey(masterKey, HKDF_INFO_THUMB);
}

function encryptBuffer(buffer, masterKey, aad = null) {
  const key = deriveSubKey(masterKey, HKDF_INFO_FILE);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  if (aad) cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const versionBuf = Buffer.alloc(1);
  versionBuf.writeUInt8(FORMAT_VERSION);

  const result = Buffer.alloc(versionBuf.length + iv.length + authTag.length + encrypted.length);
  let offset = 0;
  versionBuf.copy(result, offset); offset += versionBuf.length;
  iv.copy(result, offset); offset += iv.length;
  authTag.copy(result, offset); offset += authTag.length;
  encrypted.copy(result, offset);

  secureClear(key);
  return result;
}

function decryptBuffer(encryptedBuffer, masterKey, aad = null) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset); offset += 1;

  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
  const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
  const encrypted = encryptedBuffer.subarray(offset);

  const key = deriveSubKey(masterKey, HKDF_INFO_FILE);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  if (aad) decipher.setAAD(aad);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  secureClear(key);
  return decrypted;
}

function encryptFile(inputPath, outputPath, masterKey) {
  const buffer = fs.readFileSync(inputPath);
  const encrypted = encryptBuffer(buffer, masterKey);
  fs.writeFileSync(outputPath, encrypted);
  secureClear(buffer);
  secureClear(encrypted);
}

function decryptFile(inputPath, outputPath, masterKey) {
  const encrypted = fs.readFileSync(inputPath);
  const decrypted = decryptBuffer(encrypted, masterKey);
  fs.writeFileSync(outputPath, decrypted);
  secureClear(encrypted);
}

function encryptText(text, masterKey) {
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = encryptBuffer(buffer, masterKey);
  const result = encrypted.toString('base64');
  secureClear(buffer);
  return result;
}

function decryptText(encryptedBase64, masterKey) {
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decrypted = decryptBuffer(encrypted, masterKey);
  const result = decrypted.toString('utf8');
  secureClear(encrypted);
  return result;
}

function encryptDatabase(dbBuffer, masterKey) {
  const key = deriveDbKey(masterKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(dbBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const versionBuf = Buffer.alloc(1);
  versionBuf.writeUInt8(FORMAT_VERSION);

  const result = Buffer.alloc(versionBuf.length + iv.length + authTag.length + encrypted.length);
  let offset = 0;
  versionBuf.copy(result, offset); offset += versionBuf.length;
  iv.copy(result, offset); offset += iv.length;
  authTag.copy(result, offset); offset += authTag.length;
  encrypted.copy(result, offset);

  secureClear(key);
  return result;
}

function decryptDatabase(encryptedBuffer, masterKey) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset); offset += 1;

  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported DB version: ${version}`);
  }

  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
  const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
  const encrypted = encryptedBuffer.subarray(offset);

  const key = deriveDbKey(masterKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  secureClear(key);
  return decrypted;
}

function hashPasswordLegacy(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iterations = 800000;
  const preHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha512');
  const hash = crypto.pbkdf2Sync(preHash, salt, iterations, KEY_LENGTH, 'sha512');
  secureClear(preHash);
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    iterations: iterations,
    version: 3
  };
}

function verifyPasswordLegacy(password, stored) {
  const salt = Buffer.from(stored.salt, 'hex');
  const iterations = stored.iterations || 600000;
  const preHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha512');
  const hash = crypto.pbkdf2Sync(preHash, salt, iterations, KEY_LENGTH, 'sha512');
  const result = crypto.timingSafeEqual(hash, Buffer.from(stored.hash, 'hex'));
  secureClear(preHash);
  return result;
}

function secureDelete(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r+');
    const buf = Buffer.alloc(4096);
    const passes = 3;
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < Math.ceil(stats.size / 4096); i++) {
        crypto.randomFillSync(buf);
        fs.writeSync(fd, buf, 0, buf.length, i * 4096);
      }
      fs.fsyncSync(fd);
    }
    fs.closeSync(fd);
    fs.unlinkSync(filePath);
  } catch {}
}

function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp.${crypto.randomBytes(4).toString('hex')}`);
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath);
}

function secureCompare(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(a);
  if (!Buffer.isBuffer(b)) b = Buffer.from(b);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function rotatePassword(masterKey, currentPassword, newPassword) {
  const authPath = path.join(require('os').homedir(), '.vault-data', 'auth.json');
  if (!fs.existsSync(authPath)) {
    throw new Error('Auth file not found');
  }

  const currentAuth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  if (!validateAuthData(currentAuth)) {
    throw new Error('Invalid auth data');
  }

  const currentSalt = Buffer.from(currentAuth.salt, 'hex');
  const currentIv = Buffer.from(currentAuth.mk_iv, 'hex');
  const currentEncryptedMK = Buffer.from(currentAuth.mk_encrypted, 'hex');
  const currentAuthTag = Buffer.from(currentAuth.mk_auth_tag, 'hex');

  const decryptedMK = await decryptMasterKey(currentEncryptedMK, currentPassword, currentSalt, currentIv, currentAuthTag);

  const verifyData = deriveSubKey(decryptedMK, HKDF_INFO_VERIFY);
  const expectedVerify = Buffer.from(currentAuth.mk_verify, 'hex');
  const computedVerify = computeHMAC(verifyData, Buffer.from('vault-verify'));
  secureClear(verifyData);

  if (!crypto.timingSafeEqual(expectedVerify, computedVerify)) {
    secureClear(decryptedMK);
    throw new Error('Current password verification failed');
  }

  const newSalt = crypto.randomBytes(SALT_LENGTH);
  const { iv: newIv, encrypted: newEncrypted, authTag: newAuthTag } = await encryptMasterKey(decryptedMK, newPassword, newSalt);

  const newVerifyData = deriveSubKey(decryptedMK, HKDF_INFO_VERIFY);
  const newVerifyHash = computeHMAC(newVerifyData, Buffer.from('vault-verify'));
  secureClear(newVerifyData);
  secureClear(decryptedMK);

  const newAuthData = {
    version: FORMAT_VERSION,
    algorithm: 'argon2id',
    argon2: {
      memorySize: ARGON2_OPTIONS.memorySize,
      iterations: ARGON2_OPTIONS.iterations,
      parallelism: ARGON2_OPTIONS.parallelism
    },
    salt: newSalt.toString('hex'),
    mk_iv: newIv.toString('hex'),
    mk_encrypted: newEncrypted.toString('hex'),
    mk_auth_tag: newAuthTag.toString('hex'),
    mk_verify: newVerifyHash.toString('hex'),
    created_at: new Date().toISOString()
  };

  return { authData: newAuthData, masterKey: masterKey };
}

async function rotateMasterKey(masterKey, newPassword) {
  const authPath = path.join(require('os').homedir(), '.vault-data', 'auth.json');
  if (!fs.existsSync(authPath)) {
    throw new Error('Auth file not found');
  }

  const currentAuth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  if (!validateAuthData(currentAuth)) {
    throw new Error('Invalid auth data');
  }

  const currentPassword = null;
  throw new Error('rotateMasterKey is deprecated. Use rotatePassword() instead.');
}

function reEncryptWithNewKey(oldMK, newMK) {
  throw new Error('reEncryptWithNewKey is not implemented - use rotatePassword() instead');
}

function validateAuthData(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.version !== FORMAT_VERSION) return false;
  if (!data.salt || !data.mk_iv || !data.mk_encrypted || !data.mk_auth_tag || !data.mk_verify) return false;
  if (data.algorithm !== 'argon2id') return false;
  return true;
}

function getFileKeyForReencryption(masterKey, fileId) {
  return deriveFileKey(masterKey, fileId);
}

const HKDF_INFO_COUNTER = Buffer.from('vault-counter-sign-v2', 'utf8');

function signCounter(counter, masterKey) {
  const counterKey = deriveSubKey(masterKey, HKDF_INFO_COUNTER);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const signature = crypto.createHmac('sha256', counterKey).update(counterBuf).digest();
  secureClear(counterKey);
  return signature;
}

function verifyCounterSignature(data, masterKey) {
  if (!masterKey) return false;
  try {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(data.counter));
    const expectedSig = signCounter(data.counter, masterKey);
    const storedSig = Buffer.from(data.signature, 'hex');
    if (storedSig.length !== expectedSig.length) return false;
    return crypto.timingSafeEqual(storedSig, expectedSig);
  } catch {
    return false;
  }
}

module.exports = {
  FORMAT_VERSION,
  createAuthData,
  loadMasterKey,
  validateAuthData,
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
  encryptText,
  decryptText,
  encryptDatabase,
  decryptDatabase,
  hashPasswordLegacy,
  verifyPasswordLegacy,
  secureClear,
  secureDelete,
  atomicWrite,
  secureCompare,
  rotatePassword,
  rotateMasterKey,
  deriveSubKey,
  deriveFileKey,
  deriveDbKey,
  deriveThumbKey,
  generateMasterKey,
  encryptMasterKey,
  decryptMasterKey,
  getFileKeyForReencryption,
  signCounter,
  verifyCounterSignature
};
