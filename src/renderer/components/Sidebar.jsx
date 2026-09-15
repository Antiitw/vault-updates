import React from 'react';
import NavButton from './NavButton';
import FolderItem from './FolderItem';

function Sidebar({ view, setView, folders, currentFolder, setCurrentFolder, stats, search, setSearch, onLock, onAddFolder, onDeleteFolder, onOpenSettings, onOpenSearch, t }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <span className="sidebar-logo-text">Vault</span>
          <span className="sidebar-version">v1.0.5</span>
        </div>
        <div className="search-box" onClick={onOpenSearch}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder={t('search') + ' (Ctrl+K)'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            readOnly
            style={{ cursor: 'pointer' }}
          />
        </div>
      </div>

      <div className="sidebar-nav">
        <div className="sidebar-section">
          <div className="sidebar-section-title">{t('library')}</div>
          <NavButton
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
            label={t('allFiles')}
            count={(stats.photos || 0) + (stats.videos || 0) + (stats.texts || 0)}
            active={view === 'all'}
            onClick={() => { setView('all'); setCurrentFolder(null); }}
          />
          <NavButton
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
            label={t('photos')}
            count={stats.photos || 0}
            active={view === 'photos'}
            onClick={() => { setView('photos'); setCurrentFolder(null); }}
          />
          <NavButton
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
            label={t('videos')}
            count={stats.videos || 0}
            active={view === 'videos'}
            onClick={() => { setView('videos'); setCurrentFolder(null); }}
          />
          <NavButton
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>}
            label={t('textFiles')}
            count={stats.texts || 0}
            active={view === 'texts'}
            onClick={() => { setView('texts'); setCurrentFolder(null); }}
          />
          <NavButton
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
            label={t('notes')}
            count={stats.notes || 0}
            active={view === 'notes'}
            onClick={() => { setView('notes'); setCurrentFolder(null); }}
          />
          <NavButton
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>}
            label={t('passwords')}
            count={stats.passwords || 0}
            active={view === 'passwords'}
            onClick={() => { setView('passwords'); setCurrentFolder(null); }}
          />
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title sidebar-section-title-row">
            {t('folders')}
            <button className="btn-add-folder" onClick={onAddFolder} title={t('newFolder')}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
            </button>
          </div>
          <div className="folders-list">
            {folders.map(f => (
              <FolderItem
                key={f.id}
                folder={f}
                isActive={currentFolder === f.id}
                onClick={() => setCurrentFolder(f.id)}
                onDelete={onDeleteFolder}
              />
            ))}
            {folders.length === 0 && (
              <div className="folders-empty">{t('noFolders')}</div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="storage-info">
          <div className="storage-bar">
            <div className="storage-bar-fill" style={{ width: `${Math.min(100, (stats.totalSize || 0) / 1024 / 1024 / 10)}%` }} />
          </div>
          <span className="storage-text">{stats.totalSize ? `${(stats.totalSize / 1024 / 1024).toFixed(1)} MB` : '0 B'} {t('stored')}</span>
        </div>
        <div className="sidebar-footer-buttons">
          <button className="btn btn-settings" onClick={onOpenSettings} title={t('settings')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="btn btn-settings" onClick={() => window.vaultAPI.invoke('update:check')} title="Check for updates">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9"/></svg>
          </button>
          <button className="btn btn-lock" onClick={onLock}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            {t('lockVault')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
