import React, { useState, useEffect } from 'react';
import { FileQuestion, Plus, Clock, Trophy, Play, Eye, Trash2, Upload, BookOpen, ChevronRight, Languages, Folder, Search, Filter } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';
import { QuizTakingComponent } from './QuizTakingComponent';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSubscription } from '../../hooks/useSubscription';
import { PersistentSubscriptionModal } from '../Subscription/PersistentSubscriptionModal';
import { usePersistentModal, getFeatureConfig } from '../../contexts/PersistentModalContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { PerformanceMonitor } from '../../utils/performanceMonitor';
import { useConfirm } from '../../hooks/useConfirm';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';

interface QuizSession {
  id: string;
  quiz_title: string;
  source_type: string;
  question_count: number;
  time_limit_minutes: number | null;
  difficulty_level: string;
  created_at: string;
  folder_id?: string | null;
  quiz_language?: string;
  available_languages?: string[];
  translated_questions_json?: Record<string, any[]>;
}

interface QuizAttempt {
  id: string;
  quiz_session_id: string;
  score_percentage: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  time_taken_seconds: number;
  completed_at: string;
  quiz_sessions: {
    quiz_title: string;
  };
}

interface LibraryItem {
  id: string;
  title: string;
  summary_text: string;
}

interface QuizFolder {
  id: string;
  name: string;
  color?: string;
  user_id: string;
  created_at?: string;
}

