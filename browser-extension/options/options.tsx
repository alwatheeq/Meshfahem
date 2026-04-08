import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { getSupabaseConfig, saveConfig, getSession, signOut } from '../utils/supabaseClient';

const Options: React.FC = () => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    const config = await getSupabaseConfig();
    if (config) {
      setUrl(config.url);
      setKey(config.anonKey);

      const session = await getSession();
      if (session) {
        setIsConnected(true);
        setUserEmail(session.user.email || '');
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await saveConfig(url.trim(), key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await loadConfig();
  }

  async function handleSignOut() {
    await signOut();
    setIsConnected(false);
    setUserEmail('');
  }

  async function handleReset() {
    await chrome.storage.local.clear();
    setUrl('');
    setKey('');
    setIsConnected(false);
    setUserEmail('');
  }

  return (
    <div className="options-container">
      <div className="options-header">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
        <div>
          <h1>Meshfahem Settings</h1>
          <p>Configure your StudyBuddy browser extension</p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="card">
        <h2>Connection Status</h2>
        <p className="card-desc">Your current connection to Meshfahem</p>

        <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
          <span className="dot" />
          {isConnected ? `Connected as ${userEmail}` : 'Not connected'}
        </div>

        {isConnected && (
          <div className="btn-row">
            <button className="btn-danger" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Supabase Config */}
      <div className="card">
        <h2>Supabase Configuration</h2>
        <p className="card-desc">Connect the extension to your Meshfahem backend</p>

        <form onSubmit={handleSave}>
          <div className="form-row">
            <label>Supabase Project URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              required
            />
          </div>
          <div className="form-row">
            <label>Anon Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              required
            />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn-primary">
              {saved ? 'Saved!' : 'Save Configuration'}
            </button>
            <button type="button" className="btn-danger" onClick={handleReset}>
              Reset All
            </button>
          </div>
        </form>

        <p className="info-text">
          Find these values in your Supabase dashboard under Project Settings &gt; API.
          The extension stores credentials securely in Chrome's local storage.
        </p>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Options />);
