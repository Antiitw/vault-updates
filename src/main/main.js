const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const { setup, login, isInitialized, isLockedOut } = require('./auth');
const { getDecryptedFilePath, secureCleanupTemp, cleanSecureTemp, THUMBS_DIR } = require('./file-manager');
const db = require('./db');
const fm = require('./file-manager');
const { getSettings, saveSettings } = require('./settings');
const migration = require('./migration');
const cryptoV2 = require('./crypto-v2');

const LOG_PATH = path.join(app.getPath('userData'), 'vault-debug.log');

function safeLog(msg) {
  try {
    const sanitized = msg
      .replace(/password[=:]\s*\S+/gi, 'password=***')
      .replace(/token[=:]\s*\S+/gi, 'token=***')
      .replace(/key[=:]\s*\S+/gi, 'key=***')
      .replace(/secret[=:]\s*\S+/gi, 'secret=***');
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${sanitized}\n`);
  } catch {}
}

let mainWindow = null;
let currentPassword = null;
let masterKey = null;
let updateChecked = false;
const appVersion = app.getVersion();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: ''
    },
    backgroundColor: '#0a0a0f'
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const isDev = !app.isPackaged;
    const csp = isDev
      ? "default-src 'self' http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' vault-thumb: data: blob:; font-src 'self'; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none';"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' vault-thumb: data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none';";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerProtocol() {
  protocol.registerFileProtocol('vault-thumb', (request, callback) => {
    const thumbName = request.url.replace('vault-thumb://', '');
    if (!/^[a-f0-9]{32}\.enc$/.test(thumbName)) {
      callback({ error: -6 });
      return;
    }
    callback({ path: path.join(THUMBS_DIR, thumbName) });
  });
}

app.whenReady().then(async () => {
  try {
    await db.ensureDb();
    safeLog('Database initialized');

    cleanSecureTemp();
    safeLog('Secure temp cleaned');

    registerProtocol();
    createWindow();
    safeLog('Window created');

    if (migration.needsMigration()) {
      safeLog('Migration needed: v' + migration.getVaultVersion() + ' -> v' + cryptoV2.FORMAT_VERSION);
      mainWindow?.webContents.send('migration:needed', migration.getMigrationStatus());
    }
  } catch (err) {
    safeLog('FATAL: ' + err.message + '\n' + err.stack);
    console.error('FATAL:', err);
  }
});

app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => {
  db.flushDb();
  cleanSecureTemp();
});

ipcMain.handle('auth:isInitialized', () => isInitialized());
ipcMain.handle('auth:setup', (e, password) => {
  safeLog('auth:setup');
  setup(password);
  currentPassword = password;
  db.setDbPassword(password);
  safeLog('auth:setup done');
  return { success: true };
});
ipcMain.handle('auth:login', async (e, password) => {
  safeLog('auth:login');
  try {
    if (isLockedOut()) return { success: false, error: 'Locked. Wait 5 min.' };
    const result = await login(password);
    safeLog('auth:login result: ' + (result?.success ? 'success' : 'failed'));
    if (result && result.success) {
      currentPassword = password;
      try {
        db.setDbPassword(password);
        const authPath = path.join(app.getPath('home'), '.vault-data', 'auth.json');
        if (fs.existsSync(authPath)) {
          const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
          if (authData.version === 2 && authData.mk_iv && authData.mk_encrypted && authData.mk_auth_tag && authData.mk_verify) {
            masterKey = cryptoV2.loadMasterKey(authData, password);
          }
        }
      } catch (dbErr) { safeLog('DB set password error: ' + dbErr.message); }
      if (!updateChecked) {
        updateChecked = true;
        setTimeout(() => autoUpdater.checkForUpdates().catch(e => safeLog('Update check error')), 3000);
      }
    }
    return result || { success: false, error: 'Login failed' };
  } catch (err) {
    safeLog('auth:login ERROR');
    return { success: false, error: 'An error occurred' };
  }
});
ipcMain.handle('auth:isUnlocked', () => !!currentPassword);

ipcMain.handle('migration:status', () => migration.getMigrationStatus());
ipcMain.handle('migration:start', async (e, password) => {
  safeLog('migration:start');
  try {
    const result = migration.migrateV1ToV2(password, (progress) => {
      mainWindow?.webContents.send('migration:progress', progress);
    });
    if (result.success) {
      masterKey = cryptoV2.loadMasterKey(
        JSON.parse(fs.readFileSync(path.join(app.getPath('home'), '.vault-data', 'auth.json'), 'utf8')),
        password
      );
      db.setDbPassword(password);
    }
    safeLog('migration:' + (result.success ? 'success' : 'failed'));
    return result;
  } catch (err) {
    safeLog('migration:ERROR');
    return { success: false, error: err.message };
  }
});
ipcMain.handle('migration:rollback', () => {
  safeLog('migration:rollback');
  migration.rollbackMigration();
  return { success: true };
});

ipcMain.handle('dialog:openFiles', async (e) => {
  safeLog('dialog:openFiles');
  try {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All supported', extensions: ['jpg','jpeg','png','gif','bmp','webp','tiff','tif','svg','ico','mp4','avi','mov','mkv','webm','flv','wmv','m4v','3gp','txt','md','json','log','csv'] }]
    });
    safeLog('dialog result: ' + (result.canceled ? 'canceled' : result.filePaths.length + ' files'));
    return result.canceled ? null : result.filePaths;
  } catch (err) {
    safeLog('dialog ERROR');
    return null;
  }
});
ipcMain.handle('files:add', async (e, filePaths, folderId, tags) => {
  safeLog('files:add, files=' + (filePaths ? filePaths.length : 0));
  if (!currentPassword) return { error: 'Vault is locked' };
  if (!filePaths || filePaths.length === 0) return [];

  if (tags && Array.isArray(tags)) {
    tags = tags.slice(0, 10).map(t => String(t).slice(0, 50));
  }

  try {
    const results = [];
    for (const filePath of filePaths) {
      const info = fm.addFileToVault(filePath, currentPassword, folderId, tags);
      const thumbName = await fm.generateThumbnail(filePath, info.fileType, currentPassword);
      const dbResult = db.addFile(info.originalName, info.encryptedName, info.fileType, info.mimeType, info.size, folderId, thumbName, tags);
      results.push({ id: dbResult.lastInsertRowid, ...info, thumbnail: thumbName });
    }
    safeLog('files:add done: ' + results.length + ' files');
    return results;
  } catch (err) {
    safeLog('files:add ERROR');
    return { error: 'Failed to add files' };
  }
});
ipcMain.handle('files:list', (e, folderId, fileType, search) => {
  if (!currentPassword) return [];
  try { const files = db.getFiles(folderId, fileType, search); return files; } catch { return []; }
});
ipcMain.handle('files:get', (e, id) => {
  if (!currentPassword) return null;
  try { return db.getFile(id) || null; } catch { return null; }
});
ipcMain.handle('files:delete', (e, id) => {
  if (!currentPassword) return { success: false };
  try {
    const file = db.getFile(id);
    if (file) { fm.deleteFileFromDisk(file.encrypted_name); fm.deleteThumbnail(file.thumbnail); db.deleteFile(id); }
    return { success: true };
  } catch { return { success: false }; }
});
ipcMain.handle('files:getPath', (e, encryptedName) => {
  if (!currentPassword || !encryptedName) return null;
  try { return getDecryptedFilePath(encryptedName, currentPassword); } catch { return null; }
});
ipcMain.handle('files:updateTags', (e, id, tags) => {
  if (!currentPassword) return { success: false };
  if (tags && Array.isArray(tags)) {
    tags = tags.slice(0, 10).map(t => String(t).slice(0, 50));
  }
  try { db.updateFileTags(id, tags); return { success: true }; } catch { return { success: false }; }
});
ipcMain.handle('files:decrypt', async (e, id) => {
  if (!currentPassword) return null;
  try {
    const file = db.getFile(id);
    if (!file) return null;
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: file.original_name || 'exported_file', filters: [{ name: file.original_name || 'File', extensions: [file.file_type || '*'] }] });
    if (!result.canceled && result.filePath) {
      const tempPath = getDecryptedFilePath(file.encrypted_name, currentPassword);
      if (!tempPath) return null;
      try { fs.copyFileSync(tempPath, result.filePath); } finally { secureCleanupTemp(tempPath); }
      return result.filePath;
    }
    return null;
  } catch { return null; }
});
ipcMain.handle('files:getThumbBase64', (e, thumbName) => {
  if (!currentPassword || !thumbName) return null;
  try { return fm.getDecryptedThumbnailBase64(thumbName, currentPassword); } catch { return null; }
});
ipcMain.handle('files:readContent', (e, tempPath) => {
  if (!tempPath || typeof tempPath !== 'string') return null;
  try {
    const resolved = path.resolve(tempPath);
    const tmpDir = path.join(VAULT_DIR, '.tmp');
    if (!resolved.startsWith(tmpDir)) return null;
    if (!fs.existsSync(resolved)) return null;
    return fs.readFileSync(resolved, 'utf8');
  } catch { return null; }
});

ipcMain.handle('folders:add', (e, name, parentId) => {
  if (!currentPassword) return { success: false };
  if (!name || typeof name !== 'string' || name.length > 100) return { success: false };
  try { return { id: db.addFolder(name.trim(), parentId).lastInsertRowid }; } catch { return { success: false }; }
});
ipcMain.handle('folders:list', (e, parentId) => { if (!currentPassword) return []; try { return db.getFolders(parentId); } catch { return []; } });
ipcMain.handle('folders:get', (e, id) => { if (!currentPassword) return null; try { return db.getFolder(id) || null; } catch { return null; } });
ipcMain.handle('folders:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deleteFolder(id); return { success: true }; } catch { return { success: false }; } });

ipcMain.handle('notes:add', (e, title, content, folderId, tags) => {
  if (!currentPassword) return { success: false };
  if (!title || typeof title !== 'string' || title.length > 200) return { success: false };
  if (tags && Array.isArray(tags)) {
    tags = tags.slice(0, 10).map(t => String(t).slice(0, 50));
  }
  try { return { id: db.addNote(title.trim(), content || '', folderId, tags).lastInsertRowid }; } catch { return { success: false }; }
});
ipcMain.handle('notes:list', (e, folderId, search) => { if (!currentPassword) return []; try { return db.getNotes(folderId, search); } catch { return []; } });
ipcMain.handle('notes:get', (e, id) => { if (!currentPassword) return null; try { return db.getNote(id) || null; } catch { return null; } });
ipcMain.handle('notes:update', (e, id, title, content, tags) => {
  if (!currentPassword) return { success: false };
  if (tags && Array.isArray(tags)) {
    tags = tags.slice(0, 10).map(t => String(t).slice(0, 50));
  }
  try { db.updateNote(id, title, content, tags); return { success: true }; } catch { return { success: false }; }
});
ipcMain.handle('notes:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deleteNote(id); return { success: true }; } catch { return { success: false }; } });

ipcMain.handle('stats:get', () => { if (!currentPassword) return {}; try { return db.getStats(); } catch { return {}; } });

ipcMain.handle('passwords:add', (e, name, username, password, url, notes, category, favorite) => {
  if (!currentPassword) return { success: false };
  if (!name || typeof name !== 'string' || name.length > 100) return { success: false };
  const validCategories = ['login', 'credit-card', 'identity', 'note', 'other'];
  if (category && !validCategories.includes(category)) category = 'other';
  try { return { id: db.addPassword(name.trim(), username, password, url, notes, category, favorite).lastInsertRowid }; } catch { return { success: false }; }
});
ipcMain.handle('passwords:list', (e, category, search) => { if (!currentPassword) return []; try { return db.getPasswords(category, search); } catch { return []; } });
ipcMain.handle('passwords:get', (e, id) => { if (!currentPassword) return null; try { return db.getPassword(id) || null; } catch { return null; } });
ipcMain.handle('passwords:update', (e, id, name, username, password, url, notes, category, favorite) => {
  if (!currentPassword) return { success: false };
  const validCategories = ['login', 'credit-card', 'identity', 'note', 'other'];
  if (category && !validCategories.includes(category)) category = 'other';
  try { db.updatePassword(id, name, username, password, url, notes, category, favorite); return { success: true }; } catch { return { success: false }; }
});
ipcMain.handle('passwords:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deletePassword(id); return { success: true }; } catch { return { success: false }; } });
ipcMain.handle('passwords:toggleFavorite', (e, id) => { if (!currentPassword) return { success: false }; try { db.togglePasswordFavorite(id); return { success: true }; } catch { return { success: false }; } });

ipcMain.handle('webauthn:hasCredential', () => { try { return db.getAllWebauthnCredentials().length > 0; } catch { return false; } });
ipcMain.handle('webauthn:register', async (e) => {
  if (!currentPassword) return { success: false };
  try {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const challenge = crypto.randomBytes(32).toString('base64url');
    const userId = crypto.randomBytes(16);
    const options = { publicKey: { challenge: Buffer.from(challenge, 'base64url'), rp: { name: 'Vault', id: 'localhost' }, user: { id: userId, name: 'vault-user', displayName: 'Vault User' }, pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000, attestation: 'none' } };
    const credential = await win.webContents.executeJavaScript(`navigator.credentials.create(${JSON.stringify(options)})`);
    if (!credential) return { success: false, error: 'User cancelled' };
    const credId = Buffer.from(credential.rawId).toString('base64');
    const clientData = Buffer.from(credential.response.clientDataJSON).toString('base64');
    const attestation = Buffer.from(credential.response.attestationObject).toString('base64');
    const id = crypto.randomBytes(16).toString('hex');
    db.saveWebauthnCredential(id, credId, JSON.stringify({ clientData, attestation }));
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('webauthn:authenticate', async (e) => {
  try {
    const creds = db.getAllWebauthnCredentials();
    if (creds.length === 0) return { success: false, error: 'No credentials registered' };
    const challenge = crypto.randomBytes(32).toString('base64url');
    const allowCredentials = creds.map(c => ({ id: c.credential_id, type: 'public-key', transports: ['internal'] }));
    const options = { publicKey: { challenge: Buffer.from(challenge, 'base64url'), timeout: 60000, rpId: 'localhost', allowCredentials, userVerification: 'required' } };
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const assertion = await win.webContents.executeJavaScript(`navigator.credentials.get(${JSON.stringify(options)})`);
    if (!assertion) return { success: false, error: 'User cancelled' };
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('webauthn:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deleteWebauthnCredential(id); return { success: true }; } catch { return { success: false }; } });

ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:save', (e, settings) => saveSettings(settings));

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('app:lock', () => {
  db.flushDb();
  currentPassword = null;
  masterKey = null;
  db.clearDbPassword();
  cleanSecureTemp();
  return { success: true };
});

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = { info: (msg) => safeLog('updater: ' + msg), warn: (msg) => safeLog('updater WARN'), error: (msg) => safeLog('updater ERROR') };

autoUpdater.on('checking-for-update', () => {
  safeLog('Checking for updates');
  mainWindow?.webContents.send('update:status', { state: 'checking' });
});
autoUpdater.on('update-available', (info) => {
  safeLog('Update available: v' + info.version);
  mainWindow?.webContents.send('update:status', { state: 'available', version: info.version });
});
autoUpdater.on('update-not-available', () => {
  safeLog('App is up to date');
  mainWindow?.webContents.send('update:status', { state: 'up-to-date' });
});
autoUpdater.on('download-progress', (p) => {
  mainWindow?.webContents.send('update:status', { state: 'downloading', percent: Math.round(p.percent) });
});
autoUpdater.on('update-downloaded', (info) => {
  safeLog('Update downloaded: v' + info.version);
  mainWindow?.webContents.send('update:status', { state: 'downloaded', version: info.version });
});
autoUpdater.on('error', (err) => {
  safeLog('Auto-updater error');
  mainWindow?.webContents.send('update:status', { state: 'error', message: 'Update error' });
});

ipcMain.handle('update:check', () => {
  safeLog('Manual update check triggered');
  autoUpdater.checkForUpdates().catch(e => safeLog('Manual check error'));
});
ipcMain.handle('update:install', () => {
  safeLog('Installing update');
  db.flushDb();
  autoUpdater.quitAndInstall(false, true);
});
ipcMain.handle('update:download', () => {
  safeLog('Manual download triggered');
  autoUpdater.downloadUpdate().catch(e => safeLog('Download error'));
});
