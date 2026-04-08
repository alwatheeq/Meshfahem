import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { signIn, signOut, getSession, saveConfig, getSupabaseConfig } from '../utils/supabaseClient';
import type { Session } from '@supabase/supabase-js';

// ─── Inline SVG Icons (no dependency needed) ─────────────────────
const Icons = {
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
  fileText: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M12 4v16" />
      <path d="M2 12h20" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  cursor: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3l14 9-6 1-4 6z" />
    </svg>
  ),
  meshLogo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
};

// ─── Interfaces ──────────────────────────────────────────────────
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

type ActionType = 'save' | 'summarize' | 'flashcards' | 'capture';

// ─── Main Popup Component ────────────────────────────────────────
const Popup: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [selection, setSelection] = useState<SelectionData | null>(null);
  const [actionLoading, setActionLoading] = useState<ActionType | null>(null);
  const [actionSuccess, setActionSuccess] = useState<ActionType | null>(null);
  const [configured, setConfigured] = useState(true);
  const [configUrl, setConfigUrl] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  // Load dark mode preference
  useEffect(() => {
    chrome.storage.local.get('meshfahem_dark_mode', (result) => {
      const isDark = result.meshfahem_dark_mode ?? false;
      setDarkMode(isDark);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    });
  }, []);

  const toggleDarkMode = useCallback(() => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.setAttribute('data-theme', newMode ? 'dark' : 'light');
    chrome.storage.local.set({ meshfahem_dark_mode: newMode });
  }, [darkMode]);

  useEffect(() => { init(); }, []);

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
        await Promise.all([loadRecentItems(), loadSelection()]);
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
      if (response.selectedText) setSelection(response);
    } catch {
      // Content script may not be injected
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
      await Promise.all([loadRecentItems(), loadSelection()]);
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

  async function handleAction(action: ActionType) {
    if (!session) return;
    if (action !== 'capture' && !selection?.selectedText) return;

    setActionLoading(action);
    setActionSuccess(null);
    setError('');

    try {
      const { getSupabase } = await import('../utils/supabaseClient');
      const supabase = await getSupabase();
      if (!supabase) throw new Error('Not configured');

      let text = selection?.selectedText || '';
      let title = selection?.pageTitle || '';
      let sourceUrl = selection?.pageUrl || '';

      // Full-page capture
      if (action === 'capture') {
        const pageData = await new Promise<{ content: string; pageTitle: string; pageUrl: string }>((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_CONTENT' }, (res) => {
                resolve(res || { content: '', pageTitle: '', pageUrl: '' });
              });
            } else {
              resolve({ content: '', pageTitle: '', pageUrl: '' });
            }
          });
        });
        text = pageData.content;
        title = pageData.pageTitle;
        sourceUrl = pageData.pageUrl;
        if (!text) throw new Error('Could not capture page content');
      }

      if (action === 'save' || action === 'capture') {
        await supabase.from('user_library_items').insert({
          user_id: session.user.id,
          title: title.substring(0, 200),
          content_type: 'text',
          original_text: text,
          source_url: sourceUrl,
          source: 'browser_extension',
          status: 'ready',
        });
      } else {
        const { data: item } = await supabase
          .from('user_library_items')
          .insert({
            user_id: session.user.id,
            title: title.substring(0, 200),
            content_type: 'text',
            original_text: text,
            source_url: sourceUrl,
            source: 'browser_extension',
            status: 'processing',
          })
          .select('id')
          .single();

        if (item) {
          await supabase.functions.invoke('generate-summary-and-flashcards', {
            body: {
              text,
              title,
              library_item_id: item.id,
              action,
              source: 'browser_extension',
            },
          });
        }
      }

      setActionSuccess(action);
      await loadRecentItems();

      // Clear success indicator after 2s
      setTimeout(() => setActionSuccess(null), 2000);
      if (action !== 'capture') setSelection(null);
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
    return `${Math.floor(hours / 24)}d`;
  }

  function getActionBtnClass(action: ActionType): string {
    const classes = ['action-btn'];
    if (actionLoading === action) classes.push('loading');
    if (actionSuccess === action) classes.push('success');
    return classes.join(' ');
  }

  // ─── Loading state ─────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="header">
          <div className="header-top">
            <div className="header-brand">
              <div className="header-logo">{Icons.meshLogo}</div>
              <div><h1>Meshfahem</h1><p>StudyBuddy</p></div>
            </div>
          </div>
        </div>
        <div className="loading">
          <div className="spinner" />
          <span className="loading-text">Connecting...</span>
        </div>
      </div>
    );
  }

  // ─── Config setup ──────────────────────────────
  if (!configured) {
    return (
      <div>
        <div className="header">
          <div className="header-top">
            <div className="header-brand">
              <div className="header-logo">{Icons.meshLogo}</div>
              <div><h1>Meshfahem</h1><p>First-time setup</p></div>
            </div>
            <button className="theme-toggle" onClick={toggleDarkMode}>
              {darkMode ? Icons.sun : Icons.moon}
            </button>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSaveConfig}>
          <h2>Connect to Meshfahem</h2>
          <p className="subtitle">Enter your Supabase credentials to get started</p>
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
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              required
            />
          </div>
          <button type="submit" className="login-btn">
            Save & Connect
          </button>
        </form>
      </div>
    );
  }

  // ─── Login ─────────────────────────────────────
  if (!session) {
    return (
      <div>
        <div className="header">
          <div className="header-top">
            <div className="header-brand">
              <div className="header-logo">{Icons.meshLogo}</div>
              <div><h1>Meshfahem</h1><p>Sign in to continue</p></div>
            </div>
            <button className="theme-toggle" onClick={toggleDarkMode}>
              {darkMode ? Icons.sun : Icons.moon}
            </button>
          </div>
        </div>
        <form className="login-form" onSubmit={handleLogin}>
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in with your Meshfahem account</p>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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

  // ─── Main authenticated view ───────────────────
  return (
    <div>
      <div className="header">
        <div className="header-top">
          <div className="header-brand">
            <div className="header-logo">{Icons.meshLogo}</div>
            <div><h1>Meshfahem</h1><p>StudyBuddy</p></div>
          </div>
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {darkMode ? Icons.sun : Icons.moon}
          </button>
        </div>
        <div className="user-badge">
          <span className="dot" />
          {session.user.email}
        </div>
      </div>

      <div className="content">
        {/* Selection preview */}
        {selection && (
          <div className="selection-preview">
            <span className="selection-char-count">{selection.selectedText.length.toLocaleString()} chars</span>
            <strong>Selected: </strong>
            {selection.selectedText.substring(0, 180)}
            {selection.selectedText.length > 180 ? '...' : ''}
          </div>
        )}

        {/* Action buttons */}
        <div className="actions">
          <button
            className={getActionBtnClass('save')}
            onClick={() => handleAction('save')}
            disabled={!selection || actionLoading !== null}
          >
            <div className="icon">
              {actionSuccess === 'save' ? Icons.check : Icons.book}
            </div>
            <div className="action-text">
              <div className="label">{actionSuccess === 'save' ? 'Saved!' : 'Save to Library'}</div>
              <div className="desc">Store selected text for later study</div>
            </div>
            <span className="action-arrow">{Icons.chevronRight}</span>
          </button>

          <button
            className={getActionBtnClass('summarize')}
            onClick={() => handleAction('summarize')}
            disabled={!selection || actionLoading !== null}
          >
            <div className="icon">
              {actionSuccess === 'summarize' ? Icons.check : Icons.fileText}
            </div>
            <div className="action-text">
              <div className="label">{actionSuccess === 'summarize' ? 'Sent!' : 'Summarize'}</div>
              <div className="desc">Generate an AI-powered summary</div>
            </div>
            <span className="action-arrow">{Icons.chevronRight}</span>
          </button>

          <button
            className={getActionBtnClass('flashcards')}
            onClick={() => handleAction('flashcards')}
            disabled={!selection || actionLoading !== null}
          >
            <div className="icon">
              {actionSuccess === 'flashcards' ? Icons.check : Icons.cards}
            </div>
            <div className="action-text">
              <div className="label">{actionSuccess === 'flashcards' ? 'Creating!' : 'Create Flashcards'}</div>
              <div className="desc">Generate flashcards for spaced repetition</div>
            </div>
            <span className="action-arrow">{Icons.chevronRight}</span>
          </button>
        </div>

        {/* Empty selection state */}
        {!selection && (
          <div className="empty-state">
            <div className="empty-icon">{Icons.cursor}</div>
            <p>Select text on any page to get started</p>
            <p className="hint">Highlight text, then open this popup</p>
          </div>
        )}

        {/* Capture full page */}
        <button
          className="capture-btn"
          onClick={() => handleAction('capture')}
          disabled={actionLoading !== null}
        >
          {Icons.globe}
          {actionLoading === 'capture'
            ? 'Capturing...'
            : actionSuccess === 'capture'
              ? 'Page saved!'
              : 'Capture entire page to Library'}
        </button>

        {error && <div className="error-msg">{error}</div>}

        {/* Recent saves */}
        {recentItems.length > 0 && (
          <div className="recent-section">
            <h3>Recent Saves</h3>
            {recentItems.map((item) => (
              <div key={item.id} className="recent-item">
                <span className="type-badge">{item.content_type}</span>
                <span className="title">{item.title || 'Untitled'}</span>
                <span className="time">{formatTime(item.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer status bar */}
        <div className="status-bar">
          <span className="status-dot" />
          <span>Connected</span>
          <span>·</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </div>
    </div>
  );
};

// ─── Mount ───────────────────────────────────────────────────────
const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
