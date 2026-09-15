import React from 'react';

function NavButton({ icon, label, count, active, onClick }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
      <span className="nav-item-count">{count}</span>
    </button>
  );
}

export default NavButton;
