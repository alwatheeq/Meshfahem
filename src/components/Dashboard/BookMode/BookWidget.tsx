import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, BookOpen, FileText } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';
import { PageBreakConfig, paginateSummary } from '../../../utils/bookModeHelpers';
import HighlightLayer from '../Highlighting/HighlightLayer';

interface PageNote {
  id: string;
  page_index: number | null;
  note_type: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface BookWidgetProps {
  summaryText: string;
  pageBreakConfig?: PageBreakConfig | null;
  initialPage?: number;
  onPageChange?: (pageIndex: number) => void;
  onProgressUpdate?: (pageIndex: number) => void;
  notesForCurrentPage?: PageNote[];
  /** Library/history item id for persisted highlights (optional). */
  highlightItemId?: string | null;
}

export const BookWidget: React.FC<BookWidgetProps> = ({
  summaryText,
  pageBreakConfig,
  initialPage = 0,
  onPageChange,
  onProgressUpdate,
  notesForCurrentPage = [],
  highlightItemId = null,
}) => {
  const { getThemeText, getThemeCardBg, getThemeCardBorder, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { t } = useI18n();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [config, setConfig] = useState<PageBreakConfig | null>(pageBreakConfig || null);

  // Calculate pagination if not provided
  useEffect(() => {
    if (!config) {
      const calculated = paginateSummary(summaryText, null, 2000);
      setConfig(calculated);
    }
  }, [summaryText, config]);

  // Update current page when initialPage changes
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [initialPage]);

  const handlePrevPage = () => {
    if (currentPage > 0) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      onPageChange?.(newPage);
      onProgressUpdate?.(newPage);
    }
  };

  const handleNextPage = () => {
    if (config && currentPage < config.total_pages - 1) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      onPageChange?.(newPage);
      onProgressUpdate?.(newPage);
    }
  };

  if (!config || config.total_pages === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <BookOpen className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-4`} />
          <p className={getThemeTextSecondary()}>{t('book_mode.no_content') || 'No content to display'}</p>
        </div>
      </div>
    );
  }

  const currentPageContent = config.pages[currentPage]?.content || '';

  return (
    <div className={`flex flex-col h-full ${getThemeCardBg()} shadow-[0_2px_8px_rgba(0,0,0,0.08)] relative`}>
      {/* Page Content */}
      <div className="flex-1 overflow-y-auto p-6 relative">
        {/* Notes for current page - top right, post-it style */}
        {notesForCurrentPage.length > 0 && (
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
            {notesForCurrentPage.map((note) => {
              const isExpanded = expandedNoteId === note.id;
              return (
                <div
                  key={note.id}
                  onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                  className={`p-2 bg-amber-50 dark:bg-amber-900/30 shadow-[0_2px_8px_rgba(0,0,0,0.12)] rounded-md border border-amber-200/80 dark:border-amber-700/50 cursor-pointer transition-all overflow-hidden ${
                    isExpanded
                      ? 'min-h-[80px] max-h-[104px] w-[280px] min-w-[200px] max-w-[620px]'
                      : 'h-[48px] min-h-[44px] max-h-[52px] w-[280px] min-w-[200px] max-w-[360px]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {note.note_type === 'page' ? (
                      <FileText className={`h-3.5 w-3.5 flex-shrink-0 ${getThemeTextMuted()}`} />
                    ) : (
                      <BookOpen className={`h-3.5 w-3.5 flex-shrink-0 ${getThemeTextMuted()}`} />
                    )}
                    <span className={`text-xs truncate ${getThemeTextMuted()}`}>
                      {note.note_type === 'page' ? `${t('book_mode.page') || 'Page'} ${(note.page_index ?? 0) + 1}` : t('notebook.book_note') || 'Book Note'}
                    </span>
                  </div>
                  <p className={`text-sm ${getThemeText()} whitespace-pre-wrap mt-1 ${isExpanded ? 'line-clamp-4' : 'line-clamp-1'}`}>
                    {note.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div className={`max-w-none ${getThemeText()} leading-relaxed`}>
          {config.pages[currentPage] && (
            <div className={`text-sm ${getThemeTextSecondary()}`}>
              <HighlightLayer
                text={currentPageContent}
                itemId={highlightItemId || undefined}
                globalOffset={config.pages[currentPage].start}
              />
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className={`border-t ${getThemeCardBorder()} px-4 py-2.5`}>
        <div className="flex items-center justify-between">
          {/* Previous Button */}
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
              currentPage === 0
                ? `opacity-30 cursor-not-allowed border-transparent ${getThemeTextMuted()}`
                : `${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5`
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="font-medium">{t('book_mode.prev_page') || 'Prev'}</span>
          </button>

          {/* Page Indicator pill */}
          <span className={`text-xs font-medium px-3 py-1 rounded-full ${getThemeSubtle('bg')} ${getThemeTextMuted()}`}>
            {currentPage + 1} / {config.total_pages}
          </span>

          {/* Next Button */}
          <button
            onClick={handleNextPage}
            disabled={currentPage >= config.total_pages - 1}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
              currentPage >= config.total_pages - 1
                ? `opacity-30 cursor-not-allowed border-transparent ${getThemeTextMuted()}`
                : `${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5`
            }`}
          >
            <span className="font-medium">{t('book_mode.next_page') || 'Next'}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

