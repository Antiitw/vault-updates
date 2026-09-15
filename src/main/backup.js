const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { VAULT_DIR, DB_PATH, AUTH_PATH, FILES_DIR, THUMBS_DIR } = require('../shared/constants');
const cryptoV2 = require('./crypto-v2');

const BACKUPS_DIR = path.join(VAULT_DIR, 'backups');
const HKDF_INFO_BACKUP = Buffer.from('vault-backup-key', 'utf8');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true, mode: 0o700 });
  }
}

function getBackupMetadata(masterKey) {
  const versionPath = path.join(VAULT_DIR, '.vault_version');
  let counter = 0;
  try {
    if (fs.existsSync(versionPath)) {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      counter = data.counter || 0;
    }
  } catch {}

  return {
    version: cryptoV2.FORMAT_VERSION,
    counter,
    timestamp: new Date().toISOString(),
    hostname: require('os').hostname()
  };
}

function deriveBackupKey(masterKey) {
  return cryptoV2.deriveSubKey(masterKey, HKDF_INFO_BACKUP);
}

function encryptBackupData(data, masterKey) {
  const key = deriveBackupKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  cryptoV2.secureClear(key);

  const result = Buffer.alloc(4 + iv.length + authTag.length + encrypted.length);
  let offset = 0;
  result.writeUInt32BE(iv.length, offset); offset += 4;
  iv.copy(result, offset); offset += iv.length;
  authTag.copy(result, offset); offset += authTag.length;
  encrypted.copy(result, offset);

  return result;
}

function decryptBackupData(encryptedData, masterKey) {
  const key = deriveBackupKey(masterKey);
  let offset = 0;

  const ivLen = encryptedData.readUInt32BE(offset); offset += 4;
  const iv = encryptedData.subarray(offset, offset + ivLen); offset += ivLen;
  const authTag = encryptedData.subarray(offset, offset + 16); offset += 16;
  const encrypted = encryptedData.subarray(offset);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  cryptoV2.secureClear(key);

  return decrypted;
}

function collectBackupFiles() {
  const files = [];

  if (fs.existsSync(DB_PATH)) {
    files.push({ name: 'vault.db', path: DB_PATH });
  }

  if (fs.existsSync(AUTH_PATH)) {
    files.push({ name: 'auth.json', path: AUTH_PATH });
  }

  const settingsPath = path.join(VAULT_DIR, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    files.push({ name: 'settings.json', path: settingsPath });
  }

  if (fs.existsSync(FILES_DIR)) {
    const fileNames = fs.readdirSync(FILES_DIR).filter(f => !f.endsWith('.v1.bak') && !f.startsWith('.'));
    for (const name of fileNames) {
      files.push({ name: `files/${name}`, path: path.join(FILES_DIR, name) });
    }
  }

  if (fs.existsSync(THUMBS_DIR)) {
    const thumbNames = fs.readdirSync(THUMBS_DIR).filter(f => !f.endsWith('.v1.bak') && !f.startsWith('.'));
    for (const name of thumbNames) {
      files.push({ name: `thumbnails/${name}`, path: path.join(THUMBS_DIR, name) });
    }
  }

  return files;
}

function createSimpleArchive(files) {
  const entries = [];
  for (const file of files) {
    const data = fs.readFileSync(file.path);
    const nameBuf = Buffer.from(file.name, 'utf8');
    const entry = Buffer.alloc(4 + nameBuf.length + 4 + data.length);
    let offset = 0;
    entry.writeUInt32BE(nameBuf.length, offset); offset += 4;
    nameBuf.copy(entry, offset); offset += nameBuf.length;
    entry.writeUInt32BE(data.length, offset); offset += 4;
    data.copy(entry, offset);
    entries.push(entry);
  }

  const totalSize = entries.reduce((sum, e) => sum + e.length, 0);
  const result = Buffer.alloc(4 + totalSize);
  result.writeUInt32BE(entries.length);
  let offset = 4;
  for (const entry of entries) {
    entry.copy(result, offset);
    offset += entry.length;
  }

  return result;
}

function extractSimpleArchive(archive) {
  const files = [];
  let offset = 0;
  const count = archive.readUInt32BE(offset); offset += 4;

  for (let i = 0; i < count; i++) {
    const nameLen = archive.readUInt32BE(offset); offset += 4;
    const name = archive.subarray(offset, offset + nameLen).toString('utf8'); offset += nameLen;
    const dataLen = archive.readUInt32BE(offset); offset += 4;
    const data = archive.subarray(offset, offset + dataLen); offset += dataLen;
    files.push({ name, data });
  }

  return files;
}

async function createBackup(masterKey, onProgress) {
  ensureBackupDir();

  if (onProgress) onProgress({ stage: 'collecting', percent: 10 });

  const files = collectBackupFiles();
  const metadata = getBackupMetadata(masterKey);

  if (onProgress) onProgress({ stage: 'archiving', percent: 30 });

  const archive = createSimpleArchive(files);

  if (onProgress) onProgress({ stage: 'encrypting', percent: 60 });

  const encrypted = encryptBackupData(archive, masterKey);
  cryptoV2.secureClear(archive);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `vault-backup-${timestamp}.vcb`;
  const backupPath = path.join(BACKUPS_DIR, backupName);

  if (onProgress) onProgress({ stage: 'writing', percent: 80 });

  cryptoV2.atomicWrite(backupPath, encrypted);
  try { fs.chmodSync(backupPath, 0o600); } catch {}
  cryptoV2.secureClear(encrypted);

  if (onProgress) onProgress({ stage: 'complete', percent: 100 });

  return {
    success: true,
    path: backupPath,
    name: backupName,
    filesCount: files.length,
    metadata
  };
}

function listBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.vcb'));
  return files.map(name => ({
    name,
    path: path.join(BACKUPS_DIR, name),
    size: fs.statSync(path.join(BACKUPS_DIR, name)).size,
    created: fs.statSync(path.join(BACKUPS_DIR, name)).birthtime
  })).sort((a, b) => b.created - a.created);
}

async function restoreBackup(backupPath, masterKey, onProgress) {
  if (!fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file not found' };
  }

  if (onProgress) onProgress({ stage: 'reading', percent: 10 });

  const encrypted = fs.readFileSync(backupPath);

  if (onProgress) onProgress({ stage: 'decrypting', percent: 30 });

  let archive;
  try {
    archive = decryptBackupData(encrypted, masterKey);
  } catch (err) {
    return { success: false, error: 'Decryption failed - wrong key or corrupted backup' };
  }

  if (onProgress) onProgress({ stage: 'extracting', percent: 50 });

  const files = extractSimpleArchive(archive);
  cryptoV2.secureClear(archive);

  if (onProgress) onProgress({ stage: 'restoring', percent: 70 });

  let restored = 0;
  for (const file of files) {
    const targetPath = path.join(VAULT_DIR, file.name);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    cryptoV2.atomicWrite(targetPath, file.data);
    try { fs.chmodSync(targetPath, 0o600); } catch {}
    restored++;

    if (onProgress) {
      const percent = 70 + Math.floor((restored / files.length) * 25);
      onProgress({ stage: 'restoring', percent, current: restored, total: files.length });
    }
  }

  if (onProgress) onProgress({ stage: 'complete', percent: 100 });

  return {
    success: true,
    filesCount: restored
  };
}

function deleteBackup(backupName) {
  if (!backupName || !backupName.endsWith('.vcb')) return false;
  const backupPath = path.join(BACKUPS_DIR, backupName);
  if (!backupPath.startsWith(BACKUPS_DIR)) return false;
  try {
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      return true;
    }
  } catch {}
  return false;
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup
};
