const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AUTH_PATH, VAULT_DIR } = require('../shared/constants');
const { hashPassword, verifyPassword, secureClear, secureCompare, atomicWrite } = require('./crypto');

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300000;

let failedAttempts = 0;
let lockoutUntil = 0;
let authSecret = null;

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(VAULT_DIR, 0o700);
  } catch {}
}

function getAuthSecret() {
  if (authSecret) return authSecret;
  try {
    if (fs.existsSync(AUTH_PATH)) {
      const stored = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
      if (stored.mk_verify) {
        authSecret = stored.mk_verify;
        return authSecret;
      }
      if (stored.hash) {
        authSecret = stored.hash;
        return authSecret;
      }
    }
  } catch {}
  authSecret = null;
  return null;
}

function signLockout(data) {
  const secret = getAuthSecret();
  if (!secret) return null;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
}

function loadLockout() {
  try {
    if (!fs.existsSync(AUTH_PATH)) return;
    const stored = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));

    if (stored.lockout && stored.lockout.signature) {
      const data = {
        failedAttempts: stored.lockout.failedAttempts,
        lockoutUntil: stored.lockout.lockoutUntil
      };
      const expectedSig = signLockout(data);
      if (expectedSig && secureCompare(stored.lockout.signature, expectedSig)) {
        failedAttempts = data.failedAttempts || 0;
        lockoutUntil = data.lockoutUntil || 0;
        return;
      }
    }

    failedAttempts = 0;
    lockoutUntil = 0;
  } catch {
    failedAttempts = 0;
    lockoutUntil = 0;
  }
}

function saveLockout() {
  try {
    if (!fs.existsSync(AUTH_PATH)) return;
    const stored = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));

    const data = { failedAttempts, lockoutUntil };
    const signature = signLockout(data);

    stored.lockout = { ...data, signature };

    atomicWrite(AUTH_PATH, JSON.stringify(stored, null, 2));
    try {
      fs.chmodSync(AUTH_PATH, 0o600);
    } catch {}
  } catch {}
}

function clearLockout() {
  failedAttempts = 0;
  lockoutUntil = 0;
  try {
    if (!fs.existsSync(AUTH_PATH)) return;
    const stored = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
    delete stored.lockout;
    atomicWrite(AUTH_PATH, JSON.stringify(stored, null, 2));
  } catch {}
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
  atomicWrite(AUTH_PATH, data);
  try {
    fs.chmodSync(AUTH_PATH, 0o600);
  } catch {}
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

  try {
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
  } catch (err) {
    return { success: false, error: 'Authentication error' };
  }
}

function getFailedAttempts() {
  return failedAttempts;
}

module.exports = { isInitialized, setup, login, isLockedOut, getFailedAttempts };
