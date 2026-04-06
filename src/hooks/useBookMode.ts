import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import {
  WidgetConfig,
  WidgetLayout,
  getDefaultWidgetLayout,
  loadWidgetLayout,
  saveWidgetLayout,
  loadReadingProgress,
  saveReadingProgress,
  ReadingProgress,
  PageBreakConfig as _PageBreakConfig,
  savePageBreakConfig as _savePageBreakConfig
} from '../utils/bookModeHelpers';
import { ErrorLogger } from '../utils/errorLogger';
// Debounce utility function
const debounce = <T extends (...args: any[]) => any>(func: T, wait: number): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

interface UseBookModeProps {
  summaryId: string | null;
  summaryText: string;
  flashcards: Array<{ front: string; back: string }>;
}

interface UseBookModeReturn {
  widgets: WidgetConfig[];
  currentPage: number;
  readingProgress: ReadingProgress | null;
  loading: boolean;
  updateWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  addWidget: (type: WidgetConfig['type']) => void;
  setCurrentPage: (page: number) => void;
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<void>;
}

export const useBookMode = ({
  summaryId,
  summaryText: _summaryText,
  flashcards: _flashcards
}: UseBookModeProps): UseBookModeReturn => {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  // Debounced save function to avoid too many database writes
  const debouncedSaveLayout = useCallback(
    debounce(async (widgetsToSave: WidgetConfig[], userId: string, summaryIdToSave: string | null) => {
      if (!userId) return;

      const layout: WidgetLayout = {
        widgets: widgetsToSave,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // For new summaries (summaryId = null), save to localStorage instead
      if (!summaryIdToSave) {
        try {
          localStorage.setItem(`book_mode_layout_temp_${userId}`, JSON.stringify(layout));
        } catch (_e) {
          // Ignore localStorage errors
        }
        return;
      }

      await saveWidgetLayout(userId, summaryIdToSave, layout);
    }, 1000),
    []
  );

  // Load layout on mount
  useEffect(() => {
    if (user && !layoutLoaded) {
      loadLayout();
    }
  }, [user, summaryId, layoutLoaded]);

  // Load reading progress
  useEffect(() => {
    if (user && summaryId && !progressLoaded) {
      loadReadingProgressData();
    } else if (!summaryId) {
      // For new summaries (no summaryId), reset to page 0
      setCurrentPage(0);
      setProgressLoaded(true);
    }
  }, [user, summaryId, progressLoaded]);

  const loadLayout = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const layout = await loadWidgetLayout(user.id, summaryId);

      if (layout && layout.widgets) {
        setWidgets(layout.widgets);
      } else {
        // Use default layout
        const defaultLayout = getDefaultWidgetLayout();
        setWidgets(defaultLayout.widgets);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'useBookMode',
        action: 'loadLayout',
        userId: user.id,
        metadata: { summaryId }
      });
      // Fallback to default layout
      const defaultLayout = getDefaultWidgetLayout();
      setWidgets(defaultLayout.widgets);
    } finally {
      setLoading(false);
      setLayoutLoaded(true);
    }
  };

  const loadReadingProgressData = async () => {
    if (!user || !summaryId) {
      setProgressLoaded(true);
      return;
    }

    try {
      const progress = await loadReadingProgress(user.id, summaryId);
      if (progress) {
        setReadingProgress(progress);
        setCurrentPage(progress.last_page);
      }
      setProgressLoaded(true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'useBookMode',
        action: 'loadReadingProgress',
        userId: user.id,
        metadata: { summaryId }
      });
      setProgressLoaded(true);
    }
  };

  const updateWidget = useCallback((widget: WidgetConfig) => {
    setWidgets((prev) => {
      const updated = prev.map((w) => (w.id === widget.id ? widget : w));
      
      // Auto-save layout (debounced)
      if (user) {
        debouncedSaveLayout(updated, user.id, summaryId);
      }
      
      return updated;
    });
  }, [user, summaryId, debouncedSaveLayout]);

  const removeWidget = useCallback((widgetId: string) => {
    setWidgets((prev) => {
      const updated = prev.filter((w) => w.id !== widgetId);
      
      // Save layout after removal
      if (user) {
        debouncedSaveLayout(updated, user.id, summaryId);
      }
      
      return updated;
    });
  }, [user, summaryId, debouncedSaveLayout]);

  const addWidget = useCallback((type: WidgetConfig['type']) => {
    const isNotes = type === 'notes';
    const newWidget: WidgetConfig = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 100, y: 100 },
      size: isNotes ? { width: 320, height: 48 } : { width: 400, height: 500 },
      isCollapsed: isNotes,
      isMinimized: false,
      zIndex: widgets.length + 1
    };

    setWidgets((prev) => {
      const updated = [...prev, newWidget];
      
      // Save layout after adding
      if (user) {
        debouncedSaveLayout(updated, user.id, summaryId);
      }
      
      return updated;
    });
  }, [widgets.length, user, summaryId, debouncedSaveLayout]);

  const saveLayout = async () => {
    if (!user) return;

    const layout: WidgetLayout = {
      widgets,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // For unsaved summaries (summaryId = null), save to localStorage instead of DB
    if (!summaryId) {
      try {
        localStorage.setItem(`book_mode_layout_temp_${user.id}`, JSON.stringify(layout));
      } catch (_e) {
        // Ignore localStorage errors
      }
      return;
    }

    await saveWidgetLayout(user.id, summaryId, layout);
  };

  const handlePageChange = useCallback(async (page: number) => {
    setCurrentPage(page);

    // Update reading progress
    if (user) {
      if (summaryId) {
        // Save to database for saved summaries
        const updatedProgress: ReadingProgress = {
          last_page: page,
          last_position: 0, // Could track scroll position if needed
          pages_read: readingProgress?.pages_read || [],
          last_updated: new Date().toISOString()
        };

        // Add page to pages_read if not already there
        if (!updatedProgress.pages_read.includes(page)) {
          updatedProgress.pages_read.push(page);
        }

        setReadingProgress(updatedProgress);
        await saveReadingProgress(user.id, summaryId, updatedProgress);
      } else {
        // For new summaries (summaryId = null), save to localStorage
        const updatedProgress: ReadingProgress = {
          last_page: page,
          last_position: 0,
          pages_read: readingProgress?.pages_read || [],
          last_updated: new Date().toISOString()
        };

        if (!updatedProgress.pages_read.includes(page)) {
          updatedProgress.pages_read.push(page);
        }

        setReadingProgress(updatedProgress);
        try {
          localStorage.setItem(`book_mode_progress_temp_${user.id}`, JSON.stringify(updatedProgress));
        } catch (_e) {
          // Ignore localStorage errors
        }
      }
    }
  }, [user, summaryId, readingProgress]);

  return {
    widgets,
    currentPage,
    readingProgress,
    loading,
    updateWidget,
    removeWidget,
    addWidget,
    setCurrentPage: handlePageChange,
    saveLayout,
    loadLayout
  };
};

