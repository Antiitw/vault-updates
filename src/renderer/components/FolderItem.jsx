import React from 'react';

function FolderItem({ folder, isActive, onClick, onDelete }) {
  return (
    <button
      className={`folder-nav-item ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>{folder.name}</span>
      <button
        className="folder-nav-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 1l8 8M9 1L1 9"/>
        </svg>
      </button>
    </button>
  );
}

export default FolderItem;
