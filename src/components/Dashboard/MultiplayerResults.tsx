import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Medal, Award, TrendingUp, Clock, Target, Home } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';
import { useTheme } from '../../contexts/ThemeContext';

interface PlayerResult {
  user_id: string;
  display_name: string;
  total_score: number;
  correct_answers: number;
  total_questions: number;
  average_time_ms: number;
  rank: number;
}

interface MultiplayerResultsProps {
  lobbyId: string;
}

export default function MultiplayerResults({ lobbyId }: MultiplayerResultsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getThemeGradient } = useTheme();

  const [results, setResults] = useState<PlayerResult[]>([]);
  const [myResult, setMyResult] = useState<PlayerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameName, setGameName] = useState('');

  useEffect(() => {
    loadResults();
  }, [lobbyId]);

  const loadResults = async () => {
    try {
      const { data: lobby, error: lobbyError } = await supabase
        .from('multiplayer_game_lobbies')
        .select('game_name')
        .eq('id', lobbyId)
        .single();

      if (lobbyError) throw lobbyError;
      setGameName(lobby.game_name);

      const { data: scores, error: scoresError } = await supabase
        .from('multiplayer_game_scores')
        .select(`
          user_id,
          total_score,
          correct_answers,
          total_questions,
          average_time_ms,
          rank
        `)
        .eq('lobby_id', lobbyId)
        .order('rank', { ascending: true });

      if (scoresError) throw scoresError;

      const { data: players, error: playersError } = await supabase
        .from('multiplayer_game_players')
        .select('user_id, display_name')
        .eq('lobby_id', lobbyId);

      if (playersError) throw playersError;

      const playersMap = new Map(players.map(p => [p.user_id, p.display_name]));

      const resultsWithNames = scores.map(score => ({
        ...score,
        display_name: playersMap.get(score.user_id) || 'Unknown'
      }));

      setResults(resultsWithNames);

      const userResult = resultsWithNames.find(r => r.user_id === user?.id);
      if (userResult) {
        setMyResult(userResult);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'MultiplayerResults', action: 'loadResults', lobbyId, userId: user?.id });
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-8 h-8 text-yellow-500" />;
      case 2:
        return <Medal className="w-8 h-8 text-gray-400" />;
      case 3:
        return <Medal className="w-8 h-8 text-orange-600" />;
      default:
        return <Award className="w-8 h-8 text-gray-400" />;
    }
  };

  const getRankBgColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-500';
      case 3:
        return 'bg-gradient-to-r from-orange-400 to-orange-600';
      default:
        return 'bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} p-6`}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Game Over!</h1>
          <p className="text-gray-600 text-lg">{gameName}</p>
        </div>

        {myResult && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-center">Your Performance</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-2">
                  {getRankIcon(myResult.rank)}
                </div>
                <div className="text-3xl font-bold text-blue-600">#{myResult.rank}</div>
                <div className="text-sm text-gray-600">Rank</div>
              </div>

              <div className="text-center">
                <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-2">
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
                <div className="text-3xl font-bold text-green-600">{myResult.total_score}</div>
                <div className="text-sm text-gray-600">Points</div>
              </div>

              <div className="text-center">
                <div className="bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-2">
                  <Target className="w-8 h-8 text-purple-600" />
                </div>
                <div className="text-3xl font-bold text-purple-600">
                  {myResult.correct_answers}/{myResult.total_questions}
                </div>
                <div className="text-sm text-gray-600">Correct</div>
              </div>

              <div className="text-center">
                <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-2">
                  <Clock className="w-8 h-8 text-orange-600" />
                </div>
                <div className="text-3xl font-bold text-orange-600">
                  {(myResult.average_time_ms / 1000).toFixed(1)}s
                </div>
                <div className="text-sm text-gray-600">Avg Time</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className={`${getThemeGradient('ui')} p-6 text-white`}>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6" />
              Final Leaderboard
            </h2>
          </div>

          <div className="p-6">
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.user_id}
                  className={`rounded-lg overflow-hidden transition-all ${
                    result.user_id === user?.id
                      ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]'
                      : 'shadow'
                  }`}
                >
                  <div
                    className={`${
                      result.rank <= 3
                        ? getRankBgColor(result.rank) + ' text-white'
                        : 'bg-gray-50 text-gray-800'
                    } p-4`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {getRankIcon(result.rank)}
                          <span className="text-2xl font-bold">#{result.rank}</span>
                        </div>
                        <div>
                          <div className="font-bold text-lg">
                            {result.display_name}
                            {result.user_id === user?.id && (
                              <span className="ml-2 text-sm font-normal opacity-90">(You)</span>
                            )}
                          </div>
                          <div className="text-sm opacity-90">
                            {result.correct_answers}/{result.total_questions} correct •{' '}
                            {(result.average_time_ms / 1000).toFixed(1)}s avg
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-3xl font-bold">{result.total_score}</div>
                        <div className="text-sm opacity-90">points</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={() => navigate('/dashboard/brain-rush')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2 transition-colors"
          >
            <Home className="w-5 h-5" />
            Back to Brain Rush
          </button>
        </div>

        {results.length > 0 && results[0].user_id === user?.id && (
          <div className="mt-8 text-center">
            <div className="inline-block bg-yellow-100 border-2 border-yellow-400 rounded-xl p-6">
              <Trophy className="w-16 h-16 text-yellow-600 mx-auto mb-3" />
              <h3 className="text-2xl font-bold text-yellow-800 mb-2">
                Congratulations!
              </h3>
              <p className="text-yellow-700">
                You won this game! 🎉
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
