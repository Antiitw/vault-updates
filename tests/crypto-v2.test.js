const crypto = require('crypto');
const cryptoV2 = require('../src/main/crypto-v2');

describe('Crypto V2', () => {
  describe('Key Derivation', () => {
    test('deriveSubKey returns 32-byte key', () => {
      const mk = crypto.randomBytes(32);
      const info = Buffer.from('test-info', 'utf8');
      const key = cryptoV2.deriveSubKey(mk, info);
      expect(key.length).toBe(32);
    });

    test('deriveSubKey produces different keys for different info', () => {
      const mk = crypto.randomBytes(32);
      const key1 = cryptoV2.deriveSubKey(mk, Buffer.from('info1'));
      const key2 = cryptoV2.deriveSubKey(mk, Buffer.from('info2'));
      expect(key1.equals(key2)).toBe(false);
    });

    test('deriveSubKey produces same key for same inputs', () => {
      const mk = crypto.randomBytes(32);
      const info = Buffer.from('test');
      const key1 = cryptoV2.deriveSubKey(mk, info);
      const key2 = cryptoV2.deriveSubKey(mk, info);
      expect(key1.equals(key2)).toBe(true);
    });

    test('deriveFileKey returns 32-byte key', () => {
      const mk = crypto.randomBytes(32);
      const key = cryptoV2.deriveFileKey(mk, 'test-file-id');
      expect(key.length).toBe(32);
    });

    test('deriveDbKey returns 32-byte key', () => {
      const mk = crypto.randomBytes(32);
      const key = cryptoV2.deriveDbKey(mk);
      expect(key.length).toBe(32);
    });

    test('deriveThumbKey returns 32-byte key', () => {
      const mk = crypto.randomBytes(32);
      const key = cryptoV2.deriveThumbKey(mk, 'test-thumb');
      expect(key.length).toBe(32);
    });
  });

  describe('Master Key Operations', () => {
    test('generateMasterKey returns 32-byte buffer', () => {
      const mk = cryptoV2.generateMasterKey();
      expect(mk.length).toBe(32);
    });

    test('encryptMasterKey and decryptMasterKey roundtrip', async () => {
      const mk = cryptoV2.generateMasterKey();
      const password = 'test-password-123';
      const salt = crypto.randomBytes(16);

      const { iv, encrypted, authTag } = await cryptoV2.encryptMasterKey(mk, password, salt);
      expect(encrypted.length).toBe(32);
      expect(iv.length).toBe(12);
      expect(authTag.length).toBe(16);

      const decrypted = await cryptoV2.decryptMasterKey(encrypted, password, salt, iv, authTag);
      expect(decrypted.equals(mk)).toBe(true);
    });

    test('decryptMasterKey fails with wrong password', async () => {
      const mk = cryptoV2.generateMasterKey();
      const salt = crypto.randomBytes(16);
      const { iv, encrypted, authTag } = await cryptoV2.encryptMasterKey(mk, 'correct', salt);

      await expect(cryptoV2.decryptMasterKey(encrypted, 'wrong', salt, iv, authTag))
        .rejects.toThrow();
    });
  });

  describe('Auth Data', () => {
    test('createAuthData returns valid structure', async () => {
      const authData = await cryptoV2.createAuthData('test-password');
      expect(authData.version).toBe(cryptoV2.FORMAT_VERSION);
      expect(authData.algorithm).toBe('argon2id');
      expect(authData.salt).toBeDefined();
      expect(authData.mk_iv).toBeDefined();
      expect(authData.mk_encrypted).toBeDefined();
      expect(authData.mk_auth_tag).toBeDefined();
      expect(authData.mk_verify).toBeDefined();
    });

    test('loadMasterKey recovers master key', async () => {
      const authData = await cryptoV2.createAuthData('test-password');
      const mk = await cryptoV2.loadMasterKey(authData, 'test-password');
      expect(mk.length).toBe(32);
    });

    test('loadMasterKey fails with wrong password', async () => {
      const authData = await cryptoV2.createAuthData('test-password');
      await expect(cryptoV2.loadMasterKey(authData, 'wrong-password'))
        .rejects.toThrow();
    });

    test('validateAuthData accepts valid data', () => {
      const data = {
        version: cryptoV2.FORMAT_VERSION,
        algorithm: 'argon2id',
        salt: 'aabb',
        mk_iv: 'ccdd',
        mk_encrypted: 'eeff',
        mk_auth_tag: '1122',
        mk_verify: '3344'
      };
      expect(cryptoV2.validateAuthData(data)).toBe(true);
    });

    test('validateAuthData rejects invalid version', () => {
      const data = {
        version: 999,
        algorithm: 'argon2id',
        salt: 'aabb', mk_iv: 'ccdd', mk_encrypted: 'eeff', mk_auth_tag: '1122', mk_verify: '3344'
      };
      expect(cryptoV2.validateAuthData(data)).toBe(false);
    });

    test('validateAuthData rejects missing fields', () => {
      expect(cryptoV2.validateAuthData(null)).toBe(false);
      expect(cryptoV2.validateAuthData({})).toBe(false);
      expect(cryptoV2.validateAuthData({ version: cryptoV2.FORMAT_VERSION })).toBe(false);
    });
  });

  describe('Buffer Encryption', () => {
    test('encryptBuffer and decryptBuffer roundtrip', () => {
      const mk = crypto.randomBytes(32);
      const data = Buffer.from('Hello, Vault!');
      const encrypted = cryptoV2.encryptBuffer(data, mk);
      const decrypted = cryptoV2.decryptBuffer(encrypted, mk);
      expect(decrypted.equals(data)).toBe(true);
    });

    test('decryptBuffer fails with wrong key', () => {
      const mk1 = crypto.randomBytes(32);
      const mk2 = crypto.randomBytes(32);
      const data = Buffer.from('secret');
      const encrypted = cryptoV2.encryptBuffer(data, mk1);
      expect(() => cryptoV2.decryptBuffer(encrypted, mk2)).toThrow();
    });

    test('decryptBuffer fails with tampered data', () => {
      const mk = crypto.randomBytes(32);
      const data = Buffer.from('secret');
      const encrypted = cryptoV2.encryptBuffer(data, mk);
      const tampered = Buffer.from(encrypted);
      tampered[20] ^= 0xFF;
      expect(() => cryptoV2.decryptBuffer(tampered, mk)).toThrow();
    });

    test('encryptBuffer with AAD roundtrip', () => {
      const mk = crypto.randomBytes(32);
      const data = Buffer.from('authenticated data');
      const aad = Buffer.from('context');
      const encrypted = cryptoV2.encryptBuffer(data, mk, aad);
      const decrypted = cryptoV2.decryptBuffer(encrypted, mk, aad);
      expect(decrypted.equals(data)).toBe(true);
    });

    test('decryptBuffer fails with wrong AAD', () => {
      const mk = crypto.randomBytes(32);
      const data = Buffer.from('secret');
      const encrypted = cryptoV2.encryptBuffer(data, mk, Buffer.from('correct'));
      expect(() => cryptoV2.decryptBuffer(encrypted, mk, Buffer.from('wrong'))).toThrow();
    });
  });

  describe('Text Encryption', () => {
    test('encryptText and decryptText roundtrip', () => {
      const mk = crypto.randomBytes(32);
      const text = 'Hello, World!';
      const encrypted = cryptoV2.encryptText(text, mk);
      const decrypted = cryptoV2.decryptText(encrypted, mk);
      expect(decrypted).toBe(text);
    });
  });

  describe('Database Encryption', () => {
    test('encryptDatabase and decryptDatabase roundtrip', () => {
      const mk = crypto.randomBytes(32);
      const data = Buffer.from('SQLite format 3' + '\0'.repeat(100));
      const encrypted = cryptoV2.encryptDatabase(data, mk);
      const decrypted = cryptoV2.decryptDatabase(encrypted, mk);
      expect(decrypted.equals(data)).toBe(true);
    });

    test('decryptDatabase fails with wrong key', () => {
      const mk1 = crypto.randomBytes(32);
      const mk2 = crypto.randomBytes(32);
      const data = Buffer.from('database content');
      const encrypted = cryptoV2.encryptDatabase(data, mk1);
      expect(() => cryptoV2.decryptDatabase(encrypted, mk2)).toThrow();
    });
  });

  describe('File Encryption', () => {
    test('encryptFile and decryptFile roundtrip', () => {
      const mk = crypto.randomBytes(32);
      const fs = require('fs');
      const path = require('path');
      const tmpDir = require('os').tmpdir();
      const fileName = 'vault-test-file-' + Date.now() + '.txt';
      const inputPath = path.join(tmpDir, fileName);
      const encPath = path.join(tmpDir, fileName + '.enc');
      const decPath = path.join(tmpDir, fileName + '.dec');

      try {
        fs.writeFileSync(inputPath, 'test content for file encryption');
        cryptoV2.encryptFile(inputPath, encPath, mk);
        cryptoV2.decryptFile(encPath, decPath, mk);
        const result = fs.readFileSync(decPath, 'utf8');
        expect(result).toBe('test content for file encryption');
      } finally {
        try { fs.unlinkSync(inputPath); } catch {}
        try { fs.unlinkSync(encPath); } catch {}
        try { fs.unlinkSync(decPath); } catch {}
      }
    });
  });

  describe('Password Hashing', () => {
    test('hashPasswordLegacy and verifyPasswordLegacy roundtrip', () => {
      const hashed = cryptoV2.hashPasswordLegacy('test-password');
      expect(cryptoV2.verifyPasswordLegacy('test-password', hashed)).toBe(true);
    });

    test('verifyPasswordLegacy fails with wrong password', () => {
      const hashed = cryptoV2.hashPasswordLegacy('correct');
      expect(cryptoV2.verifyPasswordLegacy('wrong', hashed)).toBe(false);
    });
  });

  describe('Secure Operations', () => {
    test('secureCompare matches equal buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hello');
      expect(cryptoV2.secureCompare(a, b)).toBe(true);
    });

    test('secureCompare rejects different buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('world');
      expect(cryptoV2.secureCompare(a, b)).toBe(false);
    });

    test('atomicWrite creates file', () => {
      const fs = require('fs');
      const path = require('path');
      const tmpDir = require('os').tmpdir();
      const testPath = path.join(tmpDir, 'vault-atomic-test-' + Date.now() + '.txt');

      try {
        cryptoV2.atomicWrite(testPath, 'test content');
        expect(fs.readFileSync(testPath, 'utf8')).toBe('test content');
      } finally {
        try { fs.unlinkSync(testPath); } catch {}
      }
    });

    test('atomicWrite overwrites existing file', () => {
      const fs = require('fs');
      const path = require('path');
      const tmpDir = require('os').tmpdir();
      const testPath = path.join(tmpDir, 'vault-atomic-overwrite-' + Date.now() + '.txt');

      try {
        fs.writeFileSync(testPath, 'old content');
        cryptoV2.atomicWrite(testPath, 'new content');
        expect(fs.readFileSync(testPath, 'utf8')).toBe('new content');
      } finally {
        try { fs.unlinkSync(testPath); } catch {}
      }
    });
  });
});
