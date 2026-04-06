/**
 * Book Mode Helper Functions
 * 
 * Utilities for pagination, layout management, and reading progress
 */

import { supabase } from '../lib/supabase';
import { ErrorLogger } from './errorLogger';
import { handleSupabaseError } from './errorHandler';

// =====================================================================
// Types
// =====================================================================

export interface PageBreak {
  index: number;
  start: number; // Character position
  end: number; // Character position
  content: string;
}

export interface PageBreakConfig {
  pages: PageBreak[];
  total_pages: number;
  page_size: number; // Characters per page (approximate)
  calculated_at: string;
}

export interface ReadingProgress {
  last_page: number;
  last_position: number; // Scroll position (0-1)
  pages_read: number[]; // Array of page indices that have been read
  last_updated: string;
}

export interface WidgetConfig {
  id: string;
  type: 'book' | 'flashcards' | 'notes' | 'toc' | 'search';
  position: { x: number; y: number };
  size: { width: number; height: number };
  isCollapsed: boolean;
  isMinimized: boolean;
  zIndex: number;
}

export interface WidgetLayout {
  widgets: WidgetConfig[];
  version: number;
  created_at: string;
  updated_at: string;
}

// =====================================================================
// Pagination Functions
// =====================================================================

/**
 * Calculate page breaks for a summary text
 * Uses smart pagination: respects paragraphs and section headers
 * 
 * @param summaryText - The full summary text to paginate
 * @param pageSize - Approximate characters per page (default: 2000)
 * @returns PageBreakConfig with calculated pages
 */
export const calculatePageBreaks = (
  summaryText: string,
  pageSize: number = 2000
): PageBreakConfig => {
  try {
    if (!summaryText || summaryText.trim().length === 0) {
      return {
        pages: [],
        total_pages: 0,
        page_size: pageSize,
        calculated_at: new Date().toISOString()
      };
    }

    const pages: PageBreak[] = [];
    const lines = summaryText.split('\n');
    let currentPageStart = 0;
    let currentPageContent: string[] = [];
    let currentPageCharCount = 0;
    let pageIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLength = line.length + 1; // +1 for newline character

      // Check if line is a section header (starts and ends with ===)
      const isSectionHeader = /^=== .+ ===$/.test(line.trim());

      // If adding this line would exceed page size, start a new page
      // But always keep section headers with their content
      if (currentPageCharCount + lineLength > pageSize && currentPageContent.length > 0 && !isSectionHeader) {
        // Save current page
        const pageContent = currentPageContent.join('\n');
        pages.push({
          index: pageIndex,
          start: currentPageStart,
          end: currentPageStart + pageContent.length,
          content: pageContent
        });

        // Start new page
        pageIndex++;
        currentPageStart = currentPageStart + pageContent.length;
        currentPageContent = [];
        currentPageCharCount = 0;
      }

      // Add line to current page
      currentPageContent.push(line);
      currentPageCharCount += lineLength;

      // If it's a section header and we have content, consider starting new page after it
      // (This keeps section headers at the top of pages when possible)
      if (isSectionHeader && currentPageCharCount > pageSize * 0.7 && currentPageContent.length > 1) {
        // Don't break here, but note that we're getting close to page limit
      }
    }

    // Add the last page if there's content
    if (currentPageContent.length > 0) {
      const pageContent = currentPageContent.join('\n');
      pages.push({
        index: pageIndex,
        start: currentPageStart,
        end: currentPageStart + pageContent.length,
        content: pageContent
      });
    }

    return {
      pages,
      total_pages: pages.length,
      page_size: pageSize,
      calculated_at: new Date().toISOString()
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, {
      component: 'bookModeHelpers',
      action: 'calculatePageBreaks',
      metadata: { textLength: summaryText?.length || 0, pageSize }
    });
    
    // Return minimal config on error
    return {
      pages: [{
        index: 0,
        start: 0,
        end: summaryText?.length || 0,
        content: summaryText || ''
      }],
      total_pages: 1,
      page_size: pageSize,
      calculated_at: new Date().toISOString()
    };
  }
};

/**
 * Paginate summary text using cached config or calculating on the fly
 * 
 * @param summaryText - The summary text to paginate
 * @param cachedConfig - Optional cached page break config
 * @param pageSize - Characters per page
 * @returns PageBreakConfig
 */
