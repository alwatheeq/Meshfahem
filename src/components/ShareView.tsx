import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, AlertCircle, ExternalLink } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { supabase } from '../lib/supabase';
import { SummaryDisplay } from './Dashboard/SummaryDisplay';
import { FlashcardViewer } from './Dashboard/FlashcardViewer';
import { ErrorLogger } from '../utils/errorLogger';

interface SharedItem {
  id: string;
  title: string;
  summary_text: string;
  flashcards_json: Array<{ front: string; back: string }>;
  original_text_content?: string;
  topics?: string[];
  created_at: string;
}

export const ShareView: React.FC = () => {
  const { shareableLinkId } = useParams<{ shareableLinkId: string }>();
  const { t } = useI18n();
  const [item, setItem] = useState<SharedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (shareableLinkId) {
      fetchSharedItem();
    }
  }, [shareableLinkId]);

  const fetchSharedItem = async () => {
    if (!shareableLinkId) {
      setError(t('share.invalid_link'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('user_library_items')
        .select('id, title, summary_text, flashcards_json, original_text_content, topics, created_at')
        .eq('shareable_link', shareableLinkId)
        .eq('is_public', true)
        .single();

      if (fetchError || !data) {
        throw new Error(t('share.content_not_available'));
      }

      setItem(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'ShareView', action: 'fetchSharedItem', shareableLinkId });
      setError(err instanceof Error ? err.message : t('share.failed_to_load'));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center`}>
        <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            <span className="text-gray-600">{t('common.loading')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center`}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto dark:bg-gray-800 dark:shadow-none">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('share.content_not_available')}</h3>
            <p className="text-gray-600 mb-4">
              {error || t('share.invalid_link')}
            </p>
            <a
              href="/"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150"
            >
              <ExternalLink className="h-4 w-4" />
              <span>{t('share.visit_meshfahem')}</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')}`}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div className="dark:text-gray-100">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('app_name')}</h1>
                <p className="text-xs text-gray-500">{t('share.shared_content')}</p>
              </div>
            </div>

            <a
              href="/"
              className="flex items-center space-x-2 px-4 py-2 text-blue-600 hover:text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-50 transition duration-150 text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              <span>{t('share.get_meshfahem')}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-gray-800 dark:shadow-none">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{item.title}</h2>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span>{t('common.created', { date: formatDate(item.created_at) })}</span>
                  <span>•</span>
                  <span>{item.flashcards_json.length} {item.flashcards_json.length === 1 ? t('common.flashcard') : t('common.flashcards')}</span>
                </div>
                
                {/* Topics */}
                {item.topics && item.topics.length > 0 && (
                  <div className="flex items-center space-x-2 mt-3">
                    <span className="text-sm font-medium text-gray-500">{t('common.topics')}:</span>
                    <div className="flex flex-wrap gap-2">
                      {item.topics.map((topic, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full dark:bg-blue-900 dark:text-blue-300"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <SummaryDisplay 
            summaryChunks={[item.summary_text]}
            flashcards={item.flashcards_json}
            originalText={item.original_text_content || ''}
            topics={item.topics || []}
            onPublishToLibrary={() => Promise.resolve(false)} // Disabled for shared view
            onReset={() => {}} // Disabled for shared view
            isSharedView={true}
          />
          
          {item.flashcards_json.length > 0 && (
            <FlashcardViewer 
              flashcards={item.flashcards_json}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16 dark:bg-gray-800 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
              <div className={`${getThemeGradient('ui')} p-1 rounded`}>
                <FileText className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm">
                {t('share.powered_by')} <strong>{t('app_name')}</strong> - {t('share.ai_powered_learning')}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};