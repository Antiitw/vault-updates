import React, { useState, useEffect, useRef } from 'react';

function SearchModal({ onClose, t, onOpenFile, onOpenNote, onOpenPassword }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const search = async () => {
      setLoading(true);
      try {
        const [files, notes, passwords] = await Promise.all([
          window.vaultAPI.invoke('files:list', null, null, query),
          window.vaultAPI.invoke('notes:list', null, query),
          window.vaultAPI.invoke('passwords:list', null, query),
        ]);
        const items = [
          ...files.map(f => ({ ...f, type: 'file' })),
          ...notes.map(n => ({ ...n, type: 'note' })),
          ...passwords.map(p => ({ ...p, type: 'password' })),
        ];
        setResults(items);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search error:', err);
      }
      setLoading(false);
    };
    const timeout = setTimeout(search, 200);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        const item = results[selectedIndex];
        if (item.type === 'file') onOpenFile(item);
        else if (item.type === 'note') onOpenNote(item);
        else if (item.type === 'password') onOpenPassword(item);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onClose, onOpenFile, onOpenNote, onOpenPassword]);

  const getIcon = (type) => {
    switch (type) {
      case 'file': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
      case 'note': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
      case 'password': return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
      default: return null;
    }
  };

  const getColor = (type) => {
    switch (type) {
      case 'file': return 'var(--accent)';
      case 'note': return 'var(--warning)';
      case 'password': return 'var(--success)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="search-modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="search-modal-input-wrapper">
          <svg className="search-modal-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            className="search-modal-input"
            type="text"
            placeholder={t('search') + '...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="search-modal-kbd">ESC</kbd>
        </div>
        <div className="search-modal-results">
          {loading && query && (
            <div className="search-modal-empty">
              <div className="spinner" />
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <div className="search-modal-empty">
              No results found for "{query}"
            </div>
          )}
          {!query && (
            <div className="search-modal-empty">
              Type to search files, notes, and passwords...
            </div>
          )}
          {results.map((item, i) => (
            <div
              key={`${item.type}-${item.id}`}
              className={`search-modal-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => {
                if (item.type === 'file') onOpenFile(item);
                else if (item.type === 'note') onOpenNote(item);
                else if (item.type === 'password') onOpenPassword(item);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="search-modal-item-icon" style={{ color: getColor(item.type) }}>
                {getIcon(item.type)}
              </div>
              <div className="search-modal-item-info">
                <div className="search-modal-item-name">{item.original_name || item.title || item.name}</div>
                <div className="search-modal-item-type">{item.type}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
