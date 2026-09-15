import React from 'react';

function Toast({ message, type, onClose }) {
  React.useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">{type === 'success' ? '\u2713' : type === 'error' ? '\u2717' : '\u2139'}</span>
      <span className="toast-message">{message}</span>
    </div>
  );
}

export default Toast;
