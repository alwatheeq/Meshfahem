import React, { useState, useEffect } from 'react';
import { Users, Video, MessageCircle, Target, Award, TrendingUp, CheckCircle } from 'lucide-react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { InputForm } from './InputForm';
import { ProcessingStatus } from './ProcessingStatus';
import { SummaryDisplay } from './SummaryDisplay';
import { FlashcardViewer } from './FlashcardViewer';
import { HistoryPage } from './HistoryPage';
import { LibraryPage } from './LibraryPage';
import { InformationalPage } from './InformationalPage';
import { FeedbackPage } from './FeedbackPage';
import { ProfilePage } from './ProfilePage';
import { QuizPage } from './QuizPage';
import { EduPlayPage } from './EduPlayPage';
import { GoalsAndAchievementsPage } from './GoalsAndAchievementsPage';
import { StudyRoomsPage } from './StudyRoomsPage';
import { InsufficientCreditsModal } from './InsufficientCreditsModal';
import { LowCreditWarning } from './LowCreditWarning';
import { PersistentSubscriptionModal } from '../Subscription/PersistentSubscriptionModal';
import { usePersistentModal, getFeatureConfig } from '../../contexts/PersistentModalContext';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { useTheme } from '../../contexts/ThemeContext';
import { GlobalChatAssistant } from '../ChatAssistant/GlobalChatAssistant';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { tutorialConfigs } from '../Onboarding/tutorialConfigs';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { supabase } from '../../lib/supabase';
import { extractTextFromFile } from '../../utils/fileProcessor.js';
import { processSummaryBatches, processFlashcardBatches, determineProcessingMode } from '../../utils/queueProcessor.js';
import { processMedicalContent, determineMedicalProcessingMode } from '../../utils/medicalQueueProcessor.js';
import { translateContent, AVAILABLE_LANGUAGES, needsTranslation } from '../../utils/translation.js';
import { normalizeText, generateTextHash, checkCache, storeInCache } from '../../utils/deduplication.js';
import { haikuClient } from '../../utils/haikuClient.js';
import { handleApiError, handleSupabaseError, isOffline } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

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
}

