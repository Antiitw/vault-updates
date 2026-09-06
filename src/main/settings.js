const fs = require('fs');
const path = require('path');
const { VAULT_DIR } = require('../shared/constants');

const SETTINGS_PATH = path.join(VAULT_DIR, 'settings.json');

const DEFAULTS = {
  theme: 'dark',
  language: 'en'
};

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
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
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { getSettings, saveSettings };
