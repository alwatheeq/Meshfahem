// Meshfahem Content Script
// Handles page-level interactions, selection capture, and in-page notifications

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    sendResponse({
      selectedText,
      pageTitle: document.title,
      pageUrl: window.location.href,
    });
    return;
  }

  if (message.type === 'MESHFAHEM_NOTIFICATION') {
    showToast(message.title, message.message, message.variant || 'success');
    return;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    const content = extractPageContent();
    sendResponse({
      content,
      pageTitle: document.title,
      pageUrl: window.location.href,
    });
    return;
  }
});

// ─── Page Content Extraction ────────────────────────────────────

function extractPageContent(): string {
  // Try semantic selectors first for cleaner content
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-body',
    '.article-content',
    '.story-body',
    '#content',
    '.content',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent && el.textContent.trim().length > 100) {
      return cleanText(el.textContent);
    }
  }

  // Fallback: get body text without nav/header/footer/scripts
  const body = document.body.cloneNode(true) as HTMLElement;
  const removeTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'svg', 'iframe'];
  removeTags.forEach((tag) => {
    body.querySelectorAll(tag).forEach((el) => el.remove());
  });

  // Also remove common non-content classes
  const removeSelectors = ['.sidebar', '.menu', '.nav', '.footer', '.header', '.advertisement', '.ad', '.cookie-banner'];
  removeSelectors.forEach((sel) => {
    body.querySelectorAll(sel).forEach((el) => el.remove());
  });

  return cleanText(body.textContent || '');
}

function cleanText(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
    .substring(0, 50000); // 50k char limit
}

// ─── In-Page Toast Notification ─────────────────────────────────

type ToastVariant = 'success' | 'error' | 'info';

function showToast(title: string, message: string, variant: ToastVariant = 'success') {
  // Remove existing toast
  const existing = document.getElementById('meshfahem-toast');
  if (existing) existing.remove();

  // Detect if page is in dark mode
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches ||
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark');

  // Color schemes matching webapp's sky-blue theme
  const colors: Record<ToastVariant, { bg: string; border: string; icon: string; title: string; text: string }> = {
    success: {
      bg: isDark ? 'rgba(6, 78, 59, 0.95)' : 'rgba(240, 253, 244, 0.98)',
      border: isDark ? '#065f46' : '#a7f3d0',
      icon: '#22c55e',
      title: isDark ? '#ecfdf5' : '#166534',
      text: isDark ? '#a7f3d0' : '#15803d',
    },
    error: {
      bg: isDark ? 'rgba(69, 10, 10, 0.95)' : 'rgba(254, 242, 242, 0.98)',
      border: isDark ? '#7f1d1d' : '#fecaca',
      icon: '#ef4444',
      title: isDark ? '#fef2f2' : '#991b1b',
      text: isDark ? '#fca5a5' : '#b91c1c',
    },
    info: {
      bg: isDark ? 'rgba(12, 74, 110, 0.95)' : 'rgba(224, 242, 254, 0.98)',
      border: isDark ? '#0369a1' : '#bae6fd',
      icon: '#0ea5e9',
      title: isDark ? '#e0f2fe' : '#075985',
      text: isDark ? '#7dd3fc' : '#0284c7',
    },
  };

  const c = colors[variant];

  // SVG icons for each variant
  const iconSvgs: Record<ToastVariant, string> = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.id = 'meshfahem-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: ${c.bg};
    border: 1px solid ${c.border};
    padding: 14px 18px;
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, ${isDark ? '0.4' : '0.12'}), 0 2px 8px rgba(0, 0, 0, ${isDark ? '0.2' : '0.06'});
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 340px;
    min-width: 260px;
    animation: meshfahem-toast-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    cursor: pointer;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: flex-start;
    gap: 12px;
  `;

  toast.innerHTML = `
    <div style="flex-shrink: 0; margin-top: 1px;">${iconSvgs[variant]}</div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 600; font-size: 13px; color: ${c.title}; margin-bottom: 2px;">${escapeHtml(title)}</div>
      <div style="font-size: 12px; color: ${c.text}; line-height: 1.4;">${escapeHtml(message)}</div>
    </div>
    <div style="flex-shrink: 0; cursor: pointer; opacity: 0.5; margin-top: -2px; margin-right: -4px;" onclick="this.closest('#meshfahem-toast').remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c.title}" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
  `;

  // Inject animation keyframes
  if (!document.getElementById('meshfahem-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'meshfahem-toast-styles';
    style.textContent = `
      @keyframes meshfahem-toast-in {
        from { transform: translateY(16px) scale(0.96); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
      @keyframes meshfahem-toast-out {
        from { transform: translateY(0) scale(1); opacity: 1; }
        to { transform: translateY(8px) scale(0.96); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  toast.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('svg')) return; // close button handled inline
    dismissToast(toast);
  });

  document.body.appendChild(toast);

  // Auto-dismiss after 4s
  setTimeout(() => {
    if (toast.parentElement) dismissToast(toast);
  }, 4000);
}

function dismissToast(toast: HTMLElement) {
  toast.style.animation = 'meshfahem-toast-out 0.2s ease forwards';
  setTimeout(() => toast.remove(), 200);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
