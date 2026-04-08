import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { signIn, signOut, getSession, saveConfig, getSupabaseConfig } from '../utils/supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface RecentItem {
  id: string;
  title: string;
  content_type: string;
  created_at: string;
}

interface SelectionData {
  selectedText: string;
  pageTitle: string;
  pageUrl: string;
}

const Popup: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const config = await getSupabaseConfig();
      if (!config) {
        setConfigured(false);
        setLoading(false);
        return;
      }

      const currentSession = await getSession();
      setSession(currentSession);

      if (currentSession) {
        await loadRecentItems();
        await loadSelection();
      }
    } catch (err) {
      console.error('Init error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSelection() {
    try {
      const response = await new Promise<SelectionData>((resolve) => {
        chrome.runtime.sendMessage({ type: 'SAVE_SELECTION' }, (res) => {
          resolve(res || { selectedText: '', pageTitle: '', pageUrl: '' });
        });
      });
      if (response.selectedText) {
        setSelection(response);
      }
    } catch {
      // Content script may not be injected on all pages
    }
  }

  async function loadRecentItems() {
    try {
      const { getSupabase } = await import('../utils/supabaseClient');
      const supabase = await getSupabase();
      if (!supabase) return;

      const { data } = await supabase
        .from('user_library_items')
        .select('id, title, content_type, created_at')
        .eq('source', 'browser_extension')
        .order('created_at', { ascending: false })
        .limit(5);

      if (data) setRecentItems(data);
    } catch {
      // Silently fail
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setError('');

    try {
      const { session: newSession } = await signIn(email, password);
      setSession(newSession);
      await loadRecentItems();
      await loadSelection();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await signOut();
    setSession(null);
    setRecentItems([]);
  }

  async function handleAction(action: 'save' | 'summarize' | 'flashcards') {
    if (!selection?.selectedText || !session) return;
    setActionLoading(action);

    try {
      const { getSupabase } = await import('../utils/supabaseClient');
      const supabase = await getSupabase();
      if (!supabase) throw new Error('Not configured');

      if (action === 'save') {
        await supabase.from('user_library_items').insert({
          user_id: session.user.id,
          title: selection.pageTitle.substring(0, 200),
          content_type: 'text',
          original_text: selection.selectedText,
          source_url: selection.pageUrl,
          source: 'browser_extension',
          status: 'ready',
        });
      } else {
        const { data: item } = await supabase
          .from('user_library_items')
          .insert({
            user_id: session.user.id,
            title: selection.pageTitle.substring(0, 200),
            content_type: 'text',
            original_text: selection.selectedText,
            source_url: selection.pageUrl,
            source: 'browser_extension',
            status: 'processing',
          })
          .select('id')
          .single();

        if (item) {
          await supabase.functions.invoke('generate-summary-and-flashcards', {
            body: {
              text: selection.selectedText,
              title: selection.pageTitle,
              library_item_id: item.id,
              action,
              source: 'browser_extension',
            },
          });
        }
      }

      await loadRecentItems();
      setSelection(null);
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!configUrl || !configKey) return;

    await saveConfig(configUrl.trim(), configKey.trim());
    setConfigured(true);
    await init();
  }

  function formatTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  if (loading) {
    return (
      <div className="popup-container">
        <div className="header">
          <h1>Meshfahem</h1>
          <p>StudyBuddy</p>
        </div>
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="popup-container">
        <div className="header">
          <h1>Meshfahem</h1>
          <p>Configure your connection</p>
        </div>
        <form className="login-form" onSubmit={handleSaveConfig}>
          <h2>Setup</h2>
          <div className="form-group">
            <label>Supabase URL</label>
            <input
              type="url"
              value={configUrl}
              onChange={(e) => setConfigUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              required
            />
          </div>
          <div className="form-group">
            <label>Anon Key</label>
            <input
              type="password"
              value={configKey}
              onChange={(e) => setConfigKey(e.target.value)}
              placeholder="eyJ..."
              required
            />
          </div>
          <button type="submit" className="login-btn">
            Save Configuration
          </button>
        </form>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="popup-container">
        <div className="header">
          <h1>Meshfahem</h1>
          <p>Sign in to your account</p>
        </div>
        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={loginLoading}>
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
          {error && <div className="error-msg">{error}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="header">
        <h1>Meshfahem</h1>
        <p>StudyBuddy</p>
        <div className="user-badge">
          <span className="dot" />
          {session.user.email}
        </div>
      </div>

      <div className="content">
        {selection && (
          <div className="selection-preview">
            <strong>Selected text:</strong> {selection.selectedText.substring(0, 200)}
            {selection.selectedText.length > 200 ? '...' : ''}
          </div>
        )}

        <div className="actions" style={{ marginTop: selection ? '12px' : '0' }}>
          <button
            className="action-btn"
            onClick={() => handleAction('save')}
            disabled={!selection || actionLoading !== null}
          >
            <div className="icon">📚</div>
            <div>
              <div className="label">Save to Library</div>
              <div className="desc">Store selected text in your library</div>
            </div>
          </button>

          <button
            className="action-btn"
            onClick={() => handleAction('summarize')}
            disabled={!selection || actionLoading !== null}
          >
            <div className="icon">📝</div>
            <div>
              <div className="label">Summarize</div>
              <div className="desc">Generate an AI summary</div>
            </div>
          </button>

          <button
            className="action-btn"
            onClick={() => handleAction('flashcards')}
            disabled={!selection || actionLoading !== null}
          >
            <div className="icon">🃏</div>
            <div>
              <div className="label">Create Flashcards</div>
              <div className="desc">Generate flashcards for studying</div>
            </div>
          </button>
        </div>

        {!selection && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: '13px' }}>
            Select text on any page to get started
          </div>
        )}

        {recentItems.length > 0 && (
          <div className="recent-section">
            <h3>Recent Saves</h3>
            {recentItems.map((item) => (
              <div key={item.id} className="recent-item">
                <span className="type-badge">{item.content_type}</span>
                <span className="title">{item.title}</span>
                <span className="time">{formatTime(item.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="status-bar">
          <span>Connected to Meshfahem</span>
          <span>|</span>
          <button className="logout-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
