import React, { useState, useEffect } from 'react';
import translations from '../../shared/translations';
const { ipcRenderer } = window.require('electron');

function Settings({ settings, onSave, onClose }) {
  const [theme, setTheme] = useState(settings.theme || 'dark');
  const [language, setLanguage] = useState(settings.language || 'en');

  const t = (key) => {
    const lang = language || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  };

  const themes = [
    { id: 'dark', name: t('dark'), colors: ['#07070c', '#0e0e16', '#161622', '#6c5ce7'] },
    { id: 'light', name: t('light'), colors: ['#f5f5f7', '#ffffff', '#e8e8ed', '#6c5ce7'] },
    { id: 'purple', name: t('purple'), colors: ['#0d0a1a', '#15102a', '#1e1540', '#9b59b6'] },
    { id: 'blue', name: t('blue'), colors: ['#0a0e1a', '#0e1425', '#131c33', '#3498db'] },
    { id: 'green', name: t('green'), colors: ['#0a120d', '#0e1a12', '#132318', '#27ae60'] },
    { id: 'red', name: t('red'), colors: ['#120a0a', '#1a0e0e', '#231313', '#e74c3c'] },
  ];

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  ];

  const handleSave = () => {
    onSave({ theme, language });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('settings')}</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
          </button>
        </div>

        <div className="settings-section">
          <label className="settings-label">{t('theme')}</label>
          <div className="settings-themes">
            {themes.map(t => (
              <button
                key={t.id}
                className={`settings-theme-btn ${theme === t.id ? 'active' : ''}`}
                onClick={() => setTheme(t.id)}
              >
                <div className="settings-theme-preview">
                  {t.colors.map((c, i) => (
                    <div key={i} style={{ background: c, flex: 1 }} />
                  ))}
                </div>
                <span className="settings-theme-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <label className="settings-label">{t('language')}</label>
          <div className="settings-languages">
            {languages.map(l => (
              <button
                key={l.code}
                className={`settings-lang-btn ${language === l.code ? 'active' : ''}`}
                onClick={() => setLanguage(l.code)}
              >
                <span className="settings-lang-flag">{l.flag}</span>
                <span className="settings-lang-name">{l.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={handleSave}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
