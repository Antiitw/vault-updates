const { validateEncryptedName } = require('../src/main/file-manager');

describe('File Manager - Path Traversal Protection', () => {
  test('validateEncryptedName accepts valid hex name', () => {
    expect(validateEncryptedName('a'.repeat(32))).toBe(true);
  });

  test('validateEncryptedName accepts random hex', () => {
    expect(validateEncryptedName('0123456789abcdef0123456789abcdef')).toBe(true);
  });

  test('validateEncryptedName rejects path traversal with ../', () => {
    expect(validateEncryptedName('../../../etc/passwd')).toBe(false);
  });

  test('validateEncryptedName rejects Windows path traversal', () => {
    expect(validateEncryptedName('..\\..\\windows\\system32')).toBe(false);
  });

  test('validateEncryptedName rejects absolute path', () => {
    expect(validateEncryptedName('/etc/passwd')).toBe(false);
  });

  test('validateEncryptedName rejects Windows absolute path', () => {
    expect(validateEncryptedName('C:\\Windows\\System32')).toBe(false);
  });

  test('validateEncryptedName rejects null', () => {
    expect(validateEncryptedName(null)).toBe(false);
  });

  test('validateEncryptedName rejects undefined', () => {
    expect(validateEncryptedName(undefined)).toBe(false);
  });

  test('validateEncryptedName rejects empty string', () => {
    expect(validateEncryptedName('')).toBe(false);
  });

  test('validateEncryptedName rejects non-hex characters', () => {
    expect(validateEncryptedName('ghijklmnopqrstuvwxyz01234567')).toBe(false);
  });

  test('validateEncryptedName rejects too short', () => {
    expect(validateEncryptedName('abc')).toBe(false);
  });

  test('validateEncryptedName rejects too long', () => {
    expect(validateEncryptedName('a'.repeat(33))).toBe(false);
  });

  test('validateEncryptedName rejects file:// URI', () => {
    expect(validateEncryptedName('file:///etc/passwd')).toBe(false);
  });

  test('validateEncryptedName rejects null bytes', () => {
    expect(validateEncryptedName('\x00\x00\x00')).toBe(false);
  });

  test('validateEncryptedName rejects very long string', () => {
    expect(validateEncryptedName('a'.repeat(10000))).toBe(false);
  });

  test('validateEncryptedName rejects SQL injection', () => {
    expect(validateEncryptedName("' OR 1=1 --")).toBe(false);
  });

  test('validateEncryptedName rejects script injection', () => {
    expect(validateEncryptedName('<script>alert(1)</script>')).toBe(false);
  });
});
