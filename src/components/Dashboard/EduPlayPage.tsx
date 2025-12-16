import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Gamepad2, Play, Users, Clock, Trophy, Copy, Check, LogOut, Crown, Target, Sparkles, BookOpen, Edit, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useSubscription } from '../../hooks/useSubscription';
import { useTheme } from '../../contexts/ThemeContext';
import { getGameJoinUrl } from '../../utils/getBaseUrl';
import { ManualQuestionBuilder } from './ManualQuestionBuilder';
import { AIQuestionGenerator } from './AIQuestionGenerator';
import { BrainRushGamePlay } from './BrainRushGamePlay';
import { BrainRushResults } from './BrainRushResults';
import MultiplayerMenu from './MultiplayerMenu';
import MultiplayerLobby from './MultiplayerLobby';
import MultiplayerGamePlay from './MultiplayerGamePlay';
import MultiplayerResults from './MultiplayerResults';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';

interface GameSession {
  id: string;
  host_id: string;
  game_code: string;
  game_title: string;
  quiz_session_id: string | null;
  question_timer_seconds: number;
  total_questions: number;
  difficulty_level: string;
  status: string;
  current_question_index: number;
  created_at: string;
  game_type: string;
  question_source_type: string;
}

interface Participant {
  id: string;
  game_session_id: string;
  user_id: string | null;
  display_name: string;
  score: number;
  rank: number | null;
  is_host: boolean;
  joined_at: string;
}

interface BrainRushQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
}

interface GameQuestion {
  id?: string;
  game_session_id: string;
  question_index: number;
  question_text: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  time_limit_seconds: number;
}

type ViewMode = 'menu' | 'game-selection' | 'question-source' | 'ai-generate' | 'manual-build' | 'game-settings' | 'join-game' | 'lobby' | 'game-active' | 'results' | 'multiplayer-menu' | 'multiplayer-lobby' | 'multiplayer-game' | 'multiplayer-results';
type QuestionSource = 'auto_generated' | 'manual' | 'saved_set' | 'quiz_session' | null;

