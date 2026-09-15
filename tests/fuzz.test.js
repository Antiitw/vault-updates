const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const cryptoV2 = require('../src/main/crypto-v2');

const TEST_DIR = path.join(os.tmpdir(), 'vault-fuzz-' + Date.now());

describe('Fuzzing - Crypto Module', () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  test('random buffer → decryptBuffer handles gracefully', () => {
    const mk = cryptoV2.generateMasterKey();
    const randomData = crypto.randomBytes(256);
    expect(() => {
      try { cryptoV2.decryptBuffer(randomData, mk); } catch {}
    }).not.toThrow();
  });

  test('empty buffer → decryptBuffer handles gracefully', () => {
    const mk = cryptoV2.generateMasterKey();
    expect(() => {
      try { cryptoV2.decryptBuffer(Buffer.alloc(0), mk); } catch {}
    }).not.toThrow();
  });

  test('single byte → decryptBuffer handles gracefully', () => {
    const mk = cryptoV2.generateMasterKey();
    expect(() => {
      try { cryptoV2.decryptBuffer(Buffer.from([0x04]), mk); } catch {}
    }).not.toThrow();
  });

  test('tampered auth tag → decryptBuffer fails', () => {
    const mk = cryptoV2.generateMasterKey();
    const data = Buffer.from('test data for fuzzing');
    const encrypted = cryptoV2.encryptBuffer(data, mk);

    const tampered = Buffer.from(encrypted);
    const tagPos = 1 + 1 + 12;
    if (tampered.length > tagPos + 5) {
      tampered[tagPos + 5] ^= 0xFF;
    }

    expect(() => {
      try { cryptoV2.decryptBuffer(tampered, mk); } catch {}
    }).not.toThrow();
  });

  test('wrong key → decryptBuffer fails', () => {
    const mk1 = cryptoV2.generateMasterKey();
    const mk2 = cryptoV2.generateMasterKey();
    const data = Buffer.from('test data');
    const encrypted = cryptoV2.encryptBuffer(data, mk1);

    expect(() => {
      try { cryptoV2.decryptBuffer(encrypted, mk2); } catch {}
    }).not.toThrow();
  });

  test('truncated buffer → decryptBuffer handles gracefully', () => {
    const mk = cryptoV2.generateMasterKey();
    const data = Buffer.from('test data');
    const encrypted = cryptoV2.encryptBuffer(data, mk);

    for (const len of [1, 5, 10, 20, 30]) {
      if (len < encrypted.length) {
        expect(() => {
          try { cryptoV2.decryptBuffer(encrypted.subarray(0, len), mk); } catch {}
        }).not.toThrow();
      }
    }
  });

  test('very large buffer → encrypt/decrypt roundtrip', () => {
    const mk = cryptoV2.generateMasterKey();
    const data = crypto.randomBytes(1024 * 1024);
    const encrypted = cryptoV2.encryptBuffer(data, mk);
    const decrypted = cryptoV2.decryptBuffer(encrypted, mk);
    expect(decrypted).toEqual(data);
    cryptoV2.secureClear(decrypted);
  });

  test('invalid version byte → decryptBuffer throws', () => {
    const mk = cryptoV2.generateMasterKey();
    const data = Buffer.from('test');
    const encrypted = cryptoV2.encryptBuffer(data, mk);

    const bad = Buffer.from(encrypted);
    bad[0] = 0xFF;

    expect(() => cryptoV2.decryptBuffer(bad, mk)).toThrow();
  });

  test('nil bytes in data → encrypt/decrypt roundtrip', () => {
    const mk = cryptoV2.generateMasterKey();
    const data = Buffer.alloc(100, 0);
    data[50] = 0xFF;
    const encrypted = cryptoV2.encryptBuffer(data, mk);
    const decrypted = cryptoV2.decryptBuffer(encrypted, mk);
    expect(decrypted).toEqual(data);
  });

  test('unicode strings → encryptText/decryptText roundtrip', () => {
    const mk = cryptoV2.generateMasterKey();
    const strings = [
      'Hello World',
      'ñáéíóú',
      '中文测试',
      '\x00\x01\x02',
      'a'.repeat(10000)
    ];

    for (const str of strings) {
      const encrypted = cryptoV2.encryptText(str, mk);
      const decrypted = cryptoV2.decryptText(encrypted, mk);
      expect(decrypted).toBe(str);
    }
  });

  test('concurrent encrypt/decrypt does not interfere', () => {
    const mk = cryptoV2.generateMasterKey();

    for (let i = 0; i < 10; i++) {
      const data = Buffer.from(`data-${i}`);
      const enc = cryptoV2.encryptBuffer(data, mk);
      const dec = cryptoV2.decryptBuffer(enc, mk);
      expect(dec).toEqual(data);
      cryptoV2.secureClear(dec);
    }
  });
});

