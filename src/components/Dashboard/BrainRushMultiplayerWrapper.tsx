import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MultiplayerMenu from './MultiplayerMenu';
import MultiplayerLobby from './MultiplayerLobby';
import MultiplayerGamePlay from './MultiplayerGamePlay';
import MultiplayerResults from './MultiplayerResults';

type MultiplayerView = 'menu' | 'lobby' | 'game' | 'results';

export const BrainRushMultiplayerWrapper: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const { getThemeGradient } = useTheme();

  const [currentView, setCurrentView] = useState<MultiplayerView>('menu');
  const [lobbyId, setLobbyId] = useState<string | null>(params.lobbyId || null);

  const handleLobbyJoined = (id: string) => {
    setLobbyId(id);
    setCurrentView('lobby');
  };

  const handleExitLobby = () => {
    setLobbyId(null);
    setCurrentView('menu');
  };

  const handleBackToEduPlay = () => {
    navigate(-1);
  };

  if (currentView === 'menu') {
    return (
      <div className={`min-h-screen ${getThemeGradient('bg')}`}>
        <div className="p-4">
          <button
            onClick={handleBackToEduPlay}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to EduPlay
          </button>
        </div>
        <MultiplayerMenu onLobbyJoined={handleLobbyJoined} />
      </div>
    );
  }

  if (currentView === 'lobby' && lobbyId) {
    return (
      <div className={`min-h-screen ${getThemeGradient('bg')}`}>
        <MultiplayerLobby lobbyId={lobbyId} onExit={handleExitLobby} />
      </div>
    );
  }

  if (currentView === 'game' && lobbyId) {
    return (
      <div className="min-h-screen">
        <MultiplayerGamePlay lobbyId={lobbyId} />
      </div>
    );
  }

  if (currentView === 'results' && lobbyId) {
    return (
      <div className="min-h-screen">
        <MultiplayerResults lobbyId={lobbyId} />
      </div>
    );
  }

  return null;
};
