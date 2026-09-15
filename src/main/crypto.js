const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 800000;

const HKDF_INFO = Buffer.from('vault-file-encryption-v2', 'utf8');
const HKDF_SALT_INFO = Buffer.from('vault-key-derivation-v2', 'utf8');
const HKDF_DB_INFO = Buffer.from('vault-database-encryption-v3', 'utf8');

const V1_VERSION = 3;
const V2_VERSION = 4;

function secureClear(buffer) {
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  }
}

function computeHMAC(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function deriveKey(password, salt) {
  const preKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  return Buffer.from(crypto.hkdfSync('sha512', preKey, salt, HKDF_INFO, KEY_LENGTH));
}

function deriveDbKey(password, salt) {
  const preKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  return Buffer.from(crypto.hkdfSync('sha512', preKey, salt, HKDF_DB_INFO, KEY_LENGTH));
}

function encryptBufferV2(buffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const hmac = computeHMAC(key, Buffer.concat([salt, iv, authTag, encrypted]));

  const versionBuf = Buffer.alloc(1);
  versionBuf.writeUInt8(V2_VERSION);

  const result = Buffer.alloc(versionBuf.length + salt.length + iv.length + authTag.length + hmac.length + encrypted.length);
  let offset = 0;
  versionBuf.copy(result, offset); offset += versionBuf.length;
  salt.copy(result, offset); offset += salt.length;
  iv.copy(result, offset); offset += iv.length;
  authTag.copy(result, offset); offset += authTag.length;
  hmac.copy(result, offset); offset += hmac.length;
  encrypted.copy(result, offset);

  secureClear(key);
  return result;
}

function decryptBufferV1(encryptedBuffer, password) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset); offset += 1;

  if (version === V1_VERSION) {
    const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
    const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
    const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
    const layer2Data = encryptedBuffer.subarray(offset);

    const layer2Key = deriveLayer2Key(password, salt);
    const layer2Iv = layer2Data.subarray(0, IV_LENGTH);
    const layer2Encrypted = layer2Data.subarray(IV_LENGTH);
    const decipher2 = crypto.createDecipheriv('aes-256-cbc', layer2Key, layer2Iv);
    const layer1Data = Buffer.concat([decipher2.update(layer2Encrypted), decipher2.final()]);
    secureClear(layer2Key);

    const storedHmac = layer1Data.subarray(0, 32);
    const encrypted = layer1Data.subarray(32);

    const key = deriveKey(password, salt);
    const expectedHmac = computeHMAC(key, Buffer.concat([salt, iv, authTag, encrypted]));

    if (!crypto.timingSafeEqual(storedHmac, expectedHmac)) {
      secureClear(key);
      throw new Error('Integrity check failed - data tampered or wrong password');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    secureClear(key);
    return decrypted;
  }

  throw new Error('Unsupported version: ' + version);
}

function decryptBufferV2(encryptedBuffer, password) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset); offset += 1;

  if (version !== V2_VERSION) {
    throw new Error('Unsupported version: ' + version);
  }

  const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
  const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
  const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
  const storedHmac = encryptedBuffer.subarray(offset, offset + 32); offset += 32;
  const encrypted = encryptedBuffer.subarray(offset);

  const key = deriveKey(password, salt);
  const expectedHmac = computeHMAC(key, Buffer.concat([salt, iv, authTag, encrypted]));

  if (!crypto.timingSafeEqual(storedHmac, expectedHmac)) {
    secureClear(key);
    throw new Error('Integrity check failed - data tampered or wrong password');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  secureClear(key);
  return decrypted;
}

function deriveLayer2Key(password, salt) {
  const HKDF_LAYER2_INFO = Buffer.from('vault-layer2-encryption-v3', 'utf8');
  const preKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  return Buffer.from(crypto.hkdfSync('sha512', preKey, salt, HKDF_LAYER2_INFO, KEY_LENGTH));
}

function encryptBuffer(buffer, password) {
  return encryptBufferV2(buffer, password);
}

