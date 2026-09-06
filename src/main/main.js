const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { setup, login, isInitialized, isLockedOut } = require('./auth');
const { getDecryptedFilePath, secureCleanupTemp, THUMBS_DIR } = require('./file-manager');
const db = require('./db');
const fm = require('./file-manager');
const { getSettings, saveSettings } = require('./settings');

const LOG_PATH = path.join(app.getPath('userData'), 'vault-debug.log');
function log(msg) {
  try { fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

let mainWindow = null;
let currentPassword = null;
let updateChecked = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#0a0a0f'
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
    callback({ path: path.join(THUMBS_DIR, thumbName) });
  });
}

app.whenReady().then(async () => {
  try {
    await db.ensureDb();
    log('Database initialized');
    registerProtocol();
    createWindow();
    log('Window created');
  } catch (err) {
    log('FATAL: ' + err.message + '\n' + err.stack);
    console.error('FATAL:', err);
  }
});

app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => { db.flushDb(); });

// AUTH
ipcMain.handle('auth:isInitialized', () => isInitialized());
ipcMain.handle('auth:setup', (e, password) => {
  log('auth:setup');
  setup(password);
  currentPassword = password;
  db.setDbPassword(password);
  log('auth:setup done');
  return { success: true };
});
ipcMain.handle('auth:login', async (e, password) => {
  log('auth:login');
  try {
    if (isLockedOut()) return { success: false, error: 'Locked. Wait 5 min.' };
    const result = await login(password);
    log('auth:login result: ' + JSON.stringify(result));
    if (result && result.success) {
      currentPassword = password;
      try { db.setDbPassword(password); } catch (dbErr) { log('DB set password error: ' + dbErr.message); }
      if (!updateChecked) {
        updateChecked = true;
        setTimeout(() => autoUpdater.checkForUpdates().catch(e => log('Update check error: ' + e.message)), 3000);
      }
    }
    return result || { success: false, error: 'Login failed' };
  } catch (err) {
    log('auth:login ERROR: ' + err.message);
    return { success: false, error: 'An error occurred' };
  }
});
ipcMain.handle('auth:isUnlocked', () => !!currentPassword);

