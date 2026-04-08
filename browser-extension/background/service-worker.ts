import { getSupabase, getSession } from '../utils/supabaseClient';

// Context menu IDs
const MENU_SAVE_LIBRARY = 'meshfahem-save-library';
const MENU_SUMMARIZE = 'meshfahem-summarize';
const MENU_FLASHCARDS = 'meshfahem-flashcards';

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SAVE_LIBRARY,
    title: 'Save to Meshfahem Library',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_SUMMARIZE,
    title: 'Summarize with Meshfahem',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: MENU_FLASHCARDS,
    title: 'Create Flashcards with Meshfahem',
    contexts: ['selection'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText;
  if (!selectedText) return;

  const session = await getSession();
  if (!session) {
    // Notify user to log in
    chrome.action.openPopup?.();
    return;
  }

  const pageTitle = tab?.title || 'Untitled';
  const pageUrl = tab?.url || '';

  try {
    switch (info.menuItemId) {
      case MENU_SAVE_LIBRARY:
        await saveToLibrary(session.user.id, selectedText, pageTitle, pageUrl);
        showNotification('Saved to Library', 'Text saved to your Meshfahem library');
        break;

      case MENU_SUMMARIZE:
        await sendForProcessing(session.user.id, selectedText, pageTitle, pageUrl, 'summarize');
        showNotification('Sent for Summarization', 'Your text is being summarized');
        break;

      case MENU_FLASHCARDS:
        await sendForProcessing(session.user.id, selectedText, pageTitle, pageUrl, 'flashcards');
        showNotification('Creating Flashcards', 'Flashcards are being generated');
        break;
    }
  } catch (error) {
    console.error('Meshfahem extension error:', error);
    showNotification('Error', 'Failed to process. Please try again.');
  }
});

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

  // Save to library first
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

  // Call edge function for processing
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

function showNotification(title: string, message: string) {
  // Send to content script for in-page toast
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'MESHFAHEM_NOTIFICATION',
        title,
        message,
      });
    }
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SESSION') {
    getSession().then((session) => {
      sendResponse({ session });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SAVE_SELECTION') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' }, (response) => {
          sendResponse(response);
        });
      }
    });
    return true;
  }
});
