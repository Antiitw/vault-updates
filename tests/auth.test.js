const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_VAULT_DIR = path.join(os.tmpdir(), 'vault-auth-test-' + Date.now());

describe('Auth Module', () => {
  let originalHome;
  let originalUserProfile;

  beforeAll(() => {
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = TEST_VAULT_DIR;
    process.env.USERPROFILE = TEST_VAULT_DIR;
  });

  afterAll(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    try { fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true }); } catch {}
  });

  beforeEach(() => {
    jest.resetModules();
  });

  test('isInitialized returns false when no auth.json', () => {
    const { isInitialized } = require('../src/main/auth');
    expect(isInitialized()).toBe(false);
  });

  test('setup creates auth.json', () => {
    const { setup, isInitialized } = require('../src/main/auth');
    setup('test-password-123');
    expect(isInitialized()).toBe(true);
  });

  test('login succeeds with correct password', async () => {
    const { setup, login } = require('../src/main/auth');
    setup('correct-password');
    const result = await login('correct-password');
    expect(result.success).toBe(true);
  });

  test('login fails with wrong password', async () => {
    const { setup, login } = require('../src/main/auth');
    setup('correct-password');
    const result = await login('wrong-password');
    expect(result.success).toBe(false);
  });

  test('isLockedOut returns false initially', () => {
    const { isLockedOut } = require('../src/main/auth');
    expect(isLockedOut()).toBe(false);
  });

  test('getFailedAttempts returns 0 initially', () => {
    const { getFailedAttempts } = require('../src/main/auth');
    expect(getFailedAttempts()).toBe(0);
  });

  test('login with empty password fails', async () => {
    const { setup, login } = require('../src/main/auth');
    setup('test-password');
    const result = await login('');
    expect(result.success).toBe(false);
  });
});