function decryptBuffer(encryptedBuffer, password) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset);

  if (version === V1_VERSION) {
    return decryptBufferV1(encryptedBuffer, password);
  } else if (version === V2_VERSION) {
    return decryptBufferV2(encryptedBuffer, password);
  }

  throw new Error('Unsupported encryption version: ' + version);
}

function encryptFile(inputPath, outputPath, password) {
  const buffer = fs.readFileSync(inputPath);
  const encrypted = encryptBuffer(buffer, password);
  fs.writeFileSync(outputPath, encrypted);
  secureClear(buffer);
  secureClear(encrypted);
}

function decryptFile(inputPath, outputPath, password) {
  const encrypted = fs.readFileSync(inputPath);
  const decrypted = decryptBuffer(encrypted, password);
  fs.writeFileSync(outputPath, decrypted);
  secureClear(encrypted);
}

function encryptText(text, password) {
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = encryptBuffer(buffer, password);
  const result = encrypted.toString('base64');
  secureClear(buffer);
  return result;
}

function decryptText(encryptedBase64, password) {
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const decrypted = decryptBuffer(encrypted, password);
  const result = decrypted.toString('utf8');
  secureClear(encrypted);
  return result;
}

function encryptDatabase(dbBuffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveDbKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(dbBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const hmac = computeHMAC(key, Buffer.concat([salt, iv, authTag, encrypted]));

  const versionBuf = Buffer.alloc(1);
  versionBuf.writeUInt8(V2_VERSION);

  const result = Buffer.alloc(versionBuf.length + salt.length + iv.length + authTag.length + hmac.length + encrypted.length);
  let offset = 0;
  versionBuf.copy(result, offset); offset += versionBuf.length;
  salt.copy(result, offset); offset += salt.length;
  iv.copy(result, offset); offset += iv.length;
  authTag.copy(result, offset); offset += authTag.length;
  hmac.copy(result, offset); offset += hmac.length;
  encrypted.copy(result, offset);

  secureClear(key);
  return result;
}

function decryptDatabase(encryptedBuffer, password) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset); offset += 1;

  if (version === V1_VERSION) {
    offset = 0;
    const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
    const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
    const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
    const storedHmac = encryptedBuffer.subarray(offset, offset + 32); offset += 32;
    const encrypted = encryptedBuffer.subarray(offset);
    const key = deriveDbKey(password, salt);
    const expectedHmac = computeHMAC(key, Buffer.concat([salt, iv, authTag, encrypted]));
    if (!crypto.timingSafeEqual(storedHmac, expectedHmac)) {
      secureClear(key);
      throw new Error('Database integrity check failed - wrong password or corrupted');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    secureClear(key);
    return decrypted;
  }

  if (version === V2_VERSION) {
    const salt = encryptedBuffer.subarray(offset, offset + SALT_LENGTH); offset += SALT_LENGTH;
    const iv = encryptedBuffer.subarray(offset, offset + IV_LENGTH); offset += IV_LENGTH;
    const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_LENGTH); offset += AUTH_TAG_LENGTH;
    const storedHmac = encryptedBuffer.subarray(offset, offset + 32); offset += 32;
    const encrypted = encryptedBuffer.subarray(offset);
    const key = deriveDbKey(password, salt);
    const expectedHmac = computeHMAC(key, Buffer.concat([salt, iv, authTag, encrypted]));
    if (!crypto.timingSafeEqual(storedHmac, expectedHmac)) {
      secureClear(key);
      throw new Error('Database integrity check failed - wrong password or corrupted');
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    secureClear(key);
    return decrypted;
  }

  throw new Error('Unsupported database version: ' + version);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const preHash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  const hash = crypto.pbkdf2Sync(preHash, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
  secureClear(preHash);
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
    iterations: PBKDF2_ITERATIONS,
    version: 3
  };
}

function verifyPassword(password, stored) {
  const salt = Buffer.from(stored.salt, 'hex');
  const iterations = stored.iterations || PBKDF2_ITERATIONS;
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
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  encryptFile,
  decryptFile,
  encryptText,
  decryptText,
  encryptDatabase,
  decryptDatabase,
  hashPassword,
  verifyPassword,
  secureClear,
  secureDelete,
  atomicWrite,
  secureCompare
};
