import React, { useState, useEffect } from 'react';
import { Clock, Trophy, Users, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { BrainRushQuestionResults } from './BrainRushQuestionResults';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

interface GameSession {
  id: string;
  host_id: string;
  game_code: string;
  game_title: string;
  question_timer_seconds: number;
  total_questions: number;
  difficulty_level: string;
  status: string;
  current_question_index: number;
}

interface GameQuestion {
  id: string;
  game_session_id: string;
  question_index: number;
  question_text: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  time_limit_seconds: number;
}

interface Participant {
  id: string;
  display_name: string;
  score: number;
  is_host: boolean;
  user_id: string | null;
}

interface Answer {
  participant_id: string;
  selected_answer: string;
  is_correct: boolean;
  time_taken_seconds: number;
}

interface BrainRushGamePlayProps {
  gameSession: GameSession;
  participants: Participant[];
  isHost: boolean;
  onGameEnd: () => void;
}

export const BrainRushGamePlay: React.FC<BrainRushGamePlayProps> = ({
  gameSession,
  participants: initialParticipants,
  isHost,
  onGameEnd
}) => {
  const { user } = useAuth();
  const { error: showErrorToast } = useToast();
  const [currentQuestion, setCurrentQuestion] = useState<GameQuestion | null>(null);
  const [timeLeft, setTimeLeft] = useState(gameSession.question_timer_seconds);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [showQuestionResults, setShowQuestionResults] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [loading, setLoading] = useState(true);
  const [currentAnswers, setCurrentAnswers] = useState<Answer[]>([]);
  const [gameState, setGameState] = useState(gameSession);

  useEffect(() => {
    if (!gameSession?.id) return;

    loadCurrentQuestion();
    const gameCleanup = subscribeToGameUpdates();
    const participantCleanup = subscribeToParticipantUpdates();

    return () => {
      gameCleanup();
      participantCleanup();
    };
  }, [gameSession.id]);

  useEffect(() => {
    if (gameState.current_question_index !== currentQuestion?.question_index) {
      loadCurrentQuestion();
      resetQuestionState();
    }
  }, [gameState.current_question_index]);

  useEffect(() => {
    if (timeLeft > 0 && !hasAnswered && !showQuestionResults) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && !hasAnswered) {
      handleTimeUp();
    }
  }, [timeLeft, hasAnswered, showQuestionResults]);

  const subscribeToGameUpdates = () => {
    const channel = supabase
      .channel(`game-state-${gameSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'eduplay_game_sessions',
          filter: `id=eq.${gameSession.id}`
        },
        (payload) => {
          const updated = payload.new as GameSession;
          setGameState(updated);

          if (updated.status === 'completed') {
            onGameEnd();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToParticipantUpdates = () => {
    const channel = supabase
      .channel(`participants-${gameSession.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'eduplay_participants',
          filter: `game_session_id=eq.${gameSession.id}`
        },
        () => {
          fetchParticipants();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const fetchParticipants = async () => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('eduplay_participants')
        .select('*')
        .eq('game_session_id', gameSession.id)
        .is('left_at', null)
        .order('score', { ascending: false });

      if (error) {
        ErrorLogger.error(error, { 
          component: 'BrainRushGamePlay', 
          action: 'fetchParticipants',
          gameSessionId: gameSession.id,
          userId: user?.id
        });
        // Non-blocking for game flow
        return;
      }

      if (data) {
        setParticipants(data);
      }
    } catch (error) {
      ErrorLogger.error(error, { 
        component: 'BrainRushGamePlay', 
        action: 'fetchParticipants',
        gameSessionId: gameSession.id,
        userId: user?.id
      });
      // Non-blocking for game flow
    }
  };

  const loadCurrentQuestion = async () => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('eduplay_game_questions')
        .select('*')
        .eq('game_session_id', gameSession.id)
        .eq('question_index', gameState.current_question_index)
        .single();

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'BrainRushGamePlay', 
          action: 'loadCurrentQuestion',
          gameSessionId: gameSession.id,
          questionIndex: gameState.current_question_index
        });
        ErrorLogger.error(error, { 
          component: 'BrainRushGamePlay', 
          action: 'loadCurrentQuestion',
          gameSessionId: gameSession.id,
          questionIndex: gameState.current_question_index,
          userId: user?.id
        });
        showErrorToast(message);
        return;
      }

      if (data) {
        setCurrentQuestion(data);
        setTimeLeft(data.time_limit_seconds);
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'BrainRushGamePlay', 
        action: 'loadCurrentQuestion',
        gameSessionId: gameSession.id
      });
      ErrorLogger.error(error, { 
        component: 'BrainRushGamePlay', 
        action: 'loadCurrentQuestion',
        gameSessionId: gameSession.id,
        userId: user?.id
      });
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const resetQuestionState = () => {
    setSelectedAnswer(null);
    setHasAnswered(false);
    setShowQuestionResults(false);
    setAnswerFeedback(null);
    setCurrentAnswers([]);
  };

  const handleTimeUp = async () => {
    if (!hasAnswered) {
      await submitAnswer(null, Math.max(0, gameState.question_timer_seconds));
    }
  };

  const handleAnswerSelect = async (answer: string) => {
    if (hasAnswered || showQuestionResults) return;

    setHasAnswered(true); // Set immediately to prevent double-clicks
    setSelectedAnswer(answer);
    const timeTaken = Math.max(0, gameState.question_timer_seconds - timeLeft);
    await submitAnswer(answer, timeTaken);

    // Wait 3 seconds after answering, then show question results
    setTimeout(() => {
      setShowQuestionResults(true);
    }, 3000);
  };

  const submitAnswer = async (answer: string | null, timeTaken: number) => {
    if (!currentQuestion || !user || hasAnswered) return;

    const myParticipant = participants.find(p => p.user_id === user.id);
    if (!myParticipant) return;

    setHasAnswered(true);

    const isCorrect = answer === currentQuestion.correct_answer;
    setAnswerFeedback(isCorrect ? 'correct' : 'incorrect');

    let pointsEarned = 0;
    if (isCorrect) {
      const basePoints = 1000;
      const timeBonus = Math.floor((timeLeft / currentQuestion.time_limit_seconds) * 500);
      pointsEarned = basePoints + timeBonus;
    }

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error: answerError } = await supabase.from('eduplay_answers').insert({
        game_session_id: gameSession.id,
        participant_id: myParticipant.id,
        question_index: currentQuestion.question_index,
        selected_answer: answer,
        is_correct: isCorrect,
        time_taken_seconds: timeTaken,
        points_earned: pointsEarned
      });

      if (answerError) {
        ErrorLogger.error(answerError, { 
          component: 'BrainRushGamePlay', 
          action: 'submitAnswer',
          step: 'insertAnswer',
          gameSessionId: gameSession.id,
          participantId: myParticipant.id,
          userId: user.id
        });
        showErrorToast('Failed to submit answer. Please try again.');
        return;
      }

      if (isCorrect) {
        const { error: updateError } = await supabase
          .from('eduplay_participants')
          .update({ score: myParticipant.score + pointsEarned })
          .eq('id', myParticipant.id);

        if (updateError) {
          ErrorLogger.error(updateError, { 
            component: 'BrainRushGamePlay', 
            action: 'submitAnswer',
            step: 'updateScore',
            gameSessionId: gameSession.id,
            participantId: myParticipant.id,
            userId: user.id
          });
          // Non-blocking: answer was submitted, score update can fail
        }
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'BrainRushGamePlay', 
        action: 'submitAnswer',
        gameSessionId: gameSession.id,
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'BrainRushGamePlay', 
        action: 'submitAnswer',
        gameSessionId: gameSession.id,
        userId: user.id
      });
      showErrorToast(message);
    }
  };

  const handleNextQuestion = async () => {
    if (!isHost) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    const nextIndex = gameState.current_question_index + 1;

    try {
      if (nextIndex >= gameState.total_questions) {
        const { error } = await supabase
          .from('eduplay_game_sessions')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString()
          })
          .eq('id', gameSession.id);

        if (error) {
          const message = handleSupabaseError(error, { 
            component: 'BrainRushGamePlay', 
            action: 'handleNextQuestion',
            step: 'completeGame',
            gameSessionId: gameSession.id,
            userId: user?.id
          });
          ErrorLogger.error(error, { 
            component: 'BrainRushGamePlay', 
            action: 'handleNextQuestion',
            step: 'completeGame',
            gameSessionId: gameSession.id,
            userId: user?.id
          });
          showErrorToast(message);
          // Still call onGameEnd to allow game to end even if update fails
        }

        onGameEnd();
      } else {
        const { error } = await supabase
          .from('eduplay_game_sessions')
          .update({ current_question_index: nextIndex })
          .eq('id', gameSession.id);

        if (error) {
          const message = handleSupabaseError(error, { 
            component: 'BrainRushGamePlay', 
            action: 'handleNextQuestion',
            step: 'updateQuestionIndex',
            gameSessionId: gameSession.id,
            nextIndex,
            userId: user?.id
          });
          ErrorLogger.error(error, { 
            component: 'BrainRushGamePlay', 
            action: 'handleNextQuestion',
            step: 'updateQuestionIndex',
            gameSessionId: gameSession.id,
            nextIndex,
            userId: user?.id
          });
          showErrorToast(message);
        }
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'BrainRushGamePlay', 
        action: 'handleNextQuestion',
        gameSessionId: gameSession.id,
        userId: user?.id
      });
      ErrorLogger.error(error, { 
        component: 'BrainRushGamePlay', 
        action: 'handleNextQuestion',
        gameSessionId: gameSession.id,
        userId: user?.id
      });
      showErrorToast(message);
    }
  };

  if (loading || !currentQuestion) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
          <Loader2 className="h-16 w-16 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading question...</p>
        </div>
      </div>
    );
  }

  const sortedParticipants = [...participants].sort((a, b) => b.score - a.score);
  const questionProgress = `${gameState.current_question_index + 1} / ${gameState.total_questions}`;

  // Show question results after timer expires or all players have answered
  if (showQuestionResults && currentQuestion) {
    return (
      <BrainRushQuestionResults
        gameSessionId={gameSession.id}
        questionIndex={currentQuestion.question_index}
        correctAnswer={currentQuestion.correct_answer}
        participants={participants}
        isHost={isHost}
        onNextQuestion={handleNextQuestion}
        currentUserId={user?.id}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Area */}
        <div className="lg:col-span-3">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-purple-100 dark:bg-purple-900 px-4 py-2 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Question</span>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{questionProgress}</p>
                </div>
                <div className="bg-blue-100 dark:bg-blue-900 px-4 py-2 rounded-lg">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Difficulty</span>
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400 capitalize">{currentQuestion.difficulty}</p>
                </div>
              </div>
              <div className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-bold text-2xl ${
                timeLeft <= 5
                  ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400'
                  : timeLeft <= 10
                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400'
                  : 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
              }`}>
                <Clock className="h-6 w-6" />
                <span>{timeLeft}s</span>
              </div>
            </div>
          </div>

          {/* Question */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-4">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8 text-center">
              {currentQuestion.question_text}
            </h2>

            {/* Answer Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswer === option;
                const isCorrect = option === currentQuestion.correct_answer;
                const showCorrectAnswer = hasAnswered;

                let buttonClass = 'bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500';

                if (showCorrectAnswer && isCorrect) {
                  buttonClass = 'bg-green-100 dark:bg-green-900 border-2 border-green-500 dark:border-green-400';
                } else if (showCorrectAnswer && isSelected && !isCorrect) {
                  buttonClass = 'bg-red-100 dark:bg-red-900 border-2 border-red-500 dark:border-red-400';
                } else if (isSelected) {
                  buttonClass = 'bg-purple-100 dark:bg-purple-900 border-2 border-purple-500 dark:border-purple-400';
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(option)}
                    disabled={hasAnswered}
                    className={`${buttonClass} rounded-xl p-6 text-left transition-all transform hover:scale-105 disabled:cursor-not-allowed disabled:transform-none relative`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-medium text-gray-900 dark:text-gray-100">
                        {option}
                      </span>
                      {showCorrectAnswer && isCorrect && (
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      )}
                      {showCorrectAnswer && isSelected && !isCorrect && (
                        <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Answer Feedback */}
            {answerFeedback && (
              <div className={`mt-6 p-4 rounded-lg ${
                answerFeedback === 'correct'
                  ? 'bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700'
                  : 'bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700'
              }`}>
                <div className="flex items-center space-x-3">
                  {answerFeedback === 'correct' ? (
                    <>
                      <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-bold text-green-900 dark:text-green-100">Correct!</p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          +{1000 + Math.floor((timeLeft / currentQuestion.time_limit_seconds) * 500)} points
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                      <div>
                        <p className="font-bold text-red-900 dark:text-red-100">Incorrect</p>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          The correct answer was: {currentQuestion.correct_answer}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Host Controls */}
          {isHost && hasAnswered && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4">
              <button
                onClick={handleNextQuestion}
                className={`w-full px-6 py-3 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition font-semibold`}
              >
                {gameState.current_question_index + 1 >= gameState.total_questions ? 'Finish Game' : 'Next Question'}
              </button>
            </div>
          )}

          {/* Waiting for Host */}
          {!isHost && hasAnswered && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 text-center">
              <Loader2 className="h-8 w-8 text-purple-600 dark:text-purple-400 animate-spin mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400">Waiting for next question...</p>
            </div>
          )}
        </div>

        {/* Leaderboard Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sticky top-6">
            <div className="flex items-center space-x-2 mb-4">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Live Rankings</h3>
            </div>

            <div className="space-y-2">
              {sortedParticipants.map((participant, index) => {
                const myParticipant = user && participant.user_id === user.id;

                return (
                  <div
                    key={participant.id}
                    className={`p-3 rounded-lg ${
                      myParticipant
                        ? 'bg-purple-100 dark:bg-purple-900 border-2 border-purple-500'
                        : 'bg-gray-50 dark:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          index === 0
                            ? 'bg-yellow-400 text-yellow-900'
                            : index === 1
                            ? 'bg-gray-300 text-gray-900'
                            : index === 2
                            ? 'bg-orange-400 text-orange-900'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {participant.display_name}
                            {myParticipant && <span className="text-purple-600 dark:text-purple-400"> (You)</span>}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900 dark:text-gray-100">
                        {participant.score.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center space-x-1">
                  <Users className="h-4 w-4" />
                  <span>{participants.length} Players</span>
                </div>
                <span>{questionProgress}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