export const EduPlayPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { error: showErrorToast } = useToast();
  const { getThemeGradient, getThemeBorder, getThemeFocusRing } = useTheme();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('eduplay');
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [questionSource, setQuestionSource] = useState<QuestionSource>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<BrainRushQuestion[]>([]);
  const [multiplayerLobbyId, setMultiplayerLobbyId] = useState<string | null>(null);

  const [currentGame, setCurrentGame] = useState<GameSession | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Game settings
  const [gameTitle, setGameTitle] = useState('');
  const [questionTimer, setQuestionTimer] = useState(30);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [creating, setCreating] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const { hasActiveSubscription } = useSubscription();

  // Check for game parameter in URL and auto-join game
  useEffect(() => {
    const gameId = searchParams.get('game');
    if (gameId && user && !currentGame) {
      loadGameFromUrl(gameId);
    }
  }, [searchParams, user]);

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial && viewMode === 'menu') {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, viewMode, showTutorial]);

  const loadGameFromUrl = async (gameId: string) => {
    try {
      ErrorLogger.debug('Loading game from URL parameter', { component: 'EduPlayPage', action: 'loadGameFromUrl', gameId });

      // Fetch the game session
      const { data: gameData, error: gameError } = await supabase
        .from('eduplay_game_sessions')
        .select('*')
        .eq('id', gameId)
        .maybeSingle();

      if (gameError || !gameData) {
        const error = gameError instanceof Error ? gameError : new Error('Failed to load game');
        ErrorLogger.error(error, { component: 'EduPlayPage', action: 'loadGameFromUrl', gameCode: code });
        showErrorToast('Invalid game link or game not found');
        return;
      }

      // Check if user is already a participant
      const { data: participantData, error: participantError } = await supabase
        .from('eduplay_participants')
        .select('*')
        .eq('game_session_id', gameId)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (participantError) {
        const error = participantError instanceof Error ? participantError : new Error('Failed to check participant status');
        ErrorLogger.error(error, { component: 'EduPlayPage', action: 'loadGameFromUrl', gameCode: code });
        return;
      }

      if (!participantData) {
        ErrorLogger.warn('User is not a participant in this game', { component: 'EduPlayPage', action: 'loadGameFromUrl', gameId, userId: user?.id });
        showErrorToast('You are not a participant in this game');
        return;
      }

      // Set the game state
      setCurrentGame(gameData);
      setIsHost(participantData.is_host);

      // Navigate to appropriate view based on game status
      if (gameData.status === 'waiting') {
        setViewMode('lobby');
      } else if (gameData.status === 'in_progress') {
        setViewMode('game-active');
      } else if (gameData.status === 'completed') {
        setViewMode('results');
      }

      ErrorLogger.info('Game loaded successfully from URL', { component: 'EduPlayPage', action: 'loadGameFromUrl', gameId });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'EduPlayPage', action: 'loadGameFromUrl' });
      showErrorToast('Failed to load game. Please try again.');
    }
  };

  useEffect(() => {
    if (currentGame) {
      fetchParticipants();

      const participantsChannel = supabase
        .channel(`game-${currentGame.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'eduplay_participants',
            filter: `game_session_id=eq.${currentGame.id}`
          },
          () => {
            fetchParticipants();
          }
        )
        .subscribe();

      const gameStateChannel = supabase
        .channel(`game-state-${currentGame.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'eduplay_game_sessions',
            filter: `id=eq.${currentGame.id}`
          },
          (payload) => {
            const updated = payload.new as GameSession;
            setCurrentGame(updated);

            if (updated.status === 'in_progress' && viewMode === 'lobby') {
              setViewMode('game-active');
            } else if (updated.status === 'completed' && viewMode === 'game-active') {
              setViewMode('results');
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(participantsChannel);
        supabase.removeChannel(gameStateChannel);
      };
    }
  }, [currentGame, viewMode]);

  const fetchParticipants = async () => {
    if (!currentGame) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('eduplay_participants')
        .select('*')
        .eq('game_session_id', currentGame.id)
        .is('left_at', null)
        .order('score', { ascending: false });

      if (error) {
        const message = handleSupabaseError(error, { component: 'EduPlayPage', action: 'fetchParticipants', metadata: { gameId: currentGame.id } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'EduPlayPage', action: 'fetchParticipants', metadata: { gameId: currentGame.id } });
        showErrorToast(message);
        return;
      }

      if (data) {
        setParticipants(data);
      }
    } catch (error) {
      const message = handleApiError(error, { component: 'EduPlayPage', action: 'fetchParticipants', metadata: { gameId: currentGame?.id } });
      showErrorToast(message);
    }
  };

  const handleQuestionsGenerated = (questions: BrainRushQuestion[]) => {
    setGeneratedQuestions(questions);
    setQuestionCount(questions.length);
    setViewMode('game-settings');
  };

  const handleManualQuestionsSaved = (questions: Array<{ question: string; options: string[]; correct_answer: number | string; difficulty?: string }>, setName?: string) => {
    const brainRushQuestions: BrainRushQuestion[] = questions.map(q => {
      // Handle both number index and string value for correct_answer
      const correctAnswer = typeof q.correct_answer === 'number' 
        ? q.options[q.correct_answer] 
        : q.correct_answer;
      
      return {
        question: q.question,
        options: q.options,
        correct_answer: correctAnswer,
        difficulty: q.difficulty || 'medium'
      };
    });

    setGeneratedQuestions(brainRushQuestions);
    setQuestionCount(questions.length);
    setViewMode('game-settings');
  };

  const handleCreateGame = async () => {
    if (!user || !gameTitle.trim() || generatedQuestions.length === 0) {
      showErrorToast('Please enter a game title and generate questions first');
      return;
    }

    // Check subscription first
    if (!hasActiveSubscription()) {
      setShowSubscriptionModal(true);
      return;
    }

    try {
      setCreating(true);

      // Validate questions before proceeding
      ErrorLogger.debug('Validating generated questions', { component: 'EduPlayPage', action: 'handleCreateGame', questionCount: generatedQuestions.length });

      if (!generatedQuestions || generatedQuestions.length === 0) {
        throw new Error('No questions available. Please generate questions first.');
      }

      // Validate question format
      const invalidQuestions = generatedQuestions.filter((q, index) => {
        const isValid = q.question &&
                       Array.isArray(q.options) &&
                       q.options.length === 4 &&
                       q.correct_answer &&
                       q.options.includes(q.correct_answer);
        if (!isValid) {
          const error = new Error(`Invalid question at index ${index}`);
          ErrorLogger.error(error, { component: 'EduPlayPage', action: 'validateQuestions', questionIndex: index, question: q });
        }
        return !isValid;
      });

      if (invalidQuestions.length > 0) {
        throw new Error(`${invalidQuestions.length} question(s) have invalid format. Please regenerate questions.`);
      }

      ErrorLogger.info('All questions validated successfully', { component: 'EduPlayPage', action: 'handleCreateGame', questionCount: generatedQuestions.length });
      ErrorLogger.debug('Step 1: Generating game code', { component: 'EduPlayPage', action: 'handleCreateGame' });

      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_eduplay_game_code');

      if (codeError) {
        const error = new Error(`Failed to generate game code: ${codeError.message || 'Unknown error'}`);
        ErrorLogger.error(error, { component: 'EduPlayPage', action: 'handleCreateGame', codeError });
        throw error;
      }

      const gameCode = codeData;
      ErrorLogger.info('Game code generated', { component: 'EduPlayPage', action: 'handleCreateGame', gameCode });
      ErrorLogger.debug('Step 2: Creating game session', { component: 'EduPlayPage', action: 'handleCreateGame' });

      const gameSessionData = {
        host_id: user.id,
        game_code: gameCode,
        game_title: gameTitle.trim(),
        quiz_session_id: null,
        question_timer_seconds: questionTimer,
        total_questions: generatedQuestions.length,
        difficulty_level: difficulty,
        status: 'waiting',
        game_type: 'brain_rush',
        question_source_type: questionSource || 'auto_generated',
        current_question_index: 0
      };

      ErrorLogger.debug('Game session data to insert', { component: 'EduPlayPage', action: 'handleCreateGame', gameSessionData });

      const { data: gameData, error: gameError } = await supabase
        .from('eduplay_game_sessions')
        .insert(gameSessionData)
        .select()
        .maybeSingle();

      if (gameError) {
        let errorMessage = 'Failed to create game session.';
        if (gameError.message) {
          errorMessage += ` Database error: ${gameError.message}`;
        }
        if (gameError.details) {
          errorMessage += ` Details: ${gameError.details}`;
        }
        if (gameError.hint) {
          errorMessage += ` Hint: ${gameError.hint}`;
        }
        throw new Error(errorMessage);
      }

      if (!gameData) {
        const error = new Error('Game was not created properly');
        ErrorLogger.error(error, { component: 'EduPlayPage', action: 'handleCreateGame' });
        throw error;
      }

      ErrorLogger.info('Game session created', { component: 'EduPlayPage', action: 'handleCreateGame', gameSessionId: gameData.id });

      ErrorLogger.debug('Step 3: Inserting questions', { component: 'EduPlayPage', action: 'handleCreateGame', questionCount: generatedQuestions.length });
      const questionInserts = generatedQuestions.map((q, index) => ({
        game_session_id: gameData.id,
        question_index: index,
        question_text: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        difficulty: q.difficulty,
        time_limit_seconds: questionTimer
      }));

      ErrorLogger.debug('Question inserts to database', { component: 'EduPlayPage', action: 'handleCreateGame', questionCount: questionInserts.length });

      const { error: questionsError } = await supabase
        .from('eduplay_game_questions')
        .insert(questionInserts);

      if (questionsError) {
        let errorMessage = 'Failed to insert questions.';
        if (questionsError.message) {
          errorMessage += ` Database error: ${questionsError.message}`;
        }
        if (questionsError.details) {
          errorMessage += ` Details: ${questionsError.details}`;
        }
        throw new Error(errorMessage);
      }

      ErrorLogger.info('Questions inserted successfully', { component: 'EduPlayPage', action: 'handleCreateGame', questionCount: questionInserts.length });

      ErrorLogger.debug('Step 4: Adding host as participant', { component: 'EduPlayPage', action: 'handleCreateGame' });
      const hostData = {
        game_session_id: gameData.id,
        user_id: user.id,
        display_name: user.email?.split('@')[0] || 'Host',
        is_host: true
      };

      ErrorLogger.debug('Host participant data', { component: 'EduPlayPage', action: 'handleCreateGame', hostData });

      const { error: participantError } = await supabase
        .from('eduplay_participants')
        .insert(hostData);

      if (participantError) {
        const errorMessage = handleSupabaseError(participantError, { component: 'EduPlayPage', action: 'handleCreateGame', metadata: { step: 'addHostParticipant' } });
        ErrorLogger.error(participantError instanceof Error ? participantError : new Error(String(participantError)), { component: 'EduPlayPage', action: 'handleCreateGame', metadata: { step: 'addHostParticipant' } });
        throw new Error(errorMessage);
      }

      ErrorLogger.info('Host added as participant', { component: 'EduPlayPage', action: 'handleCreateGame', gameSessionId: gameData.id });
      ErrorLogger.debug('Step 5: Setting game state', { component: 'EduPlayPage', action: 'handleCreateGame' });

      setCurrentGame(gameData);
      setIsHost(true);
      setViewMode('lobby');

      ErrorLogger.info('Game created successfully', { component: 'EduPlayPage', action: 'handleCreateGame', gameSessionId: gameData.id, gameCode });
    } catch (error) {
      const errorMessage = handleApiError(error, { component: 'EduPlayPage', action: 'handleCreateGame' });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'EduPlayPage', action: 'handleCreateGame' });
      showErrorToast(errorMessage);
    } finally {
      ErrorLogger.debug('Setting creating to false', { component: 'EduPlayPage', action: 'handleCreateGame' });
      setCreating(false);
    }
  };

  const handleJoinGame = async () => {
    if (!user || !joinCode.trim() || !displayName.trim()) {
      showErrorToast('Please enter game code and your name');
      return;
    }

    try {
      const { data: gameData, error: gameError } = await supabase
        .from('eduplay_game_sessions')
        .select('*')
        .eq('game_code', joinCode.toUpperCase())
        .eq('status', 'waiting')
        .single();

      if (gameError) {
        if (gameError.code === 'PGRST116') {
          showErrorToast('Game code not found. Please check the code and try again.');
        } else {
          showErrorToast('Failed to find game. Please try again.');
        }
        return;
      }

      if (!gameData) {
        showErrorToast('Game not found. The code may be incorrect or the game may have ended.');
        return;
      }

      if (gameData.status !== 'waiting') {
        showErrorToast('This game has already started. Please join another game.');
        return;
      }

      const { error: participantError } = await supabase
        .from('eduplay_participants')
        .insert({
          game_session_id: gameData.id,
          user_id: user.id,
          display_name: displayName.trim(),
          is_host: false
        });

      if (participantError) {
        showErrorToast('Failed to join game. You may already be in this game.');
        return;
      }

      setCurrentGame(gameData);
      setIsHost(false);
      setViewMode('lobby');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'EduPlayPage', action: 'handleJoinGame', gameCode });
      showErrorToast('Failed to join game. Please try again.');
    }
  };

  const handleStartGame = async () => {
    if (!currentGame || !isHost || startingGame) return;

    setStartingGame(true);
    try {
      const { error } = await supabase
        .from('eduplay_game_sessions')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', currentGame.id);

      if (error) {
        const errorMessage = handleSupabaseError(error, { 
          component: 'EduPlayPage', 
          action: 'handleStartGame',
          gameSessionId: currentGame.id
        });
        ErrorLogger.error(error, { 
          component: 'EduPlayPage', 
          action: 'handleStartGame',
          gameSessionId: currentGame.id
        });
        showErrorToast(errorMessage);
        return;
      }

      setViewMode('game-active');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'EduPlayPage', action: 'handleStartGame', gameSessionId: currentGame?.id });
      const errorMessage = handleApiError(error, { component: 'EduPlayPage', action: 'handleStartGame' });
      showErrorToast(errorMessage);
    } finally {
      setStartingGame(false);
    }
  };

  const handleLeaveGame = async () => {
    if (!currentGame) return;

    try {
      const myParticipant = participants.find(p => p.user_id === user?.id);

      if (myParticipant) {
        await supabase
          .from('eduplay_participants')
          .update({ left_at: new Date().toISOString() })
          .eq('id', myParticipant.id);
      }

      if (isHost) {
        await supabase
          .from('eduplay_game_sessions')
          .update({ status: 'cancelled' })
          .eq('id', currentGame.id);
      }

      setCurrentGame(null);
      setParticipants([]);
      setIsHost(false);
      setGeneratedQuestions([]);
      setViewMode('menu');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'EduPlayPage', action: 'handleLeaveGame', gameSessionId: currentGameSession?.id });
    }
  };

  const copyGameCode = () => {
    if (currentGame) {
      navigator.clipboard.writeText(currentGame.game_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const renderMenu = () => (
    <div className="w-full">
      <div className="mb-12 text-center">
        <Gamepad2 className="h-20 w-20 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
        <h2 className="text-5xl font-bold text-gray-900 mb-4 dark:text-gray-100">EduPlay</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          onClick={() => setViewMode('game-selection')}
          className={`group ${getThemeGradient('ui')} hover:opacity-90 text-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all transform hover:scale-105`}
        >
          <div className="bg-white/20 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Target className="h-12 w-12" />
          </div>
          <h3 className="text-2xl font-bold mb-2">Brain Rush</h3>
          <p className="text-purple-100">Fast-paced 4-choice quiz battles</p>
          <div className="mt-4 text-sm text-purple-200">Compete in real-time!</div>
        </button>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-8 border-2 border-dashed ${getThemeBorder()} opacity-50 flex flex-col items-center justify-center opacity-60">
          <div className="bg-gray-200 dark:bg-gray-700 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-600 dark:text-gray-400">Coming Soon</h3>
          <p className="text-sm text-gray-500 dark:text-gray-500 text-center">More exciting games on the way!</p>
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-8 border-2 border-dashed ${getThemeBorder()} opacity-50 flex flex-col items-center justify-center opacity-60">
          <div className="bg-gray-200 dark:bg-gray-700 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-600 dark:text-gray-400">Coming Soon</h3>
          <p className="text-sm text-gray-500 dark:text-gray-500 text-center">More exciting games on the way!</p>
        </div>
      </div>
    </div>
  );

  const renderGameSelection = () => (
    <div className="w-full max-w-4xl mx-auto">
      <button
        onClick={() => setViewMode('menu')}
        className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Back to Games</span>
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
        <div className="text-center mb-8">
          <div className={`${getThemeGradient('ui')} rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4`}>
            <Target className="h-16 w-16 text-white" />
          </div>
          <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Brain Rush</h2>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Fast-paced multiplayer quiz game with 4-choice questions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={() => setViewMode('question-source')}
            className={`${getThemeGradient('ui')} hover:opacity-90 text-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all transform hover:scale-105`}
          >
            <Crown className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Host a Game</h3>
            <p className="text-blue-100">Create your own Brain Rush game</p>
          </button>

          <button
            onClick={() => setViewMode('join-game')}
            className="bg-gradient-to-br from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all transform hover:scale-105"
          >
            <Users className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Join a Game</h3>
            <p className="text-green-100">Enter a code to join a game</p>
          </button>

          <button
            onClick={() => setViewMode('multiplayer-menu')}
            className={`${getThemeGradient('ui')} hover:opacity-90 text-white rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all transform hover:scale-105`}
          >
            <Users className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Multiplayer</h3>
            <p className="text-purple-100">Real-time competitive mode</p>
          </button>
        </div>
      </div>

      <div className={`${getThemeGradient('bg')} rounded-xl p-6`}>
        <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
          <Trophy className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <span>How to Play</span>
        </h4>
        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
          <li className="flex items-start space-x-2">
            <span className="text-purple-600 dark:text-purple-400 font-bold">1.</span>
            <span>Answer 4-choice questions as fast as you can</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-purple-600 dark:text-purple-400 font-bold">2.</span>
            <span>Earn more points for correct answers and faster times</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-purple-600 dark:text-purple-400 font-bold">3.</span>
            <span>Compete with friends to reach the top of the leaderboard</span>
          </li>
        </ul>
      </div>
    </div>
  );

  const renderQuestionSource = () => (
    <div className="w-full max-w-4xl mx-auto">
      <button
        onClick={() => setViewMode('game-selection')}
        className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Back</span>
      </button>

      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Choose Question Source</h2>
        <p className="text-gray-600 dark:text-gray-400">How would you like to create your questions?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={() => {
            setQuestionSource('auto_generated');
            setViewMode('ai-generate');
          }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all border-2 border-transparent hover:border-purple-500 dark:hover:border-purple-400"
        >
          <div className={`${getThemeGradient('bg')} rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4`}>
            <Sparkles className="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">AI Generate</h3>
          <p className="text-gray-600 dark:text-gray-400">Let AI create questions about any topic</p>
        </button>

        <button
          onClick={() => {
            setQuestionSource('manual');
            setViewMode('manual-build');
          }}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl hover:shadow-2xl transition-all border-2 border-transparent hover:${getThemeBorder()}`}
        >
          <div className={`${getThemeGradient('bg')} rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4`}>
            <Edit className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Manual Build</h3>
          <p className="text-gray-600 dark:text-gray-400">Create your own custom questions</p>
        </button>
      </div>
    </div>
  );

  const renderGameSettings = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Game Settings</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Game Title
            </label>
            <input
              type="text"
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              placeholder="e.g., Biology Quiz Battle"
              className={`w-full px-4 py-3 border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Questions
              </label>
              <input
                type="number"
                value={questionCount}
                disabled
                className={`w-full px-4 py-3 border ${getThemeBorder()} rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-100`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Timer (seconds)
              </label>
              <input
                type="number"
                value={questionTimer}
                onChange={(e) => setQuestionTimer(Number(e.target.value))}
                min="5"
                max="60"
                className={`w-full px-4 py-3 border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              onClick={() => setViewMode('question-source')}
              className={`flex-1 px-6 py-3 border ${getThemeBorder()} text-gray-700 rounded-lg hover:bg-gray-50 transition dark:text-gray-300 dark:hover:bg-gray-700`}
            >
              Back
            </button>
            <button
              onClick={handleCreateGame}
              disabled={creating || !gameTitle.trim()}
              className={`flex-1 px-6 py-3 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2`}
            >
              <Play className="h-5 w-5" />
              <span>{creating ? 'Creating...' : 'Create Game'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderJoinGame = () => (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => setViewMode('game-selection')}
        className="mb-6 flex items-center space-x-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Back</span>
      </button>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Join Game</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Game Code
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className={`w-full px-4 py-3 text-2xl text-center font-bold tracking-widest border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              maxLength={50}
              className={`w-full px-4 py-3 border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
            />
          </div>

          <button
            onClick={handleJoinGame}
            disabled={!joinCode.trim() || !displayName.trim()}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Game
          </button>
        </div>
      </div>
    </div>
  );

  const renderLobby = () => {
    const joinUrl = currentGame ? getGameJoinUrl(currentGame.game_code) : '';

    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {currentGame?.game_title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {currentGame?.total_questions} questions • {currentGame?.question_timer_seconds}s per question
            </p>

            {/* Game Code and QR Code Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Game Code */}
              <div className={`${getThemeGradient('bg')} rounded-xl p-6 border-2 ${getThemeBorder()} opacity-50`}>
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Game Code</span>
                </div>
                <div className="flex items-center justify-center space-x-3 mb-3">
                  <span className="text-5xl font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                    {currentGame?.game_code}
                  </span>
                </div>
                <button
                  onClick={copyGameCode}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center space-x-2"
                >
                  {copiedCode ? (
                    <>
                      <Check className="h-5 w-5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>

              {/* QR Code */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border-2 border-green-300 dark:border-green-700">
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <QrCode className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Scan to Join</span>
                </div>
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg inline-block">
                    <QRCodeSVG
                      value={joinUrl}
                      size={160}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Players ({participants.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {participants.map((participant, index) => (
              <div
                key={participant.id}
                className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-lg p-4 flex items-center space-x-3"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {participant.display_name}
                    {participant.is_host && <Crown className="h-4 w-4 inline ml-1 text-yellow-500" />}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {participants.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Waiting for players to join...</p>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleLeaveGame}
            className={`flex-1 px-6 py-3 border ${getThemeBorder()} text-gray-700 rounded-lg hover:bg-gray-50 transition dark:text-gray-300 dark:hover:bg-gray-700 flex items-center justify-center space-x-2`}
          >
            <LogOut className="h-5 w-5" />
            <span>Leave Game</span>
          </button>
          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={participants.length < 1 || startingGame}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Play className="h-5 w-5" />
              <span>{startingGame ? 'Starting...' : 'Start Game'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
  };

  const renderGameActive = () => {
    if (!currentGame) return null;

    return (
      <BrainRushGamePlay
        gameSession={currentGame}
        participants={participants}
        isHost={isHost}
        onGameEnd={() => setViewMode('results')}
      />
    );
  };

  const renderResults = () => {
    if (!currentGame) return null;

    return (
      <BrainRushResults
        gameSession={currentGame}
        participants={participants}
        onReturnHome={() => {
          setCurrentGame(null);
          setParticipants([]);
          setIsHost(false);
          setGeneratedQuestions([]);
          setViewMode('menu');
        }}
      />
    );
  };

  const renderMultiplayerMenu = () => (
    <MultiplayerMenu
      onLobbyJoined={(lobbyId) => {
        setMultiplayerLobbyId(lobbyId);
        setViewMode('multiplayer-lobby');
      }}
      onBack={() => setViewMode('game-selection')}
    />
  );

  const renderMultiplayerLobby = () => {
    if (!multiplayerLobbyId) return null;

    return (
      <MultiplayerLobby
        lobbyId={multiplayerLobbyId}
        onExit={() => {
          setMultiplayerLobbyId(null);
          setViewMode('multiplayer-menu');
        }}
      />
    );
  };

  const renderMultiplayerGame = () => {
    if (!multiplayerLobbyId) return null;

    return <MultiplayerGamePlay lobbyId={multiplayerLobbyId} />;
  };

  const renderMultiplayerResults = () => {
    if (!multiplayerLobbyId) return null;

    return <MultiplayerResults lobbyId={multiplayerLobbyId} />;
  };

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} p-6`}>
      {viewMode === 'menu' && renderMenu()}
      {viewMode === 'game-selection' && renderGameSelection()}
      {viewMode === 'question-source' && renderQuestionSource()}
      {viewMode === 'ai-generate' && (
        <AIQuestionGenerator
          onQuestionsGenerated={handleQuestionsGenerated}
          onCancel={() => setViewMode('question-source')}
          questionCount={questionCount}
          difficulty={difficulty}
        />
      )}
      {viewMode === 'manual-build' && (
        <ManualQuestionBuilder
          onSaveQuestions={handleManualQuestionsSaved}
          onCancel={() => setViewMode('question-source')}
        />
      )}
      {viewMode === 'game-settings' && renderGameSettings()}
      {viewMode === 'join-game' && renderJoinGame()}
      {viewMode === 'lobby' && renderLobby()}
      {viewMode === 'game-active' && renderGameActive()}
      {viewMode === 'results' && renderResults()}
      {viewMode === 'multiplayer-menu' && renderMultiplayerMenu()}
      {viewMode === 'multiplayer-lobby' && renderMultiplayerLobby()}
      {viewMode === 'multiplayer-game' && renderMultiplayerGame()}
      {viewMode === 'multiplayer-results' && renderMultiplayerResults()}

      {/* EduPlay Tutorial */}
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
