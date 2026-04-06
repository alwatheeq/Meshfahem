import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Target, Clock, CheckCircle, TrendingUp, Home } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';
import { useTheme } from '../../contexts/ThemeContext';

interface GameSession {
  id: string;
  game_title: string;
  total_questions: number;
  difficulty_level: string;
}

interface Participant {
  id: string;
  display_name: string;
  score: number;
  user_id: string | null;
  is_host: boolean;
}

interface ParticipantStats {
  participant: Participant;
  correctAnswers: number;
  totalAnswers: number;
  avgTimeSeconds: number;
  accuracy: number;
}

interface BrainRushResultsProps {
  gameSession: GameSession;
  participants: Participant[];
  onReturnHome: () => void;
}

export const BrainRushResults: React.FC<BrainRushResultsProps> = ({
  gameSession,
  participants: initialParticipants,
  onReturnHome
}) => {
  const { user } = useAuth();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [participantStats, setParticipantStats] = useState<ParticipantStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    loadParticipantStats();

    setTimeout(() => {
      setShowConfetti(false);
    }, 5000);
  }, []);

  const loadParticipantStats = async () => {
    setLoading(true);

    try {
      const statsPromises = initialParticipants.map(async (participant) => {
        const { data: answers, error } = await supabase
          .from('eduplay_answers')
          .select('*')
          .eq('game_session_id', gameSession.id)
          .eq('participant_id', participant.id);

        if (error || !answers) {
          return {
            participant,
            correctAnswers: 0,
            totalAnswers: 0,
            avgTimeSeconds: 0,
            accuracy: 0
          };
        }

        const correctAnswers = answers.filter(a => a.is_correct).length;
        const totalAnswers = answers.length;
        const totalTime = answers.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0);
        const avgTimeSeconds = totalAnswers > 0 ? totalTime / totalAnswers : 0;
        const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

        return {
          participant,
          correctAnswers,
          totalAnswers,
          avgTimeSeconds,
          accuracy
        };
      });

      const stats = await Promise.all(statsPromises);
      const sortedStats = stats.sort((a, b) => b.participant.score - a.participant.score);
      setParticipantStats(sortedStats);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'BrainRushResults', 
        action: 'loadStats', 
        metadata: { gameSessionId: gameSession.id } 
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-12 text-center`}>
          <div className="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className={getThemeTextSecondary()}>Loading results...</p>
        </div>
      </div>
    );
  }

  const winner = participantStats[0];
  const myStats = participantStats.find(s => s.participant.user_id === user?.id);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Confetti Effect */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="absolute inset-0 animate-pulse">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full animate-ping"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  backgroundColor: ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6'][i % 5],
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 3}s`
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <div className={`${getThemeGradient('ui')} rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4`}>
          <Trophy className="h-16 w-16 text-white" />
        </div>
        <h1 className={`text-4xl md:text-5xl font-bold ${getThemeTextPrimary()} mb-2`}>
          Game Complete!
        </h1>
        <p className={`text-xl ${getThemeTextSecondary()}`}>{gameSession.game_title}</p>
      </div>

      {/* Winner Podium */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 mb-6">
        <div className="flex items-end justify-center space-x-4 mb-8">
          {/* 2nd Place */}
          {participantStats[1] && (
            <div className="text-center pb-8">
              <div className="bg-gradient-to-br from-gray-300 to-gray-400 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-3 shadow">
                <span className={`text-3xl font-bold ${getThemeTextPrimary()}`}>2</span>
              </div>
              <div className={`${getThemeSubtle('ui')} rounded-lg p-4 min-w-[140px]`}>
                <p className={`font-bold ${getThemeTextPrimary()} truncate`}>
                  {participantStats[1].participant.display_name}
                </p>
                <p className={`text-2xl font-bold ${getThemeTextSecondary()}`}>
                  {participantStats[1].participant.score.toLocaleString()}
                </p>
                <p className={`text-sm ${getThemeTextMuted()}`}>points</p>
              </div>
            </div>
          )}

          {/* 1st Place */}
          {winner && (
            <div className="text-center">
              <Trophy className="h-12 w-12 text-yellow-500 mx-auto mb-2 animate-bounce" />
              <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full w-28 h-28 flex items-center justify-center mx-auto mb-3 shadow-lg">
                <span className="text-5xl font-bold text-yellow-900">1</span>
              </div>
              <div className="bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800 rounded-lg p-4 min-w-[160px]">
                <p className={`font-bold text-lg ${getThemeTextPrimary()} truncate`}>
                  {winner.participant.display_name}
                </p>
                <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">
                  {winner.participant.score.toLocaleString()}
                </p>
                <p className={`text-sm ${getThemeTextSecondary()}`}>points</p>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {participantStats[2] && (
            <div className="text-center pb-16">
              <div className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3 shadow">
                <span className="text-2xl font-bold text-orange-900">3</span>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900 rounded-lg p-4 min-w-[120px]">
                <p className={`font-bold ${getThemeTextPrimary()} truncate text-sm`}>
                  {participantStats[2].participant.display_name}
                </p>
                <p className="text-xl font-bold text-orange-700 dark:text-orange-300">
                  {participantStats[2].participant.score.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">points</p>
              </div>
            </div>
          )}
        </div>

        {/* Winner Message */}
        <div className="text-center">
          <p className={`text-2xl font-bold text-transparent bg-clip-text ${getThemeGradient('ui')}`}>
            {winner.participant.user_id === user?.id ? 'Congratulations! You Won!' : `${winner.participant.display_name} Wins!`}
          </p>
        </div>
      </div>

      {/* Full Leaderboard */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 mb-6">
        <h2 className={`text-2xl font-bold ${getThemeTextPrimary()} mb-6 flex items-center space-x-2`}>
          <TrendingUp className="h-6 w-6 text-purple-600" />
          <span>Final Standings</span>
        </h2>

        <div className="space-y-3">
          {participantStats.map((stats, index) => {
            const isCurrentUser = stats.participant.user_id === user?.id;

            return (
              <div
                key={stats.participant.id}
                className={`p-4 rounded-lg border-2 transition ${
                  isCurrentUser
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-500 dark:border-purple-400'
                    : `${getThemeSubtle('bg')} border-transparent`
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                      index === 0
                        ? 'bg-yellow-400 text-yellow-900'
                        : index === 1
                        ? `${getThemeSubtle('ui')} ${getThemeTextPrimary()}`
                        : index === 2
                        ? 'bg-orange-400 text-orange-900'
                        : `${getThemeSubtle('ui')} ${getThemeTextSecondary()}`
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className={`font-bold ${getThemeTextPrimary()}`}>
                        {stats.participant.display_name}
                        {isCurrentUser && <span className="text-purple-600 dark:text-purple-400 ml-2">(You)</span>}
                      </p>
                      <div className={`flex items-center space-x-4 text-sm ${getThemeTextSecondary()}`}>
                        <span className="flex items-center space-x-1">
                          <CheckCircle className="h-4 w-4" />
                          <span>{stats.correctAnswers}/{stats.totalAnswers} correct</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Target className="h-4 w-4" />
                          <span>{stats.accuracy.toFixed(0)}% accuracy</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>{stats.avgTimeSeconds.toFixed(1)}s avg</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-3xl font-bold ${getThemeTextPrimary()}`}>
                      {stats.participant.score.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">points</p>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className={`pt-3 border-t ${getThemeCardBorder()}`}>
                  <div className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <p className={getThemeTextSecondary()}>Correct</p>
                      <p className="font-bold text-green-600 dark:text-green-400">{stats.correctAnswers}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Incorrect</p>
                      <p className="font-bold text-red-600 dark:text-red-400">{stats.totalAnswers - stats.correctAnswers}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 dark:text-gray-400">Accuracy</p>
                      <p className="font-bold text-blue-600 dark:text-blue-400">{stats.accuracy.toFixed(0)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Game Summary */}
      <div className={`${getThemeGradient('bg')} rounded-lg p-6 mb-6`}>
        <h3 className={`font-bold ${getThemeTextPrimary()} mb-4`}>Game Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className={`text-sm ${getThemeTextSecondary()}`}>Total Questions</p>
            <p className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{gameSession.total_questions}</p>
          </div>
          <div className="text-center">
            <p className={`text-sm ${getThemeTextSecondary()}`}>Players</p>
            <p className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{participantStats.length}</p>
          </div>
          <div className="text-center">
            <p className={`text-sm ${getThemeTextSecondary()}`}>Difficulty</p>
            <p className={`text-2xl font-bold ${getThemeTextPrimary()} capitalize`}>{gameSession.difficulty_level}</p>
          </div>
          <div className="text-center">
            <p className={`text-sm ${getThemeTextSecondary()}`}>Top Score</p>
            <p className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{winner?.participant.score.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Your Performance (if you played) */}
      {myStats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 mb-6">
          <h3 className={`font-bold ${getThemeTextPrimary()} mb-4 flex items-center space-x-2`}>
            <Medal className="h-6 w-6 text-purple-600" />
            <span>Your Performance</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Rank</p>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                #{participantStats.findIndex(s => s.participant.user_id === user?.id) + 1}
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Score</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {myStats.participant.score.toLocaleString()}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Accuracy</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {myStats.accuracy.toFixed(0)}%
              </p>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Time</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                {myStats.avgTimeSeconds.toFixed(1)}s
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center">
        <button
          onClick={onReturnHome}
          className={`px-8 py-4 ${getThemeGradient('ui')} text-white rounded-md hover:opacity-90 transition font-semibold flex items-center space-x-2 shadow`}
        >
          <Home className="h-5 w-5" />
          <span>Return to Games</span>
        </button>
      </div>
    </div>
  );
};
