import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MoreVertical, Copy, Check, FileSearch, Download, BookOpen, GraduationCap, RefreshCw, ArrowLeft, PanelLeft } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { InputForm } from './InputForm';
import { ProcessingStatus } from './ProcessingStatus';
import { SummaryDisplay } from './SummaryDisplay';
import { HistoryPage } from './HistoryPage';
import { LibraryPage } from './LibraryPage';
import { InformationalPage } from './InformationalPage';
import { FeedbackPage } from './FeedbackPage';
import { ProfilePage } from './ProfilePage';
import { QuizPage } from './QuizPage';
import { EduPlayPage } from './EduPlayPage';
import { StudyRoomsPage } from './StudyRoomsPage';
import { AcademicsPage } from './Academics/AcademicsPage';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import { PersistentSubscriptionModal } from '../Subscription/PersistentSubscriptionModal';
import {
  usePersistentModal,
  getFeatureConfig,
  SUBSCRIPTION_PROCESSING_PAYWALL_SESSION_KEY,
} from '../../contexts/PersistentModalContext';
import type { FeatureType } from '../../contexts/PersistentModalContext';
import { useSubscriptionUpsellGate } from '../../contexts/SubscriptionUpsellGateContext';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { useTheme } from '../../contexts/ThemeContext';
import { GlobalChatAssistant } from '../ChatAssistant/GlobalChatAssistant';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { FreeFormToggle } from './BookMode/FreeFormToggle';
import { useI18n } from '../../contexts/I18nContext';
import { supabase } from '../../lib/supabase';
import { extractTextFromFile, extractTextFromImage } from '../../utils/fileProcessor';
import { processSummaryBatches, processFlashcardBatches, determineProcessingMode } from '../../utils/queueProcessor';
import { processMedicalContent, determineMedicalProcessingMode } from '../../utils/medicalQueueProcessor';
import { translateContent, AVAILABLE_LANGUAGES, needsTranslation, detectLanguage } from '../../utils/translation';
import { normalizeText, generateTextHash, checkCache, storeInCache } from '../../utils/deduplication';
import { haikuClient } from '../../utils/haikuClient';
import { handleApiError, handleSupabaseError, isOffline } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import type { AcademicsGenerationPreferences } from '../../utils/academicsGenerationPreferences';
import {
  dashboardHasRunnableOutput,
  mergeGenerationPreferences,
  prefsMatchDefaultCacheShape,
} from '../../utils/academicsGenerationPreferences';
import { throwIfEdgeFunctionInvokeFailed } from '../../utils/edgeFunctionInvoke';

export interface ProcessingState {
  stage: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  summaryChunks: string[];
  flashcards: Array<{ front: string; back: string }>;
  flashcardCount: number;
  mode: 'fast' | 'staged';
  medicalMode: boolean;
  medicalScore?: number;
  selectedLanguage: string;
  originalSummaryChunks: string[];
  originalFlashcards: Array<{ front: string; back: string }>;
  originalText: string;
  topics: string[];
  translating: boolean;
  error?: string;
  extractionMethod?: string;
  confidence?: number;
}

type DashboardSidebarView =
  | 'main'
  | 'history'
  | 'library'
  | 'informational'
  | 'feedback'
  | 'profile'
  | 'quiz'
  | 'eduplay'
  | 'academics'
  | 'study-rooms';

function mapDashboardViewToSoftUpsellFeature(view: DashboardSidebarView): FeatureType | null {
  switch (view) {
    case 'library':
      return 'library';
    case 'quiz':
      return 'quiz';
    case 'academics':
      return 'academics';
    default:
      return null;
  }
}

