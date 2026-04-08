import { getSupabase, getSession } from '../utils/supabaseClient';

// ─── Context Menu Setup ─────────────────────────────────────────

const MENU_PARENT = 'meshfahem-parent';
const MENU_SAVE = 'meshfahem-save';
const MENU_SUMMARIZE = 'meshfahem-summarize';
const MENU_FLASHCARDS = 'meshfahem-flashcards';
const MENU_CAPTURE_PAGE = 'meshfahem-capture-page';

chrome.runtime.onInstalled.addListener(() => {
  // Parent menu
  chrome.contextMenus.create({
    id: MENU_PARENT,
    title: 'Meshfahem',
    contexts: ['selection', 'page'],
  });

  // Selection actions (only visible when text is selected)
  chrome.contextMenus.create({
    id: MENU_SAVE,
    parentId: MENU_PARENT,
    title: 'Save selection to Library',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_SUMMARIZE,
    parentId: MENU_PARENT,
    title: 'Summarize selection',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_FLASHCARDS,
    parentId: MENU_PARENT,
    title: 'Create Flashcards from selection',
    contexts: ['selection'],
  });

  // Full-page capture (always visible)
  chrome.contextMenus.create({
    id: MENU_CAPTURE_PAGE,
    parentId: MENU_PARENT,
    title: 'Capture entire page to Library',
    contexts: ['page', 'selection'],
  });
});

// ─── Context Menu Handler ───────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const session = await getSession();
  if (!session) {
    notifyTab(tab?.id, 'Sign in required', 'Open the Meshfahem extension popup to sign in.', 'info');
    return;
  }

  const pageTitle = tab?.title || 'Untitled';
  const pageUrl = tab?.url || '';

  try {
    if (info.menuItemId === MENU_CAPTURE_PAGE) {
      // Capture full page content via content script
      if (!tab?.id) return;

      const pageData = await new Promise<{ content: string; pageTitle: string; pageUrl: string }>((resolve) => {
        chrome.tabs.sendMessage(tab.id!, { type: 'GET_PAGE_CONTENT' }, (res) => {
          resolve(res || { content: '', pageTitle: pageTitle, pageUrl: pageUrl });
        });
      });

      if (!pageData.content) {
        notifyTab(tab.id, 'Capture failed', 'Could not extract page content.', 'error');
        return;
      }

      await saveToLibrary(session.user.id, pageData.content, pageData.pageTitle || pageTitle, pageData.pageUrl || pageUrl);
      notifyTab(tab.id, 'Page captured', 'Full page saved to your Meshfahem library', 'success');
      return;
    }

    // Selection-based actions
    const selectedText = info.selectionText;
    if (!selectedText) return;

    switch (info.menuItemId) {
      case MENU_SAVE:
        await saveToLibrary(session.user.id, selectedText, pageTitle, pageUrl);
        notifyTab(tab?.id, 'Saved to Library', `${selectedText.length.toLocaleString()} characters saved`, 'success');
        break;

      case MENU_SUMMARIZE:
        await sendForProcessing(session.user.id, selectedText, pageTitle, pageUrl, 'summarize');
        notifyTab(tab?.id, 'Summarizing...', 'Your text is being summarized by AI', 'info');
        break;

      case MENU_FLASHCARDS:
        await sendForProcessing(session.user.id, selectedText, pageTitle, pageUrl, 'flashcards');
        notifyTab(tab?.id, 'Creating flashcards...', 'AI is generating flashcards from your text', 'info');
        break;
    }
  } catch (error) {
    console.error('Meshfahem extension error:', error);
    notifyTab(tab?.id, 'Something went wrong', 'Please try again or check your connection.', 'error');
  }
});

// ─── Supabase Operations ────────────────────────────────────────

async function saveToLibrary(userId: string, text: string, title: string, sourceUrl: string) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Not configured');

  const { error } = await supabase.from('user_library_items').insert({
    user_id: userId,
    title: title.substring(0, 200),
    content_type: 'text',
    original_text: text,
    source_url: sourceUrl,
    source: 'browser_extension',
    status: 'ready',
  });

  if (error) throw error;
}

async function sendForProcessing(
  userId: string,
  text: string,
  title: string,
  sourceUrl: string,
  action: 'summarize' | 'flashcards'
) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Not configured');

  const { data: item, error: insertError } = await supabase
    .from('user_library_items')
    .insert({
      user_id: userId,
      title: title.substring(0, 200),
      content_type: 'text',
      original_text: text,
      source_url: sourceUrl,
      source: 'browser_extension',
      status: 'processing',
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  const { error: fnError } = await supabase.functions.invoke('generate-summary-and-flashcards', {
    body: {
      text,
      title,
      library_item_id: item.id,
      action,
      source: 'browser_extension',
    },
  });

  if (fnError) throw fnError;
}

// ─── Notification Helper ────────────────────────────────────────

function notifyTab(tabId: number | undefined, title: string, message: string, variant: 'success' | 'error' | 'info' = 'success') {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, {
    type: 'MESHFAHEM_NOTIFICATION',
    title,
    message,
    variant,
  });
}

// ─── Message Handler (popup ↔ background) ───────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SESSION') {
    getSession().then((session) => sendResponse({ session }));
    return true;
  }

  if (message.type === 'SAVE_SELECTION') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ selectedText: '', pageTitle: '', pageUrl: '' });
      }
    });
    return true;
  }
});
