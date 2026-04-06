import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Copy, Check, Play, Crown, Clock, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

interface LobbyPlayer {
  id: string;
  user_id: string;
  display_name: string;
  is_ready: boolean;
  is_host: boolean;
  joined_at: string;
}

interface GameConfig {
  timePerQuestion?: number;
  questionCount?: number;
  [key: string]: unknown;
}

interface GameLobby {
  id: string;
  host_user_id: string;
  game_code: string;
  game_name: string;
  max_players: number;
  current_players: number;
  status: string;
  game_config: GameConfig;
  created_at: string;
}

interface MultiplayerLobbyProps {
  lobbyId?: string;
  onExit: () => void;
}

export default function MultiplayerLobby({ lobbyId: initialLobbyId, onExit }: MultiplayerLobbyProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { error: showErrorToast } = useToast();
  const { getThemeGradient } = useTheme();

  const [lobby, setLobby] = useState<GameLobby | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [_isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialLobbyId) {
      loadLobby(initialLobbyId);
    }
  }, [initialLobbyId]);

  useEffect(() => {
    if (!lobby) return;

    const playersChannel = supabase
      .channel(`lobby_players_${lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_game_players',
          filter: `lobby_id=eq.${lobby.id}`
        },
        () => {
          loadPlayers(lobby.id);
        }
      )
      .subscribe();

    const lobbyChannel = supabase
      .channel(`lobby_${lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'multiplayer_game_lobbies',
          filter: `id=eq.${lobby.id}`
        },
        (payload) => {
          const updatedLobby = payload.new as GameLobby;
          setLobby(updatedLobby);

          if (updatedLobby.status === 'in_progress') {
            navigate(`/dashboard/brain-rush/play/${lobby.id}`);
          }
        }
      )
      .subscribe();

    return () => {
      playersChannel.unsubscribe();
      lobbyChannel.unsubscribe();
    };
  }, [lobby, navigate]);

  const loadLobby = async (id: string) => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setError('You are currently offline. Please check your connection.');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('multiplayer_game_lobbies')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'MultiplayerLobby', 
          action: 'loadLobby',
          lobbyId: id
        });
        ErrorLogger.error(error, { 
          component: 'MultiplayerLobby', 
          action: 'loadLobby',
          lobbyId: id,
          userId: user?.id
        });
        setError(message);
        return;
      }

      setLobby(data);
      setIsHost(data.host_user_id === user?.id);
      await loadPlayers(id);
    } catch (err) {
      const message = handleApiError(err, { 
        component: 'MultiplayerLobby', 
        action: 'loadLobby',
        lobbyId: id
      });
      ErrorLogger.error(err, { 
        component: 'MultiplayerLobby', 
        action: 'loadLobby',
        lobbyId: id,
        userId: user?.id
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayers = async (id: string) => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('multiplayer_game_players')
        .select('*')
        .eq('lobby_id', id)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      if (error) {
        ErrorLogger.error(error, { 
          component: 'MultiplayerLobby', 
          action: 'loadPlayers',
          lobbyId: id,
          userId: user?.id
        });
        // Non-blocking for real-time updates
        return;
      }

      setPlayers(data || []);

      const currentPlayer = data?.find(p => p.user_id === user?.id);
      if (currentPlayer) {
        setIsReady(currentPlayer.is_ready);
      }
    } catch (err) {
      ErrorLogger.error(err, { 
        component: 'MultiplayerLobby', 
        action: 'loadPlayers',
        lobbyId: id,
        userId: user?.id
      });
      // Non-blocking for real-time updates
    }
  };

  const copyGameCode = async () => {
    if (!lobby) return;

    await navigator.clipboard.writeText(lobby.game_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Removed toggleReady - all players are auto-ready on join

  const startGame = async () => {
    if (!lobby || !isHost) {
      return;
    }

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error } = await supabase
        .from('multiplayer_game_lobbies')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString()
        })
        .eq('id', lobby.id);

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'MultiplayerLobby', 
          action: 'startGame',
          lobbyId: lobby.id,
          userId: user?.id
        });
        ErrorLogger.error(error, { 
          component: 'MultiplayerLobby', 
          action: 'startGame',
          lobbyId: lobby.id,
          userId: user?.id
        });
        showErrorToast(message);
      }
    } catch (err) {
      const message = handleApiError(err, { 
        component: 'MultiplayerLobby', 
        action: 'startGame',
        lobbyId: lobby.id,
        userId: user?.id
      });
      ErrorLogger.error(err, { 
        component: 'MultiplayerLobby', 
        action: 'startGame',
        lobbyId: lobby.id,
        userId: user?.id
      });
      showErrorToast(message);
    }
  };

  const leaveLobby = async () => {
    if (!lobby || !user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      // Still allow exit even if offline
      onExit();
      return;
    }

    try {
      if (isHost) {
        const { error } = await supabase
          .from('multiplayer_game_lobbies')
          .update({ status: 'cancelled' })
          .eq('id', lobby.id);

        if (error) {
          ErrorLogger.error(error, { 
            component: 'MultiplayerLobby', 
            action: 'leaveLobby',
            step: 'cancelLobby',
            lobbyId: lobby.id,
            userId: user.id
          });
          // Still allow exit even if update fails
        }
      } else {
        const { error } = await supabase
          .from('multiplayer_game_players')
          .update({ left_at: new Date().toISOString() })
          .eq('lobby_id', lobby.id)
          .eq('user_id', user.id);

        if (error) {
          ErrorLogger.error(error, { 
            component: 'MultiplayerLobby', 
            action: 'leaveLobby',
            step: 'markPlayerLeft',
            lobbyId: lobby.id,
            userId: user.id
          });
          // Still allow exit even if update fails
        }
      }

      onExit();
    } catch (err) {
      ErrorLogger.error(err, { 
        component: 'MultiplayerLobby', 
        action: 'leaveLobby',
        lobbyId: lobby.id,
        userId: user.id
      });
      // Still allow exit even if error occurs
      onExit();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !lobby) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error || 'Lobby not found'}
        </div>
        <button
          onClick={onExit}
          className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow overflow-hidden">
        <div className={`${getThemeGradient('ui')} p-6 text-white`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{lobby.game_name}</h2>
            <button
              onClick={leaveLobby}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
              <span className="text-sm font-medium">Game Code:</span>
              <span className="text-xl font-bold tracking-wider">{lobby.game_code}</span>
              <button
                onClick={copyGameCode}
                className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
              <Users className="w-5 h-5" />
              <span className="font-medium">
                {lobby.current_players} / {lobby.max_players}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Players ({players.length})
          </h3>

          <div className="space-y-2 mb-6">
            {players.length === 0 && (
              <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                <p className="text-sm text-yellow-800">Loading players...</p>
              </div>
            )}

            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between p-4 rounded-lg border-2 bg-green-50 border-green-300"
              >
                <div className="flex items-center gap-3">
                  {player.is_host && (
                    <Crown className="w-5 h-5 text-yellow-500" />
                  )}
                  <span className="font-medium">{player.display_name}</span>
                  {player.user_id === user?.id && (
                    <span className="text-sm text-gray-500">(You)</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-green-600">Ready</span>
                </div>
              </div>
            ))}

            {lobby.current_players < lobby.max_players && (
              <div className="p-4 rounded-lg border-2 border-dashed border-gray-300 text-center text-gray-500">
                Waiting for more players...
              </div>
            )}
          </div>

          <div className="border-t pt-6">
            <h4 className="font-semibold mb-3">Game Settings</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <span>Time per question: {lobby.game_config.timePerQuestion || 30}s</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Questions: {lobby.game_config.questionCount || 10}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            {isHost && (
              <button
                onClick={startGame}
                className="flex-1 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors bg-green-600 text-white hover:bg-green-700"
              >
                <Play className="w-5 h-5" />
                Start Game
              </button>
            )}

            <button
              onClick={leaveLobby}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold transition-colors"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
