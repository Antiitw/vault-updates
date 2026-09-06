const initSqlJs = require('sql.js');
const { DB_PATH, VAULT_DIR } = require('../shared/constants');
const fs = require('fs');
const path = require('path');
const { encryptText, decryptText, encryptDatabase, decryptDatabase, secureClear } = require('./crypto');

function dbLog(msg) {
  try {
    const { app } = require('electron');
    const logPath = path.join(app.getPath('userData'), 'vault-debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [DB] ${msg}\n`);
  } catch {}
}

let db = null;
let sqlModule = null;
let dbPassword = null;
let dbReady = null;
let dbDirty = false;
let saveTimeout = null;
let pendingSave = false;

function ensureDb() {
  if (!dbReady) {
    dbReady = (async () => {
      try {
        if (!fs.existsSync(VAULT_DIR)) {
          fs.mkdirSync(VAULT_DIR, { recursive: true });
        }
        sqlModule = await initSqlJs();
        db = new sqlModule.Database();
        db.run('PRAGMA journal_mode = WAL');
        initTables();
        dbLog('ensureDb: initialized');
      } catch (err) {
        dbLog('ensureDb: FAILED: ' + (err.message || err));
        throw err;
      }
    })();
  }
  return dbReady;
}

function loadEncryptedDb(password) {
  if (!db) { dbLog('loadEncryptedDb: no db'); return false; }
  if (!fs.existsSync(DB_PATH)) { dbLog('loadEncryptedDb: no DB file'); return false; }
  const buffer = fs.readFileSync(DB_PATH);
  dbLog('loadEncryptedDb: file=' + buffer.length + ' bytes');
  if (buffer.length < 96) { dbLog('loadEncryptedDb: file too small'); return false; }
  const oldDb = db;
  try {
    const decrypted = decryptDatabase(buffer, password);
    dbLog('loadEncryptedDb: decrypted=' + decrypted.length + ' bytes');
    db.close();
    const newDb = new sqlModule.Database(decrypted);
    newDb.run('PRAGMA journal_mode = WAL');
    db = newDb;
    initTables();
    dbLog('loadEncryptedDb: success');
    return true;
  } catch (err) {
    db = oldDb;
    dbLog('loadEncryptedDb: FAILED: ' + (err.message || err));
    return false;
  }
}

function saveDb() {
  if (!db || !dbPassword) return;
  if (saveTimeout) {
    pendingSave = true;
    return;
  }
  _doSave();
}

function _doSave() {
  if (!db || !dbPassword) { dbLog('skip save: db=' + !!db + ' dbPassword=' + !!dbPassword); return; }
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const encrypted = encryptDatabase(buffer, dbPassword);
    fs.writeFileSync(DB_PATH, encrypted);
    dbLog('DB saved: ' + encrypted.length + ' bytes (raw=' + buffer.length + ')');
    secureClear(encrypted);
    secureClear(buffer);
  } catch (err) {
    dbLog('DB save FAILED: ' + (err.message || err));
  }
  pendingSave = false;
  saveTimeout = null;
}

function flushDb() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (pendingSave || db) {
    _doSave();
  }
}

function setDbPassword(password) {
  dbPassword = password;
  const loaded = loadEncryptedDb(password);
  if (!loaded) {
    dbLog('setDbPassword: no encrypted DB loaded, initializing tables');
    initTables();
  }
}

function clearDbPassword() {
  if (dbPassword) {
    flushDb();
    secureClear(Buffer.from(dbPassword));
  }
  dbPassword = null;
}

function enc(text) {
  if (!text || !dbPassword) return text;
  return encryptText(String(text), dbPassword);
}

function dec(encrypted) {
  if (!encrypted || !dbPassword) return encrypted;
  try {
    return decryptText(encrypted, dbPassword);
  } catch {
    return '';
  }
}

function initTables() {
  if (!db) return;
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_enc TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES folders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name_enc TEXT NOT NULL,
      encrypted_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      mime_type_enc TEXT,
      size INTEGER,
      folder_id INTEGER DEFAULT NULL,
      thumbnail_enc TEXT,
      tags_enc TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_enc TEXT NOT NULL,
      content_enc TEXT,
      folder_id INTEGER DEFAULT NULL,
      tags_enc TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS passwords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_enc TEXT NOT NULL,
      username_enc TEXT DEFAULT '',
      password_enc TEXT NOT NULL,
      url_enc TEXT DEFAULT '',
      notes_enc TEXT DEFAULT '',
      category TEXT DEFAULT 'other',
      favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id TEXT PRIMARY KEY,
      credential_id_enc TEXT NOT NULL,
      public_key_enc TEXT NOT NULL,
      counter INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || undefined;
}

