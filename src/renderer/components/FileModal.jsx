import React, { useState, useEffect } from 'react';
import { formatSize } from './FileCard';

function FileModal({ file, onClose, onDelete, t }) {
  const [tempPath, setTempPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState('');

  useEffect(() => {
    let mounted = true;
    window.vaultAPI.invoke('files:getPath', file.encrypted_name).then(async p => {
      if (mounted) {
        setTempPath(p);
        if (file.file_type === 'text' && p) {
          try {
            const content = await window.vaultAPI.invoke('files:readContent', p);
            if (content) setTextContent(content);
          } catch {}
        }
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const handleDecrypt = async () => { await window.vaultAPI.invoke('files:decrypt', file.id); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{file.original_name}</h3>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={handleDecrypt}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {t('export')}
            </button>
            <button className="btn btn-danger" onClick={() => onDelete(file.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              {t('delete')}
            </button>
            <button className="modal-close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
            </button>
          </div>
        </div>
        {loading ? (
          <div className="file-preview-loading">
            <div className="spinner" />
          </div>
        ) : (
          <div className="file-preview">
            {file.file_type === 'photo' && tempPath && (
              <div className="photo-viewer">
                <img src={`file://${tempPath}`} alt={file.original_name} />
              </div>
            )}
            {file.file_type === 'video' && tempPath && (
              <video className="video-player" controls autoPlay>
                <source src={`file://${tempPath}`} />
              </video>
            )}
            {file.file_type === 'text' && (
              <div className="text-viewer">
                <pre>{textContent}</pre>
              </div>
            )}
            <div className="file-info-bar">
              <span className="file-info-badge">{file.mime_type}</span>
              <span className="file-info-badge">{formatSize(file.size)}</span>
              <span className="file-info-badge">{new Date(file.created_at).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FileModal;
