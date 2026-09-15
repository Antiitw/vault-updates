import React from 'react';

const icons = {
  photos: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
    </svg>
  ),
  videos: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  ),
  texts: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>
    </svg>
  ),
  notes: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>
    </svg>
  ),
  passwords: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/>
    </svg>
  ),
  files: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
};

function EmptyState({ type, title, text, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-state-visual">
        <div className="empty-state-circle">
          {icons[type] || icons.files}
        </div>
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-text">{text}</p>
      {actionLabel && onAction && (
        <button className="btn btn-primary" onClick={onAction}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 0v14M0 7h14" strokeWidth="2"/></svg>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