export const QuizPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getThemeBorder, getThemeText, getThemeFocusRing } = useTheme();
  const { hasActiveSubscription } = useSubscription();
  const { showModal, dismissModal, isModalOpen, currentFeature, isDismissed } = usePersistentModal();
  const { error: showErrorToast, success: showSuccessToast, warning: showWarningToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('quiz');
  const [activeTab, setActiveTab] = useState<'create' | 'quizzes' | 'explore' | 'history'>('create');
  const [quizSessions, setQuizSessions] = useState<QuizSession[]>([]);
  const [quizHistory, setQuizHistory] = useState<QuizAttempt[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [quizFolders, setQuizFolders] = useState<QuizFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#3B82F6');
  const [loading, setLoading] = useState(true);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  const [selectedSource, setSelectedSource] = useState<'library' | 'upload'>('library');
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<string>('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [quizTitle, setQuizTitle] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [hasCheckedModal, setHasCheckedModal] = useState(false);

  // Check and show modal after page load
  useEffect(() => {
    const checkModal = async () => {
      if (user && !hasActiveSubscription() && !hasCheckedModal) {
        const dismissed = await isDismissed('quiz');
        if (!dismissed) {
          setTimeout(() => {
            showModal('quiz');
          }, 500);
        }
        setHasCheckedModal(true);
      }
    };

    if (!loading) {
      checkModal();
    }
  }, [user, loading, hasActiveSubscription, hasCheckedModal]);

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial && !loading) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, loading, showTutorial]);

  useEffect(() => {
    if (user) {
      fetchQuizSessions();
      fetchQuizHistory();
      fetchQuizFolders();
      if (selectedSource === 'library') {
        fetchLibraryItems();
      }
    }
  }, [user, activeTab, selectedSource, selectedFolder]);

  const fetchLibraryItems = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_library_items')
        .select('id, title, summary_text')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchLibraryItems' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchLibraryItems' });
        showErrorToast(message);
        return;
      }

      if (data) {
        setLibraryItems(data);
      }
    } catch (error) {
      const message = handleApiError(error, { component: 'QuizPage', action: 'fetchLibraryItems' });
      showErrorToast(message);
    }
  };

  const fetchQuizSessions = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    return PerformanceMonitor.measureAsync('QuizPage.fetchQuizSessions', async () => {
      try {
        const { data, error } = await supabase
        .from('quiz_sessions')
        .select('id, quiz_title, source_type, question_count, time_limit_minutes, difficulty_level, created_at, quiz_language, available_languages')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchQuizSessions' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchQuizSessions' });
        showErrorToast(message);
        setLoading(false);
        return;
      }

        if (data) {
          setQuizSessions(data);
        }
        setLoading(false);
      } catch (error) {
        const message = handleApiError(error, { component: 'QuizPage', action: 'fetchQuizSessions' });
        showErrorToast(message);
        setLoading(false);
      }
    });
  };

  const fetchQuizHistory = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    return PerformanceMonitor.measureAsync('QuizPage.fetchQuizHistory', async () => {
      try {
        const { data, error } = await supabase
        .from('quiz_attempts')
        .select(`
          *,
          quiz_sessions!inner(quiz_title)
        `)
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(20);

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchQuizHistory' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchQuizHistory' });
        showErrorToast(message);
        return;
      }

        if (data) {
          setQuizHistory(data as QuizAttempt[]);
        }
      } catch (error) {
        const message = handleApiError(error, { component: 'QuizPage', action: 'fetchQuizHistory' });
        showErrorToast(message);
      }
    });
  };

  const fetchQuizFolders = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('quiz_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchQuizFolders' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchQuizFolders' });
        showErrorToast(message);
        return;
      }

      if (data) {
        setQuizFolders(data);
      }
    } catch (error) {
      const message = handleApiError(error, { component: 'QuizPage', action: 'fetchQuizFolders' });
      showErrorToast(message);
    }
  };

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error } = await supabase
        .from('quiz_folders')
        .insert({
          user_id: user.id,
          name: newFolderName.trim(),
          color: newFolderColor
        });

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'handleCreateFolder' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'handleCreateFolder' });
        showErrorToast(message);
        return;
      }

      await fetchQuizFolders();
      setNewFolderName('');
      setNewFolderColor('#3B82F6');
      setShowCreateFolder(false);
      showSuccessToast('Folder created successfully');
    } catch (error) {
      const message = handleApiError(error, { component: 'QuizPage', action: 'handleCreateFolder' });
      showErrorToast(message);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return;
    const confirmed = await confirm('Delete this folder? Quizzes will not be deleted.', {
      title: 'Delete Folder',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      await supabase
        .from('quiz_sessions')
        .update({ folder_id: null })
        .eq('folder_id', folderId);

      const { error } = await supabase
        .from('quiz_folders')
        .delete()
        .eq('id', folderId);

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'handleDeleteFolder', metadata: { folderId } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'handleDeleteFolder', metadata: { folderId } });
        showErrorToast(message);
        return;
      }

      await fetchQuizFolders();
      setSelectedFolder('all');
      showSuccessToast('Folder deleted successfully');
    } catch (error) {
      const message = handleApiError(error, { component: 'QuizPage', action: 'handleDeleteFolder', metadata: { folderId } });
      showErrorToast(message);
    }
  };

  const handleMoveQuizToFolder = async (quizId: string, folderId: string | null) => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error } = await supabase
        .from('quiz_sessions')
        .update({ folder_id: folderId })
        .eq('id', quizId);

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'handleMoveQuizToFolder', metadata: { quizId, folderId } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'handleMoveQuizToFolder', metadata: { quizId, folderId } });
        showErrorToast(message);
        return;
      }

      await fetchQuizSessions();
    } catch (error) {
      const message = handleApiError(error, { component: 'QuizPage', action: 'handleMoveQuizToFolder', metadata: { quizId, folderId } });
      showErrorToast(message);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!user) return;

    if (selectedSource === 'library' && !selectedLibraryItem) {
      showErrorToast(t('quiz.select_library_item'));
      return;
    }

    if (selectedSource === 'upload' && !uploadedFile) {
      showErrorToast(t('quiz.upload_document'));
      return;
    }

    if (!quizTitle.trim()) {
      showErrorToast(t('quiz.enter_title'));
      return;
    }

    setGenerating(true);
    ErrorLogger.debug('Starting quiz generation', { component: 'QuizPage', action: 'handleGenerateQuiz', source: selectedSource, questionCount, difficulty, title: quizTitle });

    const timeoutId = setTimeout(() => {
      if (generating) {
        showWarningToast('Quiz generation is taking longer than expected. This might indicate an issue with the API configuration. Please check that ANTHROPIC_API_KEY is configured in your Supabase project settings.');
      }
    }, 30000);

    try {
      let textContent = '';
      let sourceId: string | undefined;

      if (selectedSource === 'library') {
        ErrorLogger.debug('Fetching content from library item', { component: 'QuizPage', action: 'handleGenerateQuiz', libraryItemId: selectedLibraryItem });
        const item = libraryItems.find(i => i.id === selectedLibraryItem);
        if (item) {
          textContent = item.summary_text;
          sourceId = item.id;
          ErrorLogger.debug('Library item found', { component: 'QuizPage', action: 'handleGenerateQuiz', libraryItemId: selectedLibraryItem, contentLength: textContent.length });
        } else {
          throw new Error('Selected library item not found');
        }
      } else {
        const fileType = uploadedFile!.name.split('.').pop()?.toUpperCase() || 'FILE';
        ErrorLogger.debug('Extracting text from file', { component: 'QuizPage', action: 'handleGenerateQuiz', fileType, fileName: uploadedFile!.name, fileSizeKB: (uploadedFile!.size / 1024).toFixed(2) });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const error = new Error('No active session');
          ErrorLogger.error(error, { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name });
          throw error;
        }
        ErrorLogger.debug('Active session verified', { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name });

        const formData = new FormData();
        formData.append('file', uploadedFile!);
        ErrorLogger.debug('FormData created, calling extract-text function', { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name });

        const extractStartTime = Date.now();
        const extractResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-text`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: formData,
          }
        );
        const extractDuration = Date.now() - extractStartTime;
        ErrorLogger.debug('Extract-text function responded', { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name, durationSeconds: (extractDuration / 1000).toFixed(2) });

        if (!extractResponse.ok) {
          const errorData = await extractResponse.json().catch(() => ({}));

          let userFriendlyError = errorData.error || `Text extraction failed: ${extractResponse.statusText}`;

          if (fileType === 'PPTX' && userFriendlyError.includes('no readable text')) {
            userFriendlyError += '\n\nTips for PowerPoint files:\n- Ensure slides contain actual text (not just images)\n- Check that text boxes are not empty\n- Try copying text from slides and pasting directly instead';
          } else if (fileType === 'DOCX' && userFriendlyError.includes('no readable text')) {
            userFriendlyError += '\n\nTips for Word documents:\n- Ensure document contains actual text (not just images/tables)\n- Check that document is not corrupted\n- Try saving as a new .docx file and uploading again';
          }

          const error = new Error(userFriendlyError);
          ErrorLogger.error(error, { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name, status: extractResponse.status, errorData });
          throw error;
        }

        ErrorLogger.debug('Extract-text succeeded, parsing response', { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name });
        const extractData = await extractResponse.json();
        ErrorLogger.debug('Extraction results', { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name, textLength: extractData?.text?.length || 0, pageCount: extractData?.pageCount || 'unknown', extractionMethod: extractData?.extractionMethod || 'unknown' });

        if (extractData?.text) {
          textContent = extractData.text;
          const wordCount = textContent.split(/\s+/).filter((w: string) => w.length > 0).length;
          ErrorLogger.info('Text extraction complete and validated', { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name, wordCount, textLength: textContent.length });
        } else {
          const error = new Error(extractData?.error || 'Failed to extract text from file');
          ErrorLogger.error(error, { component: 'QuizPage', action: 'handleGenerateQuiz', fileName: uploadedFile!.name });
          throw error;
        }
      }

      ErrorLogger.debug('Validating content length for quiz generation', { component: 'QuizPage', action: 'handleGenerateQuiz', textLength: textContent.length });
      if (textContent.length < 300) {
        ErrorLogger.warn('Content too short', { component: 'QuizPage', action: 'handleGenerateQuiz', textLength: textContent.length });
        const wordCount = textContent.split(/\s+/).filter((w: string) => w.length > 0).length;
        showErrorToast(
          `Content is too short to generate a meaningful quiz.\n\n` +
          `Current: ${textContent.length} characters (${wordCount} words)\n` +
          `Required: At least 300 characters\n\n` +
          `Please provide more content or try a different file.`
        );
        setGenerating(false);
        clearTimeout(timeoutId);
        return;
      }
      ErrorLogger.info('Content length validated', { component: 'QuizPage', action: 'handleGenerateQuiz', textLength: textContent.length });

      ErrorLogger.debug('Sending quiz generation request to Edge Function', { component: 'QuizPage', action: 'handleGenerateQuiz', textLength: textContent.length, questionCount, difficulty, sourceType: selectedSource === 'library' ? 'library_item' : 'uploaded_document', quizTitle: quizTitle.trim() });

      const quizGenStartTime = Date.now();
      const { data: quizData, error: invokeError } = await supabase.functions.invoke('generate-quiz', {
        body: {
          text: textContent,
          questionCount,
          difficulty,
          sourceType: selectedSource === 'library' ? 'library_item' : 'uploaded_document',
          sourceId,
          quizTitle: quizTitle.trim(),
          targetLanguage,
        }
      });
      const quizGenDuration = Date.now() - quizGenStartTime;
      ErrorLogger.debug('Quiz generation completed', { component: 'QuizPage', action: 'handleGenerateQuiz', durationSeconds: (quizGenDuration / 1000).toFixed(2) });

      if (invokeError) {
        const error = new Error(invokeError.message || 'Failed to generate quiz');
        ErrorLogger.error(error, { component: 'QuizPage', action: 'handleGenerateQuiz', metadata: { invokeError, questionCount, difficulty, sourceType: selectedSource } });
        throw error;
      }

      ErrorLogger.debug('Quiz generation response', { component: 'QuizPage', action: 'handleGenerateQuiz', success: quizData.success, questionCount: quizData.questionCount });

      if (quizData.success) {
        ErrorLogger.info('Quiz generated successfully', { component: 'QuizPage', action: 'handleGenerateQuiz', quizSessionId: quizData.quizSessionId, questionCount: quizData.questionCount });
        showSuccessToast(t('quiz.generation_success', { count: quizData.questionCount, difficulty: t(`quiz.difficulty_${difficulty}`) }));
        setQuizTitle('');
        setSelectedLibraryItem('');
        setUploadedFile(null);
        setTargetLanguage('en');
        setActiveTab('quizzes');
        ErrorLogger.debug('Refreshing quiz sessions list', { component: 'QuizPage', action: 'handleGenerateQuiz' });
        await fetchQuizSessions();
        ErrorLogger.info('Quiz creation flow complete', { component: 'QuizPage', action: 'handleGenerateQuiz', quizSessionId: quizData.quizSessionId });
      } else {
        const errorMessage = quizData.error || 'Failed to generate quiz';

        if (errorMessage.includes('API key') || errorMessage.includes('ANTHROPIC_API_KEY')) {
          throw new Error('Quiz generation failed: ANTHROPIC_API_KEY is not configured in Supabase Edge Functions. Please add it to your Supabase project settings under Edge Functions > Secrets.');
        } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
          throw new Error('Quiz generation failed: API quota exceeded. Please try again later or check your Anthropic API usage.');
        } else if (errorMessage.includes('parse') || errorMessage.includes('JSON') || errorMessage.includes('SyntaxError')) {
          throw new Error('Quiz generation encountered a formatting error from the AI service. This is usually temporary. Please try again.');
        } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new Error('Quiz generation timed out. The AI service may be busy. Please try again in a moment.');
        } else {
          throw new Error(errorMessage);
        }
      }
    } catch (error) {
      const errorMessage = handleApiError(error, { 
        component: 'QuizPage', 
        action: 'handleGenerateQuiz',
        metadata: { questionCount, difficulty, selectedSource }
      });
      
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
        component: 'QuizPage', 
        action: 'handleGenerateQuiz',
        metadata: { questionCount, difficulty, selectedSource }
      });
      
      showErrorToast(errorMessage);
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    const confirmed = await confirm(t('quiz.confirm_delete'), {
      title: t('quiz.confirm_delete_title') || 'Delete Quiz',
      variant: 'destructive',
      confirmText: t('quiz.delete') || 'Delete',
    });
    if (!confirmed) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error } = await supabase
        .from('quiz_sessions')
        .delete()
        .eq('id', quizId);

      if (error) {
        const message = handleSupabaseError(error, { component: 'QuizPage', action: 'handleDeleteQuiz', metadata: { quizId } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'handleDeleteQuiz', metadata: { quizId } });
        showErrorToast(message);
        return;
      }

      await fetchQuizSessions();
      showSuccessToast(t('quiz.deleted_successfully') || 'Quiz deleted successfully');
    } catch (error) {
      const message = handleApiError(error, { component: 'QuizPage', action: 'handleDeleteQuiz', metadata: { quizId } });
      showErrorToast(message);
    }
  };

  const handleStartQuiz = (quizId: string) => {
    setActiveQuizId(quizId);
  };

  const handleQuizComplete = () => {
    setActiveQuizId(null);
    fetchQuizHistory();
  };

  const handleQuizExit = async () => {
    const confirmed = await confirm(t('quiz.confirm_exit'), {
      title: t('quiz.confirm_exit_title') || 'Exit Quiz',
      variant: 'default',
      confirmText: t('quiz.exit') || 'Exit',
    });
    if (confirmed) {
      setActiveQuizId(null);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getDifficultyColor = (level: string) => {
    const colors = {
      easy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    };
    return colors[level as keyof typeof colors] || colors.medium;
  };

  const featureConfig = getFeatureConfig('quiz');

  if (activeQuizId) {
    return (
      <QuizTakingComponent
        quizId={activeQuizId}
        onComplete={handleQuizComplete}
        onExit={handleQuizExit}
      />
    );
  }

  return (
    <>
    <PersistentSubscriptionModal
      isOpen={isModalOpen && currentFeature === 'quiz'}
      onDismiss={dismissModal}
      featureName="quiz"
      featureTitle={featureConfig.title}
      benefits={featureConfig.benefits}
    />
    <div className={`min-h-screen ${getThemeGradient('bg')} p-6`}>
      <div className="w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <FileQuestion className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('quiz.title')}</h1>
          </div>

          <div className={`flex space-x-2 border-b ${getThemeBorder()}`}>
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'create'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t('quiz.create_quiz')}
            </button>
            <button
              onClick={() => setActiveTab('quizzes')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'quizzes'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t('quiz.my_quizzes')} ({quizSessions.length})
            </button>
            <button
              onClick={() => setActiveTab('explore')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'explore'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <span className="flex items-center space-x-2">
                <Folder className="h-4 w-4" />
                <span>Explore</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'history'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t('quiz.history')} ({quizHistory.length})
            </button>
          </div>
        </div>

        {activeTab === 'create' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">{t('quiz.create_new')}</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('quiz.quiz_title')}
                </label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder={t('quiz.quiz_title_placeholder')}
                  maxLength={200}
                  className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('quiz.content_source')}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedSource('library')}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      selectedSource === 'library'
                        ? `${getThemeBorder()} bg-opacity-10 dark:bg-opacity-20`
                        : `${getThemeBorder()} opacity-50`
                    }`}
                  >
                    <BookOpen className="h-6 w-6 mx-auto mb-2" />
                    <span className="font-medium">{t('quiz.from_library')}</span>
                  </button>
                  <button
                    onClick={() => setSelectedSource('upload')}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      selectedSource === 'upload'
                        ? `${getThemeBorder()} bg-opacity-10 dark:bg-opacity-20`
                        : `${getThemeBorder()} opacity-50`
                    }`}
                  >
                    <Upload className="h-6 w-6 mx-auto mb-2" />
                    <span className="font-medium">{t('quiz.upload_file')}</span>
                  </button>
                </div>
              </div>

              {selectedSource === 'library' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quiz.select_item')}
                  </label>
                  <select
                    value={selectedLibraryItem}
                    onChange={(e) => setSelectedLibraryItem(e.target.value)}
                    className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                  >
                    <option value="">{t('quiz.choose_item')}</option>
                    {libraryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedSource === 'upload' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quiz.upload_document_label')}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.pptx"
                    onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                    className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quiz.question_count')}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-center mt-2">
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{questionCount}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">{t('quiz.questions')}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quiz.difficulty_level')}
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                    className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                  >
                    <option value="easy">{t('quiz.difficulty_easy')}</option>
                    <option value="medium">{t('quiz.difficulty_medium')}</option>
                    <option value="hard">{t('quiz.difficulty_hard')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('quiz.quiz_language')}
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                  >
                    <option value="en">{t('quiz.language_en')}</option>
                    <option value="ar">{t('quiz.language_ar')}</option>
                    <option value="fr">{t('quiz.language_fr')}</option>
                    <option value="tr">{t('quiz.language_tr')}</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerateQuiz}
                disabled={generating || !quizTitle.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>{t('quiz.generating')}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    <span>{t('quiz.generate')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'quizzes' && (
          <div className="space-y-4">
            {loading ? (
              <LoadingSkeleton type="card" count={3} />
            ) : quizSessions.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
                <FileQuestion className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">{t('quiz.no_quizzes')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">{t('quiz.create_first')}</p>
              </div>
            ) : (
              quizSessions.map((quiz) => (
                <div key={quiz.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {quiz.quiz_title}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center">
                          <FileQuestion className="h-4 w-4 mr-1" />
                          {quiz.question_count} {t('quiz.questions')}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(quiz.difficulty_level)}`}>
                          {quiz.difficulty_level.toUpperCase()}
                        </span>
                        <span>{new Date(quiz.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleStartQuiz(quiz.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                      >
                        <Play className="h-4 w-4" />
                        <span>{t('quiz.start')}</span>
                      </button>
                      <button
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'explore' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar with Folders */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                    <Folder className="h-5 w-5" />
                    <span>Folders</span>
                  </h3>
                  <button
                    onClick={() => setShowCreateFolder(true)}
                    className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {showCreateFolder && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg space-y-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      className={`w-full px-3 py-2 text-sm border ${getThemeBorder()} rounded-lg focus:outline-none ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={newFolderColor}
                        onChange={(e) => setNewFolderColor(e.target.value)}
                        className="h-8 w-12 rounded cursor-pointer"
                      />
                      <button
                        onClick={handleCreateFolder}
                        className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setShowCreateFolder(false)}
                        className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-400 transition dark:bg-gray-600 dark:text-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedFolder('all')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition ${
                      selectedFolder === 'all'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    All Quizzes
                  </button>
                  <button
                    onClick={() => setSelectedFolder('uncategorized')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition ${
                      selectedFolder === 'uncategorized'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    Uncategorized
                  </button>

                  {quizFolders.map((folder) => (
                    <div key={folder.id} className="group flex items-center">
                      <button
                        onClick={() => setSelectedFolder(folder.id)}
                        className={`flex-1 text-left px-3 py-2 rounded-lg transition ${
                          selectedFolder === folder.id
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: folder.color }}
                          />
                          <span>{folder.name}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:text-red-800 transition dark:text-red-400 dark:hover:text-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Content - Quizzes */}
            <div className="lg:col-span-3">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {selectedFolder === 'all' ? 'All Quizzes' :
                     selectedFolder === 'uncategorized' ? 'Uncategorized Quizzes' :
                     quizFolders.find(f => f.id === selectedFolder)?.name || 'Quizzes'}
                  </h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search quizzes..."
                      className={`pl-10 pr-4 py-2 border ${getThemeBorder()} rounded-lg focus:outline-none ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {quizSessions
                    .filter(quiz => {
                      if (selectedFolder === 'all') return true;
                      if (selectedFolder === 'uncategorized') return !quiz.folder_id;
                      return quiz.folder_id === selectedFolder;
                    })
                    .filter(quiz => quiz.quiz_title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
                    .map((quiz) => (
                      <div key={quiz.id} className={`border ${getThemeBorder()} opacity-60 dark:opacity-40 rounded-lg p-4 hover:shadow-md transition`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{quiz.quiz_title}</h4>
                            <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                              <span>{quiz.question_count} questions</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(quiz.difficulty_level)}`}>
                                {quiz.difficulty_level}
                              </span>
                              {quiz.time_limit_minutes && (
                                <span className="flex items-center">
                                  <Clock className="h-4 w-4 mr-1" />
                                  {quiz.time_limit_minutes}m
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <select
                              onChange={(e) => handleMoveQuizToFolder(quiz.id, e.target.value || null)}
                              value={quiz.folder_id || ''}
                              className={`px-3 py-1 text-sm border ${getThemeBorder()} rounded-lg focus:outline-none ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <option value="">Move to...</option>
                              <option value="">Uncategorized</option>
                              {quizFolders.map(folder => (
                                <option key={folder.id} value={folder.id}>{folder.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleStartQuiz(quiz.id)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center space-x-2"
                            >
                              <Play className="h-4 w-4" />
                              <span>Start</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {quizSessions.filter(quiz => {
                  if (selectedFolder === 'all') return true;
                  if (selectedFolder === 'uncategorized') return !quiz.folder_id;
                  return quiz.folder_id === selectedFolder;
                }).length === 0 && (
                  <div className="text-center py-12">
                    <Folder className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">No quizzes in this folder</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {loading ? (
              <LoadingSkeleton type="card" count={3} />
            ) : quizHistory.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
                <Trophy className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">{t('quiz.no_attempts')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">{t('quiz.complete_first')}</p>
              </div>
            ) : (
              quizHistory.map((attempt) => (
                <div key={attempt.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {attempt.quiz_sessions.quiz_title}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center">
                          <Trophy className="h-4 w-4 mr-1" />
                          {attempt.score_percentage.toFixed(1)}% {t('quiz.score')}
                        </span>
                        <span className="text-green-600 dark:text-green-400">
                          {attempt.correct_count} {t('quiz.correct')}
                        </span>
                        <span className="text-red-600 dark:text-red-400">
                          {attempt.incorrect_count} {t('quiz.incorrect')}
                        </span>
                        <span className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatTime(attempt.time_taken_seconds)}
                        </span>
                        <span>{new Date(attempt.completed_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {attempt.score_percentage.toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {ConfirmModal}

      {/* Quiz Tutorial */}
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
    </>
  );
});
