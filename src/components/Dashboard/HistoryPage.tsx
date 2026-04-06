import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, FileText, Calendar, AlertCircle, RefreshCw, Tag, Clock, Stethoscope } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';

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

interface HistoryPageProps {
  onViewHistoryEntry?: (entry: HistoryEntry) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = React.memo(({ onViewHistoryEntry }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('history');
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  if (loading) {
    return (
      <div className="w-full">
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] p-8 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm ${getThemeCardBorder()}`}>
          <div className="flex items-center justify-center py-12">
            <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${getThemeTextMuted()} mr-3`}></div>
            <span className={getThemeTextSecondary()}>{t('history.loading_history')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] p-8 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm ${getThemeCardBorder()}`}>
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>{t('history.error_loading')}</h3>
            <p className={`${getThemeTextSecondary()} mb-4`}>{error}</p>
            <button
              onClick={() => fetchHistory()}
              className={`flex items-center space-x-2 px-4 py-2 ${getThemeGradient('ui')} text-white hover:opacity-90 transition duration-150 mx-auto rounded-lg`}
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
        <h2 className={`text-3xl font-bold ${getThemeTextPrimary()} mb-2`}>{t('history.generation_history')}</h2>
        <p className={`text-lg ${getThemeTextSecondary()}`}>
          {t('history.history_desc')}
        </p>
      </div>

      {/* Sorting Controls */}
      <div className="bg-white rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] p-6 mb-6 dark:bg-gray-800 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <History className="h-5 w-5 text-white" />
            </div>
            <div> {/* Apply dark mode classes to sort options text */}
              <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{t('history.sort_options')}</h3>
              <p className={`text-sm ${getThemeTextMuted()}`}>{t('history.sort_desc')}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3"> {/* Apply dark mode classes to sort by label and select */}
            <label className={`text-sm font-medium ${getThemeTextSecondary()}`}>{t('history.sort_by')}</label>
            <select
              value={sortOption}
              onChange={(e) => {
                ErrorLogger.debug('Sort option changed', { component: 'HistoryPage', action: 'handleSortChange', newSortOption: e.target.value });
                setSortOption(e.target.value);
              }}
              className={`px-3 py-2 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${getThemeCardBg()} ${getThemeTextPrimary()}`}
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
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] p-8 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm ${getThemeCardBorder()}`}>
          <div className="text-center py-12">
            <History className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-4`} />
            <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>{t('history.no_history')}</h3>
            <p className={getThemeTextSecondary()}>
              {t('history.process_first')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {historyEntries.map((entry) => (
            <div key={entry.id} className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm overflow-hidden dark:shadow-none`}>
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      entry.original_file_name?.toLowerCase().includes('medical') ||
                      entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)))
                        ? 'bg-red-50 dark:bg-red-900/20 dark:from-red-600 dark:to-pink-700'
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
                      <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                        {entry.original_file_name || t('common.unknown')}
                        {(entry.original_file_name?.toLowerCase().includes('medical') ||
                          entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med)))) && (
                          <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full dark:bg-red-900 dark:text-red-300">
                            🩺 Medical
                          </span>
                        )}
                      </h3>
                      <div className={`flex items-center space-x-4 text-sm ${getThemeTextMuted()}`}>
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
                    onClick={() => onViewHistoryEntry ? onViewHistoryEntry(entry) : navigate(`/view/history/${entry.id}`)}
                    className={`px-3 py-2 text-white ${getThemeGradient('ui')} text-white hover:opacity-90 transition duration-150 text-sm font-medium whitespace-nowrap`}
                  >
                    {t('history.view_content')}
                  </button>
                </div>

                {/* Topics display */}
                {entry.topics && entry.topics.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-start space-x-2">
                      <Tag className={`h-4 w-4 ${getThemeTextMuted()} flex-shrink-0 mt-1`} />
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
                  <h4 className={`text-sm font-medium ${getThemeTextSecondary()} mb-2`}>{t('history.summary_preview')}</h4>
                  <p className={`${getThemeTextSecondary()} ${getThemeSubtle('bg')} rounded-lg p-3`}>
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