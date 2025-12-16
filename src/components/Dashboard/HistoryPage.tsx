import React, { useState, useEffect } from 'react';
import { History, FileText, Calendar, ChevronRight, AlertCircle, RefreshCw, X, BookOpen, Tag, Clock, Stethoscope } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { SummaryDisplay } from './SummaryDisplay';
import { FlashcardViewer } from './FlashcardViewer';
import { useChatContext } from '../../contexts/ChatContext';

interface HistoryEntry {
  id: string;
  original_input_type: string;
  original_file_name: string;
  summary_text: string;
  flashcards_json: Array<{ front: string; back: string }>;
  original_text_content?: string;
  topics?: string[];
  created_at: string;
  expires_at: string;
}

export const HistoryPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient } = useTheme();
  const { setChatContext, clearChatContext } = useChatContext();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('history');
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemForView, setSelectedItemForView] = useState<HistoryEntry | null>(null);
  const [sortOption, setSortOption] = useState<string>('created_at_desc');

  useEffect(() => {
    fetchHistory(sortOption);
  }, [user, sortOption]);

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial && !loading) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, loading, showTutorial]);

  const fetchHistory = async (currentSortOption: string = sortOption) => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError((msg) => setError(msg));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      ErrorLogger.debug('Fetching history with sort option', { component: 'HistoryPage', action: 'fetchHistory', sortOption: currentSortOption });

      let query = supabase
        .from('user_history')
        .select('*')
        .eq('user_id', user.id);

      // Apply sorting based on the selected option
      if (currentSortOption === 'created_at_desc') {
        query = query.order('created_at', { ascending: false });
      } else if (currentSortOption === 'created_at_asc') {
        query = query.order('created_at', { ascending: true });
      } else if (currentSortOption === 'filename_asc') {
        query = query.order('original_file_name', { ascending: true, nullsFirst: false });
      } else if (currentSortOption === 'filename_desc') {
        query = query.order('original_file_name', { ascending: false, nullsFirst: false });
      } else {
        // Default fallback
        query = query.order('created_at', { ascending: false });
      }

      ErrorLogger.debug('Applied sort option', { component: 'HistoryPage', action: 'fetchHistory', sortOption: currentSortOption });

      const { data, error: fetchError } = await query;

      if (fetchError) {
        const errorMessage = handleSupabaseError(fetchError, { component: 'HistoryPage', action: 'fetchHistory' });
        ErrorLogger.error(fetchError instanceof Error ? fetchError : new Error(String(fetchError)), { component: 'HistoryPage', action: 'fetchHistory' });
        throw new Error(errorMessage);
      }

      ErrorLogger.debug('Fetched history entries', { component: 'HistoryPage', action: 'fetchHistory', entryCount: data?.length || 0 });
      setHistoryEntries(data || []);
    } catch (err) {
      const errorMessage = handleApiError(err, { component: 'HistoryPage', action: 'fetchHistory' });
      ErrorLogger.error(err instanceof Error ? err : new Error(String(err)), { component: 'HistoryPage', action: 'fetchHistory' });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatStoredUntil = (expiresAt: string) => {
    const expiresDate = new Date(expiresAt);
    return expiresDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleViewContent = (entry: HistoryEntry) => {
    setSelectedItemForView(entry);
    // Set chat context when viewing history item
    if (entry) {
      const isMedical = entry.original_file_name?.toLowerCase().includes('medical') ||
        entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)));
      setChatContext({
        summaryText: entry.summary_text || '',
        originalText: entry.original_text_content || '',
        topics: entry.topics || [],
        medicalMode: isMedical,
        contextType: 'history_item',
        contextId: entry.id,
      });
    }
  };

  const closeDetailView = () => {
    setSelectedItemForView(null);
    // Clear chat context when modal closes
    clearChatContext();
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3 dark:border-blue-400"></div>
            <span className="text-gray-600">{t('history.loading_history')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('history.error_loading')}</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => fetchHistory()}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 mx-auto"
            >
              <RefreshCw className="h-4 w-4" />
              <span>{t('history.try_again')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-gray-100">{t('history.generation_history')}</h2>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          {t('history.history_desc')}
        </p>
      </div>

      {/* Sorting Controls */}
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 dark:bg-gray-800 dark:shadow-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <History className="h-5 w-5 text-white" />
            </div>
            <div> {/* Apply dark mode classes to sort options text */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('history.sort_options')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('history.sort_desc')}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3"> {/* Apply dark mode classes to sort by label and select */}
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('history.sort_by')}</label>
            <select
              value={sortOption}
              onChange={(e) => {
                ErrorLogger.debug('Sort option changed', { component: 'HistoryPage', action: 'handleSortChange', newSortOption: e.target.value });
                setSortOption(e.target.value);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="created_at_desc">{t('history.creation_newest')}</option>
              <option value="created_at_asc">{t('history.creation_oldest')}</option>
              <option value="filename_asc">{t('history.filename_az')}</option>
              <option value="filename_desc">{t('history.filename_za')}</option>
            </select>
          </div>
        </div>
      </div>

      {historyEntries.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center py-12">
            <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">{t('history.no_history')}</h3>
            <p className="text-gray-600 dark:text-gray-300">
              {t('history.process_first')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {historyEntries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-2xl shadow-xl overflow-hidden dark:bg-gray-800 dark:shadow-none">
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      entry.original_file_name?.toLowerCase().includes('medical') ||
                      entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)))
                        ? 'bg-gradient-to-r from-red-500 to-pink-600 dark:from-red-600 dark:to-pink-700'
                        : getThemeGradient('ui')
                    }`}>
                      {entry.original_file_name?.toLowerCase().includes('medical') ||
                       entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med))) ? (
                        <Stethoscope className="h-5 w-5 text-white" />
                      ) : (
                        <FileText className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div> {/* Apply dark mode classes to entry details */}
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {entry.original_file_name || t('common.unknown')}
                        {(entry.original_file_name?.toLowerCase().includes('medical') ||
                          entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)))) && (
                          <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full dark:bg-red-900 dark:text-red-300">
                            🩺 Medical
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDate(entry.created_at)}
                        </div>
                        <span className="capitalize">
                          {entry.original_input_type === 'file' ? t('history.file_upload') : t('history.text_input')}
                        </span>
                        <span>
                          {entry.flashcards_json.length} {entry.flashcards_json.length === 1 ? t('common.flashcard') : t('common.flashcards')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleViewContent(entry)}
                    className={`px-3 py-2 text-white ${getThemeGradient('ui')} text-white hover:opacity-90 transition duration-150 text-sm font-medium whitespace-nowrap`}
                  >
                    {t('history.view_content')}
                  </button>
                </div>

                {/* Topics display */}
                {entry.topics && entry.topics.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-start space-x-2">
                      <Tag className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                      <div className="flex flex-wrap gap-2 min-w-0">
                        {entry.topics.map((topic, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full dark:bg-purple-900 dark:text-purple-300 whitespace-nowrap"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stored until badge */}
                <div className="mb-4">
                  <div className="flex items-center space-x-2 text-sm text-orange-600 dark:text-orange-400">
                    <Clock className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{t('history.expires_on', { date: formatStoredUntil(entry.expires_at) })}</span>
                  </div>
                </div>

                <div className="mb-4"> {/* Apply dark mode classes to summary preview */}
                  <h4 className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">{t('history.summary_preview')}</h4>
                  <p className="text-gray-600 bg-gray-50 rounded-lg p-3 dark:bg-gray-900 dark:text-gray-300">
                    {entry.summary_text.length > 150 
                      ? entry.summary_text.substring(0, 150) + '...'
                      : entry.summary_text
                    }
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail View Modal */}
      {selectedItemForView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col dark:bg-gray-800 dark:shadow-none">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
                  <History className="h-6 w-6 text-white" />
                </div>
                <div> {/* Apply dark mode classes to modal header text */}
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {selectedItemForView.original_file_name || t('history.pasted_text')}
                  </h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(selectedItemForView.created_at)}
                    </div>
                    <span className="capitalize">
                      {selectedItemForView.original_input_type === 'file' ? t('history.file_upload') : t('history.text_input')}
                    </span>
                    <span>
                      {selectedItemForView.flashcards_json.length} {selectedItemForView.flashcards_json.length === 1 ? t('common.flashcard') : t('common.flashcards')}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={closeDetailView}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition duration-150"
              >
                <X className="h-6 w-6" />
              medicalMode={selectedItemForView.original_file_name?.toLowerCase().includes('medical') ||
                selectedItemForView.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)))}
              </button>
            </div>
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <SummaryDisplay 
                summaryChunks={[selectedItemForView.summary_text]}
                flashcards={selectedItemForView.flashcards_json}
                medicalMode={selectedItemForView.original_file_name?.toLowerCase().includes('medical') ||
                  selectedItemForView.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)))}
                originalText={selectedItemForView.original_text_content || ''}
                topics={selectedItemForView.topics || []}
                onPublishToLibrary={() => Promise.resolve(true)}
                onReset={closeDetailView}
              />
              
              {selectedItemForView.flashcards_json.length > 0 && (
                <FlashcardViewer 
                  flashcards={selectedItemForView.flashcards_json}
                />
              )}
              
            </div>
          </div>
        </div>
      )}

      {/* History Tutorial */}
      {tutorialConfig && (
        <PageTutorial
          config={tutorialConfig}
          isOpen={isTutorialOpen}
          onClose={() => {}}
          onComplete={completeTutorial}
          onSkip={skipTutorial}
        />
      )}
    </div>
  );
});