// FILES
ipcMain.handle('dialog:openFiles', async (e) => {
  log('dialog:openFiles');
  try {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All supported', extensions: ['jpg','jpeg','png','gif','bmp','webp','tiff','tif','svg','ico','mp4','avi','mov','mkv','webm','flv','wmv','m4v','3gp','txt','md','json','log','csv'] }]
    });
    log('dialog result: ' + (result.canceled ? 'canceled' : result.filePaths.length + ' files'));
    return result.canceled ? null : result.filePaths;
  } catch (err) {
    log('dialog ERROR: ' + err.message);
    return null;
  }
});
ipcMain.handle('files:add', async (e, filePaths, folderId, tags) => {
  log('files:add, password=' + (currentPassword ? 'YES' : 'NO') + ', files=' + (filePaths ? filePaths.length : 0));
  if (!currentPassword) return { error: 'Vault is locked' };
  if (!filePaths || filePaths.length === 0) return [];
  try {
    const results = [];
    for (const filePath of filePaths) {
      log('  encrypting: ' + filePath);
      const info = fm.addFileToVault(filePath, currentPassword, folderId, tags);
      const thumbName = await fm.generateThumbnail(filePath, info.fileType, currentPassword);
      const dbResult = db.addFile(info.originalName, info.encryptedName, info.fileType, info.mimeType, info.size, folderId, thumbName, tags);
      log('  saved id=' + dbResult.lastInsertRowid);
      results.push({ id: dbResult.lastInsertRowid, ...info, thumbnail: thumbName });
    }
    log('files:add done: ' + results.length + ' files');
    return results;
  } catch (err) {
    log('files:add ERROR: ' + err.message + '\n' + err.stack);
    return { error: err.message };
  }
});
ipcMain.handle('files:list', (e, folderId, fileType, search) => {
  if (!currentPassword) return [];
  try { const files = db.getFiles(folderId, fileType, search); log('files:list = ' + files.length); return files; } catch { return []; }
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

// FOLDERS
ipcMain.handle('folders:add', (e, name, parentId) => {
  if (!currentPassword) return { success: false };
  try { return { id: db.addFolder(name, parentId).lastInsertRowid }; } catch { return { success: false }; }
});
ipcMain.handle('folders:list', (e, parentId) => { if (!currentPassword) return []; try { return db.getFolders(parentId); } catch { return []; } });
ipcMain.handle('folders:get', (e, id) => { if (!currentPassword) return null; try { return db.getFolder(id) || null; } catch { return null; } });
ipcMain.handle('folders:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deleteFolder(id); return { success: true }; } catch { return { success: false }; } });

// NOTES
ipcMain.handle('notes:add', (e, title, content, folderId, tags) => {
  if (!currentPassword) return { success: false };
  try { return { id: db.addNote(title, content, folderId, tags).lastInsertRowid }; } catch { return { success: false }; }
});
ipcMain.handle('notes:list', (e, folderId, search) => { if (!currentPassword) return []; try { return db.getNotes(folderId, search); } catch { return []; } });
ipcMain.handle('notes:get', (e, id) => { if (!currentPassword) return null; try { return db.getNote(id) || null; } catch { return null; } });
ipcMain.handle('notes:update', (e, id, title, content, tags) => { if (!currentPassword) return { success: false }; try { db.updateNote(id, title, content, tags); return { success: true }; } catch { return { success: false }; } });
ipcMain.handle('notes:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deleteNote(id); return { success: true }; } catch { return { success: false }; } });

// STATS
ipcMain.handle('stats:get', () => { if (!currentPassword) return {}; try { return db.getStats(); } catch { return {}; } });

// PASSWORDS
ipcMain.handle('passwords:add', (e, name, username, password, url, notes, category, favorite) => {
  if (!currentPassword) return { success: false };
  try { return { id: db.addPassword(name, username, password, url, notes, category, favorite).lastInsertRowid }; } catch { return { success: false }; }
});
ipcMain.handle('passwords:list', (e, category, search) => { if (!currentPassword) return []; try { return db.getPasswords(category, search); } catch { return []; } });
ipcMain.handle('passwords:get', (e, id) => { if (!currentPassword) return null; try { return db.getPassword(id) || null; } catch { return null; } });
ipcMain.handle('passwords:update', (e, id, name, username, password, url, notes, category, favorite) => { if (!currentPassword) return { success: false }; try { db.updatePassword(id, name, username, password, url, notes, category, favorite); return { success: true }; } catch { return { success: false }; } });
ipcMain.handle('passwords:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deletePassword(id); return { success: true }; } catch { return { success: false }; } });
ipcMain.handle('passwords:toggleFavorite', (e, id) => { if (!currentPassword) return { success: false }; try { db.togglePasswordFavorite(id); return { success: true }; } catch { return { success: false }; } });

// WEBAUTHN
ipcMain.handle('webauthn:hasCredential', () => { try { return db.getAllWebauthnCredentials().length > 0; } catch { return false; } });
ipcMain.handle('webauthn:register', async (e) => {
  if (!currentPassword) return { success: false };
  try {
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const challenge = require('crypto').randomBytes(32).toString('base64url');
    const userId = require('crypto').randomBytes(16);
    const options = { publicKey: { challenge: Buffer.from(challenge, 'base64url'), rp: { name: 'Vault', id: 'localhost' }, user: { id: userId, name: 'vault-user', displayName: 'Vault User' }, pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000, attestation: 'none' } };
    const credential = await win.webContents.executeJavaScript(`navigator.credentials.create(${JSON.stringify(options)})`);
    if (!credential) return { success: false, error: 'User cancelled' };
    const credId = Buffer.from(credential.rawId).toString('base64');
    const clientData = Buffer.from(credential.response.clientDataJSON).toString('base64');
    const attestation = Buffer.from(credential.response.attestationObject).toString('base64');
    const id = require('crypto').randomBytes(16).toString('hex');
    db.saveWebauthnCredential(id, credId, JSON.stringify({ clientData, attestation }));
    log('WebAuthn credential registered: ' + id);
    return { success: true };
  } catch (err) { log('WebAuthn register error: ' + err.message); return { success: false, error: err.message }; }
});
ipcMain.handle('webauthn:authenticate', async (e) => {
  try {
    const creds = db.getAllWebauthnCredentials();
    if (creds.length === 0) return { success: false, error: 'No credentials registered' };
    const challenge = require('crypto').randomBytes(32).toString('base64url');
    const allowCredentials = creds.map(c => ({ id: c.credential_id, type: 'public-key', transports: ['internal'] }));
    const options = { publicKey: { challenge: Buffer.from(challenge, 'base64url'), timeout: 60000, rpId: 'localhost', allowCredentials, userVerification: 'required' } };
    const win = BrowserWindow.fromWebContents(e.sender) || mainWindow;
    const assertion = await win.webContents.executeJavaScript(`navigator.credentials.get(${JSON.stringify(options)})`);
    if (!assertion) return { success: false, error: 'User cancelled' };
    log('WebAuthn authentication successful');
    return { success: true };
  } catch (err) { log('WebAuthn auth error: ' + err.message); return { success: false, error: err.message }; }
});
ipcMain.handle('webauthn:delete', (e, id) => { if (!currentPassword) return { success: false }; try { db.deleteWebauthnCredential(id); return { success: true }; } catch { return { success: false }; } });

// SETTINGS
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:save', (e, settings) => saveSettings(settings));

// WINDOW
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('app:lock', () => {
  db.flushDb();
  currentPassword = null;
  db.clearDbPassword();
  return { success: true };
});

// AUTO UPDATER
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = { info: (msg) => log('updater: ' + msg), warn: (msg) => log('updater WARN: ' + msg), error: (msg) => log('updater ERROR: ' + msg) };

autoUpdater.on('checking-for-update', () => {
  log('Checking for updates...');
  mainWindow?.webContents.send('update:status', { state: 'checking' });
});
autoUpdater.on('update-available', (info) => {
  log('Update available: v' + info.version);
  mainWindow?.webContents.send('update:status', { state: 'available', version: info.version });
});
autoUpdater.on('update-not-available', () => {
  log('App is up to date');
  mainWindow?.webContents.send('update:status', { state: 'up-to-date' });
});
autoUpdater.on('download-progress', (p) => {
  mainWindow?.webContents.send('update:status', { state: 'downloading', percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond, total: p.total, transferred: p.transferred });
});
autoUpdater.on('update-downloaded', (info) => {
  log('Update downloaded: v' + info.version);
  mainWindow?.webContents.send('update:status', { state: 'downloaded', version: info.version });
});
autoUpdater.on('error', (err) => {
  log('Auto-updater error: ' + err.message);
  mainWindow?.webContents.send('update:status', { state: 'error', message: err.message });
});

ipcMain.handle('update:check', () => {
  log('Manual update check triggered');
  autoUpdater.checkForUpdates().catch(e => log('Manual check error: ' + e.message));
});
ipcMain.handle('update:install', () => {
  log('Installing update...');
  autoUpdater.quitAndInstall(false, true);
});
ipcMain.handle('update:download', () => {
  log('Manual download triggered');
  autoUpdater.downloadUpdate().catch(e => log('Download error: ' + e.message));
});
