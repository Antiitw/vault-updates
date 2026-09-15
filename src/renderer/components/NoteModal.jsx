import React, { useState, useEffect, useRef } from 'react';

function NoteModal({ note, onSave, onDelete, onClose, t }) {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{note ? t('editNote') : t('newNoteTitle')}</h3>
          <div className="modal-actions">
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
          <label>{t('title')}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('titlePlaceholder')} autoFocus />
        </div>
        <div className="input-group">
          <label>{t('content')}</label>
          <textarea
            ref={textareaRef}
            className="text-editor"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t('contentPlaceholder')}
          />
        </div>
        <div className="modal-actions modal-actions-end">
          <button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={() => onSave(title, content)}>
            {note ? t('update') : t('saveNote')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoteModal;