export const paginateSummary = (
  summaryText: string,
  cachedConfig?: PageBreakConfig | null,
  pageSize: number = 2000
): PageBreakConfig => {
  // If we have a valid cached config and text hasn't changed, use it
  if (cachedConfig && cachedConfig.pages.length > 0) {
    // Verify the config still matches (text length check)
    const totalTextLength = summaryText.length;
    const configLength = cachedConfig.pages[cachedConfig.pages.length - 1]?.end || 0;
    
    // If lengths match closely (within 100 chars), use cached config
    if (Math.abs(totalTextLength - configLength) < 100) {
      return cachedConfig;
    }
  }

  // Calculate new page breaks
  return calculatePageBreaks(summaryText, pageSize);
};

// =====================================================================
// Layout Management Functions
// =====================================================================

/**
 * Save widget layout to database
 * 
 * @param userId - User ID
 * @param summaryId - Summary ID (can be null for new summaries)
 * @param layout - Widget layout configuration
 * @returns Promise<boolean> - Success status
 */
export const saveWidgetLayout = async (
  userId: string,
  summaryId: string | null,
  layout: WidgetLayout
): Promise<boolean> => {
  try {
    if (!userId) {
      ErrorLogger.warn('Cannot save layout: no user ID', {
        component: 'bookModeHelpers',
        action: 'saveWidgetLayout',
        metadata: { summaryId }
      });
      return false;
    }

    const layoutData = {
      user_id: userId,
      summary_id: summaryId,
      layout_json: layout
    };

    const { error } = await supabase
      .from('book_widget_layouts')
      .upsert(layoutData, {
        onConflict: 'user_id,summary_id',
        ignoreDuplicates: false
      });

    if (error) {
      handleSupabaseError(error, {
        component: 'bookModeHelpers',
        action: 'saveWidgetLayout',
        userId,
        metadata: { summaryId, widgetCount: layout.widgets.length }
      });
      ErrorLogger.error(error, {
        component: 'bookModeHelpers',
        action: 'saveWidgetLayout',
        userId,
        metadata: { summaryId, widgetCount: layout.widgets.length }
      });
      return false;
    }

    ErrorLogger.debug('Widget layout saved', {
      component: 'bookModeHelpers',
      action: 'saveWidgetLayout',
      userId,
      metadata: { summaryId, widgetCount: layout.widgets.length }
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, {
      component: 'bookModeHelpers',
      action: 'saveWidgetLayout',
      userId,
      metadata: { summaryId }
    });
    return false;
  }
};

/**
 * Load widget layout from database
 * 
 * @param userId - User ID
 * @param summaryId - Summary ID (can be null for new summaries)
 * @returns Promise<WidgetLayout | null> - Layout or null if not found
 */
export const loadWidgetLayout = async (
  userId: string,
  summaryId: string | null
): Promise<WidgetLayout | null> => {
  try {
    if (!userId) {
      return null;
    }

    // Build query conditionally
    let query = supabase
      .from('book_widget_layouts')
      .select('layout_json, created_at, updated_at')
      .eq('user_id', userId);

    if (summaryId) {
      query = query.eq('summary_id', summaryId);
    } else {
      query = query.is('summary_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      // Not found is not an error - return null
      if (error.code === 'PGRST116') {
        return null;
      }

      handleSupabaseError(error, {
        component: 'bookModeHelpers',
        action: 'loadWidgetLayout',
        userId,
        metadata: { summaryId }
      });
      ErrorLogger.error(error, {
        component: 'bookModeHelpers',
        action: 'loadWidgetLayout',
        userId,
        metadata: { summaryId }
      });
      return null;
    }

    if (!data || !data.layout_json) {
      return null;
    }

    // Ensure layout_json has the expected structure
    const layout = data.layout_json as WidgetLayout;
    
    return {
      ...layout,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString()
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, {
      component: 'bookModeHelpers',
      action: 'loadWidgetLayout',
      userId,
      metadata: { summaryId }
    });
    return null;
  }
};

/**
 * Get default widget layout for a new Book Mode session
 * 
 * @returns WidgetLayout - Default layout configuration
 */
export const getDefaultWidgetLayout = (): WidgetLayout => {
  return {
    widgets: [
      {
        id: 'book-1',
        type: 'book',
        position: { x: 100, y: 100 },
        size: { width: 800, height: 600 },
        isCollapsed: false,
        isMinimized: false,
        zIndex: 1
      },
      {
        id: 'flashcards-1',
        type: 'flashcards',
        position: { x: 950, y: 100 },
        size: { width: 400, height: 500 },
        isCollapsed: false,
        isMinimized: false,
        zIndex: 2
      }
    ],
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

// =====================================================================
// Reading Progress Functions
// =====================================================================

/**
 * Save reading progress to database
 * 
 * @param userId - User ID
 * @param summaryId - Summary ID
 * @param progress - Reading progress data
 * @returns Promise<boolean> - Success status
 */
export const saveReadingProgress = async (
  userId: string,
  summaryId: string,
  progress: ReadingProgress
): Promise<boolean> => {
  try {
    if (!userId || !summaryId) {
      ErrorLogger.warn('Cannot save reading progress: missing user or summary ID', {
        component: 'bookModeHelpers',
        action: 'saveReadingProgress',
        metadata: { userId: !!userId, summaryId: !!summaryId }
      });
      return false;
    }

    const progressData = {
      ...progress,
      last_updated: new Date().toISOString()
    };

    const { error } = await supabase
      .from('user_library_items')
      .update({ reading_progress: progressData })
      .eq('id', summaryId)
      .eq('user_id', userId);

    if (error) {
      handleSupabaseError(error, {
        component: 'bookModeHelpers',
        action: 'saveReadingProgress',
        userId,
        metadata: { summaryId, lastPage: progress.last_page }
      });
      ErrorLogger.error(error, {
        component: 'bookModeHelpers',
        action: 'saveReadingProgress',
        userId,
        metadata: { summaryId, lastPage: progress.last_page }
      });
      return false;
    }

    ErrorLogger.debug('Reading progress saved', {
      component: 'bookModeHelpers',
      action: 'saveReadingProgress',
      userId,
      metadata: { summaryId, lastPage: progress.last_page }
    });

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, {
      component: 'bookModeHelpers',
      action: 'saveReadingProgress',
      userId,
      metadata: { summaryId }
    });
    return false;
  }
};

/**
 * Load reading progress from database
 * 
 * @param userId - User ID
 * @param summaryId - Summary ID
 * @returns Promise<ReadingProgress | null> - Progress or null if not found
 */
export const loadReadingProgress = async (
  userId: string,
  summaryId: string
): Promise<ReadingProgress | null> => {
  try {
    if (!userId || !summaryId) {
      return null;
    }

    const { data, error } = await supabase
      .from('user_library_items')
      .select('reading_progress')
      .eq('id', summaryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }

      handleSupabaseError(error, {
        component: 'bookModeHelpers',
        action: 'loadReadingProgress',
        userId,
        metadata: { summaryId }
      });
      ErrorLogger.error(error, {
        component: 'bookModeHelpers',
        action: 'loadReadingProgress',
        userId,
        metadata: { summaryId }
      });
      return null;
    }

    if (!data || !data.reading_progress) {
      // Return default progress
      return {
        last_page: 0,
        last_position: 0,
        pages_read: [],
        last_updated: new Date().toISOString()
      };
    }

    return data.reading_progress as ReadingProgress;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, {
      component: 'bookModeHelpers',
      action: 'loadReadingProgress',
      userId,
      metadata: { summaryId }
    });
    return null;
  }
};

/**
 * Update page break config in database
 * 
 * @param userId - User ID
 * @param summaryId - Summary ID
 * @param config - Page break configuration
 * @returns Promise<boolean> - Success status
 */
export const savePageBreakConfig = async (
  userId: string,
  summaryId: string,
  config: PageBreakConfig
): Promise<boolean> => {
  try {
    if (!userId || !summaryId) {
      return false;
    }

    const { error } = await supabase
      .from('user_library_items')
      .update({ page_break_config: config })
      .eq('id', summaryId)
      .eq('user_id', userId);

    if (error) {
      handleSupabaseError(error, {
        component: 'bookModeHelpers',
        action: 'savePageBreakConfig',
        userId,
        metadata: { summaryId, totalPages: config.total_pages }
      });
      ErrorLogger.error(error, {
        component: 'bookModeHelpers',
        action: 'savePageBreakConfig',
        userId,
        metadata: { summaryId, totalPages: config.total_pages }
      });
      return false;
    }

    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    ErrorLogger.error(err, {
      component: 'bookModeHelpers',
      action: 'savePageBreakConfig',
      userId,
      metadata: { summaryId }
    });
    return false;
  }
};

