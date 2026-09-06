import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

const { ipcRenderer } = window.require('electron');

function Splash({ onDone }) {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 1500);
    const t3 = setTimeout(() => setPhase(3), 3500);
    const t4 = setTimeout(() => onDone(), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 1;
      });
    }, 38);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="splash-screen">
      {phase >= 1 && (
        <div className={`splash-content ${phase >= 3 ? 'splash-exit' : ''}`}>
          <div className="splash-logo">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="white">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div className="splash-title">VAULT</div>
          <div className="splash-credit">made by anti_TW</div>
          <div className="splash-bar-container">
            <div className="splash-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [settings, setSettings] = useState({ theme: 'dark', language: 'en' });

  useEffect(() => {
    ipcRenderer.invoke('settings:get').then(s => {
      setSettings(s);
      applyTheme(s.theme);
    });
    ipcRenderer.invoke('auth:isUnlocked').then(setUnlocked).finally(() => setLoading(false));
  }, []);

  const applyTheme = (theme) => {
    document.body.className = '';
    if (theme && theme !== 'dark') {
      document.body.classList.add('theme-' + theme);
    }
  };

  const handleSettingsSave = (newSettings) => {
    setSettings(newSettings);
    applyTheme(newSettings.theme);
    ipcRenderer.invoke('settings:save', newSettings);
  };

  const handleUnlock = () => setUnlocked(true);
  const handleLock = () => setUnlocked(false);

  if (showSplash) {
    return <Splash onDone={() => setShowSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="login-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <div className="titlebar">
        <span className="titlebar-title">VAULT</span>
        <div className="titlebar-buttons">
          <button className="titlebar-btn btn-minimize" onClick={() => ipcRenderer.invoke('window:minimize')} />
          <button className="titlebar-btn btn-maximize" onClick={() => ipcRenderer.invoke('window:maximize')} />
          <button className="titlebar-btn btn-close" onClick={() => ipcRenderer.invoke('window:close')} />
        </div>
      </div>
      {unlocked ? (
        <Dashboard onLock={handleLock} settings={settings} onSettingsSave={handleSettingsSave} />
      ) : (
        <Login onUnlock={handleUnlock} />
      )}
    </>
  );
}

export default App;
