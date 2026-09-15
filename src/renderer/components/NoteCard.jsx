import React from 'react';

function NoteCard({ note, onClick }) {
  return (
    <div className="note-card fade-in" onClick={() => onClick(note)}>
      <div className="note-card-header">
        <div className="note-card-dot" />
        <span className="note-card-date">{new Date(note.updated_at).toLocaleDateString()}</span>
      </div>
      <div className="note-card-title">{note.title}</div>
      <div className="note-card-preview">{note.content?.substring(0, 150) || 'Empty note...'}</div>
    </div>
  );
}

export default NoteCard;
