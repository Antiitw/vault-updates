import React from 'react';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function FileCard({ file, thumbCache, onClick, viewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="list-row fade-in" onClick={() => onClick(file)}>
        <div className="list-col-name">
          <div className={`file-type-dot file-type-${file.file_type}`} />
          {file.original_name}
        </div>
        <span className="list-col-type">{file.file_type}</span>
        <span className="list-col-size">{formatSize(file.size)}</span>
        <span className="list-col-date">{new Date(file.created_at).toLocaleDateString()}</span>
      </div>
    );
  }

  return (
    <div className="file-card fade-in" onClick={() => onClick(file)}>
      <div className="file-card-thumb">
        {file.thumbnail && thumbCache[file.thumbnail] ? (
          <img className="thumb-blur" src={thumbCache[file.thumbnail]} alt={file.original_name} loading="lazy" />
        ) : (
          <div className={`file-card-icon file-type-${file.file_type}`}>
            {file.file_type === 'video' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            ) : file.file_type === 'text' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            )}
          </div>
        )}
      </div>
      <div className="file-card-info">
        <div className="file-card-name" title={file.original_name}>{file.original_name}</div>
        <div className="file-card-meta">{formatSize(file.size)} &middot; {new Date(file.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

export { formatSize };
export default FileCard;