export const Dashboard: React.FC = () => {
  const { user, updateUsage } = useAuth();
  const { hasExceededTokenLimit, getTokensRemaining, hasActiveSubscription } = useSubscription();
  const { showModal, dismissModal, isModalOpen, currentFeature } = usePersistentModal();
  const { setBusy } = useSubscriptionUpsellGate();
  const { getBackgroundGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeGradient } = useTheme();
  const { t, dir } = useI18n();
  const isRtl = dir === 'rtl';
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('dashboard');
  const location = useLocation();
  const navigate = useNavigate();

  // Handle navigation state (e.g. Go Back from ContentViewPage with no history)
  useEffect(() => {
    const state = location.state as { tab?: string; loadHistoryId?: string } | null;
    if (state?.tab === 'history') {
      setCurrentView('history');
    }
    if (state?.loadHistoryId && user) {
      const loadId = state.loadHistoryId;
      supabase
        .from('user_history')
        .select('id, summary_text, flashcards_json, original_text_content, topics, original_file_name')
        .eq('id', loadId)
        .eq('user_id', user.id)
        .single()
        .then(({ data: row, error }) => {
          if (!error && row) {
            setLoadedHistoryEntry(row);
            setCurrentView('main');
            setProcessingState({
              stage: 'completed',
              progress: 100,
              message: '',
              summaryChunks: [row.summary_text],
              flashcards: row.flashcards_json,
              flashcardCount: row.flashcards_json?.length ?? 0,
              mode: 'fast',
              medicalMode: (row.original_file_name?.toLowerCase().includes('medical') ||
                (row.topics?.some((t: string) => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => t.toLowerCase().includes(med))) ?? false)),
              selectedLanguage: 'original',
              originalSummaryChunks: [row.summary_text],
              originalFlashcards: row.flashcards_json,
              originalText: row.original_text_content || '',
              topics: row.topics || [],
              translating: false
            });
            navigate(location.pathname, { replace: true, state: {} });
          }
        });
    }
  }, [location.state, location.pathname, user, navigate]);

  const [currentView, setCurrentView] = useState<'main' | 'history' | 'library' | 'informational' | 'feedback' | 'profile' | 'quiz' | 'eduplay' | 'academics' | 'study-rooms'>('main');

  useEffect(() => {
    const onFocusStudyRooms = () => setCurrentView('study-rooms');
    window.addEventListener('mindstudy:focus-study-rooms', onFocusStudyRooms);
    return () => window.removeEventListener('mindstudy:focus-study-rooms', onFocusStudyRooms);
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [actionBarData, setActionBarData] = useState<{
    freeFormMode: boolean;
    onFreeFormToggle: (enabled: boolean) => void;
    combinedSummary: string;
    copiedIndex: number | null;
    publishing: boolean;
    published: boolean;
    onCopyAll: () => void;
    onDualMode: () => void;
    onExportTxt: () => void;
    onExportPdf: () => void;
    onPublish: () => void;
    onNewDocument: () => void;
  } | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [loadedHistoryEntry, setLoadedHistoryEntry] = useState<{
    id: string;
    summary_text: string;
    flashcards_json: Array<{ front: string; back: string }>;
    original_text_content?: string;
    topics?: string[];
    original_file_name?: string;
  } | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    stage: 'idle',
    progress: 0,
    message: '',
    summaryChunks: [],
    flashcards: [],
    flashcardCount: 10,
    mode: 'fast',
    medicalMode: false,
    selectedLanguage: 'original',
    originalSummaryChunks: [],
    originalFlashcards: [],
    originalText: '',
    topics: [],
    translating: false
  });

  // Insufficient credits modal state
  const [showInsufficientCreditsModal, setShowInsufficientCreditsModal] = useState(false);
  const [insufficientCreditsData, setInsufficientCreditsData] = useState<{
    creditsRemaining: number;
    cycleEnd: string;
  } | null>(null);

  const prevDashboardViewRef = useRef<DashboardSidebarView | null>(null);

  useEffect(() => {
    const busy =
      processingState.stage === 'uploading' || processingState.stage === 'processing';
    setBusy('processing', busy);
    return () => setBusy('processing', false);
  }, [processingState.stage, setBusy]);

  useEffect(() => {
    if (!user || hasActiveSubscription()) {
      prevDashboardViewRef.current = currentView;
      return;
    }
    const prev = prevDashboardViewRef.current;
    prevDashboardViewRef.current = currentView;
    if (prev === null) return;
    if (prev === currentView) return;
    const feature = mapDashboardViewToSoftUpsellFeature(currentView);
    if (!feature) return;
    const id = window.setTimeout(() => {
      void showModal(feature);
    }, 400);
    return () => window.clearTimeout(id);
  }, [currentView, user, hasActiveSubscription, showModal]);

  // Handle mobile/desktop responsive behavior
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle RTL layout for Arabic
  useEffect(() => {
    const htmlElement = document.documentElement;
    if (processingState.selectedLanguage === 'arabic') {
      htmlElement.dir = 'rtl';
    } else {
      htmlElement.dir = 'ltr';
    }

    // Cleanup function to reset to LTR when component unmounts
    return () => {
      htmlElement.dir = 'ltr';
    };
  }, [processingState.selectedLanguage]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  useEffect(() => {
    const handleNavigateToProfile = () => {
      setCurrentView('profile');
    };

    window.addEventListener('navigateToProfile', handleNavigateToProfile);

    return () => {
      window.removeEventListener('navigateToProfile', handleNavigateToProfile);
    };
  }, []);

  // Check and show dashboard tutorial on first visit only
  // Don't show tutorial when processing completes or summary is generated
  useEffect(() => {
    if (shouldShowTutorial && processingState.stage !== 'completed' && processingState.stage !== 'processing') {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        ErrorLogger.debug('Showing dashboard tutorial on first visit', {
          component: 'Dashboard',
          action: 'showTutorial',
          userId: user?.id,
          metadata: { processingStage: processingState.stage }
        });
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    } else if (shouldShowTutorial && (processingState.stage === 'completed' || processingState.stage === 'processing')) {
      ErrorLogger.debug('Skipping dashboard tutorial - summary processing in progress or completed', {
        component: 'Dashboard',
        action: 'skipTutorial',
        userId: user?.id,
        metadata: { processingStage: processingState.stage }
      });
    }
  }, [shouldShowTutorial, showTutorial, processingState.stage, user?.id]);


  const saveHistoryEntry = async (
    summary: string, 
    flashcards: Array<{ front: string; back: string }>, 
    inputType: string, 
    fileName: string,
    originalTextContent: string,
    topics: string[] = []
  ) => {
    ErrorLogger.debug('User object in saveHistoryEntry', { component: 'Dashboard', action: 'saveHistoryEntry', userId: user?.id });
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'Dashboard', action: 'saveHistoryEntry', userId: user.id });
      return;
    }

    try {
      // Calculate expiration date (365 days from now)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 365);

      const { error } = await supabase
        .from('user_history')
        .insert({
          user_id: user.id,
          original_input_type: inputType,
          original_file_name: fileName,
          summary_text: summary,
          flashcards_json: flashcards,
          original_text_content: originalTextContent || '',
          topics: topics,
          expires_at: expirationDate.toISOString()
        });

      if (error) {
        handleSupabaseError(error, { component: 'Dashboard', action: 'saveHistoryEntry', userId: user.id });
        ErrorLogger.error(error, { component: 'Dashboard', action: 'saveHistoryEntry', userId: user.id });
      } else {
        ErrorLogger.info('History entry saved successfully with 365-day expiration', { component: 'Dashboard', action: 'saveHistoryEntry', userId: user.id });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'Dashboard', action: 'saveHistoryEntry', userId: user.id });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'saveHistoryEntry', userId: user.id });
    }
  };

  const handleProcessInput = async (
    input: File | string,
    flashcardCount: number,
    fromSummary: boolean,
    medicalMode: boolean = false,
    useOCR: boolean = false,
    generationPrefs?: AcademicsGenerationPreferences
  ) => {
    const genPrefs = mergeGenerationPreferences(generationPrefs);
    ErrorLogger.debug('Starting handleProcessInput', {
      component: 'Dashboard',
      action: 'handleProcessInput',
      metadata: { medicalMode, flashcardCount, fromSummary, genPrefs },
    });

    // Check subscription status first
    if (!hasActiveSubscription()) {
      const snoozed =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SUBSCRIPTION_PROCESSING_PAYWALL_SESSION_KEY) === '1';
      if (!snoozed) {
        void showModal('dashboard_processing', { force: true });
        return;
      }
      setProcessingState((prev) => ({
        ...prev,
        stage: 'error',
        progress: 0,
        message: 'Subscription Required',
        error: 'This feature requires an active subscription. Please upgrade to process content.',
      }));
      return;
    }

    // Check if user has exceeded token limit
    if (hasExceededTokenLimit()) {
      ErrorLogger.warn('Token limit exceeded, showing upgrade prompt', { component: 'Dashboard', action: 'checkTokenLimit', userId: user?.id });
      setProcessingState(prev => ({
        ...prev,
        stage: 'error',
        progress: 0,
        message: 'Token limit exceeded',
        error: `You've used all ${getTokensRemaining()} tokens in your current billing cycle. Upgrade your plan for more tokens!`
      }));
      return;
    }

    if (!dashboardHasRunnableOutput(genPrefs)) {
      setProcessingState((prev) => ({
        ...prev,
        stage: 'error',
        progress: 0,
        message: t('dashboard.error_generation_prefs_required'),
        error: t('dashboard.error_generation_prefs_required'),
      }));
      return;
    }

    // Reset any previous state
    setProcessingState(prev => ({
      ...prev,
      stage: 'uploading',
      progress: 0,
      message: typeof input === 'string' ? 'Processing text...' : 'Uploading and extracting text...',
      flashcardCount,
      medicalMode,
      mode: (typeof input === 'string' ? input.length > 10000 : input.size > 5000000) || flashcardCount > 20 ? 'staged' : 'fast',
      summaryChunks: [],
      flashcards: [],
      selectedLanguage: 'original',
      originalSummaryChunks: [],
      originalFlashcards: [],
      originalText: '',
      translating: false,
      error: undefined,
      extractionMethod: undefined,
      confidence: undefined
    }));

    try {
      let extractedData;
      
      if (typeof input === 'string') {
        // Step 1a: Handle direct text input
        setProcessingState(prev => ({
          ...prev,
          progress: 20,
          message: 'Processing text input...'
        }));
        
        extractedData = {
          text: input,
          pageCount: Math.max(1, Math.ceil(input.length / 2000)), // Estimate pages
          fileType: 'text/plain',
          fileName: 'Pasted Text',
          fileSize: input.length,
          extractionMethod: 'Direct text input'
        };
      } else {
        // Step 1b: Extract text from file or image
        if (useOCR) {
          // OCR mode: Use OCR extraction for images
          setProcessingState(prev => ({
            ...prev,
            progress: 0,
            message: 'Processing image with OCR...',
            extractionMethod: 'OCR',
          }));
          
          extractedData = await extractTextFromImage(input, (progress, message) => {
            setProcessingState(prev => ({
              ...prev,
              progress: Math.round(progress * 0.2), // Reserve 20% for OCR processing
              message
            }));
          });

          // Store OCR confidence if available
          if (extractedData.confidence !== undefined) {
            setProcessingState(prev => ({
              ...prev,
              confidence: extractedData.confidence,
            }));
          }
        } else {
          // File mode: Use regular file extraction for documents
          extractedData = await extractTextFromFile(input, (progress, message) => {
            setProcessingState(prev => ({
              ...prev,
              progress: Math.round(progress * 0.2), // Reserve 20% for file processing
              message
            }));
          });
        }
      }

      // Validate extractedData before proceeding
      if (!extractedData || !extractedData.text || typeof extractedData.text !== 'string') {
        const errorSource = useOCR ? 'image' : 'file';
        throw new Error(`Failed to extract text from ${errorSource}. The ${errorSource} may be corrupted, password-protected, or contain no readable text.`);
      }

      // Step 1.5: Detect language and set selectedLanguage automatically
      let detectedLanguage = 'original';
      try {
        // First, check if OCR already detected language
        if (extractedData.language && typeof extractedData.language === 'string') {
          // Map OCR language to our codes
          const ocrLanguageMap: Record<string, string> = {
            'en': 'en',
            'english': 'en',
            'ar': 'ar',
            'arabic': 'ar',
            'fr': 'fr',
            'french': 'fr',
            'français': 'fr',
            'tr': 'tr',
            'turkish': 'tr',
            'türkçe': 'tr'
          };
          const ocrLang = extractedData.language.toLowerCase();
          detectedLanguage = ocrLanguageMap[ocrLang] || 'original';
          
          ErrorLogger.debug('Using OCR detected language', { 
            component: 'Dashboard', 
            action: 'handleProcessInput',
            ocrLanguage: extractedData.language,
            mappedLanguage: detectedLanguage
          });
        } else {
          // Detect language from text
          detectedLanguage = await detectLanguage(extractedData.text);
          ErrorLogger.debug('Language detected from text', { 
            component: 'Dashboard', 
            action: 'handleProcessInput',
            detectedLanguage
          });
        }
      } catch (error) {
        // Silent fallback - don't block processing
        ErrorLogger.warn('Language detection failed, using default', { 
          component: 'Dashboard', 
          action: 'handleProcessInput',
          error: error instanceof Error ? error.message : String(error)
        });
        detectedLanguage = 'original';
      }

      // Update selectedLanguage based on detected language
      setProcessingState(prev => ({
        ...prev,
        selectedLanguage: detectedLanguage
      }));

      // Step 2: Check for cached content using deduplication
      setProcessingState(prev => ({
        ...prev,
        progress: 25,
        message: 'Checking for existing processed content...'
      }));

      try {
        let cachedResult: Awaited<ReturnType<typeof checkCache>> = null;
        if (prefsMatchDefaultCacheShape(genPrefs)) {
          const normalizedText = normalizeText(extractedData.text);
          const contentHash = await generateTextHash(normalizedText);
          cachedResult = await checkCache(contentHash);
        }

        if (cachedResult) {
          // Found cached content! Use it instead of processing
          ErrorLogger.info('Using cached content, skipping AI processing and token usage tracking', { 
            component: 'Dashboard', 
            action: 'handleProcessInput', 
            metadata: { step: 'cacheCheck' } 
          });

          // Auto-translate cached content if detected language is not 'original' or 'en'
          let cachedSummaryToDisplay = cachedResult.summary;
          let cachedFlashcardsToDisplay = cachedResult.flashcards;
          
          if (detectedLanguage !== 'original' && detectedLanguage !== 'en' && needsTranslation(detectedLanguage)) {
            try {
              setProcessingState(prev => ({
                ...prev,
                progress: 50,
                message: `Translating cached content to ${AVAILABLE_LANGUAGES.find(l => l.code === detectedLanguage)?.name || detectedLanguage}...`,
                translating: true
              }));

              const translatedContent = await translateContent(
                {
                  summaryChunks: [cachedResult.summary],
                  flashcards: cachedResult.flashcards
                },
                detectedLanguage,
                (progress, message) => {
                  setProcessingState(prev => ({
                    ...prev,
                    progress: 50 + Math.round(progress * 0.5), // 50-100% for translation
                    message
                  }));
                }
              );

              cachedSummaryToDisplay = translatedContent.summaryChunks[0] || cachedResult.summary;
              cachedFlashcardsToDisplay = translatedContent.flashcards || cachedResult.flashcards;

              ErrorLogger.debug('Auto-translation of cached content completed', {
                component: 'Dashboard',
                action: 'handleProcessInput',
                detectedLanguage,
                summaryTranslated: cachedSummaryToDisplay !== cachedResult.summary
              });
            } catch (translationError) {
              // Silent fallback - use original cached content if translation fails
              ErrorLogger.warn('Auto-translation of cached content failed, using original', {
                component: 'Dashboard',
                action: 'handleProcessInput',
                detectedLanguage,
                error: translationError instanceof Error ? translationError.message : String(translationError)
              });
            }
          }

          setProcessingState(prev => ({
            ...prev,
            stage: 'completed',
            progress: 100,
            message: 'Loaded from cache - processing complete! (No tokens used)',
            summaryChunks: [cachedSummaryToDisplay],
            flashcards: cachedFlashcardsToDisplay,
            originalSummaryChunks: [cachedResult.summary],
            originalFlashcards: cachedResult.flashcards,
            originalText: extractedData.text,
            topics: [],
            translating: false
          }));

          // Save cached content to history
          ErrorLogger.debug('Saving cached content to history', { 
            component: 'Dashboard', 
            action: 'handleProcessInput', 
            metadata: { step: 'saveHistory' } 
          });
          const inputType = typeof input === 'string' ? 'text' : 'file';
          const fileName = typeof input === 'string'
            ? (medicalMode ? 'Medical Text Content' : 'Pasted Text')
            : extractedData.fileName;

          await saveHistoryEntry(
            cachedResult.summary,
            cachedResult.flashcards,
            inputType,
            fileName,
            extractedData.text,
            []
          );

          // DO NOT call updateUsage() for cached content - no AI tokens were consumed
          return; // Exit early, no need to process with AI
        }
      } catch (cacheError) {
        ErrorLogger.warn('Cache check failed, proceeding with normal processing', { component: 'Dashboard', action: 'checkCache', cacheError: cacheError instanceof Error ? cacheError : new Error(String(cacheError)) });
        // Continue with normal processing if cache check fails
      }

      // Determine processing mode based on content
      const processingMode = medicalMode 
        ? determineMedicalProcessingMode(extractedData.text, flashcardCount)
        : determineProcessingMode(extractedData.text, flashcardCount);
      
      const initialProcessingMessage = medicalMode
        ? genPrefs.includeSummary
          ? 'Generating medical summary...'
          : genPrefs.includeFlashcards
            ? 'Generating medical flashcards...'
            : 'Processing medical content...'
        : genPrefs.includeSummary
          ? 'Generating summary...'
          : genPrefs.includeFlashcards
            ? 'Generating flashcards...'
            : 'Processing...';

      setProcessingState(prev => ({
        ...prev,
        stage: 'processing',
        progress: 30,
        message: initialProcessingMessage,
        mode: processingMode.mode as 'fast' | 'staged'
      }));

      // Step 3-5: Process content (medical or regular)
      let totalTokens = 0;
      let finalSummary: string;
      let finalFlashcards: Array<{ front: string; back: string }> = []; // Initialize to prevent undefined access
      let finalTopics: string[] = []; // Initialize to prevent undefined access
      let finalMedicalScore: number | undefined;

      // Strict check: Only use medical processing if medicalMode is explicitly true
      if (medicalMode === true) {
        ErrorLogger.debug('Medical mode enabled - using medical processing pipeline', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          metadata: { 
            medicalMode: true,
            textLength: extractedData.text.length 
          }
        });
        // Use medical processing pipeline
        const result = await processMedicalContent(
          extractedData.text,
          flashcardCount,
          fromSummary,
          (progress, message, data) => {
            setProcessingState(prev => ({
              ...prev,
              progress: 30 + Math.round(progress * 0.65), // 30-95% for processing
              message,
              ...(data && {
                summaryChunks: data.summaryChunks || prev.summaryChunks,
                flashcards: data.flashcards || prev.flashcards,
                topics: data.topics || prev.topics,
                medicalScore: data.medicalScore
              })
            }));
          }
        ,
          {
            includeSummary: genPrefs.includeSummary,
            includeFlashcards: genPrefs.includeFlashcards,
          }
        );

        totalTokens = result.tokens || 0;
        ErrorLogger.debug('Medical mode total tokens used', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          metadata: { step: 'medicalMode', totalTokens } 
        });
        await updateUsage(totalTokens);

        // Capture final values directly from result (synchronously available)
        finalSummary = genPrefs.includeSummary
          ? (result.summary || 'No summary generated')
          : '';
        finalFlashcards = result.flashcards || [];
        finalTopics = result.topics || [];
        finalMedicalScore = result.medicalScore;

        ErrorLogger.debug('Medical mode - Final values captured from result', {
          component: 'Dashboard',
          action: 'handleProcessInput',
          step: 'medicalMode',
          summaryLength: finalSummary.length,
          flashcardCount: finalFlashcards.length,
          flashcardsCount: finalFlashcards.length,
          topicsCount: finalTopics.length,
          medicalScore: finalMedicalScore
        });

        setProcessingState(prev => ({
          ...prev,
          summaryChunks: finalSummary ? [finalSummary] : [],
          flashcards: finalFlashcards,
          topics: finalTopics,
          medicalScore: finalMedicalScore
        }));

      } else {
        // Use regular processing pipeline - medicalMode is false or undefined
        ErrorLogger.debug('Regular mode - using standard processing pipeline', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          medicalMode: false,
          textLength: extractedData.text.length 
        });

        const effectiveFromSummary = fromSummary && genPrefs.includeSummary;
        let combinedSummary = '';

        if (genPrefs.includeSummary) {
          const summaryResult = await processSummaryBatches(
            extractedData.text,
            (progress, message) => {
              setProcessingState(prev => ({
                ...prev,
                progress: 30 + Math.round(progress * 0.35), // 30-65% for summary
                message
              }));
            },
            (chunkSummary, _chunkIndex, _totalChunks) => {
              setProcessingState(prev => ({
                ...prev,
                summaryChunks: [...prev.summaryChunks, chunkSummary]
              }));
            }
          );

          combinedSummary = summaryResult.summary;
          totalTokens = summaryResult.tokens;

          ErrorLogger.debug('Summary result', {
            component: 'Dashboard',
            action: 'handleProcessInput',
            metadata: {
              step: 'summaryGeneration',
              summaryLength: combinedSummary?.length || 0,
              flashcardCount: finalFlashcards?.length || 0,
              tokens: totalTokens,
              isEmpty: !combinedSummary || combinedSummary.trim().length === 0
            }
          });

          if (!combinedSummary || combinedSummary.trim().length === 0) {
            throw new Error('Summary generation returned empty content');
          }

          setProcessingState(prev => ({
            ...prev,
            progress: genPrefs.includeFlashcards ? 65 : 85,
            message: genPrefs.includeFlashcards ? 'Generating flashcards...' : 'Detecting topics...',
            summaryChunks: [combinedSummary]
          }));
        } else {
          setProcessingState(prev => ({
            ...prev,
            progress: genPrefs.includeFlashcards ? 40 : 85,
            message: genPrefs.includeFlashcards ? 'Generating flashcards...' : 'Detecting topics...',
            summaryChunks: []
          }));
        }

        let flashcards: Array<{ front: string; back: string }> = [];
        if (genPrefs.includeFlashcards) {
          const sourceText = effectiveFromSummary && combinedSummary.trim().length > 0
            ? combinedSummary
            : extractedData.text;
          const flashcardsResult = await processFlashcardBatches(
            sourceText,
            flashcardCount,
            effectiveFromSummary ? 'summary' : 'full',
            (progress, message) => {
              setProcessingState(prev => ({
                ...prev,
                progress: genPrefs.includeSummary
                  ? 65 + Math.round(progress * 0.25)
                  : 40 + Math.round(progress * 0.45),
                message
              }));
            },
            (batchFlashcards, _batchIndex, _totalBatches) => {
              setProcessingState(prev => ({
                ...prev,
                flashcards: [...prev.flashcards, ...batchFlashcards]
              }));
            }
          );

          flashcards = flashcardsResult.flashcards;
          totalTokens += flashcardsResult.tokens;
        }

        setProcessingState(prev => ({
          ...prev,
          progress: 90,
          message: 'Detecting topics...'
        }));

        let detectedTopics: string[] = [];
        try {
          const topicsResult = await haikuClient.callFunction('generate-summary-and-flashcards', {
            action: 'topics',
            text: extractedData.text
          });
          detectedTopics = topicsResult.topics || [];
        } catch (topicError) {
          ErrorLogger.warn('Topic detection failed, continuing without topics', { 
            component: 'Dashboard', 
            action: 'detectTopics', 
            metadata: { topicError: topicError instanceof Error ? topicError.message : String(topicError) } 
          });
          detectedTopics = [];
        }

        // Update usage with total tokens consumed
        ErrorLogger.debug('Total tokens used', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          metadata: { step: 'tokenUsage', totalTokens } 
        });
        await updateUsage(totalTokens);

        // Capture final values directly from processing results (synchronously available)
        finalSummary = genPrefs.includeSummary
          ? (combinedSummary || 'No summary generated')
          : '';
        finalFlashcards = flashcards || [];
        finalTopics = detectedTopics || [];

        ErrorLogger.debug('Regular mode - Final values captured from results', {
          component: 'Dashboard',
          action: 'handleProcessInput',
          step: 'regularMode',
          summaryLength: finalSummary.length,
          flashcardCount: finalFlashcards.length,
          flashcardsCount: finalFlashcards.length,
          topicsCount: finalTopics.length
        });

        setProcessingState(prev => ({
          ...prev,
          summaryChunks: finalSummary ? [finalSummary] : [],
          flashcards: finalFlashcards,
          topics: finalTopics
        }));
      }

      // Step 6: Store in cache for future deduplication
      setProcessingState(prev => ({
        ...prev,
        progress: 97,
        message: 'Caching results for future use...'
      }));

      try {
        if (prefsMatchDefaultCacheShape(genPrefs)) {
          const normalizedText = normalizeText(extractedData.text);
          const contentHash = await generateTextHash(normalizedText);
          await storeInCache(contentHash, finalSummary, finalFlashcards);
          ErrorLogger.info('Successfully cached processed content', {
            component: 'Dashboard',
            action: 'handleProcessInput',
            metadata: { step: 'cacheStore', summaryLength: finalSummary.length },
          });
        }
      } catch (cacheError) {
        ErrorLogger.warn('Failed to cache results, but continuing', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          metadata: { step: 'cacheStore', cacheError: cacheError instanceof Error ? cacheError.message : String(cacheError) } 
        });
      }

      // Step 7: Auto-translate if detected language is not 'original' or 'en'
      let finalSummaryToDisplay = finalSummary;
      let finalFlashcardsToDisplay = finalFlashcards;
      
      if (detectedLanguage !== 'original' && detectedLanguage !== 'en' && needsTranslation(detectedLanguage)) {
        try {
          setProcessingState(prev => ({
            ...prev,
            progress: 95,
            message: `Translating to ${AVAILABLE_LANGUAGES.find(l => l.code === detectedLanguage)?.name || detectedLanguage}...`,
            translating: true
          }));

          const translatedContent = await translateContent(
            {
              summaryChunks: finalSummary ? [finalSummary] : [],
              flashcards: finalFlashcards
            },
            detectedLanguage,
            (progress, message) => {
              setProcessingState(prev => ({
                ...prev,
                progress: 95 + Math.round(progress * 0.05), // 95-100% for translation
                message
              }));
            }
          );

          finalSummaryToDisplay = finalSummary
            ? (translatedContent.summaryChunks[0] || finalSummary)
            : '';
          finalFlashcardsToDisplay = translatedContent.flashcards || finalFlashcards;

          ErrorLogger.debug('Auto-translation completed', {
            component: 'Dashboard',
            action: 'handleProcessInput',
            detectedLanguage,
            summaryTranslated: finalSummaryToDisplay !== finalSummary,
            flashcardsTranslated: finalFlashcardsToDisplay.length === finalFlashcards.length
          });
        } catch (translationError) {
          // Silent fallback - use original content if translation fails
          ErrorLogger.warn('Auto-translation failed, using original content', {
            component: 'Dashboard',
            action: 'handleProcessInput',
            detectedLanguage,
            error: translationError instanceof Error ? translationError.message : String(translationError)
          });
          // Keep original content
        }
      }

      // Step 8: Complete processing
      setProcessingState(prev => ({
        ...prev,
        stage: 'completed',
        progress: 100,
        message: medicalMode ? 'Medical content processing complete!' : 'Processing complete!',
        summaryChunks: finalSummaryToDisplay ? [finalSummaryToDisplay] : [],
        flashcards: finalFlashcardsToDisplay,
        originalSummaryChunks: finalSummary ? [finalSummary] : [],
        originalFlashcards: finalFlashcards,
        originalText: extractedData.text,
        topics: finalTopics,
        translating: false,
        ...(medicalMode && finalMedicalScore !== undefined && { medicalScore: finalMedicalScore })
      }));

      // Step 8: Save to history with captured values
      ErrorLogger.debug('Saving history entry', { 
        component: 'Dashboard', 
        action: 'handleProcessInput', 
        metadata: { step: 'saveHistory', summaryLength: finalSummary.length, flashcardCount: finalFlashcards.length } 
      });
      const inputType = typeof input === 'string' ? 'text' : 'file';
      const fileName = typeof input === 'string'
        ? (medicalMode ? 'Medical Text Content' : 'Pasted Text')
        : extractedData.fileName;

      await saveHistoryEntry(
        finalSummary,
        finalFlashcards,
        inputType,
        fileName,
        extractedData.text,
        finalTopics
      );

      if (user && genPrefs.quizQuestionTypes.length > 0 && extractedData.text.length >= 300) {
        const quizLang = ['en', 'ar', 'fr', 'tr'].includes(detectedLanguage) ? detectedLanguage : 'en';
        const quizTitle = medicalMode ? `Medical — ${fileName}` : `${fileName} — Quiz`;
        try {
          const { data: quizData, error: quizInvokeError } = await supabase.functions.invoke('generate-quiz', {
            body: {
              text: extractedData.text,
              questionCount: 10,
              difficulty: 'medium',
              sourceType: 'uploaded_document',
              quizTitle,
              targetLanguage: quizLang,
              questionTypes: genPrefs.quizQuestionTypes,
            },
          });
          throwIfEdgeFunctionInvokeFailed(quizData, quizInvokeError);
          ErrorLogger.info('Dashboard follow-up quiz generated', {
            component: 'Dashboard',
            action: 'handleProcessInput',
            metadata: { quizSessionId: quizData.quizSessionId, questionCount: quizData.questionCount },
          });
        } catch (quizErr) {
          ErrorLogger.warn('Dashboard quiz generation skipped or failed', {
            component: 'Dashboard',
            action: 'handleProcessInput',
            error: quizErr instanceof Error ? quizErr.message : String(quizErr),
          });
        }
      }

      ErrorLogger.info('Processing complete! Summary and flashcards are ready for display', { 
        component: 'Dashboard', 
        action: 'handleProcessInput', 
        metadata: { summaryLength: finalSummary.length, flashcardCount: finalFlashcards.length } 
      });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleApiError(err, { component: 'Dashboard', action: 'handleProcessInput' });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'handleProcessInput' });

      // Check for insufficient credits error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('insufficient_credits') || errorMessage.includes("don't have enough credits")) {
        // Extract credit info if available
        const cycleEndMatch = errorMessage.match(/refresh on ([^.]+)/);
        const cycleEnd = cycleEndMatch ? cycleEndMatch[1] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();

        setInsufficientCreditsData({
          creditsRemaining: 0,
          cycleEnd: cycleEnd
        });
        setShowInsufficientCreditsModal(true);

        setProcessingState(prev => ({
          ...prev,
          stage: 'error',
          progress: 0,
          message: 'Insufficient credits',
          error: 'You need more credits to complete this operation'
        }));
      } else {
        setProcessingState(prev => ({
          ...prev,
          stage: 'error',
          progress: 0,
          message: medicalMode ? 'Medical processing failed' : 'Processing failed',
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }));
      }
    }
  };

  const handleProcessInputWrapper = (
    input: File | string,
    flashcardCount: number,
    fromSummary: boolean,
    medicalMode: boolean = false,
    useOCR: boolean = false,
    generationPrefs?: AcademicsGenerationPreferences
  ) => {
    handleProcessInput(input, flashcardCount, fromSummary, medicalMode, useOCR, generationPrefs).catch(error => {
      const err = error instanceof Error ? error : new Error(String(error));
      handleApiError(err, { component: 'Dashboard', action: 'handleProcessInputWrapper' });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'handleProcessInputWrapper' });
      setProcessingState(prev => ({
        ...prev,
        stage: 'error',
        error: 'An unexpected error occurred'
      }));
    });
  };

  const saveToLibrary = async (
    summary: string,
    flashcards: Array<{ front: string; back: string }>,
    originalTextContent: string,
    topics: string[] = [],
    folderId?: string,
    tagIds?: string[]
  ) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'Dashboard', action: 'saveToLibrary', userId: user.id });
      return;
    }

    try {
      // Create a more descriptive title
      let title = 'Generated Content';
      
      // Try to extract title from first few words of summary
      if (summary && summary.trim().length > 0) {
        const summaryWords = summary.trim().split(' ').slice(0, 6).join(' ');
        const timestamp = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        title = `${summaryWords}... - ${timestamp}`;
      }

      const { data: libraryItem, error } = await supabase
        .from('user_library_items')
        .insert({
          user_id: user.id,
          title: title,
          summary_text: summary,
          flashcards_json: flashcards,
          source_type: 'processed',
          original_text_content: originalTextContent,
          topics: topics,
          folder_id: folderId || null
        })
        .select()
        .single();

      if (error) {
        handleSupabaseError(error, { component: 'Dashboard', action: 'saveToLibrary', userId: user.id });
        ErrorLogger.error(error, { component: 'Dashboard', action: 'saveToLibrary', userId: user.id });
        // Don't throw error - library save failure shouldn't break main flow
      } else if (libraryItem) {
        ErrorLogger.info('Successfully saved to library', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          metadata: { step: 'saveToLibrary' } 
        });
        
        // Add tags if provided
        if (tagIds && tagIds.length > 0) {
          const tagInserts = tagIds.map(tagId => ({
            item_id: libraryItem.id,
            tag_id: tagId
          }));

          const { error: tagError } = await supabase
            .from('item_tags')
            .insert(tagInserts);

          if (tagError) {
            handleSupabaseError(tagError, { component: 'Dashboard', action: 'saveToLibrary-tags', userId: user.id });
            ErrorLogger.error(tagError, { component: 'Dashboard', action: 'saveToLibrary-tags', userId: user.id });
            // Don't fail the entire operation if tags fail
          }
        }

        // Dispatch event to refresh library page
        window.dispatchEvent(new CustomEvent('libraryItemPublished', {
          detail: { 
            id: libraryItem.id,
            folderId, 
            tagIds: tagIds || [], 
            timestamp: Date.now() 
          }
        }));
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'Dashboard', action: 'saveToLibrary', userId: user.id });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'saveToLibrary', userId: user.id });
      // Don't throw error - library save failure shouldn't break main flow
    }
  };

  const _saveToLibraryWithCustomTitle = async (
    summary: string,
    flashcards: Array<{ front: string; back: string }>,
    inputType: string,
    fileName: string,
    originalTextContent: string,
    topics: string[] = []
  ) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'Dashboard', action: 'saveToLibraryWithCustomTitle', userId: user.id });
      return;
    }

    try {
      // Create a more descriptive title
      let title = fileName;
      if (inputType === 'text') {
        const timestamp = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        title = `Pasted Text - ${timestamp}`;
      }

      const { error } = await supabase
        .from('user_library_items')
        .insert({
          user_id: user.id,
          title: title,
          summary_text: summary,
          flashcards_json: flashcards,
          source_type: 'processed',
          original_text_content: originalTextContent,
          topics: topics
        });

      if (error) {
        handleSupabaseError(error, { component: 'Dashboard', action: 'saveToLibraryWithCustomTitle', userId: user.id });
        ErrorLogger.error(error, { component: 'Dashboard', action: 'saveToLibraryWithCustomTitle', userId: user.id });
        // Don't throw error - library save failure shouldn't break main flow
      } else {
        ErrorLogger.info('Successfully saved to library', { 
          component: 'Dashboard', 
          action: 'handleProcessInput', 
          metadata: { step: 'saveToLibrary' } 
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'Dashboard', action: 'saveToLibraryWithCustomTitle', userId: user.id });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'saveToLibraryWithCustomTitle', userId: user.id });
      // Don't throw error - library save failure shouldn't break main flow
    }
  };

  const handlePublishToLibrary = async (summary: string, flashcards: Array<{ front: string; back: string }>, originalText: string) => {
    if (!user) {
      const error = new Error('User must be authenticated to publish to library');
      ErrorLogger.error(error, { component: 'Dashboard', action: 'handlePublishToLibrary' });
      return false;
    }

    try {
      await saveToLibrary(summary, flashcards, originalText, processingState.topics);
      // Trigger library refresh by incrementing the refresh key
      setLibraryRefreshKey(prev => prev + 1);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'Dashboard', action: 'handlePublishToLibrary', userId: user.id });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'handlePublishToLibrary', userId: user.id });
      return false;
    }
  };

  const handleLanguageChange = async (newLanguage: string) => {
    if (newLanguage === processingState.selectedLanguage) {
      return; // No change needed
    }

    setProcessingState(prev => ({
      ...prev,
      selectedLanguage: newLanguage,
      translating: needsTranslation(newLanguage)
    }));

    // If selecting original language, restore original content
    if (newLanguage === 'original') {
      setProcessingState(prev => ({
        ...prev,
        summaryChunks: prev.originalSummaryChunks,
        flashcards: prev.originalFlashcards,
        translating: false
      }));
      return;
    }

    // Otherwise, translate the content
    try {
      const translatedContent = await translateContent(
        {
          summaryChunks: processingState.originalSummaryChunks,
          flashcards: processingState.originalFlashcards
        },
        newLanguage,
        (progress, message) => {
          // Update translation progress (optional - could show in UI)
          ErrorLogger.debug('Translation progress', { 
            component: 'Dashboard', 
            action: 'handleProcessInput', 
            metadata: { step: 'translation', progress, message } 
          });
        }
      );

      setProcessingState(prev => ({
        ...prev,
        summaryChunks: translatedContent.summaryChunks,
        flashcards: translatedContent.flashcards,
        translating: false
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = handleApiError(err, { component: 'Dashboard', action: 'handleLanguageChange' });
      ErrorLogger.error(err, { component: 'Dashboard', action: 'handleLanguageChange' });
      // Revert to original language on error
      setProcessingState(prev => ({
        ...prev,
        selectedLanguage: 'original',
        summaryChunks: prev.originalSummaryChunks,
        flashcards: prev.originalFlashcards,
        translating: false,
        error: errorMessage || `Translation failed: ${err.message}`
      }));
    }
  };

  const handleViewHistoryEntry = (entry: {
    id: string;
    summary_text: string;
    flashcards_json: Array<{ front: string; back: string }>;
    original_text_content?: string;
    topics?: string[];
    original_file_name?: string;
  }) => {
    setLoadedHistoryEntry(entry);
    setCurrentView('main');
    setProcessingState({
      stage: 'completed',
      progress: 100,
      message: '',
      summaryChunks: [entry.summary_text],
      flashcards: entry.flashcards_json,
      flashcardCount: entry.flashcards_json.length,
      mode: 'fast',
      medicalMode: (entry.original_file_name?.toLowerCase().includes('medical') ||
        (entry.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical'].some(med => topic.toLowerCase().includes(med))) ?? false)),
      selectedLanguage: 'original',
      originalSummaryChunks: [entry.summary_text],
      originalFlashcards: entry.flashcards_json,
      originalText: entry.original_text_content || '',
      topics: entry.topics || [],
      translating: false
    });
  };

  const handleBackToHistory = () => {
    setLoadedHistoryEntry(null);
    setCurrentView('history');
    setProcessingState(prev => ({ ...prev, stage: 'idle' }));
  };

  const resetProcessing = () => {
    setCurrentView('main');
    setIsSidebarOpen(true);
    setLoadedHistoryEntry(null);
    setProcessingState({
      stage: 'idle',
      progress: 0,
      message: '',
      summaryChunks: [],
      flashcards: [],
      flashcardCount: 10,
      mode: 'fast',
      medicalMode: false,
      selectedLanguage: 'original',
      originalSummaryChunks: [],
      originalFlashcards: [],
      originalText: '',
      topics: [],
      translating: false
    });
  };

  const subscriptionFeatureConfig = getFeatureConfig(currentFeature);

  return (
    <div className={`min-h-screen w-full flex flex-col ${getBackgroundGradient()}`}>
      {/* Persistent Subscription Modal (all dashboard soft / paywall prompts) */}
      <PersistentSubscriptionModal
        isOpen={isModalOpen}
        onDismiss={dismissModal}
        featureName={currentFeature ?? 'library'}
        featureTitle={subscriptionFeatureConfig.title}
        benefits={subscriptionFeatureConfig.benefits}
      />

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={showInsufficientCreditsModal}
        onClose={() => setShowInsufficientCreditsModal(false)}
        creditsRemaining={insufficientCreditsData?.creditsRemaining}
        cycleEnd={insufficientCreditsData?.cycleEnd}
      />

      <Header />

      <div className="flex flex-1 relative">
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
        />

        {/* Mobile overlay */}
        {isMobile && isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-10"
            onClick={toggleSidebar}
          />
        )}

        <main
          className="flex-1 transition-colors duration-150 ease-in-out"
          style={isMobile ? {} : isRtl
            ? { marginRight: isSidebarOpen ? '128px' : '32px' }
            : { marginLeft: isSidebarOpen ? '128px' : '32px' }
          }
        >
          {/* Mobile menu button */}
          {isMobile && !isSidebarOpen && (
            <button
              type="button"
              onClick={toggleSidebar}
              className={`fixed bottom-6 ${isRtl ? 'right-6' : 'left-6'} z-30 flex items-center justify-center p-3 ${getThemeGradient('ui')} text-white rounded-full shadow hover:opacity-90 transition duration-150`}
              aria-label={t('header.open_menu')}
            >
              <PanelLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
            </button>
          )}

          <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
            {currentView === 'history' && (
              <HistoryPage key="history" onViewHistoryEntry={handleViewHistoryEntry} />
            )}

            {currentView === 'library' && (
              <LibraryPage key={`library-${libraryRefreshKey}`} />
            )}

            {currentView === 'quiz' && (
              <QuizPage key="quiz" />
            )}

            {currentView === 'eduplay' && (
              <EduPlayPage key="eduplay" />
            )}

            {currentView === 'study-rooms' && <StudyRoomsPage />}

            {currentView === 'academics' && <AcademicsPage key="academics" />}

            {currentView === 'informational' && (
              <InformationalPage key="informational" />
            )}

            {currentView === 'feedback' && (
              <FeedbackPage key="feedback" />
            )}

            {currentView === 'profile' && (
              <ProfilePage key="profile" />
            )}

            {currentView === 'main' && processingState.stage === 'idle' && (
              <InputForm onProcessInput={handleProcessInputWrapper} />
            )}

            {currentView === 'main' && (processingState.stage === 'uploading' || processingState.stage === 'processing') && (
              <ProcessingStatus 
                stage={processingState.stage}
                progress={processingState.progress}
                message={processingState.message}
                mode={processingState.mode}
                medicalMode={processingState.medicalMode}
                medicalScore={processingState.medicalScore}
                extractionMethod={processingState.extractionMethod}
                confidence={processingState.confidence}
                onReset={resetProcessing}
              />
            )}

            {currentView === 'main' && processingState.stage === 'completed' && (
              <div className="space-y-8">
                {/* Language Selector */}
                <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 ${getThemeCardBorder()}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
                        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                        </svg>
                      </div>
                      <div> {/* Apply dark mode classes to language selector text */}
                        <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>Content Language</h3>
                        <p className={`text-sm ${getThemeTextMuted()}`}>
                          {processingState.translating ? 'Translating content...' : 'Choose a language for your summary and flashcards'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <select
                        value={processingState.selectedLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        disabled={processingState.translating}
                        className={`px-4 py-2 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                      >
                        {AVAILABLE_LANGUAGES.map((lang: { code: string; name: string; flag: string; dir: string }) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.flag} {lang.name}
                          </option>
                        ))}
                      </select>
                      
                      {processingState.translating && (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Bar - positioned below Content Language card */}
                {actionBarData && (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    {/* Back to History - when viewing from history */}
                    {loadedHistoryEntry && (
                      <button
                        onClick={handleBackToHistory}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border ${getThemeCardBorder()} rounded-full ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${getThemeCardBg()}`}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        <span>{t('history.back_to_history') || 'Back to History'}</span>
                      </button>
                    )}
                    {/* Free-Form Mode Toggle - hidden until optimized */}
                    {(() => {
                      const showFreeFormToggle = false;
                      return showFreeFormToggle && (
                        <div className="flex items-center">
                          <FreeFormToggle
                            enabled={actionBarData.freeFormMode}
                            onToggle={actionBarData.onFreeFormToggle}
                            compact={false}
                          />
                        </div>
                      );
                    })()}

                    {/* Actions Menu Button */}
                    <div className="relative">
                      <button
                        onClick={() => setShowActionsMenu(!showActionsMenu)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border ${getThemeCardBorder()} rounded-xl ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                        <span>Actions</span>
                      </button>

                      {/* Actions Dropdown Menu */}
                      {showActionsMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                          <div className={`absolute right-0 mt-1.5 w-56 ${getThemeCardBg()} border ${getThemeCardBorder()} rounded-xl shadow-xl z-50 overflow-hidden`}>
                            <div className="p-1.5 space-y-0.5">
                              {/* Copy All */}
                              <button
                                onClick={() => { actionBarData.onCopyAll(); setShowActionsMenu(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                              >
                                {actionBarData.copiedIndex === -1 ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 opacity-60" />
                                )}
                                <span>{t('summary.copy_all')}</span>
                              </button>

                              {/* Dual-mode */}
                              <button
                                onClick={() => { actionBarData.onDualMode(); setShowActionsMenu(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                              >
                                <FileSearch className="h-3.5 w-3.5 opacity-60" />
                                <span>{t('summary.dual_mode')}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => { actionBarData.onExportTxt(); setShowActionsMenu(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                              >
                                <Download className="h-3.5 w-3.5 opacity-60" />
                                <span>{t('summary.export_txt')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => { actionBarData.onExportPdf(); setShowActionsMenu(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                              >
                                <Download className="h-3.5 w-3.5 opacity-60" />
                                <span>{t('summary.export_pdf')}</span>
                              </button>

                              {/* Divider before primary action */}
                              <div className={`my-1 border-t ${getThemeCardBorder()}`} />

                              {/* Publish to Library — highlighted */}
                              <button
                                onClick={() => { actionBarData.onPublish(); setShowActionsMenu(false); }}
                                disabled={actionBarData.publishing || actionBarData.published}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                                  actionBarData.published
                                    ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400'
                                    : processingState.medicalMode
                                      ? 'text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30'
                                      : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
                                }`}
                              >
                                {actionBarData.publishing ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : actionBarData.published ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : processingState.medicalMode ? (
                                  <GraduationCap className="h-3.5 w-3.5" />
                                ) : (
                                  <BookOpen className="h-3.5 w-3.5" />
                                )}
                                <span>
                                  {actionBarData.published
                                    ? t('summary.published')
                                    : actionBarData.publishing
                                      ? t('summary.publishing')
                                      : processingState.medicalMode
                                        ? 'Save to Medical Library'
                                        : t('summary.publish_library')}
                                </span>
                              </button>

                              {/* Divider before destructive */}
                              <div className={`my-1 border-t ${getThemeCardBorder()}`} />

                              {/* New Document */}
                              <button
                                onClick={() => { actionBarData.onNewDocument(); setShowActionsMenu(false); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${getThemeTextMuted()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                              >
                                <RefreshCw className="h-3.5 w-3.5 opacity-60" />
                                <span>{t('summary.new_document')}</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <SummaryDisplay 
                  summaryChunks={processingState.summaryChunks}
                  flashcards={processingState.flashcards}
                  originalText={processingState.originalText}
                  topics={processingState.topics}
                  medicalMode={processingState.medicalMode}
                  medicalScore={processingState.medicalScore}
                  onPublishToLibrary={handlePublishToLibrary}
                  onReset={resetProcessing}
                  onActionBarData={setActionBarData}
                />
              </div>
            )}

            {currentView === 'main' && processingState.stage === 'error' && (
              <div className="text-center py-12">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto dark:bg-red-900 dark:border-red-700">
                  <h3 className="text-lg font-semibold text-red-800 mb-2 dark:text-red-300">
                    {processingState.medicalMode ? '🏥 Medical Processing Error' : 'Processing Error'}
                  </h3>
                  <p className="text-red-700 mb-4 dark:text-red-300">
                    {processingState.error || 'An error occurred during processing. Please try again.'}
                  </p>
                  <button
                    onClick={resetProcessing}
                    className={`px-4 py-2 text-white rounded-lg transition duration-150 ${
                      processingState.medicalMode
                        ? 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {processingState.medicalMode ? '🔄 Retry Medical Processing' : 'Try Again'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      
      {/* Global Chat Assistant - Available on all pages except EduPlay */}
      {currentView !== 'eduplay' && <GlobalChatAssistant />}

      {/* Dashboard Tutorial */}
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
};