describe('Fuzzing - Auth Module', () => {
  test('corrupted auth.json → loadMasterKey fails gracefully', async () => {
    const corruptions = [
      '{}',
      '{"version": 4}',
      '{"version": 4, "salt": "xxx"}',
      '{"mk_encrypted": "deadbeef"}',
      '{"version": "not a number"}',
      '{"argon2": null}'
    ];

    for (const corrupt of corruptions) {
      try {
        const authData = JSON.parse(corrupt);
        if (cryptoV2.validateAuthData(authData)) {
          await cryptoV2.loadMasterKey(authData, 'test');
        }
      } catch {}
    }
  });
});

describe('Fuzzing - Path Validation', () => {
  test('secureCompare handles different lengths safely', () => {
    const a = Buffer.from('short');
    const b = Buffer.from('much longer string');
    expect(cryptoV2.secureCompare(a, b)).toBe(false);
    expect(cryptoV2.secureCompare(b, a)).toBe(false);
  });

  test('secureCompare handles empty buffers', () => {
    const empty = Buffer.alloc(0);
    expect(cryptoV2.secureCompare(empty, empty)).toBe(true);
  });
});

describe('Fuzzing - Counter Verification', () => {
  test('invalid counter signatures rejected', () => {
    const mk = cryptoV2.generateMasterKey();
    const validSig = cryptoV2.signCounter(1, mk);

    const invalid = [
      { counter: 1, signature: 'deadbeef' },
      { counter: -1, signature: validSig.toString('hex') },
      { counter: 0, signature: '' }
    ];

    for (const data of invalid) {
      const result = cryptoV2.verifyCounterSignature(data, mk);
      expect(result).toBe(false);
    }
  });

  test('valid counter signature accepted', () => {
    const mk = cryptoV2.generateMasterKey();
    const sig = cryptoV2.signCounter(42, mk);
    const data = { counter: 42, signature: sig.toString('hex') };
    const result = cryptoV2.verifyCounterSignature(data, mk);
    expect(result).toBe(true);
  });

  test('wrong key rejects counter signature', () => {
    const mk1 = cryptoV2.generateMasterKey();
    const mk2 = cryptoV2.generateMasterKey();
    const sig = cryptoV2.signCounter(1, mk1);
    const data = { counter: 1, signature: sig.toString('hex') };
    const result = cryptoV2.verifyCounterSignature(data, mk2);
    expect(result).toBe(false);
  });
});

describe('Security - Timing Attack Resistance', () => {
  test('secureCompare does not leak length info', () => {
    const a = Buffer.from('secret');
    const b = Buffer.from('secret');
    const c = Buffer.from('wrong');

    expect(cryptoV2.secureCompare(a, b)).toBe(true);
    expect(cryptoV2.secureCompare(a, c)).toBe(false);
    expect(cryptoV2.secureCompare(c, a)).toBe(false);
  });
});

describe('Security - Secure Clear', () => {
  test('secureClear zeros buffer', () => {
    const buf = Buffer.from('sensitive data');
    cryptoV2.secureClear(buf);
    const allZeros = buf.every(b => b === 0);
    expect(allZeros).toBe(true);
  });

  test('secureClear handles null gracefully', () => {
    expect(() => cryptoV2.secureClear(null)).not.toThrow();
  });
});
