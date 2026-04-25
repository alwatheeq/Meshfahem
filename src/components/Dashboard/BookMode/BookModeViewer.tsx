import React, { useState, useEffect, useRef } from 'react';
import { Plus, BookOpen, CreditCard, StickyNote, Brain } from 'lucide-react';
import { useBookMode } from '../../../hooks/useBookMode';
import { WidgetContainer, WidgetConfig } from './WidgetContainer';
import { BookWidget } from './BookWidget';
import { FlashcardsWidget } from './FlashcardsWidget';
import { NotesWidget } from './NotesWidget';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';
import { PageBreakConfig, paginateSummary } from '../../../utils/bookModeHelpers';
import { Modal } from '../../Common/Modal';
import MindMapView from '../MindMap/MindMapView';

interface BookModeViewerProps {
  summaryId: string | null;
  summaryText: string;
  flashcards: Array<{ front: string; back: string }>;
  originalText?: string;
  topics?: string[];
  source: 'dashboard' | 'library' | 'notebook' | 'history' | 'shared';
  onClose?: () => void;
  medicalMode?: boolean;
  freeFormMode?: boolean; // Controls whether widgets are in free-form (movable) or traditional (fixed) layout
}

export const BookModeViewer: React.FC<BookModeViewerProps> = ({
  summaryId,
  summaryText,
  flashcards,
  originalText: _originalText,
  topics: _topics,
  source: _source,
  onClose,
  medicalMode = false,
  freeFormMode = false
}) => {
  const { getBackgroundGradient, getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextSecondary } = useTheme();
  const { t } = useI18n();
  const [pageBreakConfig, setPageBreakConfig] = useState<PageBreakConfig | null>(null);
  const [originalWidgetPositions, setOriginalWidgetPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [previousFreeFormMode, setPreviousFreeFormMode] = useState<boolean>(freeFormMode);
  const [addWidgetMenuOpen, setAddWidgetMenuOpen] = useState(false);
  const addWidgetMenuRef = useRef<HTMLDivElement>(null);
  const [mindMapOpen, setMindMapOpen] = useState(false);

  const {
    widgets,
    currentPage,
    readingProgress: _readingProgress,
    loading: layoutLoading,
    updateWidget,
    removeWidget,
    addWidget,
    setCurrentPage
  } = useBookMode({
    summaryId,
    summaryText,
    flashcards
  });

  // Calculate pagination on mount
  useEffect(() => {
    const config = paginateSummary(summaryText, null, 2000);
    setPageBreakConfig(config);
  }, [summaryText]);

  // Initialize widgets if empty (first time)
  useEffect(() => {
    if (!layoutLoading && widgets.length === 0) {
      // Add default widgets
      addWidget('book');
      if (flashcards.length > 0) {
        addWidget('flashcards');
      }
      // Always add notes widget - it supports localStorage for new summaries
      addWidget('notes');
    }
  }, [layoutLoading, widgets.length, flashcards.length, addWidget]);

  // Store original positions when free mode is first enabled
  useEffect(() => {
    if (freeFormMode && !previousFreeFormMode && widgets.length > 0) {
      // Free mode just enabled - store current positions as originals
      const positions = new Map<string, { x: number; y: number }>();
      widgets.forEach(widget => {
        positions.set(widget.id, { x: widget.position.x, y: widget.position.y });
      });
      setOriginalWidgetPositions(positions);
    }
    setPreviousFreeFormMode(freeFormMode);
  }, [freeFormMode, previousFreeFormMode, widgets]);

  // Restore original positions when free mode is disabled
  useEffect(() => {
    if (!freeFormMode && previousFreeFormMode && originalWidgetPositions.size > 0) {
      // Free mode just disabled - restore original positions
      widgets.forEach(widget => {
        const originalPos = originalWidgetPositions.get(widget.id);
        if (originalPos) {
          updateWidget({
            ...widget,
            position: originalPos,
            isCollapsed: false // Ensure widgets are expanded in traditional mode
          });
        } else {
          // If no original position, expand widget
          updateWidget({
            ...widget,
            isCollapsed: false
          });
        }
      });
    }
  }, [freeFormMode, previousFreeFormMode, originalWidgetPositions, widgets, updateWidget]);

  // Ensure widgets are expanded when free mode is off
  useEffect(() => {
    if (!freeFormMode && widgets.some(w => w.isCollapsed)) {
      widgets.forEach(widget => {
        if (widget.isCollapsed) {
          updateWidget({
            ...widget,
            isCollapsed: false
          });
        }
      });
    }
  }, [freeFormMode, widgets, updateWidget]);

  // Click outside to close Add Widget menu
  useEffect(() => {
    if (!addWidgetMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addWidgetMenuRef.current && !addWidgetMenuRef.current.contains(e.target as Node)) {
        setAddWidgetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addWidgetMenuOpen]);

  const [pageNotes, setPageNotes] = useState<Array<{ id: string; page_index: number | null; note_type: string; content: string; created_at: string; updated_at: string }>>([]);

  const handlePageChange = (pageIndex: number) => {
    setCurrentPage(pageIndex);
  };

  const renderWidget = (widget: WidgetConfig) => {
    switch (widget.type) {
      case 'book':
        return (
          <BookWidget
            summaryText={summaryText}
            pageBreakConfig={pageBreakConfig}
            initialPage={currentPage}
            onPageChange={handlePageChange}
            onProgressUpdate={handlePageChange}
            notesForCurrentPage={pageNotes.filter(n => n.note_type === 'book' ? n.page_index === null : n.page_index === currentPage)}
            highlightItemId={summaryId}
          />
        );
      case 'flashcards':
        return (
          <FlashcardsWidget
            flashcards={flashcards}
            medicalMode={medicalMode}
            itemId={summaryId}
            contextSummary={summaryText}
          />
        );
      case 'notes':
        return (
          <NotesWidget
            summaryId={summaryId}
            summaryText={summaryText}
            currentPageIndex={currentPage}
            totalPages={pageBreakConfig?.total_pages ?? 1}
            onNoteAdded={() => {}}
            onNotesChange={(notes) => setPageNotes(notes)}
          />
        );
      default:
        return null;
    }
  };

  const getWidgetTitle = (type: WidgetConfig['type']): string => {
    switch (type) {
      case 'book':
        return t('book_mode.book_widget') || 'Book';
      case 'flashcards':
        return t('book_mode.flashcards_widget') || 'Flashcards';
      case 'notes':
        return t('book_mode.notes_widget') || 'Notes';
      default:
        return type;
    }
  };

  if (layoutLoading) {
    return (
      <div className={`min-h-screen ${getBackgroundGradient()} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">{t('common.loading') || 'Loading Book Mode...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getBackgroundGradient()} relative overflow-hidden`}>
      {/* Background overlay - click to close if onClose provided */}
      {onClose && (
        <div
          className="absolute inset-0 bg-black bg-opacity-20 z-0"
          onClick={onClose}
        />
      )}

      {/* Widgets Container */}
      <div className={`relative z-10 ${freeFormMode ? '' : 'flex flex-col items-center space-y-5 px-0 pt-2'}`}>
        {widgets.map((widget) => (
          <WidgetContainer
            key={widget.id}
            widget={widget}
            onUpdate={updateWidget}
            onRemove={() => removeWidget(widget.id)}
            title={getWidgetTitle(widget.type)}
            canRemove={widgets.length > 1} // Don't allow removing last widget
            canClose={widget.type !== 'book' && widget.type !== 'flashcards'} // Book and flashcards widgets cannot be closed, only collapsed
            freeFormMode={freeFormMode || widget.type === 'notes'}
          >
            {renderWidget(widget)}
          </WidgetContainer>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setMindMapOpen(true)}
        className={`fixed bottom-24 right-6 z-50 rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow text-white ${getThemeGradient('ui')}`}
        title={t('mind_map.title') || 'Mind map'}
      >
        <Brain className="h-5 w-5" />
      </button>

      <Modal isOpen={mindMapOpen} onClose={() => setMindMapOpen(false)} title={t('mind_map.title')} maxWidth="2xl">
        <MindMapView text={summaryText} title={t('mind_map.title')} />
      </Modal>

      {/* Add Widget Button (floating) - click to open, click outside to close */}
      <div className="fixed bottom-6 right-6 z-50" ref={addWidgetMenuRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddWidgetMenuOpen(prev => !prev)}
            className={`${getThemeGradient('ui')} rounded-full w-10 h-10 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow text-white`}
            title={t('book_mode.add_widget') || 'Add Widget'}
          >
            <Plus className="h-5 w-5" />
          </button>

          {/* Widget type menu */}
          <div className={`absolute bottom-full right-0 mb-2 w-52 ${getThemeCardBg()} rounded-xl shadow-xl border ${getThemeCardBorder()} transition-all duration-150 ${addWidgetMenuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-1 pointer-events-none'}`}>
            <div className="p-1.5 space-y-0.5">
              {!widgets.some(w => w.type === 'book') && (
                <button
                  type="button"
                  onClick={() => { addWidget('book'); setAddWidgetMenuOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                >
                  <BookOpen className="h-4 w-4 opacity-60" />
                  <span>{t('book_mode.book_widget') || 'Book'}</span>
                </button>
              )}
              {!widgets.some(w => w.type === 'flashcards') && flashcards.length > 0 && (
                <button
                  type="button"
                  onClick={() => { addWidget('flashcards'); setAddWidgetMenuOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                >
                  <CreditCard className="h-4 w-4 opacity-60" />
                  <span>{t('book_mode.flashcards_widget') || 'Flashcards'}</span>
                </button>
              )}
              {!widgets.some(w => w.type === 'notes') && (
                <button
                  type="button"
                  onClick={() => { addWidget('notes'); setAddWidgetMenuOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                >
                  <StickyNote className="h-4 w-4 opacity-60" />
                  <span>{t('book_mode.notes_widget') || 'Notes'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

