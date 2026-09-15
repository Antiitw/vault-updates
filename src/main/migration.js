const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cryptoV2 = require('./crypto-v2');
const cryptoV1 = require('./crypto');
const { VAULT_DIR, FILES_DIR, THUMBS_DIR, DB_PATH, AUTH_PATH } = require('../shared/constants');

const VERSION_PATH = path.join(VAULT_DIR, '.vault_version');
const HKDF_INFO_COUNTER = Buffer.from('vault-counter-sign-v2', 'utf8');

function logMigration(msg) {
  try {
    const logPath = path.join(VAULT_DIR, 'vault.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [MIGRATION] ${msg}\n`);
  } catch {}
}

function signCounter(counter, masterKey) {
  const counterKey = cryptoV2.deriveSubKey(masterKey, HKDF_INFO_COUNTER);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const signature = crypto.createHmac('sha256', counterKey).update(counterBuf).digest();
  cryptoV2.secureClear(counterKey);
  return signature;
}

function verifyCounterSignature(data, masterKey) {
  if (!masterKey) return false;
  try {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(data.counter));
    const expectedSig = signCounter(data.counter, masterKey);
    const storedSig = Buffer.from(data.signature, 'hex');
    if (storedSig.length !== expectedSig.length) return false;
    return crypto.timingSafeEqual(storedSig, expectedSig);
  } catch {
    return false;
  }
}

function getVaultVersion() {
  if (!fs.existsSync(VERSION_PATH)) return 1;
  try {
    const data = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
    return data.version || 1;
  } catch {
    return 1;
  }
}

function saveVaultVersion(version, counter, masterKey) {
  const signature = signCounter(counter, masterKey);
  const data = {
    version,
    counter,
    signature: signature.toString('hex'),
    updated_at: new Date().toISOString()
  };
  cryptoV2.atomicWrite(VERSION_PATH, JSON.stringify(data));
}

function incrementCounter(masterKey) {
  if (!fs.existsSync(VERSION_PATH)) {
    saveVaultVersion(cryptoV2.FORMAT_VERSION, 1, masterKey);
    return 1;
  }
  try {
    const data = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
    data.counter = (data.counter || 0) + 1;
    const signature = signCounter(data.counter, masterKey);
    data.signature = signature.toString('hex');
    data.updated_at = new Date().toISOString();
    cryptoV2.atomicWrite(VERSION_PATH, JSON.stringify(data));
    return data.counter;
  } catch {
    saveVaultVersion(cryptoV2.FORMAT_VERSION, 1, masterKey);
    return 1;
  }
}

function verifyCounter(masterKey) {
  if (!fs.existsSync(VERSION_PATH)) return { valid: true, counter: 0, rollback: false };
  try {
    const data = JSON.parse(fs.readFileSync(VERSION_PATH, 'utf8'));
    if (!data.signature || !masterKey) {
      return { valid: false, counter: data.counter || 0, rollback: false };
    }
    const signatureValid = verifyCounterSignature(data, masterKey);
    return {
      valid: signatureValid,
      counter: data.counter || 0,
      rollback: false
    };
  } catch {
    return { valid: false, counter: 0, rollback: false };
  }
}

function detectRollback(currentCounter, previousCounter) {
  return currentCounter < previousCounter;
}

