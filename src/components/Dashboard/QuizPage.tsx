import React, { useState, useEffect, useRef } from 'react';
import { FileQuestion, Plus, Clock, Trophy, Play, Trash2, Upload, BookOpen, Folder, Search, Globe, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';
import { QuizTakingComponent } from './QuizTakingComponent';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSubscriptionUpsellGate } from '../../contexts/SubscriptionUpsellGateContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { PerformanceMonitor } from '../../utils/performanceMonitor';
import { useConfirm } from '../../hooks/useConfirm';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { GlobalExamDetailModal } from './GlobalExamDetailModal';
import { ALL_QUIZ_QUESTION_TYPES } from '../../utils/academicsGenerationPreferences';
import { throwIfEdgeFunctionInvokeFailed } from '../../utils/edgeFunctionInvoke';

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

interface GlobalExam {
  id: string;
  exam_name: string;
  exam_code: string;
  description: string;
  country: string;
  region?: string;
  exam_type: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  total_questions: number;
  time_limit_minutes: number;
  subject?: string;
  passing_score?: number;
  is_active: boolean;
}

interface GlobalExamAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  score_percentage: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  time_taken_seconds: number;
  started_at: string;
  completed_at: string;
  global_exams: GlobalExam;
}

export const QuizPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getThemeBorder, getThemeFocusRing, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { setBusy } = useSubscriptionUpsellGate();
  const { error: showErrorToast, success: showSuccessToast, warning: showWarningToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('quiz');
  const [activeTab, setActiveTab] = useState<'create' | 'quizzes' | 'explore' | 'history' | 'exams'>('create');
  const [quizViewMode, setQuizViewMode] = useState<'quizzes' | 'exams'>('quizzes');
  const [quizSessions, setQuizSessions] = useState<QuizSession[]>([]);
  const [quizHistory, setQuizHistory] = useState<QuizAttempt[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryItemsLoading, setLibraryItemsLoading] = useState(false);
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
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const libraryPickerRef = useRef<HTMLDivElement>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [quizTitle, setQuizTitle] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [globalExams, setGlobalExams] = useState<GlobalExam[]>([]);
  const [selectedExam, setSelectedExam] = useState<GlobalExam | null>(null);
  const [examCountry, setExamCountry] = useState<string>('all');
  const [examType, setExamType] = useState<string>('all');
  const [examAttempts, setExamAttempts] = useState<GlobalExamAttempt[]>([]);
  const [incompleteExams, setIncompleteExams] = useState<GlobalExamAttempt[]>([]);

  useEffect(() => {
    setBusy('quiz', !!activeQuizId);
    return () => setBusy('quiz', false);
  }, [activeQuizId, setBusy]);

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
      // Fetch data based on active tab and view mode
      if (quizViewMode === 'exams') {
        // Global Exams mode
        if (activeTab === 'explore') {
          fetchGlobalExams();
        } else if (activeTab === 'history') {
          fetchExamAttempts();
        } else if (activeTab === 'quizzes') {
          fetchIncompleteExams();
        }
        // Create tab doesn't need data fetching in exams mode
      } else {
        // My Quizzes mode
        fetchQuizSessions();
        fetchQuizHistory();
        fetchQuizFolders();
        if (selectedSource === 'library') {
          fetchLibraryItems();
        }
      }
    }
  }, [user, activeTab, selectedSource, selectedFolder, quizViewMode, examCountry, examType, debouncedSearchQuery]);

  // Dedicated effect: always load library items when "From Library" is selected
  useEffect(() => {
    if (user && selectedSource === 'library') {
      fetchLibraryItems();
    }
  }, [user, selectedSource]);

  // Close library picker on click outside or Escape
  useEffect(() => {
    if (!libraryPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (libraryPickerRef.current && !libraryPickerRef.current.contains(e.target as Node)) {
        setLibraryPickerOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLibraryPickerOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [libraryPickerOpen]);

  const fetchLibraryItems = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setLibraryItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_library_items')
        .select('id, title, summary_text')
        .order('created_at', { ascending: false })
        .limit(100);

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
    } finally {
      setLibraryItemsLoading(false);
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

  const fetchExamAttempts = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    return PerformanceMonitor.measureAsync('QuizPage.fetchExamAttempts', async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('global_exam_attempts')
          .select(`
            *,
            global_exams (*)
          `)
          .eq('user_id', user.id)
          .order('completed_at', { ascending: false })
          .limit(50);

        if (error) {
          const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchExamAttempts' });
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchExamAttempts' });
          showErrorToast(message);
          setLoading(false);
          return;
        }

        if (data) {
          setExamAttempts(data as GlobalExamAttempt[]);
        }
        setLoading(false);
      } catch (error) {
        const message = handleApiError(error, { component: 'QuizPage', action: 'fetchExamAttempts' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchExamAttempts' });
        showErrorToast(message);
        setLoading(false);
      }
    });
  };

  const fetchIncompleteExams = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    return PerformanceMonitor.measureAsync('QuizPage.fetchIncompleteExams', async () => {
      try {
        setLoading(true);
        // Fetch all attempts for the user
        const { data: allAttempts, error } = await supabase
          .from('global_exam_attempts')
          .select(`
            *,
            global_exams (*)
          `)
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(100);

        if (error) {
          const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchIncompleteExams' });
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchIncompleteExams' });
          showErrorToast(message);
          setLoading(false);
          return;
        }

        if (allAttempts) {
          // Filter for incomplete exams: high unanswered count or very short time taken
          const incomplete = allAttempts.filter((attempt: GlobalExamAttempt) => {
            const exam = attempt.global_exams;
            if (!exam || exam.total_questions === 0) return false;
            
            const unansweredRatio = attempt.unanswered_count / exam.total_questions;
            
            // Check time ratio only if time limit is valid (> 0)
            let timeRatio = 0;
            if (exam.time_limit_minutes > 0) {
              timeRatio = attempt.time_taken_seconds / (exam.time_limit_minutes * 60);
            }
            
            // Consider incomplete if:
            // 1. More than 50% unanswered, OR
            // 2. Less than 10% of time limit used (likely abandoned) - only if time limit exists
            return unansweredRatio > 0.5 || (exam.time_limit_minutes > 0 && timeRatio < 0.1);
          }).filter((attempt: GlobalExamAttempt) => attempt.global_exams !== null) as GlobalExamAttempt[];

          setIncompleteExams(incomplete);
        }
        setLoading(false);
      } catch (error) {
        const message = handleApiError(error, { component: 'QuizPage', action: 'fetchIncompleteExams' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchIncompleteExams' });
        showErrorToast(message);
        setLoading(false);
      }
    });
  };

  const fetchGlobalExams = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    return PerformanceMonitor.measureAsync('QuizPage.fetchGlobalExams', async () => {
      try {
        setLoading(true);

        let query = supabase
          .from('global_exams')
          .select('*')
          .eq('is_active', true);

        // Apply country filter
        if (examCountry !== 'all') {
          query = query.eq('country', examCountry);
        }

        // Apply exam type filter
        if (examType !== 'all') {
          query = query.eq('exam_type', examType);
        }

        // Apply search filter (using debounced value)
        if (debouncedSearchQuery) {
          const escapedQuery = debouncedSearchQuery.replace(/[%_*]/g, '\\$&');
          query = query.or(`exam_name.ilike.*${escapedQuery}*,exam_code.ilike.*${escapedQuery}*,description.ilike.*${escapedQuery}*`);
        }

        query = query.order('exam_name');

        const { data, error } = await query;

        if (error) {
          const message = handleSupabaseError(error, { component: 'QuizPage', action: 'fetchGlobalExams' });
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizPage', action: 'fetchGlobalExams' });
          showErrorToast(message);
          return;
        }

        setGlobalExams(data || []);
      } catch (err) {
        const message = handleApiError(err, { component: 'QuizPage', action: 'fetchGlobalExams' });
        ErrorLogger.error(err instanceof Error ? err : new Error(String(err)), { component: 'QuizPage', action: 'fetchGlobalExams' });
        showErrorToast(message);
      } finally {
        setLoading(false);
      }
    });
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
          questionTypes: [...ALL_QUIZ_QUESTION_TYPES],
        }
      });
      const quizGenDuration = Date.now() - quizGenStartTime;
      ErrorLogger.debug('Quiz generation completed', { component: 'QuizPage', action: 'handleGenerateQuiz', durationSeconds: (quizGenDuration / 1000).toFixed(2) });

      throwIfEdgeFunctionInvokeFailed(quizData, invokeError);

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
    try {
      ErrorLogger.debug('Quiz exit requested', {
        component: 'QuizPage',
        action: 'handleQuizExit',
        userId: user?.id,
        metadata: { activeQuizId }
      });

      const confirmed = await confirm(t('quiz.confirm_exit'), {
        title: t('quiz.confirm_exit_title') || 'Exit Quiz',
        variant: 'default',
        confirmText: t('quiz.exit') || 'Exit',
      });

      if (confirmed) {
        ErrorLogger.debug('Quiz exit confirmed, resetting activeQuizId', {
          component: 'QuizPage',
          action: 'handleQuizExit',
          userId: user?.id,
          metadata: { activeQuizId }
        });
        setActiveQuizId(null);
        // Ensure we're back to the quizzes tab
        setActiveTab('quizzes');
      } else {
        ErrorLogger.debug('Quiz exit cancelled', {
          component: 'QuizPage',
          action: 'handleQuizExit',
          userId: user?.id
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, {
        component: 'QuizPage',
        action: 'handleQuizExit',
        userId: user?.id,
        metadata: { activeQuizId, error: 'Exit confirmation failed' }
      });
      // Fallback: exit without confirmation if confirm dialog fails
      showWarningToast('Exiting quiz...');
      setActiveQuizId(null);
      setActiveTab('quizzes');
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
    <div className="w-full min-h-0 p-4 sm:p-6">
      <div className="w-full">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <FileQuestion className={`h-8 w-8 ${getThemeTextPrimary()}`} />
              <h1 className={`text-3xl font-bold ${getThemeTextPrimary()}`}>{t('quiz.page_title') || t('quiz.quizzes_and_exams') || 'Quizzes & Exams'}</h1>
            </div>
            
            {/* Toggle between Quizzes and Exams - always visible */}
            <div className={`flex items-center space-x-3 ${getThemeSubtle('ui')} rounded-lg p-1`}>
              <button
                onClick={() => {
                  setQuizViewMode('quizzes');
                  if (activeTab === 'exams') {
                    setActiveTab('quizzes');
                  }
                }}
                className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                  quizViewMode === 'quizzes'
                    ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                    : `${getThemeTextSecondary()} hover:opacity-80`
                }`}
              >
                <FileQuestion className="h-5 w-5 inline mr-2" />
                {t('quiz.my_quizzes') || 'My Quizzes'}
              </button>
              <button
                onClick={() => {
                  setQuizViewMode('exams');
                  if (activeTab === 'quizzes') {
                    setActiveTab('explore');
                  }
                }}
                className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                  quizViewMode === 'exams'
                    ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                    : `${getThemeTextSecondary()} hover:opacity-80`
                }`}
              >
                <Globe className="h-5 w-5 inline mr-2" />
                {t('quiz.global_exams') || 'Global Exams'}
              </button>
            </div>
          </div>

          <div className={`inline-flex items-center space-x-3 rounded-lg p-1 ${getThemeSubtle('ui')}`}>
            <button
              onClick={() => setActiveTab('create')}
              className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                activeTab === 'create'
                  ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              {t('quiz.create_quiz')}
            </button>
            <button
              onClick={() => {
                setActiveTab('quizzes');
                if (quizViewMode !== 'exams') {
                  setQuizViewMode('quizzes');
                }
              }}
              className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                activeTab === 'quizzes'
                  ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              {quizViewMode === 'exams' 
                ? `${t('quiz.my_exams') || 'My Exams'} (${incompleteExams.length})`
                : `${t('quiz.my_quizzes')} (${quizSessions.length})`
              }
            </button>
            <button
              onClick={() => setActiveTab('explore')}
              className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                activeTab === 'explore'
                  ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <span className="flex items-center space-x-2">
                <Folder className="h-4 w-4" />
                <span>Explore</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                activeTab === 'history'
                  ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              {quizViewMode === 'exams'
                ? `${t('quiz.exam_history') || 'Exam History'} (${examAttempts.length})`
                : `${t('quiz.history')} (${quizHistory.length})`
              }
            </button>
          </div>
        </div>

        {activeTab === 'create' && (
          <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
            {quizViewMode === 'exams' ? (
              <div className="text-center py-12">
                <Globe className={`h-16 w-16 ${getThemeTextMuted()} mx-auto mb-4`} />
                <h2 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-2`}>
                  {t('quiz.exams_cannot_be_created') || 'Global exams cannot be created'}
                </h2>
                <p className={`${getThemeTextSecondary()} mb-4`}>
                  {t('quiz.exams_cannot_be_created_message') || "Global exams cannot be created. Switch to 'My Quizzes' mode to create custom quizzes."}
                </p>
                <button
                  onClick={() => setQuizViewMode('quizzes')}
                  className={`px-6 py-3 ${getThemeGradient('ui')} text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-all font-medium`}
                >
                  {t('quiz.switch_to_quizzes') || 'Switch to My Quizzes'}
                </button>
              </div>
            ) : (
              <>
                <h2 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-5`}>{t('quiz.create_new')}</h2>

            <div className="space-y-4">
              {/* Quiz Title */}
              <div>
                <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
                  {t('quiz.quiz_title')}
                </label>
                <input
                  type="text"
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder={t('quiz.quiz_title_placeholder')}
                  maxLength={200}
                  className="w-full px-3 py-2 input-clean text-sm"
                />
              </div>

              {/* Content Source */}
              <div>
                <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
                  {t('quiz.content_source')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSource('library')}
                    className={`p-2.5 border rounded-md transition-colors text-sm ${getThemeTextPrimary()} ${
                      selectedSource === 'library'
                        ? `${getThemeCardBorder()} ${getThemeSubtle('ui')}`
                        : `${getThemeCardBorder()} hover:opacity-60 bg-transparent`
                    }`}
                  >
                    <BookOpen className={`h-4 w-4 mx-auto mb-1 ${getThemeTextPrimary()}`} />
                    <span className={`font-medium ${getThemeTextPrimary()}`}>{t('quiz.from_library')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSource('upload')}
                    className={`p-2.5 border rounded-md transition-colors text-sm ${getThemeTextPrimary()} ${
                      selectedSource === 'upload'
                        ? `${getThemeCardBorder()} ${getThemeSubtle('ui')}`
                        : `${getThemeCardBorder()} hover:opacity-60 bg-transparent`
                    }`}
                  >
                    <Upload className={`h-4 w-4 mx-auto mb-1 ${getThemeTextPrimary()}`} />
                    <span className={`font-medium ${getThemeTextPrimary()}`}>{t('quiz.upload_file')}</span>
                  </button>
                </div>
              </div>

              {/* Library Item or Upload File — searchable picker */}
              {selectedSource === 'library' && (
                <div ref={libraryPickerRef} className="relative">
                  <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
                    {t('quiz.select_item')}
                  </label>
                  <button
                    type="button"
                    onClick={() => !libraryItemsLoading && setLibraryPickerOpen((o) => !o)}
                    disabled={libraryItemsLoading}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-all min-h-[42px] ${getThemeCardBg()} ${getThemeBorder()} hover:border-opacity-80 disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <span className={`truncate text-sm ${selectedLibraryItem ? getThemeTextPrimary() : getThemeTextSecondary()}`}>
                      {libraryItemsLoading
                        ? t('quiz.loading_library')
                        : selectedLibraryItem
                          ? (libraryItems.find((i) => i.id === selectedLibraryItem)?.title ?? selectedLibraryItem)
                          : libraryItems.length === 0
                            ? t('quiz.no_library_items_yet')
                            : t('quiz.choose_item')}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${libraryPickerOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {libraryPickerOpen && (
                    <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-lg overflow-hidden ${getThemeCardBg()} ${getThemeBorder()}`}>
                      <div className={`p-2 border-b sticky top-0 z-10 ${getThemeBorder()}`}>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/5 dark:bg-white/5">
                          <Search className="h-4 w-4 shrink-0 opacity-60" />
                          <input
                            type="text"
                            value={librarySearchQuery}
                            onChange={(e) => setLibrarySearchQuery(e.target.value)}
                            placeholder={t('quiz.search_library_placeholder')}
                            className="flex-1 bg-transparent text-sm outline-none min-w-0"
                          />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto p-1">
                        {libraryItemsLoading ? (
                          <div className={`py-4 text-center text-sm ${getThemeTextSecondary()}`}>{t('quiz.loading_library')}</div>
                        ) : (() => {
                          const q = librarySearchQuery.trim().toLowerCase();
                          const filtered = q
                            ? libraryItems.filter(
                                (i) =>
                                  i.title.toLowerCase().includes(q) ||
                                  (i.summary_text && i.summary_text.toLowerCase().includes(q))
                              )
                            : libraryItems;
                          if (filtered.length === 0) {
                            return (
                              <div className={`py-4 text-center text-sm ${getThemeTextSecondary()}`}>
                                {libraryItems.length === 0 ? t('quiz.no_library_items_yet') : t('quiz.no_matches')}
                              </div>
                            );
                          }
                          return (
                            <ul className="space-y-0.5">
                              {filtered.map((item) => (
                                <li key={item.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedLibraryItem(item.id);
                                      setLibraryPickerOpen(false);
                                      setLibrarySearchQuery('');
                                    }}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${item.id === selectedLibraryItem ? 'bg-primary/15 text-primary' : `${getThemeTextPrimary()} hover:bg-black/5 dark:hover:bg-white/5`}`}
                                  >
                                    {item.id === selectedLibraryItem && <Check className="h-4 w-4 shrink-0" />}
                                    <span className="flex-1 min-w-0">
                                      <span className="font-medium block truncate">{item.title}</span>
                                      {item.summary_text && (
                                        <span className={`text-xs block truncate mt-0.5 ${getThemeTextSecondary()}`}>
                                          {item.summary_text.slice(0, 80)}{item.summary_text.length > 80 ? '…' : ''}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedSource === 'upload' && (
                <div>
                  <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
                    {t('quiz.upload_document_label')}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.pptx"
                    onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 input-clean text-sm"
                  />
                </div>
              )}

              {/* Quiz Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
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
                  <div className="text-center mt-1.5">
                    <span className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{questionCount}</span>
                    <span className={`text-xs ${getThemeTextSecondary()} ml-1.5`}>{t('quiz.questions')}</span>
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
                    {t('quiz.difficulty_level')}
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                    className="w-full px-3 py-2 input-clean text-sm"
                  >
                    <option value="easy">{t('quiz.difficulty_easy')}</option>
                    <option value="medium">{t('quiz.difficulty_medium')}</option>
                    <option value="hard">{t('quiz.difficulty_hard')}</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-1.5`}>
                    {t('quiz.quiz_language')}
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full px-3 py-2 input-clean text-sm"
                  >
                    <option value="en">{t('quiz.language_en')}</option>
                    <option value="ar">{t('quiz.language_ar')}</option>
                    <option value="fr">{t('quiz.language_fr')}</option>
                    <option value="tr">{t('quiz.language_tr')}</option>
                  </select>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerateQuiz}
                disabled={generating || !quizTitle.trim()}
                className={`w-full py-2 ${getThemeGradient('ui')} text-white rounded-md hover:opacity-90 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2 text-sm`}
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>{t('quiz.generating')}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>{t('quiz.generate')}</span>
                  </>
                )}
              </button>
            </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'quizzes' && (
          <div className="space-y-4">
            {quizViewMode === 'quizzes' ? (
              /* My Quizzes View */
              <>
                {loading ? (
                  <LoadingSkeleton type="card" count={3} />
                ) : quizSessions.length === 0 ? (
                  <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-12 text-center`}>
                    <FileQuestion className={`h-16 w-16 ${getThemeTextMuted()} mx-auto mb-4`} />
                    <p className={`${getThemeTextSecondary()} mb-2`}>{t('quiz.no_quizzes')}</p>
                    <p className={`text-sm ${getThemeTextMuted()}`}>{t('quiz.create_first')}</p>
                  </div>
                ) : (
                  quizSessions.map((quiz) => (
                    <div key={quiz.id} className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>
                            {quiz.quiz_title}
                          </h3>
                          <div className={`flex items-center space-x-4 text-sm ${getThemeTextSecondary()}`}>
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
                            className={`px-4 py-2 ${getThemeGradient('ui')} text-white dark:text-gray-900 rounded-lg hover:opacity-90 flex items-center space-x-2`}
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
              </>
            ) : (
              /* My Exams View - Incomplete Exams */
              <>
                {loading ? (
                  <LoadingSkeleton type="card" count={3} />
                ) : incompleteExams.length === 0 ? (
                  <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-12 text-center`}>
                    <Clock className={`h-16 w-16 ${getThemeTextMuted()} mx-auto mb-4`} />
                    <p className={`${getThemeTextSecondary()} mb-2`}>{t('quiz.no_incomplete_exams') || 'No incomplete exams'}</p>
                    <p className={`text-sm ${getThemeTextMuted()}`}>{t('quiz.start_exam_to_continue') || 'Start an exam to continue it later'}</p>
                  </div>
                ) : (
                  incompleteExams
                    .filter((attempt) => attempt.global_exams !== null)
                    .map((attempt) => {
                      const exam = attempt.global_exams!;
                      const progress = Math.max(0, Math.min(100, ((exam.total_questions - attempt.unanswered_count) / exam.total_questions) * 100));
                      return (
                      <div key={attempt.id} className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>
                              {exam.exam_name}
                            </h3>
                            <div className={`flex items-center space-x-4 text-sm ${getThemeTextSecondary()} mb-3`}>
                              <span className="flex items-center">
                                <FileQuestion className="h-4 w-4 mr-1" />
                                {exam.total_questions - attempt.unanswered_count} / {exam.total_questions} {t('quiz.questions')}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                exam.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                exam.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                              }`}>
                                {exam.difficulty_level}
                              </span>
                              <span>{new Date(attempt.started_at).toLocaleDateString()}</span>
                            </div>
                            <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-2 mb-2`}>
                              <div 
                                className={`h-2 rounded-full ${getThemeGradient('ui')}`}
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                            <p className={`text-xs ${getThemeTextMuted()}`}>{Math.round(progress)}% {t('quiz.completed') || 'completed'}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => setSelectedExam(exam)}
                              className={`px-4 py-2 ${getThemeGradient('ui')} text-white dark:text-gray-900 rounded-lg hover:opacity-90 flex items-center space-x-2`}
                            >
                              <Play className="h-4 w-4" />
                              <span>{t('quiz.continue_exam') || 'Continue Exam'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'explore' && (
          <>
            {quizViewMode === 'exams' ? (
              /* Global Exams View - Explore */
              <div className="space-y-4">
                {/* Filters */}
                <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6 mb-6`}>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>Country/Region</label>
                      <select
                        value={examCountry}
                        onChange={(e) => setExamCountry(e.target.value)}
                        className={`w-full px-4 py-2 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                      >
                        <option value="all">All Countries</option>
                        <option value="USA">USA</option>
                        <option value="UK">United Kingdom</option>
                        <option value="Canada">Canada</option>
                        <option value="Germany">Germany</option>
                        <option value="France">France</option>
                        <option value="Turkey">Turkey</option>
                        <option value="UAE">UAE</option>
                        <option value="Saudi Arabia">Saudi Arabia</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>Exam Type</label>
                      <select
                        value={examType}
                        onChange={(e) => setExamType(e.target.value)}
                        className={`w-full px-4 py-2 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                      >
                        <option value="all">All Types</option>
                        <option value="standardized">Standardized Tests</option>
                        <option value="entrance">Entrance Exams</option>
                        <option value="proficiency">Language Proficiency</option>
                        <option value="certification">Professional Certification</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>Search</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search exams..."
                          className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                        {loading && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className={`animate-spin h-4 w-4 border-2 ${getThemeTextMuted()} border-t-transparent rounded-full`}></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exams Grid */}
                {loading ? (
                  <LoadingSkeleton type="card" count={3} />
                ) : globalExams.length === 0 ? (
                  <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-12 text-center`}>
                    <Globe className={`h-16 w-16 ${getThemeTextMuted()} mx-auto mb-4`} />
                    <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>No exams found</h3>
                    <p className={getThemeTextSecondary()}>Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {globalExams.map((exam) => (
                      <div key={exam.id} className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6 cursor-pointer`}>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className={`text-xl font-bold ${getThemeTextPrimary()} mb-1`}>{exam.exam_name}</h3>
                            <p className={`text-sm ${getThemeTextMuted()}`}>{exam.exam_code}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            exam.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                            exam.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                          }`}>
                            {exam.difficulty_level}
                          </span>
                        </div>

                        <p className={`${getThemeTextSecondary()} text-sm mb-4 line-clamp-2`}>{exam.description}</p>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Globe className="h-4 w-4 mr-2" />
                            <span>{exam.country}</span>
                            {exam.region && <span className="ml-2">• {exam.region}</span>}
                          </div>
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <FileQuestion className="h-4 w-4 mr-2" />
                            <span>{exam.total_questions} questions</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Clock className="h-4 w-4 mr-2" />
                            <span>{exam.time_limit_minutes} minutes</span>
                          </div>
                          {exam.subject && (
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                              <BookOpen className="h-4 w-4 mr-2" />
                              <span>{exam.subject}</span>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setSelectedExam(exam)}
                          className={`w-full px-4 py-2 ${getThemeGradient('ui')} text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-all flex items-center justify-center space-x-2`}
                        >
                          <Play className="h-4 w-4" />
                          <span>Start Practice</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Quizzes View - Explore */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar with Folders */}
            <div className="lg:col-span-1">
              <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                    <Folder className="h-5 w-5" />
                    <span>Folders</span>
                  </h3>
                  <button
                    onClick={() => setShowCreateFolder(true)}
                    className="p-1 text-gray-900 hover:text-gray-700 dark:text-white dark:hover:text-gray-200"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {showCreateFolder && (
                  <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg space-y-2">
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
                        className={`flex-1 px-3 py-1 ${getThemeGradient('ui')} text-white dark:text-gray-900 text-sm rounded-lg hover:opacity-90 transition`}
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
                        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    All Quizzes
                  </button>
                  <button
                    onClick={() => setSelectedFolder('uncategorized')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition ${
                      selectedFolder === 'uncategorized'
                        ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
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
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
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
              <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
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
                      <div key={quiz.id} className={`border ${getThemeBorder()} opacity-60 dark:opacity-40 rounded-lg p-4`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{quiz.quiz_title}</h4>
                            <div className={`flex items-center space-x-4 text-sm ${getThemeTextSecondary()}`}>
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
                              className={`px-4 py-2 ${getThemeGradient('ui')} text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition flex items-center space-x-2`}
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
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {quizViewMode === 'exams' ? (
              /* Exam History View */
              <>
                {loading ? (
                  <LoadingSkeleton type="card" count={3} />
                ) : examAttempts.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-12 text-center">
                    <Trophy className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-2">{t('quiz.no_exam_attempts') || 'No exam attempts yet'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">{t('quiz.complete_exam_first') || 'Complete an exam to see your history'}</p>
                  </div>
                ) : (
                  examAttempts
                    .filter((attempt) => attempt.global_exams !== null)
                    .map((attempt) => {
                      const exam = attempt.global_exams!;
                      return (
                      <div key={attempt.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                              {exam.exam_name}
                            </h3>
                            <div className={`flex items-center space-x-4 text-sm ${getThemeTextSecondary()}`}>
                              <span className="flex items-center">
                                <Trophy className="h-4 w-4 mr-1" />
                                {attempt.score_percentage.toFixed(1)}% {t('quiz.exam_score') || 'Score'}
                              </span>
                              <span className="text-green-600 dark:text-green-400">
                                {attempt.correct_count} {t('quiz.exam_correct') || 'Correct'}
                              </span>
                              <span className="text-red-600 dark:text-red-400">
                                {attempt.incorrect_count} {t('quiz.exam_incorrect') || 'Incorrect'}
                              </span>
                              {attempt.unanswered_count > 0 && (
                                <span className="text-gray-600 dark:text-gray-400">
                                  {attempt.unanswered_count} {t('quiz.exam_unanswered') || 'Unanswered'}
                                </span>
                              )}
                              <span className="flex items-center">
                                <Clock className="h-4 w-4 mr-1" />
                                {formatTime(attempt.time_taken_seconds)}
                              </span>
                              <span>{new Date(attempt.completed_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="text-3xl font-bold text-gray-900 dark:text-white">
                            {attempt.score_percentage.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            ) : (
              /* Quiz History View */
              <>
                {loading ? (
                  <LoadingSkeleton type="card" count={3} />
                ) : quizHistory.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-12 text-center">
                    <Trophy className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 mb-2">{t('quiz.no_attempts')}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">{t('quiz.complete_first')}</p>
                  </div>
                ) : (
                  quizHistory.map((attempt) => (
                    <div key={attempt.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            {attempt.quiz_sessions.quiz_title}
                          </h3>
                          <div className={`flex items-center space-x-4 text-sm ${getThemeTextSecondary()}`}>
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
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {attempt.score_percentage.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
      {ConfirmModal}

      {/* Global Exam Detail Modal */}
      <GlobalExamDetailModal
        exam={selectedExam}
        isOpen={!!selectedExam}
        onClose={() => setSelectedExam(null)}
      />

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
