import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface ActiveRoom {
  roomId: string;
  roomName: string;
  roomCode: string;
  userName: string;
}

interface VideoRoomContextValue {
  activeRoom: ActiveRoom | null;
  isMinimized: boolean;
  isConnected: boolean;
  connect: (room: ActiveRoom) => void;
  disconnect: () => void;
  minimize: () => void;
  maximize: () => void;
  toggleMinimize: () => void;
}

const VideoRoomContext = createContext<VideoRoomContextValue | undefined>(undefined);

export const VideoRoomProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  const connect = useCallback((room: ActiveRoom) => {
    setActiveRoom(room);
    setIsMinimized(false);
  }, []);

  const disconnect = useCallback(() => {
    setActiveRoom(null);
    setIsMinimized(false);
  }, []);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const maximize = useCallback(() => setIsMinimized(false), []);
  const toggleMinimize = useCallback(() => setIsMinimized((prev) => !prev), []);

  return (
    <VideoRoomContext.Provider
      value={{
        activeRoom,
        isMinimized,
        isConnected: activeRoom !== null,
        connect,
        disconnect,
        minimize,
        maximize,
        toggleMinimize,
      }}
    >
      {children}
    </VideoRoomContext.Provider>
  );
};

export const useVideoRoom = (): VideoRoomContextValue => {
  const context = useContext(VideoRoomContext);
  if (!context) {
    throw new Error('useVideoRoom must be used within a VideoRoomProvider');
  }
  return context;
};