function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const last = queryOne('SELECT last_insert_rowid() as id');
  saveDb();
  return { changes, lastInsertRowid: last ? last.id : 0 };
}

function batchRun(operations) {
  for (const op of operations) {
    db.run(op.sql, op.params || []);
  }
  const changes = db.getRowsModified();
  const last = queryOne('SELECT last_insert_rowid() as id');
  saveDb();
  return { changes, lastInsertRowid: last ? last.id : 0 };
}

function addFile(originalName, encryptedName, fileType, mimeType, size, folderId, thumbnail, tags) {
  return run(
    `INSERT INTO files (original_name_enc, encrypted_name, file_type, mime_type_enc, size, folder_id, thumbnail_enc, tags_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [enc(originalName), encryptedName, fileType, enc(mimeType), size, folderId, enc(thumbnail || ''), enc(JSON.stringify(tags || []))]
  );
}

function decryptFileRow(row) {
  if (!row) return null;
  return {
    ...row,
    original_name: dec(row.original_name_enc),
    mime_type: dec(row.mime_type_enc),
    thumbnail: dec(row.thumbnail_enc),
    tags: dec(row.tags_enc)
  };
}

function getFiles(folderId = null, fileType = null, search = null, limit = null, offset = 0) {
  let query = 'SELECT * FROM files WHERE 1=1';
  const params = [];

  if (folderId) {
    query += ' AND folder_id = ?';
    params.push(folderId);
  } else {
    query += ' AND folder_id IS NULL';
  }

  if (fileType) {
    query += ' AND file_type = ?';
    params.push(fileType);
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  return queryAll(query, params).map(decryptFileRow);
}

function getFile(id) {
  return decryptFileRow(queryOne('SELECT * FROM files WHERE id = ?', [id]));
}

function deleteFile(id) {
  return run('DELETE FROM files WHERE id = ?', [id]);
}

function updateFileTags(id, tags) {
  return run('UPDATE files SET tags_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [enc(JSON.stringify(tags)), id]);
}

function addFolder(name, parentId = null) {
  return run('INSERT INTO folders (name_enc, parent_id) VALUES (?, ?)', [enc(name), parentId]);
}

function decryptFolderRow(row) {
  if (!row) return null;
  return { ...row, name: dec(row.name_enc) };
}

function getFolders(parentId = null) {
  let rows;
  if (parentId) {
    rows = queryAll('SELECT * FROM folders WHERE parent_id = ? ORDER BY id', [parentId]);
  } else {
    rows = queryAll('SELECT * FROM folders WHERE parent_id IS NULL ORDER BY id');
  }
  return rows.map(decryptFolderRow);
}

function getFolder(id) {
  return decryptFolderRow(queryOne('SELECT * FROM folders WHERE id = ?', [id]));
}

function deleteFolder(id) {
  run('UPDATE files SET folder_id = NULL WHERE folder_id = ?', [id]);
  run('UPDATE folders SET parent_id = NULL WHERE parent_id = ?', [id]);
  return run('DELETE FROM folders WHERE id = ?', [id]);
}

function addNote(title, content, folderId = null, tags = []) {
  return run(
    'INSERT INTO notes (title_enc, content_enc, folder_id, tags_enc) VALUES (?, ?, ?, ?)',
    [enc(title), enc(content), folderId, enc(JSON.stringify(tags))]
  );
}

function decryptNoteRow(row) {
  if (!row) return null;
  return {
    ...row,
    title: dec(row.title_enc),
    content: dec(row.content_enc),
    tags: dec(row.tags_enc)
  };
}

function getNotes(folderId = null, search = null) {
  let query = 'SELECT * FROM notes WHERE 1=1';
  const params = [];

  if (folderId) {
    query += ' AND folder_id = ?';
    params.push(folderId);
  } else {
    query += ' AND folder_id IS NULL';
  }

  query += ' ORDER BY updated_at DESC';
  return queryAll(query, params).map(decryptNoteRow);
}

function getNote(id) {
  return decryptNoteRow(queryOne('SELECT * FROM notes WHERE id = ?', [id]));
}

function updateNote(id, title, content, tags) {
  return run(
    'UPDATE notes SET title_enc = ?, content_enc = ?, tags_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [enc(title), enc(content), enc(JSON.stringify(tags)), id]
  );
}

function deleteNote(id) {
  return run('DELETE FROM notes WHERE id = ?', [id]);
}

function getStats() {
  const photos = queryOne("SELECT COUNT(*) as count FROM files WHERE file_type = 'photo'");
  const videos = queryOne("SELECT COUNT(*) as count FROM files WHERE file_type = 'video'");
  const texts = queryOne("SELECT COUNT(*) as count FROM files WHERE file_type = 'text'");
  const notes = queryOne('SELECT COUNT(*) as count FROM notes');
  const passwords = queryOne('SELECT COUNT(*) as count FROM passwords');
  const totalSize = queryOne('SELECT COALESCE(SUM(size), 0) as total FROM files');
  const folders = queryOne('SELECT COUNT(*) as count FROM folders');

  return {
    photos: photos ? photos.count : 0,
    videos: videos ? videos.count : 0,
    texts: texts ? texts.count : 0,
    notes: notes ? notes.count : 0,
    passwords: passwords ? passwords.count : 0,
    totalSize: totalSize ? totalSize.total : 0,
    folders: folders ? folders.count : 0
  };
}

function decryptPasswordRow(row) {
  if (!row) return null;
  return {
    ...row,
    name: dec(row.name_enc),
    username: dec(row.username_enc),
    password: dec(row.password_enc),
    url: dec(row.url_enc),
    notes: dec(row.notes_enc)
  };
}

function addPassword(name, username, password, url, notes, category, favorite) {
  return run(
    `INSERT INTO passwords (name_enc, username_enc, password_enc, url_enc, notes_enc, category, favorite)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [enc(name), enc(username || ''), enc(password), enc(url || ''), enc(notes || ''), category || 'other', favorite ? 1 : 0]
  );
}

