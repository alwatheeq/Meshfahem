// Content script: handles page-level interactions and notifications

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    const pageTitle = document.title;
    const pageUrl = window.location.href;

    sendResponse({
      selectedText,
      pageTitle,
      pageUrl,
    });
    return;
  }

  if (message.type === 'MESHFAHEM_NOTIFICATION') {
    showToast(message.title, message.message);
    return;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    // Extract main page content for full-page capture
    const content = extractPageContent();
    sendResponse({
      content,
      pageTitle: document.title,
      pageUrl: window.location.href,
    });
    return;
  }
});

function extractPageContent(): string {
  // Try to get article/main content first
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '.article-body'];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent && el.textContent.trim().length > 100) {
      return cleanText(el.textContent);
    }
  }

  // Fallback: get body text, filtering out nav/header/footer
  const body = document.body.cloneNode(true) as HTMLElement;
  const removeTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript'];
  removeTags.forEach((tag) => {
    body.querySelectorAll(tag).forEach((el) => el.remove());
  });

  return cleanText(body.textContent || '');
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .substring(0, 50000); // Limit to 50k chars
}

// In-page toast notification
function showToast(title: string, message: string) {
  // Remove existing toast if any
  const existing = document.getElementById('meshfahem-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'meshfahem-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: linear-gradient(135deg, #065f46, #047857);
    color: white;
    padding: 14px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    max-width: 360px;
    animation: meshfahem-slide-in 0.3s ease-out;
    cursor: pointer;
    transition: opacity 0.2s;
  `;

  toast.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 4px; font-size: 14px;">${escapeHtml(title)}</div>
    <div style="font-size: 13px; opacity: 0.9;">${escapeHtml(message)}</div>
  `;

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes meshfahem-slide-in {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  toast.addEventListener('click', () => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  });

  document.body.appendChild(toast);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }
  }, 4000);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
