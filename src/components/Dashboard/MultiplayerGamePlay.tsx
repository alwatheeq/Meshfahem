import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Zap, Trophy, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

interface Question {
  question: string;
  options: string[];
  correct_answer: string;
}

interface PlayerScore {
  user_id: string;
  display_name: string;
  score: number;
  correct: number;
}

interface GameConfig {
  timePerQuestion?: number;
  questionCount?: number;
  [key: string]: unknown;
}

interface GameLobby {
  id: string;
  questions_json: Question[];
  game_config: GameConfig | null;
}

interface MultiplayerGamePlayProps {
  lobbyId: string;
}

export default function MultiplayerGamePlay({ lobbyId }: MultiplayerGamePlayProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { error: showErrorToast } = useToast();
  const { getThemeGradient } = useTheme();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameEnded, setGameEnded] = useState(false);
  const [timePerQuestion, setTimePerQuestion] = useState(30);

  useEffect(() => {
    loadGameData();
  }, [lobbyId]);

  useEffect(() => {
    if (!lobbyId) return;

    const answersChannel = supabase
      .channel(`game_answers_${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'multiplayer_game_answers',
          filter: `lobby_id=eq.${lobbyId}`
        },
        () => {
          updateLiveScores();
        }
      )
      .subscribe();

    return () => {
      answersChannel.unsubscribe();
    };
  }, [lobbyId]);

  useEffect(() => {
    if (hasAnswered || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasAnswered, timeLeft]);

  const loadGameData = async () => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setIsLoading(false);
      return;
    }

    try {
      const { data: lobby, error: lobbyError } = await supabase
        .from('multiplayer_game_lobbies')
        .select('questions_json, game_config')
        .eq('id', lobbyId)
        .single();

      if (lobbyError) {
        const message = handleSupabaseError(lobbyError, { 
          component: 'MultiplayerGamePlay', 
          action: 'loadGameData',
          step: 'fetchLobby',
          lobbyId
        });
        ErrorLogger.error(lobbyError, { 
          component: 'MultiplayerGamePlay', 
          action: 'loadGameData',
          step: 'fetchLobby',
          lobbyId,
          userId: user?.id
        });
        showErrorToast(message);
        setIsLoading(false);
        return;
      }

      if (!lobby) {
        const error = new Error('Lobby not found');
        ErrorLogger.error(error, { 
          component: 'MultiplayerGamePlay', 
          action: 'loadGameData',
          step: 'fetchLobby',
          lobbyId,
          userId: user?.id
        });
        showErrorToast('Lobby not found');
        setIsLoading(false);
        return;
      }

      const typedLobby = lobby as GameLobby;
      const questionData = typedLobby.questions_json || [];
      
      // Type guard to ensure questions are valid
      if (!Array.isArray(questionData)) {
        const error = new Error('Invalid questions data format');
        ErrorLogger.error(error, { 
          component: 'MultiplayerGamePlay', 
          action: 'loadGameData',
          step: 'validateQuestions',
          lobbyId,
          userId: user?.id
        });
        showErrorToast('Invalid game data format');
        setIsLoading(false);
        return;
      }

      setQuestions(questionData);
      const gameConfig = typedLobby.game_config as GameConfig | null;
      setTimePerQuestion(gameConfig?.timePerQuestion || 30);
      setTimeLeft(gameConfig?.timePerQuestion || 30);

      const { data: players, error: playersError } = await supabase
        .from('multiplayer_game_players')
        .select('user_id, display_name')
        .eq('lobby_id', lobbyId)
        .is('left_at', null);

      if (playersError) {
        const message = handleSupabaseError(playersError, { 
          component: 'MultiplayerGamePlay', 
          action: 'loadGameData',
          step: 'fetchPlayers',
          lobbyId
        });
        ErrorLogger.error(playersError, { 
          component: 'MultiplayerGamePlay', 
          action: 'loadGameData',
          step: 'fetchPlayers',
          lobbyId,
          userId: user?.id
        });
        showErrorToast(message);
        setIsLoading(false);
        return;
      }

      setPlayerScores(
        players.map(p => ({
          user_id: p.user_id,
          display_name: p.display_name,
          score: 0,
          correct: 0
        }))
      );

      setGameStartTime(Date.now());
      setIsLoading(false);
    } catch (err: unknown) {
      const message = handleApiError(err, { 
        component: 'MultiplayerGamePlay', 
        action: 'loadGameData',
        lobbyId,
        userId: user?.id
      });
      ErrorLogger.error(err, { 
        component: 'MultiplayerGamePlay', 
        action: 'loadGameData',
        lobbyId,
        userId: user?.id
      });
      showErrorToast(message);
      setIsLoading(false);
    }
  };

  const updateLiveScores = async () => {
    if (isOffline()) {
      // Non-blocking for real-time updates
      return;
    }

    try {
      const { data: answers, error } = await supabase
        .from('multiplayer_game_answers')
        .select('user_id, points_earned, is_correct')
        .eq('lobby_id', lobbyId);

      if (error) {
        ErrorLogger.error(error, { 
          component: 'MultiplayerGamePlay', 
          action: 'updateLiveScores',
          lobbyId,
          userId: user?.id
        });
        // Non-blocking for real-time updates
        return;
      }

      const scoreMap = new Map<string, { score: number; correct: number }>();

      answers.forEach(answer => {
        const current = scoreMap.get(answer.user_id) || { score: 0, correct: 0 };
        scoreMap.set(answer.user_id, {
          score: current.score + answer.points_earned,
          correct: current.correct + (answer.is_correct ? 1 : 0)
        });
      });

      setPlayerScores(prev =>
        prev.map(player => {
          const stats = scoreMap.get(player.user_id) || { score: 0, correct: 0 };
          return {
            ...player,
            score: stats.score,
            correct: stats.correct
          };
        }).sort((a, b) => b.score - a.score)
      );
    } catch (err: unknown) {
      ErrorLogger.error(err, { 
        component: 'MultiplayerGamePlay', 
        action: 'updateLiveScores',
        lobbyId,
        userId: user?.id
      });
      // Non-blocking for real-time updates
    }
  };

  const calculatePoints = useCallback((timeTaken: number) => {
    const timeBonus = Math.max(0, Math.floor((timePerQuestion - timeTaken) * 10));
    const basePoints = 100;
    return basePoints + timeBonus;
  }, [timePerQuestion]);

  const submitAnswer = async (answer: string) => {
    if (hasAnswered || !user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    const timeTaken = Math.floor((Date.now() - gameStartTime) / 1000);
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = answer === currentQuestion.correct_answer;
    const points = isCorrect ? calculatePoints(timeTaken) : 0;

    setHasAnswered(true);
    setSelectedAnswer(answer);

    try {
      const { error } = await supabase
        .from('multiplayer_game_answers')
        .insert({
          lobby_id: lobbyId,
          user_id: user.id,
          question_index: currentQuestionIndex,
          selected_answer: answer,
          is_correct: isCorrect,
          time_taken_ms: timeTaken * 1000,
          points_earned: points
        });

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'MultiplayerGamePlay', 
          action: 'submitAnswer',
          lobbyId,
          questionIndex: currentQuestionIndex,
          userId: user.id
        });
        ErrorLogger.error(error, { 
          component: 'MultiplayerGamePlay', 
          action: 'submitAnswer',
          lobbyId,
          questionIndex: currentQuestionIndex,
          userId: user.id
        });
        showErrorToast(message);
        // Allow game to continue even if answer submission fails
        setTimeout(() => {
          moveToNextQuestion();
        }, 2000);
        return;
      }

      await updateLiveScores();

      setTimeout(() => {
        moveToNextQuestion();
      }, 2000);
    } catch (err: unknown) {
      const message = handleApiError(err, { 
        component: 'MultiplayerGamePlay', 
        action: 'submitAnswer',
        lobbyId,
        userId: user.id
      });
      ErrorLogger.error(err, { 
        component: 'MultiplayerGamePlay', 
        action: 'submitAnswer',
        lobbyId,
        userId: user.id
      });
      showErrorToast(message);
      // Allow game to continue even if answer submission fails
      setTimeout(() => {
        moveToNextQuestion();
      }, 2000);
    }
  };

  const handleTimeout = () => {
    if (!hasAnswered && user) {
      submitAnswer('');
    }
  };

  const moveToNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setHasAnswered(false);
      setTimeLeft(timePerQuestion);
      setGameStartTime(Date.now());
    } else {
      endGame();
    }
  };

  const endGame = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      // Still navigate to results even if offline
      setGameEnded(true);
      navigate(`/dashboard/brain-rush/results/${lobbyId}`);
      return;
    }

    try {
      const { error: scoreError } = await supabase.rpc('calculate_player_final_score', {
        p_lobby_id: lobbyId,
        p_user_id: user.id
      });

      if (scoreError) {
        ErrorLogger.error(scoreError, { 
          component: 'MultiplayerGamePlay', 
          action: 'endGame',
          step: 'calculateUserScore',
          lobbyId,
          userId: user.id
        });
        // Continue even if score calculation fails
      }

      const { data: players, error: playersError } = await supabase
        .from('multiplayer_game_players')
        .select('user_id')
        .eq('lobby_id', lobbyId)
        .is('left_at', null);

      if (playersError) {
        ErrorLogger.error(playersError, { 
          component: 'MultiplayerGamePlay', 
          action: 'endGame',
          step: 'fetchPlayers',
          lobbyId,
          userId: user.id
        });
        // Continue even if fetch fails
      } else if (players) {
        for (const player of players) {
          if (player.user_id !== user.id) {
            const { error: otherScoreError } = await supabase.rpc('calculate_player_final_score', {
              p_lobby_id: lobbyId,
              p_user_id: player.user_id
            });
            if (otherScoreError) {
              ErrorLogger.error(otherScoreError, { 
                component: 'MultiplayerGamePlay', 
                action: 'endGame',
                step: 'calculateOtherPlayerScore',
                lobbyId,
                otherUserId: player.user_id,
                userId: user.id
              });
              // Continue even if other player score calculation fails
            }
          }
        }
      }

      const { error: updateError } = await supabase
        .from('multiplayer_game_lobbies')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString()
        })
        .eq('id', lobbyId);

      if (updateError) {
        ErrorLogger.error(updateError, { 
          component: 'MultiplayerGamePlay', 
          action: 'endGame',
          step: 'updateLobbyStatus',
          lobbyId,
          userId: user.id
        });
        // Still navigate to results even if update fails
      }

      setGameEnded(true);
      navigate(`/dashboard/brain-rush/results/${lobbyId}`);
    } catch (err: unknown) {
      ErrorLogger.error(err, { 
        component: 'MultiplayerGamePlay', 
        action: 'endGame',
        lobbyId,
        userId: user.id
      });
      // Still navigate to results even if error occurs
      setGameEnded(true);
      navigate(`/dashboard/brain-rush/results/${lobbyId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">No questions available</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} p-6`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-lg px-4 py-2 shadow flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className={`text-2xl font-bold ${timeLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
                {timeLeft}s
              </span>
            </div>

            <div className="bg-white rounded-lg px-4 py-2 shadow">
              <span className="text-sm text-gray-600">Question {currentQuestionIndex + 1} / {questions.length}</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="mb-6">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getThemeGradient('ui')} transition-all duration-300`}
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              <h2 className="text-2xl font-bold mb-8 text-gray-800">
                {currentQuestion.question}
              </h2>

              <div className="space-y-3">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrect = option === currentQuestion.correct_answer;
                  const showResult = hasAnswered;

                  let buttonClass = 'w-full p-4 rounded-lg border-2 text-left font-medium transition-all ';

                  if (showResult) {
                    if (isCorrect) {
                      buttonClass += 'bg-green-100 border-green-500 text-green-800';
                    } else if (isSelected && !isCorrect) {
                      buttonClass += 'bg-red-100 border-red-500 text-red-800';
                    } else {
                      buttonClass += 'bg-gray-100 border-gray-300 text-gray-600';
                    }
                  } else {
                    buttonClass += 'bg-white border-gray-300 hover:border-blue-500 hover:bg-blue-50 cursor-pointer';
                  }

                  return (
                    <button
                      key={index}
                      onClick={() => submitAnswer(option)}
                      disabled={hasAnswered}
                      className={buttonClass}
                    >
                      <div className="flex items-center justify-between">
                        <span>{option}</span>
                        {showResult && isCorrect && (
                          <Zap className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Live Leaderboard
              </h3>

              <div className="space-y-2">
                {playerScores.map((player, index) => (
                  <div
                    key={player.user_id}
                    className={`p-3 rounded-lg flex items-center justify-between ${
                      player.user_id === user?.id
                        ? 'bg-blue-50 border-2 border-blue-300'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg text-gray-600">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-semibold">
                          {player.display_name}
                          {player.user_id === user?.id && (
                            <span className="text-xs text-blue-600 ml-1">(You)</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {player.correct} correct
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-blue-600">
                        {player.score}
                      </div>
                      <div className="text-xs text-gray-500">pts</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
