const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FILES_DIR, THUMBS_DIR, PHOTO_EXTENSIONS, VIDEO_EXTENSIONS, VAULT_DIR } = require('../shared/constants');
const cryptoV2 = require('./crypto-v2');
const cryptoV1 = require('./crypto');

const SECURE_TEMP_DIR = path.join(VAULT_DIR, '.tmp');
const ENCRYPTED_NAME_REGEX = /^[a-f0-9]{32}$/;

function ensureDirs() {
  [FILES_DIR, THUMBS_DIR, SECURE_TEMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    try {
      fs.chmodSync(dir, 0o700);
    } catch {}
  });
}

function validateEncryptedName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length !== 32) return false;
  return ENCRYPTED_NAME_REGEX.test(name);
}

function validateFolderPath(filePath, baseDir) {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  return resolved.startsWith(resolvedBase + path.sep) || resolved === resolvedBase;
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (PHOTO_EXTENSIONS.includes(ext)) return 'photo';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return 'text';
}

function generateEncryptedName() {
  return crypto.randomBytes(16).toString('hex');
}

function cleanSecureTemp() {
  try {
    if (!fs.existsSync(SECURE_TEMP_DIR)) return;
    const files = fs.readdirSync(SECURE_TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(SECURE_TEMP_DIR, file);
      try {
        secureDelete(filePath);
      } catch {}
    }
  } catch {}
}

function secureDelete(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r+');
    const buf = Buffer.alloc(4096);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < Math.ceil(stats.size / 4096); i++) {
        crypto.randomFillSync(buf);
        fs.writeSync(fd, buf, 0, buf.length, i * 4096);
      }
      fs.fsyncSync(fd);
    }
    fs.closeSync(fd);
    fs.unlinkSync(filePath);
  } catch {}
}

function decryptBufferAuto(encryptedBuffer, masterKey, password) {
  let offset = 0;
  const version = encryptedBuffer.readUInt8(offset);

  if (version === cryptoV2.FORMAT_VERSION) {
    return cryptoV2.decryptBuffer(encryptedBuffer, masterKey);
  }

  if (version === 3 || version === 4) {
    return cryptoV1.decryptBuffer(encryptedBuffer, password);
  }

  throw new Error('Unknown encryption version: ' + version);
}

function encryptBufferAuto(buffer, masterKey) {
  return cryptoV2.encryptBuffer(buffer, masterKey);
}

async function generateThumbnail(filePath, fileType, password, masterKey) {
  if (fileType !== 'photo') return null;
  const thumbName = crypto.randomBytes(16).toString('hex') + '.enc';
  const thumbPath = path.join(THUMBS_DIR, thumbName);
  try {
    const buffer = fs.readFileSync(filePath);
    const encrypted = encryptBufferAuto(buffer, masterKey);
    fs.writeFileSync(thumbPath, encrypted);
    try {
      fs.chmodSync(thumbPath, 0o600);
    } catch {}
    cryptoV2.secureClear(buffer);
    cryptoV2.secureClear(encrypted);
    return thumbName;
  } catch (err) {
    console.error('Thumbnail generation failed:', err.message);
    return null;
  }
}

function getDecryptedThumbnailBase64(thumbName, masterKey, password) {
  if (!thumbName) return null;
  if (!validateEncryptedName(thumbName.replace('.enc', ''))) return null;

  const thumbPath = path.join(THUMBS_DIR, thumbName);
  if (!fs.existsSync(thumbPath)) return null;

  if (!validateFolderPath(thumbPath, THUMBS_DIR)) return null;

  try {
    const encrypted = fs.readFileSync(thumbPath);
    const decrypted = decryptBufferAuto(encrypted, masterKey, password);
    const b64 = decrypted.toString('base64');
    cryptoV2.secureClear(decrypted);
    return b64;
  } catch { return null; }
}

function addFileToVault(filePath, masterKey, folderId = null, tags = []) {
  ensureDirs();
  const originalName = path.basename(filePath);
  const fileType = getFileType(filePath);
  const mimeType = getMimeType(filePath);
  const stats = fs.statSync(filePath);

  const encryptedName = generateEncryptedName();
  const outputPath = path.join(FILES_DIR, encryptedName);

  const buffer = fs.readFileSync(filePath);
  const encrypted = encryptBufferAuto(buffer, masterKey);
  fs.writeFileSync(outputPath, encrypted);
  cryptoV2.secureClear(buffer);
  cryptoV2.secureClear(encrypted);

  try {
    fs.chmodSync(outputPath, 0o600);
  } catch {}

  return { originalName, encryptedName, fileType, mimeType, size: stats.size, folderId, tags };
}

function getDecryptedFilePath(encryptedName, masterKey, password) {
  if (!encryptedName) return null;

  if (!validateEncryptedName(encryptedName)) return null;

  const encryptedPath = path.join(FILES_DIR, encryptedName);

  if (!validateFolderPath(encryptedPath, FILES_DIR)) return null;

  if (!fs.existsSync(encryptedPath)) return null;

  ensureDirs();

  try {
    const tempName = 'vault_' + crypto.randomBytes(8).toString('hex');
    const tempPath = path.join(SECURE_TEMP_DIR, tempName);
    const encrypted = fs.readFileSync(encryptedPath);
    const decrypted = decryptBufferAuto(encrypted, masterKey, password);
    fs.writeFileSync(tempPath, decrypted);
    cryptoV2.secureClear(encrypted);
    cryptoV2.secureClear(decrypted);
    try {
      fs.chmodSync(tempPath, 0o600);
    } catch {}
    return tempPath;
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
}

function secureCleanupTemp(tempPath) {
  if (!tempPath) return;

  if (!validateFolderPath(tempPath, SECURE_TEMP_DIR)) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    return;
  }

  try {
    if (fs.existsSync(tempPath)) {
      secureDelete(tempPath);
    }
  } catch {}
}

function deleteFileFromDisk(encryptedName) {
  if (!encryptedName) return;
  if (!validateEncryptedName(encryptedName)) return;

  const filePath = path.join(FILES_DIR, encryptedName);
  if (!validateFolderPath(filePath, FILES_DIR)) return;

  try { secureDelete(filePath); } catch {}
}

function deleteThumbnail(thumbName) {
  if (!thumbName) return;

  const nameWithoutExt = thumbName.replace('.enc', '');
  if (!validateEncryptedName(nameWithoutExt)) return;

  const thumbPath = path.join(THUMBS_DIR, thumbName);
  if (!validateFolderPath(thumbPath, THUMBS_DIR)) return;

  try { secureDelete(thumbPath); } catch {}
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
    '.tiff': 'image/tiff', '.tif': 'image/tiff', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv', '.m4v': 'video/x-m4v', '.3gp': 'video/3gpp',
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.log': 'text/plain', '.csv': 'text/csv'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  addFileToVault,
  getDecryptedFilePath,
  deleteFileFromDisk,
  deleteThumbnail,
  generateThumbnail,
  getDecryptedThumbnailBase64,
  getFileType,
  secureCleanupTemp,
  cleanSecureTemp,
  validateEncryptedName,
  THUMBS_DIR
};
