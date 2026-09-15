import React from 'react';

function Toolbar({ view, sortBy, setSortBy, viewMode, setViewMode, search, currentFolder, onClearFilters, onAddFiles, onNewNote, onNewPassword, t }) {
  const titles = { all: t('allFiles'), photos: t('photos'), videos: t('videos'), texts: t('textFiles'), notes: t('notes'), passwords: t('passwords') };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <h2 className="toolbar-title">{titles[view]}</h2>
        {(search || currentFolder) && (
          <button className="btn-clear" onClick={onClearFilters}>
            {t('clearFilters')} &times;
          </button>
        )}
      </div>
      <div className="toolbar-right">
        {view !== 'notes' && view !== 'passwords' && (
          <>
            <div className="toolbar-sort">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sort-select">
                <option value="date">{t('recent')}</option>
                <option value="name">{t('name')}</option>
                <option value="size">{t('size')}</option>
              </select>
            </div>
            <div className="toolbar-view-toggle">
              <button className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
              </button>
              <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List view">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="3" rx="1"/><rect x="1" y="12" width="14" height="3" rx="1"/></svg>
              </button>
            </div>
          </>
        )}
        {view !== 'notes' && view !== 'passwords' && (
          <button className="btn btn-primary" onClick={onAddFiles}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0v14M0 7h14" strokeWidth="2"/></svg>
            {t('addFiles')}
          </button>
        )}
        {view === 'notes' && (
          <button className="btn btn-primary" onClick={onNewNote}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0v14M0 7h14" strokeWidth="2"/></svg>
            {t('newNote')}
          </button>
        )}
        {view === 'passwords' && (
          <button className="btn btn-primary" onClick={onNewPassword}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0v14M0 7h14" strokeWidth="2"/></svg>
            {t('newPassword')}
          </button>
        )}
      </div>
    </div>
  );
}

export default Toolbar;
