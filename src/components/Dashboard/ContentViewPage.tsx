import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChatContext } from '../../contexts/ChatContext';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { supabase } from '../../lib/supabase';
import { BookModeViewer } from './BookMode/BookModeViewer';
import { useTheme } from '../../contexts/ThemeContext';

type ViewSource = 'history' | 'library';

interface HistoryData {
  id: string;
  summary_text: string;
  flashcards_json: Array<{ front: string; back: string }>;
  original_text_content?: string;
  topics?: string[];
  original_file_name?: string;
}

interface LibraryData {
  id: string;
  title: string;
  summary_text: string;
  flashcards_json: Array<{ front: string; back: string }>;
  original_text_content?: string;
  topics?: string[];
  user_id: string;
}

export const ContentViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { setChatContext, clearChatContext } = useChatContext();
  const { preferences } = useUserPreferences();
  const { getThemeTextSecondary, getBackgroundGradient, getThemeCardBorder } = useTheme();

  const pathname = location.pathname || '';
  const source: ViewSource = pathname.startsWith('/view/history') ? 'history' : 'library';

  // Redirect history view to Dashboard for full experience (sidebar, action bar)
  useEffect(() => {
    if (source === 'history' && id && user) {
      navigate('/', { state: { loadHistoryId: id }, replace: true });
    }
  }, [source, id, user, navigate]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryData | LibraryData | null>(null);

  useEffect(() => {
    if (!id || !user) {
      if (!user) {
        setError('Unauthorized');
      } else {
        setError('Not found');
      }
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        if (source === 'history') {
          const { data: row, error: fetchError } = await supabase
            .from('user_history')
            .select('id, summary_text, flashcards_json, original_text_content, topics, original_file_name')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

          if (cancelled) return;
          if (fetchError || !row) {
            setError(row ? 'Not found' : fetchError?.message || 'Not found');
            setLoading(false);
            return;
          }
          setData(row as HistoryData);
        } else {
          const { data: row, error: fetchError } = await supabase
            .from('user_library_items')
            .select('id, title, summary_text, flashcards_json, original_text_content, topics, user_id')
            .eq('id', id)
            .single();

          if (cancelled) return;
          if (fetchError || !row) {
            setError(row ? 'Not found' : fetchError?.message || 'Not found');
            setLoading(false);
            return;
          }
          const lib = row as LibraryData;
          setData(lib);

          // Update last_viewed_at for owner (non-blocking)
          if (lib.user_id === user.id) {
            supabase
              .from('user_library_items')
              .update({ last_viewed_at: new Date().toISOString() })
              .eq('id', id)
              .eq('user_id', user.id)
              .then(() => {});
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [id, user?.id, source]);

  // Set chat context when data is loaded; clear on unmount
  useEffect(() => {
    if (!data) return;
    const isHistory = source === 'history';
    const hist = isHistory ? (data as HistoryData) : null;
    const lib = !isHistory ? (data as LibraryData) : null;
    const fileName = hist?.original_file_name ?? lib?.title ?? '';
    const isMedical = fileName.toLowerCase().includes('medical') ||
      (data.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med))) ?? false);
    setChatContext({
      summaryText: data.summary_text || '',
      originalText: data.original_text_content || '',
      topics: data.topics || [],
      medicalMode: isMedical,
      contextType: isHistory ? 'history_item' : 'library_item',
      contextId: data.id,
    });
    return () => clearChatContext();
  }, [data, source, setChatContext, clearChatContext]);

  const goBack = () => {
    navigate('/', { state: { tab: source } });
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${getBackgroundGradient()}`}>
        <div className={`text-lg ${getThemeTextSecondary()}`}>Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 gap-4 ${getBackgroundGradient()}`}>
        <p className={`text-lg ${getThemeTextSecondary()}`}>
          {error === 'Unauthorized'
            ? 'Please sign in to view this content.'
            : "Content not found or you do not have access."}
        </p>
        <button
          type="button"
          onClick={goBack}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:opacity-80 transition-opacity`}
        >
          <ArrowLeft className="h-5 w-5" />
          Go back
        </button>
      </div>
    );
  }

  const isMedical = (data as HistoryData).original_file_name?.toLowerCase().includes('medical') ||
    (data.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med))) ?? false);

  return (
    <div className={`min-h-screen flex flex-col ${getBackgroundGradient()}`}>
      <div className={`flex-shrink-0 p-4 border-b ${getThemeCardBorder()}`}>
        <button
          type="button"
          onClick={goBack}
          className={`flex items-center gap-2 ${getThemeTextSecondary()} hover:opacity-80 transition-opacity`}
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Go back</span>
        </button>
      </div>
      <div className="flex-1">
        <BookModeViewer
          summaryId={source === 'library' ? data.id : null}
          summaryText={data.summary_text}
          flashcards={data.flashcards_json || []}
          originalText={data.original_text_content || ''}
          topics={data.topics || []}
          source={source}
          onClose={goBack}
          medicalMode={isMedical}
          freeFormMode={preferences?.free_form_mode_enabled ?? false}
        />
      </div>
    </div>
  );
};