function getPasswords(category = null, search = null) {
  let query = 'SELECT * FROM passwords WHERE 1=1';
  const params = [];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (name_enc LIKE ? OR username_enc LIKE ? OR url_enc LIKE ?)';
    const like = '%' + search + '%';
    params.push(like, like, like);
  }
  query += ' ORDER BY favorite DESC, updated_at DESC';
  return queryAll(query, params).map(decryptPasswordRow);
}

function getPassword(id) {
  return decryptPasswordRow(queryOne('SELECT * FROM passwords WHERE id = ?', [id]));
}

function updatePassword(id, name, username, password, url, notes, category, favorite) {
  return run(
    `UPDATE passwords SET name_enc=?, username_enc=?, password_enc=?, url_enc=?, notes_enc=?, category=?, favorite=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [enc(name), enc(username || ''), enc(password), enc(url || ''), enc(notes || ''), category || 'other', favorite ? 1 : 0, id]
  );
}

function deletePassword(id) {
  return run('DELETE FROM passwords WHERE id = ?', [id]);
}

function togglePasswordFavorite(id) {
  return run('UPDATE passwords SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
}

function saveWebauthnCredential(id, credentialId, publicKey) {
  return run('INSERT INTO webauthn_credentials (id, credential_id_enc, public_key_enc) VALUES (?, ?, ?)', [id, enc(credentialId), enc(publicKey)]);
}

function getWebauthnCredential(id) {
  const row = queryOne('SELECT * FROM webauthn_credentials WHERE id = ?', [id]);
  if (!row) return null;
  return { ...row, credential_id: dec(row.credential_id_enc), public_key: dec(row.public_key_enc) };
}

function getAllWebauthnCredentials() {
  return queryAll('SELECT * FROM webauthn_credentials').map(row => ({
    ...row,
    credential_id: dec(row.credential_id_enc),
    public_key: dec(row.public_key_enc)
  }));
}

function updateWebauthnCounter(id, counter) {
  return run('UPDATE webauthn_credentials SET counter = ? WHERE id = ?', [counter, id]);
}

function deleteWebauthnCredential(id) {
  return run('DELETE FROM webauthn_credentials WHERE id = ?', [id]);
}

function closeDb() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  if (db) {
    flushDb();
    db.close();
    db = null;
  }
  dbReady = null;
  clearDbPassword();
}

module.exports = {
  ensureDb,
  flushDb,
  addFile, getFiles, getFile, deleteFile, updateFileTags,
  addFolder, getFolders, getFolder, deleteFolder,
  addNote, getNotes, getNote, updateNote, deleteNote,
  addPassword, getPasswords, getPassword, updatePassword, deletePassword, togglePasswordFavorite,
  saveWebauthnCredential, getWebauthnCredential, getAllWebauthnCredentials, updateWebauthnCounter, deleteWebauthnCredential,
  getStats, setDbPassword, clearDbPassword, closeDb
};
