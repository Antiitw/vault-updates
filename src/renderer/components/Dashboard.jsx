import React, { useState, useEffect, useCallback, useRef } from 'react';
import Settings from './Settings';
import Sidebar from './Sidebar';
import Toolbar from './Toolbar';
import FileCard from './FileCard';
import NoteCard from './NoteCard';
import PasswordItem from './PasswordItem';
import EmptyState from './EmptyState';
import FileModal from './FileModal';
import NoteModal from './NoteModal';
import PasswordModal from './PasswordModal';
import SearchModal from './SearchModal';
import Toast from './Toast';
import translations from '../../shared/translations';

const MAX_THUMB_CACHE = 50;

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function Dashboard({ onLock, settings, onSettingsSave }) {
  const [view, setView] = useState('all');
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState([]);
  const [passwords, setPasswords] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [selectedPassword, setSelectedPassword] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('date');
  const [thumbCache, setThumbCache] = useState({});
  const [passwordCategory, setPasswordCategory] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const dropRef = useRef(null);
  const thumbCacheRef = useRef({});

  const debouncedSearch = useDebounce(search, 300);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const t = (key) => {
    const lang = (settings && settings.language) || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  };

  const loadData = async () => {
    const f = await window.vaultAPI.invoke('files:list', currentFolder, null, debouncedSearch || null);
    const n = await window.vaultAPI.invoke('notes:list', currentFolder, debouncedSearch || null);
    const pw = await window.vaultAPI.invoke('passwords:list', passwordCategory, debouncedSearch || null);
    const fo = await window.vaultAPI.invoke('folders:list', currentFolder);
    const s = await window.vaultAPI.invoke('stats:get');
    setFiles(f);
    setNotes(n);
    setPasswords(pw);
    setFolders(fo);
    setStats(s);
  };

  useEffect(() => { loadData(); }, [currentFolder, debouncedSearch, view, passwordCategory]);

  useEffect(() => {
    const loadThumbs = async () => {
      const newCache = {};
      for (const f of files) {
        if (f.thumbnail && !thumbCacheRef.current[f.thumbnail]) {
          const b64 = await window.vaultAPI.invoke('files:getThumbBase64', f.thumbnail);
          if (b64) newCache[f.thumbnail] = `data:image/jpeg;base64,${b64}`;
        }
      }
      if (Object.keys(newCache).length > 0) {
        const updated = { ...thumbCacheRef.current, ...newCache };
        const keys = Object.keys(updated);
        if (keys.length > MAX_THUMB_CACHE) {
          const toRemove = keys.slice(0, keys.length - MAX_THUMB_CACHE);
          toRemove.forEach(k => delete updated[k]);
        }
        thumbCacheRef.current = updated;
        setThumbCache({ ...updated });
      }
    };
    if (files.length > 0) loadThumbs();
  }, [files]);

  useEffect(() => {
    const handleUpdate = (e, info) => {
      setUpdateInfo(info);
      if (info.state === 'available') {
        addToast(`Update v${info.version} available. Downloading...`, 'info');
      } else if (info.state === 'downloaded') {
        addToast(`Update v${info.version} ready to install.`, 'success');
      } else if (info.state === 'error') {
        addToast('Update check failed: ' + (info.message || 'Unknown error'), 'error');
      } else if (info.state === 'up-to-date') {
        addToast('App is up to date', 'success');
      }
    };
    const unsubscribe = window.vaultAPI.on('update:status', handleUpdate);
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const processFiles = async (paths) => {
    if (!paths || paths.length === 0) return;
    setUploading(true);
    try {
      const result = await window.vaultAPI.invoke('files:add', paths, currentFolder);
      if (result && result.error) {
        addToast(result.error, 'error');
      } else {
        addToast(typeof t('filesEncrypted') === 'function' ? t('filesEncrypted')(paths.length) : `${paths.length} files encrypted and added`, 'success');
        loadData();
      }
    } catch (err) {
      addToast('Error: ' + (err.message || 'Unknown error'), 'error');
    }
    setUploading(false);
  };

  const handleAddFiles = async () => {
    try {
      const paths = await window.vaultAPI.invoke('dialog:openFiles');
      await processFiles(paths);
    } catch (err) {
      addToast('Error opening file dialog: ' + err.message, 'error');
    }
  };

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const paths = Array.from(e.dataTransfer.files).map(f => f.path).filter(p => p);
    await processFiles(paths);
  }, [currentFolder]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  useEffect(() => {
    const el = dropRef.current;
    if (el) {
      el.addEventListener('dragover', handleDragOver);
      el.addEventListener('dragleave', handleDragLeave);
      el.addEventListener('drop', handleDrop);
      return () => {
        el.removeEventListener('dragover', handleDragOver);
        el.removeEventListener('dragleave', handleDragLeave);
        el.removeEventListener('drop', handleDrop);
      };
    }
  }, [handleDrop, handleDragOver, handleDragLeave]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); handleAddFiles(); }
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setShowSearchModal(true); }
      if (e.key === 'Escape') { setSelectedFile(null); setShowNoteModal(false); setShowFolderModal(false); setSelectedNote(null); setShowPasswordModal(false); setSelectedPassword(null); setShowSearchModal(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddFolder = async () => {
    if (folderName.trim()) {
      await window.vaultAPI.invoke('folders:add', folderName.trim(), currentFolder);
      setFolderName('');
      setShowFolderModal(false);
      addToast(t('folderCreated'), 'success');
      loadData();
    }
  };

  const handleDeleteFile = async (id) => {
    await window.vaultAPI.invoke('files:delete', id);
    setSelectedFile(null);
    addToast(t('fileDeleted'), 'success');
    loadData();
  };

  const handleDeleteNote = async (id) => {
    await window.vaultAPI.invoke('notes:delete', id);
    setSelectedNote(null);
    setShowNoteModal(false);
    addToast(t('noteDeleted'), 'success');
    loadData();
  };

  const handleDeletePassword = async (id) => {
    await window.vaultAPI.invoke('passwords:delete', id);
    setSelectedPassword(null);
    setShowPasswordModal(false);
    addToast(t('passwordDeleted'), 'success');
    loadData();
  };

  const handleDeleteFolder = async (id) => {
    await window.vaultAPI.invoke('folders:delete', id);
    addToast(t('folderDeleted'), 'success');
    loadData();
  };

  const handleLock = async () => {
    await window.vaultAPI.invoke('app:lock');
    onLock();
  };

  const filteredFiles = files.filter(f => {
    if (view === 'photos') return f.file_type === 'photo';
    if (view === 'videos') return f.file_type === 'video';
    if (view === 'texts') return f.file_type === 'text';
    return true;
  });

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.created_at) - new Date(a.created_at);
    if (sortBy === 'name') return a.original_name.localeCompare(b.original_name);
    if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
    return 0;
  });

  const renderContent = () => {
    if (view === 'notes') {
      return notes.length > 0 ? (
        <div className="notes-grid">
          {notes.map(n => (
            <NoteCard key={n.id} note={n} onClick={(note) => { setSelectedNote(note); setShowNoteModal(true); }} />
          ))}
        </div>
      ) : (
        <EmptyState type="notes" title={t('noNotesYet')} text={t('noNotesText')} actionLabel={t('createNote')} onAction={() => { setSelectedNote(null); setShowNoteModal(true); }} />
      );
    }

    if (view === 'passwords') {
      return passwords.length > 0 ? (
        <div className="passwords-list">
          <div className="password-categories">
            {['all','social','email','banking','shopping','work','other'].map(cat => (
              <button key={cat} className={`pw-cat-btn ${passwordCategory === (cat === 'all' ? null : cat) ? 'active' : ''}`} onClick={() => setPasswordCategory(cat === 'all' ? null : cat)}>
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
          <div className="password-items">
            {passwords.map(pw => (
              <PasswordItem key={pw.id} password={pw} onClick={(p) => { setSelectedPassword(p); setShowPasswordModal(true); }} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState type="passwords" title={t('noPasswordsSaved')} text={t('noPasswordsText')} actionLabel={t('addPassword')} onAction={() => { setSelectedPassword(null); setShowPasswordModal(true); }} />
      );
    }

    if (sortedFiles.length > 0) {
      return viewMode === 'grid' ? (
        <div className="files-grid">
          {sortedFiles.map(f => (
            <FileCard key={f.id} file={f} thumbCache={thumbCache} onClick={setSelectedFile} viewMode="grid" />
          ))}
        </div>
      ) : (
        <div className="files-list">
          <div className="list-header">
            <span className="list-col-name">Name</span>
            <span className="list-col-type">Type</span>
            <span className="list-col-size">Size</span>
            <span className="list-col-date">Date</span>
          </div>
          {sortedFiles.map(f => (
            <FileCard key={f.id} file={f} thumbCache={thumbCache} onClick={setSelectedFile} viewMode="list" />
          ))}
        </div>
      );
    }

    const emptyType = view === 'photos' ? 'photos' : view === 'videos' ? 'videos' : 'files';
    const emptyTitle = view === 'photos' ? t('noPhotos') : view === 'videos' ? t('noVideos') : t('noFiles');
    return <EmptyState type={emptyType} title={emptyTitle} text={t('filesEmptyText')} actionLabel={t('addFiles')} onAction={handleAddFiles} />;
  };

  return (
    <div className="app-layout">
      <Sidebar
        view={view}
        setView={setView}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        stats={stats}
        search={search}
        setSearch={setSearch}
        onLock={handleLock}
        onAddFolder={() => setShowFolderModal(true)}
        onDeleteFolder={handleDeleteFolder}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenSearch={() => setShowSearchModal(true)}
        t={t}
      />
      <div className="main-content" ref={dropRef} style={{ position: 'relative' }}>
        {dragOver && (
          <div className="drop-overlay">
            <div className="drop-zone">
              <div className="drop-icon">&#128229;</div>
              <div className="drop-text">{t('dragDrop')}</div>
              <div className="drop-subtext">{t('dragDropSub')}</div>
            </div>
          </div>
        )}
        {uploading && (
          <div className="upload-overlay">
            <div className="spinner" />
            <div className="upload-text">{t('encrypting')}</div>
          </div>
        )}
        <Toolbar
          view={view}
          sortBy={sortBy}
          setSortBy={setSortBy}
          viewMode={viewMode}
          setViewMode={setViewMode}
          search={search}
          currentFolder={currentFolder}
          onClearFilters={() => { setSearch(''); setCurrentFolder(null); }}
          onAddFiles={handleAddFiles}
          onNewNote={() => { setSelectedNote(null); setShowNoteModal(true); }}
          onNewPassword={() => { setSelectedPassword(null); setShowPasswordModal(true); }}
          t={t}
        />
        <div className="content-area">
          {folders.length > 0 && view !== 'notes' && view !== 'passwords' && (
            <div className="folders-section">
              <div className="section-header">
                <span className="section-label">{t('folders')}</span>
                <span className="section-count">{folders.length}</span>
              </div>
              <div className="folders-grid">
                {folders.map(f => (
                  <div key={f.id} className="folder-card" onClick={() => setCurrentFolder(f.id)}>
                    <div className="folder-card-icon">&#128193;</div>
                    <div className="folder-card-name">{f.name}</div>
                    <button className="folder-card-delete" onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }} title="Delete folder">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {renderContent()}
        </div>
      </div>

      {selectedFile && <FileModal file={selectedFile} onClose={() => setSelectedFile(null)} onDelete={handleDeleteFile} t={t} />}

      {showNoteModal && (
        <NoteModal
          note={selectedNote}
          t={t}
          onSave={async (title, content) => {
            if (selectedNote) {
              await window.vaultAPI.invoke('notes:update', selectedNote.id, title, content, selectedNote.tags || []);
              addToast(t('noteUpdated'), 'success');
            } else {
              await window.vaultAPI.invoke('notes:add', title, content, currentFolder);
              addToast(t('noteCreated'), 'success');
            }
            setShowNoteModal(false);
            setSelectedNote(null);
            loadData();
          }}
          onDelete={selectedNote ? () => handleDeleteNote(selectedNote.id) : null}
          onClose={() => { setShowNoteModal(false); setSelectedNote(null); }}
        />
      )}

      {showFolderModal && (
        <div className="modal-overlay" onClick={() => setShowFolderModal(false)}>
          <div className="modal modal-sm fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('newFolder')}</h3>
              <button className="modal-close" onClick={() => setShowFolderModal(false)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
              </button>
            </div>
            <div className="input-group">
              <label>{t('folderName')}</label>
              <input
                value={folderName}
                onChange={e => setFolderName(e.target.value)}
                placeholder={t('folderPlaceholder')}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddFolder()}
              />
            </div>
            <div className="modal-actions modal-actions-end">
              <button className="btn btn-secondary" onClick={() => setShowFolderModal(false)}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleAddFolder}>{t('create')}</button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <Settings settings={settings} onSave={(newSettings) => { onSettingsSave(newSettings); setShowSettingsModal(false); }} onClose={() => setShowSettingsModal(false)} />
      )}

      {showSearchModal && (
        <SearchModal
          t={t}
          onClose={() => setShowSearchModal(false)}
          onOpenFile={(file) => { setSelectedFile(file); setShowSearchModal(false); }}
          onOpenNote={(note) => { setSelectedNote(note); setShowNoteModal(true); setShowSearchModal(false); }}
          onOpenPassword={(pw) => { setSelectedPassword(pw); setShowPasswordModal(true); setShowSearchModal(false); }}
        />
      )}

      {showPasswordModal && (
        <PasswordModal
          password={selectedPassword}
          t={t}
          onSave={async (data) => {
            if (selectedPassword) {
              await window.vaultAPI.invoke('passwords:update', selectedPassword.id, data.name, data.username, data.password, data.url, data.notes, data.category, data.favorite);
              addToast(t('passwordUpdated'), 'success');
            } else {
              await window.vaultAPI.invoke('passwords:add', data.name, data.username, data.password, data.url, data.notes, data.category, data.favorite);
              addToast(t('passwordSaved'), 'success');
            }
            setShowPasswordModal(false);
            setSelectedPassword(null);
            loadData();
          }}
          onDelete={selectedPassword ? () => handleDeletePassword(selectedPassword.id) : null}
          onToggleFavorite={selectedPassword ? async () => {
            await window.vaultAPI.invoke('passwords:toggleFavorite', selectedPassword.id);
            loadData();
          } : null}
          onClose={() => { setShowPasswordModal(false); setSelectedPassword(null); }}
        />
      )}

      {updateInfo && updateInfo.state === 'downloading' && (
        <div className="update-banner update-downloading">
          <div className="update-banner-content">
            <div className="update-spinner" />
            <div className="update-info">
              <span className="update-text">Downloading update... {updateInfo.percent}%</span>
              <div className="update-progress-bar">
                <div className="update-progress-fill" style={{ width: `${updateInfo.percent || 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {updateInfo && updateInfo.state === 'downloaded' && (
        <div className="update-banner update-ready">
          <div className="update-banner-content">
            <span className="update-text">Update v{updateInfo.version} ready to install</span>
            <div className="update-actions">
              <button className="btn btn-primary btn-sm" onClick={() => window.vaultAPI.invoke('update:install')}>
                Restart & Install
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setUpdateInfo(null)}>
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {updateInfo && updateInfo.state === 'checking' && (
        <div className="update-banner update-checking">
          <div className="update-banner-content">
            <div className="update-spinner" />
            <span className="update-text">Checking for updates...</span>
          </div>
        </div>
      )}

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
