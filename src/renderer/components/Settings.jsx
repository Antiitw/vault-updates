import React, { useState, useEffect, useRef, useMemo } from 'react';
import translations from '../../shared/translations';
import ColorWheel from './ColorWheel';

function AnimatedCounter({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = parseInt(value) || 0;
    if (end === 0) { setDisplay(0); return; }
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration]);
  return <span>{display}</span>;
}

function CircleProgress({ percent, size = 120, stroke = 6 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setOffset(circumference - (percent / 100) * circumference);
    }, 100);
    return () => clearTimeout(timeout);
  }, [percent, circumference]);
  return (
    <svg width={size} height={size} className="settings-circle-progress">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--accent)" strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} className="settings-circle-fill" />
    </svg>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button className={`settings-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="settings-toggle-thumb" />
    </button>
  );
}

function Settings({ settings, onSave, onClose }) {
  const [theme, setTheme] = useState(settings.theme || 'dark');
  const [language, setLanguage] = useState(settings.language || 'en');
  const [activeSection, setActiveSection] = useState('appearance');
  const [saved, setSaved] = useState(false);
  const [storageInfo, setStorageInfo] = useState({ files: 0, notes: 0, passwords: 0, totalSize: 0 });
  const [autoLockTimeout, setAutoLockTimeout] = useState(settings.autoLockTimeout || 5);
  const [notifications, setNotifications] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [hoveredTheme, setHoveredTheme] = useState(null);
  const [ripple, setRipple] = useState(null);
  const [customAccent, setCustomAccent] = useState(settings.accentColor || '#6c5ce7');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const modalRef = useRef(null);

  const t = (key) => {
    const lang = language || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  };

  useEffect(() => {
    window.vaultAPI.invoke('stats:get').then(s => setStorageInfo(s));
  }, []);

  const themes = [
    { id: 'dark', name: t('dark'), colors: ['#07070c', '#0e0e16', '#161622', '#6c5ce7'], icon: '🌙', gradient: 'linear-gradient(135deg, #07070c, #6c5ce7)', accent: '#6c5ce7' },
    { id: 'light', name: t('light'), colors: ['#f5f5f7', '#ffffff', '#e8e8ed', '#6c5ce7'], icon: '☀️', gradient: 'linear-gradient(135deg, #f5f5f7, #6c5ce7)', accent: '#6c5ce7' },
    { id: 'purple', name: t('purple'), colors: ['#0d0a1a', '#15102a', '#1e1540', '#9b59b6'], icon: '💎', gradient: 'linear-gradient(135deg, #0d0a1a, #9b59b6)', accent: '#9b59b6' },
    { id: 'blue', name: t('blue'), colors: ['#0a0e1a', '#0e1425', '#131c33', '#3498db'], icon: '🌊', gradient: 'linear-gradient(135deg, #0a0e1a, #3498db)', accent: '#3498db' },
    { id: 'green', name: t('green'), colors: ['#0a120d', '#0e1a12', '#132318', '#27ae60'], icon: '🌿', gradient: 'linear-gradient(135deg, #0a120d, #27ae60)', accent: '#27ae60' },
    { id: 'red', name: t('red'), colors: ['#120a0a', '#1a0e0e', '#231313', '#e74c3c'], icon: '🔥', gradient: 'linear-gradient(135deg, #120a0a, #e74c3c)', accent: '#e74c3c' },
  ];

  const presetColors = [
    { color: '#6c5ce7', name: 'Purple' },
    { color: '#9b59b6', name: 'Amethyst' },
    { color: '#3498db', name: 'Blue' },
    { color: '#1abc9c', name: 'Teal' },
    { color: '#2ecc71', name: 'Green' },
    { color: '#e74c3c', name: 'Red' },
    { color: '#e67e22', name: 'Orange' },
    { color: '#f1c40f', name: 'Yellow' },
    { color: '#e84393', name: 'Pink' },
    { color: '#00cec9', name: 'Cyan' },
    { color: '#fd79a8', name: 'Rose' },
    { color: '#a29bfe', name: 'Lavender' },
  ];

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧', native: 'English' },
    { code: 'es', name: 'Español', flag: '🇪🇸', native: 'Español' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪', native: 'Deutsch' },
    { code: 'fr', name: 'Français', flag: '🇫🇷', native: 'Français' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦', native: 'العربية' },
    { code: 'pl', name: 'Polski', flag: '🇵🇱', native: 'Polski' },
  ];

  const sections = [
    { id: 'appearance', icon: '🎨', label: t('theme') },
    { id: 'language', icon: '🌐', label: t('language') },
    { id: 'security', icon: '🔒', label: t('security') || 'Security' },
    { id: 'storage', icon: '📦', label: t('storage') || 'Storage' },
    { id: 'notifications', icon: '🔔', label: 'Notifications' },
    { id: 'about', icon: '💡', label: t('about') || 'About' },
  ];

  const handleSave = () => {
    onSave({ theme, language, autoLockTimeout, notifications, accentColor: customAccent });
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (newPw.length < 6) { setPwError('Password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    try {
      const result = await window.vaultAPI.invoke('auth:changePassword', currentPw, newPw);
      if (result.success) {
        setPwSuccess(true);
        setTimeout(() => { setPwSuccess(false); setShowChangePassword(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }, 1500);
      } else { setPwError(result.error || 'Failed to change password'); }
    } catch (err) { setPwError('Error: ' + err.message); }
  };

  const currentTheme = themes.find(th => th.id === theme);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  };

  const storagePercent = Math.min(100, ((storageInfo.totalSize || 0) / 1024 / 1024 / 50) * 100);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-container" onClick={e => e.stopPropagation()} ref={modalRef}>
        {/* Animated background orbs */}
        <div className="settings-bg-orb settings-bg-orb-1" />
        <div className="settings-bg-orb settings-bg-orb-2" />
        <div className="settings-bg-orb settings-bg-orb-3" />

        {/* Header */}
        <div className="settings-header-new">
          <div className="settings-header-glow" />
          <div className="settings-header-content">
            <div className="settings-logo-container">
              <div className="settings-logo-ring" />
              <div className="settings-logo-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </div>
            </div>
            <div className="settings-header-text">
              <h3 className="settings-title-new">{t('settings')}</h3>
              <p className="settings-subtitle-new">Customize your vault experience</p>
            </div>
            <button className="settings-close-btn" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="settings-body-new">
          {/* Sidebar */}
          <div className="settings-sidebar-new">
            {sections.map((section, i) => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="settings-nav-emoji">{section.icon}</span>
                <span className="settings-nav-label">{section.label}</span>
                {activeSection === section.id && <span className="settings-nav-active-bg" />}
              </button>
            ))}
            <div className="settings-sidebar-footer">
              <div className="settings-sidebar-version">Vault v1.0.5</div>
            </div>
          </div>

          {/* Content */}
          <div className="settings-content-new">
            {/* APPEARANCE */}
            {activeSection === 'appearance' && (
              <div className="settings-panel-new" key="appearance">
                <div className="settings-panel-title-row">
                  <h4 className="settings-panel-title">Appearance</h4>
                  <span className="settings-panel-badge">{currentTheme?.icon} {currentTheme?.name}</span>
                </div>
                <div className="settings-themes-showcase">
                  {themes.map((th, i) => (
                    <button
                      key={th.id}
                      className={`settings-theme-item ${theme === th.id ? 'active' : ''}`}
                      onClick={() => setTheme(th.id)}
                      onMouseEnter={() => setHoveredTheme(th.id)}
                      onMouseLeave={() => setHoveredTheme(null)}
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <div className="settings-theme-visual" style={{ background: th.gradient }}>
                        <div className="settings-theme-shine" />
                        {theme === th.id && (
                          <div className="settings-theme-active-ring">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                      </div>
                      <div className="settings-theme-label">
                        <span className="settings-theme-emoji">{th.icon}</span>
                        <span>{th.name}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Custom Accent Color Section */}
                <div className="settings-accent-section">
                  <div className="settings-accent-header">
                    <h5 className="settings-accent-title">Accent Color</h5>
                    <button
                      className="settings-accent-toggle"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                    >
                      {showColorPicker ? 'Hide Picker' : 'Customize'}
                    </button>
                  </div>
                  
                  {/* Preset Colors */}
                  <div className="settings-preset-colors">
                    {presetColors.map((preset, i) => (
                      <button
                        key={preset.color}
                        className={`settings-preset-swatch ${customAccent === preset.color ? 'active' : ''}`}
                        onClick={() => setCustomAccent(preset.color)}
                        title={preset.name}
                        style={{ 
                          animationDelay: `${i * 40}ms`,
                          '--swatch-color': preset.color
                        }}
                      >
                        <div className="settings-preset-inner" style={{ background: preset.color }} />
                        {customAccent === preset.color && (
                          <svg className="settings-preset-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Color Wheel */}
                  {showColorPicker && (
                    <div className="settings-color-picker-wrap">
                      <ColorWheel color={customAccent} onChange={setCustomAccent} />
                    </div>
                  )}

                  {/* Live Preview */}
                  <div className="settings-accent-preview">
                    <div className="settings-accent-preview-label">Preview</div>
                    <div className="settings-accent-preview-row">
                      <div className="settings-accent-preview-card" style={{ 
                        background: 'var(--bg-secondary)', 
                        borderColor: customAccent,
                        boxShadow: `0 0 20px ${customAccent}30`
                      }}>
                        <div className="settings-accent-preview-btn" style={{ background: customAccent }}>Button</div>
                        <div className="settings-accent-preview-text" style={{ color: customAccent }}>Accent Text</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LANGUAGE */}
            {activeSection === 'language' && (
              <div className="settings-panel-new" key="language">
                <div className="settings-panel-title-row">
                  <h4 className="settings-panel-title">Language</h4>
                  <span className="settings-panel-badge">{languages.find(l => l.code === language)?.flag} {languages.find(l => l.code === language)?.native}</span>
                </div>
                <div className="settings-languages-showcase">
                  {languages.map((l, i) => (
                    <button
                      key={l.code}
                      className={`settings-lang-item ${language === l.code ? 'active' : ''}`}
                      onClick={() => setLanguage(l.code)}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="settings-lang-emoji-large">{l.flag}</span>
                      <div className="settings-lang-text">
                        <span className="settings-lang-name">{l.native}</span>
                        <span className="settings-lang-sub">{l.name}</span>
                      </div>
                      {language === l.code && (
                        <div className="settings-lang-check-new">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SECURITY */}
            {activeSection === 'security' && (
              <div className="settings-panel-new" key="security">
                <div className="settings-panel-title-row">
                  <h4 className="settings-panel-title">Security</h4>
                  <span className="settings-panel-badge settings-badge-green">Protected</span>
                </div>
                <div className="settings-cards-grid">
                  <div className="settings-option-card" style={{ animationDelay: '0ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Master Password</div>
                        <div className="settings-option-card-desc">Change the password used to unlock your vault</div>
                      </div>
                    </div>
                    <button className="settings-option-card-btn" onClick={() => setShowChangePassword(!showChangePassword)}>
                      {showChangePassword ? 'Cancel' : 'Change'}
                    </button>
                  </div>

                  {showChangePassword && (
                    <div className="settings-password-form">
                      {pwSuccess ? (
                        <div className="settings-success-banner">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          Password changed successfully!
                        </div>
                      ) : (
                        <>
                          <div className="settings-input-group">
                            <label>Current Password</label>
                            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password" />
                          </div>
                          <div className="settings-input-group">
                            <label>New Password</label>
                            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" />
                          </div>
                          <div className="settings-input-group">
                            <label>Confirm New Password</label>
                            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
                          </div>
                          {pwError && <div className="settings-error-banner">{pwError}</div>}
                          <button className="settings-submit-btn" onClick={handleChangePassword} disabled={!currentPw || !newPw || !confirmPw}>
                            Update Password
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div className="settings-option-card" style={{ animationDelay: '80ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Auto-Lock</div>
                        <div className="settings-option-card-desc">Lock vault after inactivity</div>
                      </div>
                    </div>
                    <select className="settings-select-new" value={autoLockTimeout} onChange={e => setAutoLockTimeout(Number(e.target.value))}>
                      <option value={1}>1 min</option>
                      <option value={5}>5 min</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>60 min</option>
                      <option value={0}>Never</option>
                    </select>
                  </div>

                  <div className="settings-option-card" style={{ animationDelay: '160ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Encryption</div>
                        <div className="settings-option-card-desc">AES-256-GCM with PBKDF2</div>
                      </div>
                    </div>
                    <span className="settings-status-pill active">Active</span>
                  </div>
                </div>
              </div>
            )}

            {/* STORAGE */}
            {activeSection === 'storage' && (
              <div className="settings-panel-new" key="storage">
                <div className="settings-panel-title-row">
                  <h4 className="settings-panel-title">Storage</h4>
                  <span className="settings-panel-badge">{formatBytes(storageInfo.totalSize || 0)} used</span>
                </div>
                <div className="settings-storage-visual">
                  <div className="settings-storage-circle-wrap">
                    <CircleProgress percent={storagePercent} size={140} stroke={8} />
                    <div className="settings-storage-circle-text">
                      <span className="settings-storage-circle-number">{formatBytes(storageInfo.totalSize || 0)}</span>
                      <span className="settings-storage-circle-label">of 50 MB</span>
                    </div>
                  </div>
                  <div className="settings-storage-stats">
                    <div className="settings-stat-card" style={{ animationDelay: '0ms' }}>
                      <div className="settings-stat-icon" style={{ background: 'rgba(108,92,231,0.15)', color: 'var(--accent)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                      </div>
                      <div className="settings-stat-value"><AnimatedCounter value={storageInfo.files || 0} /></div>
                      <div className="settings-stat-label">Files</div>
                    </div>
                    <div className="settings-stat-card" style={{ animationDelay: '80ms' }}>
                      <div className="settings-stat-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </div>
                      <div className="settings-stat-value"><AnimatedCounter value={storageInfo.notes || 0} /></div>
                      <div className="settings-stat-label">Notes</div>
                    </div>
                    <div className="settings-stat-card" style={{ animationDelay: '160ms' }}>
                      <div className="settings-stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </div>
                      <div className="settings-stat-value"><AnimatedCounter value={storageInfo.passwords || 0} /></div>
                      <div className="settings-stat-label">Passwords</div>
                    </div>
                  </div>
                </div>
                <div className="settings-option-card" style={{ animationDelay: '240ms' }}>
                  <div className="settings-option-card-header">
                    <div className="settings-option-card-icon" style={{ background: 'rgba(52,152,219,0.15)', color: '#3498db' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </div>
                    <div className="settings-option-card-info">
                      <div className="settings-option-card-title">Export Vault</div>
                      <div className="settings-option-card-desc">Download an encrypted backup of your data</div>
                    </div>
                  </div>
                  <button className="settings-option-card-btn" onClick={() => window.vaultAPI.invoke('vault:export')}>Export</button>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS */}
            {activeSection === 'notifications' && (
              <div className="settings-panel-new" key="notifications">
                <div className="settings-panel-title-row">
                  <h4 className="settings-panel-title">Notifications</h4>
                </div>
                <div className="settings-cards-grid">
                  <div className="settings-option-card" style={{ animationDelay: '0ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(108,92,231,0.15)', color: 'var(--accent)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Push Notifications</div>
                        <div className="settings-option-card-desc">Get notified about updates and security alerts</div>
                      </div>
                    </div>
                    <Toggle checked={notifications} onChange={setNotifications} />
                  </div>
                  <div className="settings-option-card" style={{ animationDelay: '80ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Update Alerts</div>
                        <div className="settings-option-card-desc">Notify when a new version is available</div>
                      </div>
                    </div>
                    <Toggle checked={notifications} onChange={() => {}} />
                  </div>
                  <div className="settings-option-card" style={{ animationDelay: '160ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Security Alerts</div>
                        <div className="settings-option-card-desc">Alert on failed login attempts</div>
                      </div>
                    </div>
                    <Toggle checked={true} onChange={() => {}} />
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT */}
            {activeSection === 'about' && (
              <div className="settings-panel-new" key="about">
                <div className="settings-panel-title-row">
                  <h4 className="settings-panel-title">About</h4>
                </div>
                <div className="settings-about-showcase">
                  <div className="settings-about-glow" />
                  <div className="settings-about-icon-wrap">
                    <div className="settings-about-icon-ring" />
                    <div className="settings-about-icon">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                  </div>
                  <h3 className="settings-about-name">Vault</h3>
                  <span className="settings-about-version">v1.0.5</span>
                  <p className="settings-about-desc">Encrypted file, note, and password storage. Local-first, no cloud, no tracking.</p>
                </div>
                <div className="settings-cards-grid">
                  <div className="settings-option-card" style={{ animationDelay: '0ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(108,92,231,0.15)', color: 'var(--accent)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Check for Updates</div>
                        <div className="settings-option-card-desc">Look for the latest version</div>
                      </div>
                    </div>
                    <button className="settings-option-card-btn" onClick={() => window.vaultAPI.invoke('update:check')}>Check</button>
                  </div>
                  <div className="settings-option-card" style={{ animationDelay: '80ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">Source Code</div>
                        <div className="settings-option-card-desc">Open source on GitHub</div>
                      </div>
                    </div>
                    <a href="https://github.com/Antiitw/vault-updates" target="_blank" rel="noreferrer" className="settings-option-card-btn">GitHub</a>
                  </div>
                  <div className="settings-option-card" style={{ animationDelay: '160ms' }}>
                    <div className="settings-option-card-header">
                      <div className="settings-option-card-icon" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      </div>
                      <div className="settings-option-card-info">
                        <div className="settings-option-card-title">License</div>
                        <div className="settings-option-card-desc">MIT License</div>
                      </div>
                    </div>
                    <span className="settings-status-pill">MIT</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer-new">
          <button className="settings-btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button className={`settings-btn-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
            {saved ? (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Saved!</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> {t('save')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