export const Dashboard: React.FC = () => {
  const { user, updateUsage } = useAuth();
  const { hasExceededTokenLimit, getTokensRemaining, hasActiveSubscription } = useSubscription();
  const { showModal, dismissModal, isModalOpen, currentFeature, isDismissed } = usePersistentModal();
  const { getThemeGradient } = useTheme();
  const { isDashboardTutorialCompleted, completeDashboardTutorial, loading: onboardingLoading } = useOnboarding();
  const [showDashboardTutorial, setShowDashboardTutorial] = useState(false);

  // Block admin users from accessing the regular user dashboard
  if (user?.role === 'admin') {
    ErrorLogger.warn('Admin users cannot access the regular user dashboard', { component: 'Dashboard', action: 'accessCheck', userId: user.id });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-gray-300 mb-6">Admin users cannot access the regular user dashboard.</p>
          <a
            href="/admin/dashboard"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to Admin Dashboard
          </a>
        </div>
      </div>
    );
  }

  const [currentView, setCurrentView] = useState<'main' | 'history' | 'library' | 'informational' | 'feedback' | 'profile' | 'quiz' | 'eduplay' | 'goals-achievements' | 'study-rooms'>('main');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
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

  // Check and show dashboard tutorial on first visit
  useEffect(() => {
    if (!onboardingLoading && user && !isDashboardTutorialCompleted) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        setShowDashboardTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [onboardingLoading, user, isDashboardTutorialCompleted]);

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

  const handleProcessInput = async (input: File | string, flashcardCount: number, fromSummary: boolean, medicalMode: boolean = false) => {
    ErrorLogger.debug('Starting handleProcessInput', { component: 'Dashboard', action: 'handleProcessInput', medicalMode, flashcardCount, fromSummary });

    // Check subscription status first
    if (!hasActiveSubscription()) {
      const dismissed = await isDismissed('dashboard_processing');
      if (!dismissed) {
        showModal('dashboard_processing');
        return;
      } else {
        // User has dismissed modal before, show inline message
        setProcessingState(prev => ({
          ...prev,
          stage: 'error',
          progress: 0,
          message: 'Subscription Required',
          error: 'This feature requires an active subscription. Please upgrade to process content.'
        }));
        return;
      }
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
      error: undefined
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
        // Step 1b: Extract text from file
        extractedData = await extractTextFromFile(input, (progress, message) => {
          setProcessingState(prev => ({
            ...prev,
            progress: Math.round(progress * 0.2), // Reserve 20% for file processing
            message
          }));
        });
      }

      // Validate extractedData before proceeding
      if (!extractedData || !extractedData.text || typeof extractedData.text !== 'string') {
        throw new Error('Failed to extract text from file. The file may be corrupted, password-protected, or contain no readable text.');
      }

      // Step 2: Check for cached content using deduplication
      setProcessingState(prev => ({
        ...prev,
        progress: 25,
        message: 'Checking for existing processed content...'
      }));

      try {
        const normalizedText = normalizeText(extractedData.text);
        const contentHash = await generateTextHash(normalizedText);
        const cachedResult = await checkCache(contentHash);

        if (cachedResult) {
          // Found cached content! Use it instead of processing
          ErrorLogger.info('Using cached content, skipping AI processing and token usage tracking', { component: 'Dashboard', action: 'handleProcessInput', step: 'cacheCheck' });

          setProcessingState(prev => ({
            ...prev,
            stage: 'completed',
            progress: 100,
            message: 'Loaded from cache - processing complete! (No tokens used)',
            summaryChunks: [cachedResult.summary],
            flashcards: cachedResult.flashcards,
            originalSummaryChunks: [cachedResult.summary],
            originalFlashcards: cachedResult.flashcards,
            originalText: extractedData.text,
            topics: []
          }));

          // Save cached content to history
          ErrorLogger.debug('Saving cached content to history', { component: 'Dashboard', action: 'handleProcessInput', step: 'saveHistory' });
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
      
      setProcessingState(prev => ({
        ...prev,
        stage: 'processing',
        progress: 30,
        message: medicalMode ? 'Generating medical summary...' : 'Generating summary...',
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
          medicalMode: true,
          textLength: extractedData.text.length 
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
        );

        totalTokens = result.tokens || 0;
        ErrorLogger.debug('Medical mode total tokens used', { component: 'Dashboard', action: 'handleProcessInput', step: 'medicalMode', totalTokens });
        await updateUsage(totalTokens);

        // Capture final values directly from result (synchronously available)
        finalSummary = result.summary || 'No summary generated';
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
          summaryChunks: [finalSummary],
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
        
        const summaryResult = await processSummaryBatches(
          extractedData.text,
          (progress, message) => {
            setProcessingState(prev => ({
              ...prev,
              progress: 30 + Math.round(progress * 0.35), // 30-65% for summary
              message
            }));
          },
          (chunkSummary, chunkIndex, totalChunks) => {
            setProcessingState(prev => ({
              ...prev,
              summaryChunks: [...prev.summaryChunks, chunkSummary]
            }));
          }
        );

        const combinedSummary = summaryResult.summary;
        totalTokens = summaryResult.tokens;

        ErrorLogger.debug('Summary result', {
          component: 'Dashboard',
          action: 'handleProcessInput',
          step: 'summaryGeneration',
          summaryLength: combinedSummary?.length || 0,
          flashcardCount: finalFlashcards?.length || 0, // Use optional chaining for safety
          tokens: totalTokens,
          isEmpty: !combinedSummary || combinedSummary.trim().length === 0
        });

        if (!combinedSummary || combinedSummary.trim().length === 0) {
          throw new Error('Summary generation returned empty content');
        }

        setProcessingState(prev => ({
          ...prev,
          progress: 65,
          message: 'Generating flashcards...',
          summaryChunks: [combinedSummary]
        }));

        const sourceText = fromSummary ? combinedSummary : extractedData.text;
        const flashcardsResult = await processFlashcardBatches(
          sourceText,
          flashcardCount,
          fromSummary ? 'summary' : 'full',
          (progress, message) => {
            setProcessingState(prev => ({
              ...prev,
              progress: 65 + Math.round(progress * 0.25), // 65-90% for flashcards
              message
            }));
          },
          (batchFlashcards, batchIndex, totalBatches) => {
            setProcessingState(prev => ({
              ...prev,
              flashcards: [...prev.flashcards, ...batchFlashcards]
            }));
          }
        );

        const flashcards = flashcardsResult.flashcards;
        totalTokens += flashcardsResult.tokens;

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
          ErrorLogger.warn('Topic detection failed, continuing without topics', { component: 'Dashboard', action: 'detectTopics', topicError: topicError instanceof Error ? topicError : new Error(String(topicError)) });
          detectedTopics = [];
        }

        // Update usage with total tokens consumed
        ErrorLogger.debug('Total tokens used', { component: 'Dashboard', action: 'handleProcessInput', step: 'tokenUsage', totalTokens });
        await updateUsage(totalTokens);

        // Capture final values directly from processing results (synchronously available)
        finalSummary = combinedSummary || 'No summary generated';
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
          summaryChunks: [finalSummary],
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
        const normalizedText = normalizeText(extractedData.text);
        const contentHash = await generateTextHash(normalizedText);
        await storeInCache(contentHash, finalSummary, finalFlashcards);
        ErrorLogger.info('Successfully cached processed content', { component: 'Dashboard', action: 'handleProcessInput', step: 'cacheStore', summaryLength: finalSummary.length });
      } catch (cacheError) {
        ErrorLogger.warn('Failed to cache results, but continuing', { component: 'Dashboard', action: 'handleProcessInput', step: 'cacheStore', cacheError });
      }

      // Step 7: Complete processing
      setProcessingState(prev => ({
        ...prev,
        stage: 'completed',
        progress: 100,
        message: medicalMode ? 'Medical content processing complete!' : 'Processing complete!',
        summaryChunks: [finalSummary],
        flashcards: finalFlashcards,
        originalSummaryChunks: [finalSummary],
        originalFlashcards: finalFlashcards,
        originalText: extractedData.text,
        topics: finalTopics,
        ...(medicalMode && finalMedicalScore !== undefined && { medicalScore: finalMedicalScore })
      }));

      // Step 8: Save to history with captured values
      ErrorLogger.debug('Saving history entry', { component: 'Dashboard', action: 'handleProcessInput', step: 'saveHistory', summaryLength: finalSummary.length, flashcardCount: finalFlashcards.length });
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

      ErrorLogger.info('Processing complete! Summary and flashcards are ready for display', { component: 'Dashboard', action: 'handleProcessInput', summaryLength: finalSummary.length, flashcardCount: finalFlashcards.length });

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

  const handleProcessInputWrapper = (input: File | string, flashcardCount: number, fromSummary: boolean, medicalMode: boolean = false) => {
    handleProcessInput(input, flashcardCount, fromSummary, medicalMode).catch(error => {
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
        ErrorLogger.info('Successfully saved to library', { component: 'Dashboard', action: 'handleProcessInput', step: 'saveToLibrary' });
        
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

  const saveToLibraryWithCustomTitle = async (
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
        ErrorLogger.info('Successfully saved to library', { component: 'Dashboard', action: 'handleProcessInput', step: 'saveToLibrary' });
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
          ErrorLogger.debug('Translation progress', { component: 'Dashboard', action: 'handleProcessInput', step: 'translation', progress, message });
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

  const resetProcessing = () => {
    setCurrentView('main');
    setIsSidebarOpen(true);
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

  const featureConfig = getFeatureConfig('dashboard_processing');

  return (
    <div className={`min-h-screen w-full flex flex-col ${getThemeGradient('bg')}`}>
      {/* Persistent Subscription Modal */}
      <PersistentSubscriptionModal
        isOpen={isModalOpen && currentFeature === 'dashboard_processing'}
        onDismiss={dismissModal}
        featureName="dashboard_processing"
        featureTitle={featureConfig.title}
        benefits={featureConfig.benefits}
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
          className="flex-1 transition-all duration-300 ease-in-out"
          style={{
            marginLeft: isMobile ? '0' : (isSidebarOpen ? '128px' : '32px')
          }}
        >
          {/* Mobile menu button */}
          {isMobile && !isSidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="fixed bottom-6 left-6 z-30 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition duration-150"
              aria-label="Open menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
            {currentView === 'history' && (
              <HistoryPage key="history" />
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

            {currentView === 'goals-achievements' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
                <Target className="h-24 w-24 text-gray-300 dark:text-gray-600 mx-auto mb-6" />
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  Goals & Achievements Coming Soon
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-lg mb-6">
                  We're working on an exciting goal-setting and achievement tracking system to help you stay motivated and track your progress.
                </p>
                <div className="space-y-3 text-left max-w-md mx-auto mb-8">
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">
                      <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 dark:text-gray-300 font-medium">Study Goals</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Set and track personal study goals</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">
                      <Award className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 dark:text-gray-300 font-medium">Achievements</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Unlock badges and earn rewards</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">
                      <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 dark:text-gray-300 font-medium">Progress Tracking</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Monitor your learning journey over time</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="mt-1">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 dark:text-gray-300 font-medium">Milestones</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Celebrate reaching important milestones</p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCurrentView('main')}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Back to Dashboard
                </button>
              </div>
            )}

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
                onReset={resetProcessing}
              />
            )}

            {currentView === 'main' && processingState.stage === 'completed' && (
              <div className="space-y-8">
                {/* Language Selector */}
                <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-gray-800 dark:shadow-none">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
                        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                        </svg>
                      </div>
                      <div> {/* Apply dark mode classes to language selector text */}
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Content Language</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {processingState.translating ? 'Translating content...' : 'Choose a language for your summary and flashcards'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <select
                        value={processingState.selectedLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        disabled={processingState.translating}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                      >
                        {AVAILABLE_LANGUAGES.map((lang) => (
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

                <SummaryDisplay 
                  summaryChunks={processingState.summaryChunks}
                  flashcards={processingState.flashcards}
                  originalText={processingState.originalText}
                  topics={processingState.topics}
                  medicalMode={processingState.medicalMode}
                  medicalScore={processingState.medicalScore}
                  onPublishToLibrary={handlePublishToLibrary}
                  onReset={resetProcessing}
                />
                <FlashcardViewer 
                  flashcards={processingState.flashcards}
                  medicalMode={processingState.medicalMode}
                />
              </div>
            )}

            {currentView === 'main' && processingState.stage === 'error' && (
              <div className="text-center py-12">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md mx-auto dark:bg-red-900 dark:border-red-700">
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
      {tutorialConfigs.dashboard && (
        <PageTutorial
          config={tutorialConfigs.dashboard}
          isOpen={showDashboardTutorial}
          onClose={() => setShowDashboardTutorial(false)}
          onComplete={completeDashboardTutorial}
          onSkip={completeDashboardTutorial}
        />
      )}
    </div>
  );
};