function migrateV1ToV2(password, onProgress, masterKey) {
  logMigration('Starting migration v1 to v2');
  const startTime = Date.now();

  try {
    const authData = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));

    if (!cryptoV1.verifyPassword(password, authData)) {
      throw new Error('Invalid password for migration');
    }

    if (onProgress) onProgress({ stage: 'creating_master_key', percent: 5 });

    const newAuthData = cryptoV2.createAuthData(password);
    const mk = cryptoV2.loadMasterKey(newAuthData, password);

    if (onProgress) onProgress({ stage: 'migrating_database', percent: 15 });

    let dbSuccess = false;
    if (fs.existsSync(DB_PATH)) {
      try {
        const encryptedDb = fs.readFileSync(DB_PATH);
        let dbBuffer;

        try {
          dbBuffer = cryptoV1.decryptDatabase(encryptedDb, password);
        } catch {
          dbBuffer = encryptedDb;
        }

        const newEncryptedDb = cryptoV2.encryptDatabase(dbBuffer, mk);
        const tmpDbPath = DB_PATH + '.v1.bak';
        fs.copyFileSync(DB_PATH, tmpDbPath);
        cryptoV2.atomicWrite(DB_PATH, newEncryptedDb);
        cryptoV2.secureClear(dbBuffer);
        cryptoV2.secureClear(newEncryptedDb);
        dbSuccess = true;
        logMigration('Database migrated successfully');
      } catch (err) {
        logMigration('Database migration failed: ' + err.message);
      }
    }

    if (onProgress) onProgress({ stage: 'migrating_files', percent: 30 });

    let filesMigrated = 0;
    let filesTotal = 0;
    let thumbsMigrated = 0;

    if (fs.existsSync(FILES_DIR)) {
      const files = fs.readdirSync(FILES_DIR).filter(f => !f.endsWith('.v1.bak'));
      filesTotal = files.length;

      for (const file of files) {
        try {
          const filePath = path.join(FILES_DIR, file);
          const encrypted = fs.readFileSync(filePath);

          let decrypted;
          try {
            decrypted = cryptoV1.decryptBuffer(encrypted, password);
          } catch {
            decrypted = encrypted;
          }

          const newEncrypted = cryptoV2.encryptBuffer(decrypted, mk);

          const tmpPath = filePath + '.v1.bak';
          fs.copyFileSync(filePath, tmpPath);
          cryptoV2.atomicWrite(filePath, newEncrypted);
          cryptoV2.secureClear(decrypted);
          cryptoV2.secureClear(newEncrypted);
          filesMigrated++;

          if (onProgress) {
            const filePercent = 30 + Math.floor((filesMigrated / filesTotal) * 40);
            onProgress({ stage: 'migrating_files', percent: filePercent, current: filesMigrated, total: filesTotal });
          }
        } catch (err) {
          logMigration('Failed to migrate file ' + file + ': ' + err.message);
        }
      }
    }

    if (onProgress) onProgress({ stage: 'migrating_thumbnails', percent: 70 });

    if (fs.existsSync(THUMBS_DIR)) {
      const thumbs = fs.readdirSync(THUMBS_DIR).filter(f => !f.endsWith('.v1.bak'));
      const thumbsTotal = thumbs.length;

      for (const thumb of thumbs) {
        try {
          const thumbPath = path.join(THUMBS_DIR, thumb);
          const encrypted = fs.readFileSync(thumbPath);

          let decrypted;
          try {
            decrypted = cryptoV1.decryptBuffer(encrypted, password);
          } catch {
            decrypted = encrypted;
          }

          const newEncrypted = cryptoV2.encryptBuffer(decrypted, mk);

          const tmpPath = thumbPath + '.v1.bak';
          fs.copyFileSync(thumbPath, tmpPath);
          cryptoV2.atomicWrite(thumbPath, newEncrypted);
          cryptoV2.secureClear(decrypted);
          cryptoV2.secureClear(newEncrypted);
          thumbsMigrated++;
        } catch (err) {
          logMigration('Failed to migrate thumbnail ' + thumb + ': ' + err.message);
        }
      }
    }

    if (onProgress) onProgress({ stage: 'saving_auth', percent: 90 });

    cryptoV2.atomicWrite(AUTH_PATH, JSON.stringify(newAuthData, null, 2));

    saveVaultVersion(cryptoV2.FORMAT_VERSION, 1, mk);

    cleanupV1Backups();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logMigration('Migration completed in ' + elapsed + 's: ' + filesMigrated + ' files, ' + thumbsMigrated + ' thumbnails');

    return {
      success: true,
      filesMigrated,
      thumbsMigrated,
      elapsed: parseFloat(elapsed)
    };
  } catch (err) {
    logMigration('Migration failed: ' + err.message);
    return { success: false, error: err.message };
  }
}

function cleanupV1Backups() {
  const dirs = [FILES_DIR, THUMBS_DIR, VAULT_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.v1.bak'));
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(dir, file));
      } catch {}
    }
  }
}

function rollbackMigration() {
  logMigration('Rolling back migration');

  const dirs = [FILES_DIR, THUMBS_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const backups = fs.readdirSync(dir).filter(f => f.endsWith('.v1.bak'));
    const current = fs.readdirSync(dir).filter(f => !f.endsWith('.v1.bak'));

    for (const file of current) {
      const filePath = path.join(dir, file);
      try { fs.unlinkSync(filePath); } catch {}
    }

    for (const backup of backups) {
      const backupPath = path.join(dir, backup);
      const originalPath = path.join(dir, backup.replace('.v1.bak', ''));
      try {
        fs.renameSync(backupPath, originalPath);
      } catch {}
    }
  }

  const dbBackup = DB_PATH + '.v1.bak';
  if (fs.existsSync(dbBackup)) {
    try {
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      fs.renameSync(dbBackup, DB_PATH);
    } catch {}
  }

  const authBackup = AUTH_PATH + '.v1.bak';
  if (fs.existsSync(authBackup)) {
    try {
      if (fs.existsSync(AUTH_PATH)) fs.unlinkSync(AUTH_PATH);
      fs.renameSync(authBackup, AUTH_PATH);
    } catch {}
  }

  if (fs.existsSync(VERSION_PATH)) {
    try { fs.unlinkSync(VERSION_PATH); } catch {}
  }

  logMigration('Rollback completed');
}

function needsMigration() {
  const version = getVaultVersion();
  return version < cryptoV2.FORMAT_VERSION;
}

function getMigrationStatus() {
  const version = getVaultVersion();
  return {
    currentVersion: version,
    targetVersion: cryptoV2.FORMAT_VERSION,
    needsMigration: version < cryptoV2.FORMAT_VERSION
  };
}

module.exports = {
  migrateV1ToV2,
  rollbackMigration,
  needsMigration,
  getMigrationStatus,
  getVaultVersion,
  saveVaultVersion,
  incrementCounter,
  verifyCounter,
  detectRollback,
  signCounter,
  verifyCounterSignature
};
