import React, { useState } from 'react';
import { Plus, Users, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';

interface Question {
  question: string;
  options: string[];
  correct_answer: string;
  difficulty?: string;
}

interface MultiplayerMenuProps {
  onLobbyJoined: (lobbyId: string) => void;
  onBack?: () => void;
  questionSetId?: string;
  questionsJson?: Question[];
}

export default function MultiplayerMenu({ onLobbyJoined, onBack, questionSetId, questionsJson }: MultiplayerMenuProps) {
  const { user } = useAuth();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [gameName, setGameName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [questionCount, setQuestionCount] = useState(10);
  const [gameCode, setGameCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateGameCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const createLobby = async () => {
    if (!user || !gameName.trim()) {
      setError('Please enter a game name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const displayName = profile?.full_name || 'Anonymous';
      const code = generateGameCode();

      const { data: lobby, error: lobbyError } = await supabase
        .from('multiplayer_game_lobbies')
        .insert({
          host_user_id: user.id,
          game_code: code,
          game_name: gameName,
          max_players: maxPlayers,
          current_players: 1,
          status: 'waiting',
          game_config: {
            timePerQuestion,
            questionCount
          },
          question_set_id: questionSetId,
          questions_json: questionsJson
        })
        .select()
        .single();

      if (lobbyError) throw lobbyError;

      const { error: playerError } = await supabase
        .from('multiplayer_game_players')
        .insert({
          lobby_id: lobby.id,
          user_id: user.id,
          display_name: displayName,
          is_host: true,
          is_ready: true
        });

      if (playerError) throw playerError;

      ErrorLogger.info('Host player created successfully', { component: 'MultiplayerMenu', action: 'createLobby', lobbyId: lobby.id, userId: user.id, displayName, isHost: true, isReady: true, currentPlayers: lobby.current_players });

      // Wait briefly for database trigger to update current_players
      await new Promise(resolve => setTimeout(resolve, 300));

      ErrorLogger.debug('Navigating to lobby', { component: 'MultiplayerMenu', action: 'createLobby', lobbyId: lobby.id });
      onLobbyJoined(lobby.id);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'MultiplayerMenu', action: 'handleCreateLobby', gameTitle, questionCount, difficulty });
      setError(error.message || 'Failed to create lobby');
    } finally {
      setLoading(false);
    }
  };

  const joinLobby = async () => {
    if (!user || !gameCode.trim()) {
      setError('Please enter a game code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      const displayName = profile?.full_name || 'Anonymous';

      const { data: lobby, error: lobbyError } = await supabase
        .from('multiplayer_game_lobbies')
        .select('*')
        .eq('game_code', gameCode.toUpperCase())
        .eq('status', 'waiting')
        .single();

      if (lobbyError || !lobby) {
        throw new Error('Game not found or already started');
      }

      if (lobby.current_players >= lobby.max_players) {
        throw new Error('Game is full');
      }

      const { data: existingPlayer } = await supabase
        .from('multiplayer_game_players')
        .select('id')
        .eq('lobby_id', lobby.id)
        .eq('user_id', user.id)
        .is('left_at', null)
        .single();

      if (existingPlayer) {
        onLobbyJoined(lobby.id);
        return;
      }

      const { error: playerError } = await supabase
        .from('multiplayer_game_players')
        .insert({
          lobby_id: lobby.id,
          user_id: user.id,
          display_name: displayName,
          is_host: false,
          is_ready: true
        });

      if (playerError) throw playerError;

      ErrorLogger.info('Player joined successfully', { component: 'MultiplayerMenu', action: 'joinLobby', lobbyId: lobby.id, userId: user.id, displayName, isHost: false, isReady: true });

      // Wait briefly for database trigger to update current_players
      await new Promise(resolve => setTimeout(resolve, 300));

      ErrorLogger.debug('Navigating to lobby', { component: 'MultiplayerMenu', action: 'joinLobby', lobbyId: lobby.id });
      onLobbyJoined(lobby.id);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'MultiplayerMenu', action: 'handleJoinLobby', gameCode });
      setError(error.message || 'Failed to join lobby');
    } finally {
      setLoading(false);
    }
  };

  if (showCreateForm) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6">
          <h2 className="text-2xl font-bold mb-6">Create Multiplayer Game</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Name
              </label>
              <input
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="Enter game name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Players
                </label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {[2, 3, 4, 5, 6, 8, 10].map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Questions
                </label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {[5, 10, 15, 20, 25].map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time per Question (seconds)
              </label>
              <select
                value={timePerQuestion}
                onChange={(e) => setTimePerQuestion(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {[15, 20, 30, 45, 60].map(num => (
                  <option key={num} value={num}>{num}s</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={createLobby}
              disabled={loading || !gameName.trim()}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Game'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setError(null);
              }}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showJoinForm) {
    return (
      <div className="max-w-md mx-auto p-6">
        <div className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6">
          <h2 className="text-2xl font-bold mb-6">Join Game</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Game Code
              </label>
              <input
                type="text"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit code"
                maxLength={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-center text-2xl font-bold tracking-wider focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={joinLobby}
              disabled={loading || gameCode.length !== 6}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button
              onClick={() => {
                setShowJoinForm(false);
                setError(null);
              }}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {onBack && (
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
      )}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Multiplayer Brain Rush</h1>
        <p className="text-gray-600">Compete with friends in real-time quiz battles!</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <button
          onClick={() => setShowCreateForm(true)}
          className="group bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-8 hover:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm transition-all"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              <Plus className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Create Game</h3>
            <p className="text-gray-600 mb-4">
              Host a new game and invite friends to join
            </p>
            <div className="flex items-center text-blue-600 font-medium">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2 group- transition-transform" />
            </div>
          </div>
        </button>

        <button
          onClick={() => setShowJoinForm(true)}
          className="group bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-8 hover:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm transition-all"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
              <Users className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Join Game</h3>
            <p className="text-gray-600 mb-4">
              Enter a game code to join an existing game
            </p>
            <div className="flex items-center text-green-600 font-medium">
              Join Now
              <ArrowRight className="w-4 h-4 ml-2 group- transition-transform" />
            </div>
          </div>
        </button>
      </div>

      <div className="mt-12 bg-blue-50 rounded-md p-6">
        <h3 className="font-semibold mb-3">How it works:</h3>
        <ol className="space-y-2 text-sm text-gray-700">
          <li className="flex gap-2">
            <span className="font-bold text-blue-600">1.</span>
            <span>Create a game or join using a code shared by a friend</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600">2.</span>
            <span>Wait for players to join (everyone is automatically ready!)</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600">3.</span>
            <span>Answer questions as fast and accurately as possible</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-blue-600">4.</span>
            <span>See who comes out on top in the final leaderboard!</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
