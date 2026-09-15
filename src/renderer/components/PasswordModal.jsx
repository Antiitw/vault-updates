import React, { useState, useEffect, useRef } from 'react';

function PasswordModal({ password, onSave, onDelete, onToggleFavorite, onClose, t }) {
  const [name, setName] = useState(password?.name || '');
  const [username, setUsername] = useState(password?.username || '');
  const [pw, setPw] = useState(password?.password || '');
  const [url, setUrl] = useState(password?.url || '');
  const [notes, setNotes] = useState(password?.notes || '');
  const [category, setCategory] = useState(password?.category || 'other');
  const [favorite, setFavorite] = useState(password?.favorite === 1);
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let result = '';
    const arr = window.vaultAPI.randomBytes(24);
    for (let i = 0; i < 24; i++) result += chars[arr[i] % chars.length];
    setPw(result);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), username: username.trim(), password: pw, url: url.trim(), notes, category, favorite });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{password ? t('editPassword') : t('newPassword')}</h3>
          <div className="modal-actions">
            {password && (
              <button className="btn btn-secondary" onClick={onToggleFavorite} title={favorite ? t('favorited') : t('favorite')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={favorite ? 'var(--warning)' : 'none'} stroke={favorite ? 'var(--warning)' : 'currentColor'} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                {favorite ? t('favorited') : t('favorite')}
              </button>
            )}
            {onDelete && (
              <button className="btn btn-danger" onClick={onDelete}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                {t('delete')}
              </button>
            )}
            <button className="modal-close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
            </button>
          </div>
        </div>

        <div className="input-group">
          <label>{t('serviceName')} *</label>
          <input ref={inputRef} value={name} onChange={e => setName(e.target.value)} placeholder={t('serviceNamePlaceholder')} />
        </div>

        <div className="input-group">
          <label>{t('username')}</label>
          <div className="pw-input-row">
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder={t('usernamePlaceholder')} />
            {username && (
              <button className="btn-copy" onClick={() => copyToClipboard(username, 'user')} title={t('username')}>
                {copied === 'user' ? '\u2713' : '\u2398'}
              </button>
            )}
          </div>
        </div>

        <div className="input-group">
          <label>{t('password')}</label>
          <div className="pw-input-row">
            <input
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              className="pw-field"
            />
            <button className="btn-copy" onClick={() => setShowPw(!showPw)} title={showPw ? 'Hide' : 'Show'}>
              {showPw ? '\u{1F441}' : '\u{1F441}\u200D\u{1F5E8}'}
            </button>
            <button className="btn-copy" onClick={() => copyToClipboard(pw, 'pw')} title={t('password')}>
              {copied === 'pw' ? '\u2713' : '\u2398'}
            </button>
            <button className="btn-generate" onClick={generatePassword} title={t('password')}>
              &#x21BB;
            </button>
          </div>
        </div>

        <div className="input-group">
          <label>{t('url')}</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder={t('urlPlaceholder')} />
        </div>

        <div className="input-group">
          <label>{t('category')}</label>
          <div className="pw-categories-row">
            {['social','email','banking','shopping','work','other'].map(cat => (
              <button key={cat} className={`pw-cat-chip ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label>{t('notesLabel')}</label>
          <textarea className="text-editor" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} style={{ minHeight: 100 }} />
        </div>

        <div className="modal-actions modal-actions-end">
          <button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            {password ? t('update') : t('savePassword')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PasswordModal;
