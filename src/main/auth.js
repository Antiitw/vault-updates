const fs = require('fs');
const path = require('path');
const { AUTH_PATH, VAULT_DIR } = require('../shared/constants');
const { hashPassword, verifyPassword, secureClear } = require('./crypto');

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300000;
const LOCKOUT_PATH = path.join(VAULT_DIR, '.lockout');

let failedAttempts = 0;
let lockoutUntil = 0;

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
}

function loadLockout() {
  try {
    if (fs.existsSync(LOCKOUT_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCKOUT_PATH, 'utf8'));
      failedAttempts = data.failedAttempts || 0;
      lockoutUntil = data.lockoutUntil || 0;
    }
  } catch {}
}

function saveLockout() {
  try {
    ensureVaultDir();
    fs.writeFileSync(LOCKOUT_PATH, JSON.stringify({ failedAttempts, lockoutUntil }));
  } catch {}
}

function clearLockout() {
  failedAttempts = 0;
  lockoutUntil = 0;
  try { if (fs.existsSync(LOCKOUT_PATH)) fs.unlinkSync(LOCKOUT_PATH); } catch {}
}

function isInitialized() {
  return fs.existsSync(AUTH_PATH);
}

function isLockedOut() {
  loadLockout();
  if (lockoutUntil > 0 && Date.now() >= lockoutUntil) {
    clearLockout();
  }
  return Date.now() < lockoutUntil;
}

function setup(password) {
  ensureVaultDir();
  const hashed = hashPassword(password);
  const data = JSON.stringify(hashed, null, 2);
  fs.writeFileSync(AUTH_PATH, data);
  secureClear(Buffer.from(data));
  clearLockout();
  return true;
}

function login(password) {
  if (!isInitialized()) return { success: false, error: 'Vault not initialized' };
  if (isLockedOut()) {
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    return { success: false, error: `Locked out. Try again in ${remaining}s`, lockedOut: true };
  }

  const stored = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));

  const startTime = process.hrtime.bigint();
  const valid = verifyPassword(password, stored);
  const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;

  if (valid) {
    clearLockout();
    const minDelay = Math.max(0, 500 - elapsed);
    if (minDelay > 0) {
      return new Promise(resolve => setTimeout(() => resolve({ success: true }), minDelay));
    }
    return { success: true };
  }

  failedAttempts++;
  if (failedAttempts >= MAX_ATTEMPTS) {
    lockoutUntil = Date.now() + LOCKOUT_DURATION;
    saveLockout();
    return { success: false, error: `Too many attempts. Locked for 5 minutes`, lockedOut: true };
  }

  saveLockout();
  const remaining = MAX_ATTEMPTS - failedAttempts;
  return { success: false, error: `Wrong password. ${remaining} attempts remaining` };
}

function getFailedAttempts() {
  return failedAttempts;
}

module.exports = { isInitialized, setup, login, isLockedOut, getFailedAttempts };
