import React, { useState, useEffect, useRef } from 'react';
import translations from '../../shared/translations';
const { ipcRenderer } = window.require('electron');

function Settings({ settings, onSave, onClose }) {
  const [theme, setTheme] = useState(settings.theme || 'dark');
  const [language, setLanguage] = useState(settings.language || 'en');
  const [activeSection, setActiveSection] = useState('appearance');
  const [saved, setSaved] = useState(false);
  const modalRef = useRef(null);

  const t = (key) => {
    const lang = language || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  };

  const themes = [
    { id: 'dark', name: t('dark'), colors: ['#07070c', '#0e0e16', '#161622', '#6c5ce7'], icon: '🌙' },
    { id: 'light', name: t('light'), colors: ['#f5f5f7', '#ffffff', '#e8e8ed', '#6c5ce7'], icon: '☀️' },
    { id: 'purple', name: t('purple'), colors: ['#0d0a1a', '#15102a', '#1e1540', '#9b59b6'], icon: '💎' },
    { id: 'blue', name: t('blue'), colors: ['#0a0e1a', '#0e1425', '#131c33', '#3498db'], icon: '🌊' },
    { id: 'green', name: t('green'), colors: ['#0a120d', '#0e1a12', '#132318', '#27ae60'], icon: '🌿' },
    { id: 'red', name: t('red'), colors: ['#120a0a', '#1a0e0e', '#231313', '#e74c3c'], icon: '🔥' },
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
    { id: 'appearance', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>, label: t('theme') },
    { id: 'language', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, label: t('language') },
  ];

  const handleSave = () => {
    onSave({ theme, language });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const currentTheme = themes.find(th => th.id === theme);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md settings-modal" onClick={e => e.stopPropagation()} ref={modalRef}>
        <div className="settings-header">
          <div className="settings-header-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div className="settings-header-text">
            <h3 className="settings-title">{t('settings')}</h3>
            <p className="settings-subtitle">Customize your experience</p>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="settings-sidebar">
            {sections.map((section, i) => (
              <button
                key={section.id}
                className={`settings-nav-btn ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="settings-nav-icon">{section.icon}</span>
                <span className="settings-nav-label">{section.label}</span>
                {activeSection === section.id && <span className="settings-nav-indicator" />}
              </button>
            ))}
          </div>

          <div className="settings-content">
            {activeSection === 'appearance' && (
              <div className="settings-panel fade-in-panel">
                <div className="settings-panel-header">
                  <h4>{t('theme')}</h4>
                  <div className="settings-current-theme">
                    <span className="settings-current-icon">{currentTheme?.icon}</span>
                    <span>{currentTheme?.name}</span>
                  </div>
                </div>
                <div className="settings-themes-grid">
                  {themes.map((th, i) => (
                    <button
                      key={th.id}
                      className={`settings-theme-card ${theme === th.id ? 'active' : ''}`}
                      onClick={() => setTheme(th.id)}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="settings-theme-preview">
                        {th.colors.map((c, ci) => (
                          <div key={ci} className="settings-theme-stripe" style={{ background: c }} />
                        ))}
                      </div>
                      <div className="settings-theme-info">
                        <span className="settings-theme-icon">{th.icon}</span>
                        <span className="settings-theme-name">{th.name}</span>
                      </div>
                      {theme === th.id && (
                        <div className="settings-theme-check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'language' && (
              <div className="settings-panel fade-in-panel">
                <div className="settings-panel-header">
                  <h4>{t('language')}</h4>
                  <div className="settings-current-theme">
                    <span>{languages.find(l => l.code === language)?.flag}</span>
                    <span>{languages.find(l => l.code === language)?.native}</span>
                  </div>
                </div>
                <div className="settings-languages-grid">
                  {languages.map((l, i) => (
                    <button
                      key={l.code}
                      className={`settings-lang-card ${language === l.code ? 'active' : ''}`}
                      onClick={() => setLanguage(l.code)}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className="settings-lang-flag-large">{l.flag}</span>
                      <div className="settings-lang-info">
                        <span className="settings-lang-native">{l.native}</span>
                        <span className="settings-lang-english">{l.name}</span>
                      </div>
                      {language === l.code && (
                        <div className="settings-lang-check">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary settings-btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button className={`btn btn-primary settings-btn-save ${saved ? 'saved' : ''}`} onClick={handleSave}>
            {saved ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> Saved!</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> {t('save')}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
