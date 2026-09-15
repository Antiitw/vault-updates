const fs = require('fs');
const path = require('path');
const { VAULT_DIR } = require('../shared/constants');
const { atomicWrite } = require('./crypto-v2');

const SETTINGS_PATH = path.join(VAULT_DIR, 'settings.json');

const DEFAULTS = {
  theme: 'dark',
  language: 'en'
};

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  }
  try { fs.chmodSync(VAULT_DIR, 0o700); } catch {}
}

function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      return { ...DEFAULTS, ...data };
    }
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings(settings) {
  ensureVaultDir();
  const current = getSettings();
  const merged = { ...current, ...settings };
  atomicWrite(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  try { fs.chmodSync(SETTINGS_PATH, 0o600); } catch {}
  return merged;
}

module.exports = { getSettings, saveSettings };
