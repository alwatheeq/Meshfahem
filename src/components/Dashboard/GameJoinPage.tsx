import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Gamepad2, Users, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';
import { useTheme } from '../../contexts/ThemeContext';

interface GameSession {
  id: string;
  game_title: string;
  status: string;
  host_id: string;
}

export const GameJoinPage: React.FC = () => {
  const { gameCode } = useParams<{ gameCode: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getThemeGradient, getBackgroundGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [joinAsGuest, setJoinAsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameInfo, setGameInfo] = useState<GameSession | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (gameCode) {
      validateGameCode();
    }
  }, [gameCode]);

  const validateGameCode = async () => {
    if (!gameCode) {
      setError('No game code provided');
      setLoading(false);
      return;
    }

    try {
      const { data, error: gameError } = await supabase
        .from('eduplay_game_sessions')
        .select('id, game_title, status, host_id')
        .eq('game_code', gameCode.toUpperCase())
        .maybeSingle();

      if (gameError || !data) {
        setError('Invalid game code. Please check and try again.');
        setLoading(false);
        return;
      }

      if (data.status !== 'waiting') {
        setError('This game has already started or ended.');
        setLoading(false);
        return;
      }

      setGameInfo(data);

      if (user) {
        setDisplayName(user.email?.split('@')[0] || 'Player');
      } else {
        setShowAuthModal(true);
      }

      setLoading(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'GameJoinPage', action: 'validateGameCode', gameCode });
      setError('Failed to validate game code. Please try again.');
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!gameInfo) return;

    if (!user && !joinAsGuest) {
      setShowAuthModal(true);
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const { error: participantError } = await supabase
        .from('eduplay_participants')
        .insert({
          game_session_id: gameInfo.id,
          user_id: user?.id || null,
          display_name: displayName.trim(),
          is_host: false
        });

      if (participantError) {
        if (participantError.message.includes('duplicate')) {
          setError('You have already joined this game.');
        } else {
          setError('Failed to join game. Please try again.');
        }
        setJoining(false);
        return;
      }

      navigate(`/dashboard?view=eduplay&game=${gameInfo.id}`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'GameJoinPage', action: 'handleJoinGame', gameId: gameInfo?.id, userId: user?.id });
      setError('Failed to join game. Please try again.');
      setJoining(false);
    }
  };

  const handleSignUp = () => {
    navigate(`/?redirect=/join/${gameCode}`);
  };

  const handleSignIn = () => {
    navigate(`/?redirect=/join/${gameCode}`);
  };

  const handleContinueAsGuest = () => {
    setJoinAsGuest(true);
    setShowAuthModal(false);
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${getBackgroundGradient()} flex items-center justify-center p-4`}>
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-12 text-center max-w-md w-full`}>
          <Loader2 className="h-16 w-16 text-blue-600 dark:text-blue-400 animate-spin mx-auto mb-4" />
          <p className={getThemeTextSecondary()}>Validating game code...</p>
        </div>
      </div>
    );
  }

  if (error && !gameInfo) {
    return (
      <div className={`min-h-screen ${getBackgroundGradient()} flex items-center justify-center p-4`}>
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-12 text-center max-w-md w-full`}>
          <AlertCircle className="h-16 w-16 text-red-600 dark:text-red-400 mx-auto mb-4" />
          <h2 className={`text-2xl font-bold ${getThemeTextPrimary()} mb-2`}>Unable to Join Game</h2>
          <p className={`${getThemeTextSecondary()} mb-6`}>{error}</p>
          <button
            onClick={() => navigate('/dashboard?view=eduplay')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to EduPlay
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center p-4`}>
      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 max-w-md w-full`}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`${getThemeGradient('ui')} rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4`}>
            <Gamepad2 className="h-12 w-12 text-white" />
          </div>
          <h2 className={`text-3xl font-bold ${getThemeTextPrimary()} mb-2`}>Join Game</h2>
          {gameInfo && (
            <p className={`text-lg ${getThemeTextSecondary()}`}>{gameInfo.game_title}</p>
          )}
        </div>

        {/* Join Form */}
        <div className="space-y-6">
          <div>
            <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>
              Game Code
            </label>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400 tracking-wider">
                {gameCode?.toUpperCase()}
              </span>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>
              Your Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
              className={`w-full px-4 py-3 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${getThemeCardBg()} ${getThemeTextPrimary()}`}
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleJoinGame}
            disabled={joining || !displayName.trim()}
            className={`w-full px-6 py-3 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2`}
          >
            {joining ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Joining...</span>
              </>
            ) : (
              <>
                <Users className="h-5 w-5" />
                <span>Join Game</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-lg p-8 max-w-md w-full">
            <h3 className={`text-2xl font-bold ${getThemeTextPrimary()} mb-4`}>Join the Game</h3>
            <p className={`${getThemeTextSecondary()} mb-6`}>
              Choose how you'd like to join this game:
            </p>

            <div className="space-y-3">
              <button
                onClick={handleSignIn}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Sign In to Your Account
              </button>

              <button
                onClick={handleSignUp}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
              >
                Create New Account
              </button>

              <button
                onClick={handleContinueAsGuest}
                className={`w-full px-6 py-3 border-2 ${getThemeCardBorder()} ${getThemeTextSecondary()} rounded-lg hover:opacity-60 transition font-medium`}
              >
                Continue as Guest
              </button>
            </div>

            <p className={`mt-4 text-sm ${getThemeTextMuted()} text-center`}>
              Guest users won't have their progress saved
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
