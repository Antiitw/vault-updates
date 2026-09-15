import React from 'react';

function PasswordItem({ password, onClick }) {
  return (
    <div className="password-item fade-in" onClick={() => onClick(password)}>
      <div className="pw-item-left">
        <div className="pw-item-icon" style={{ background: password.favorite ? 'var(--accent)' : 'var(--bg-tertiary)' }}>
          {password.name ? password.name.charAt(0).toUpperCase() : '?'}
        </div>
        <div className="pw-item-info">
          <div className="pw-item-name">{password.name}</div>
          <div className="pw-item-user">{password.username || 'No username'}</div>
        </div>
      </div>
      <div className="pw-item-right">
        <span className="pw-item-category">{password.category}</span>
        <span className="pw-item-date">{new Date(password.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

export default PasswordItem;
