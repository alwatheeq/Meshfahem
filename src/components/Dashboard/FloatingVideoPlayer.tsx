import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Maximize2, Minimize2, X, Video, Volume2, VolumeX } from 'lucide-react';
import { useVideoRoom } from '../../contexts/VideoRoomContext';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ZegoVideoRoom } from './ZegoVideoRoom';

export const FloatingVideoPlayer: React.FC = () => {
  const { activeRoom, isMinimized, isConnected, disconnect, maximize, toggleMinimize } = useVideoRoom();
  const { t } = useI18n();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextMuted } = useTheme();

  const [position, setPosition] = useState({ x: window.innerWidth - 340, y: window.innerHeight - 220 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Only render when connected and minimized
  if (!isConnected || !isMinimized || !activeRoom) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 320, dragRef.current.origX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 200, dragRef.current.origY + dy)),
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      className="fixed z-[9990] select-none"
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`w-80 rounded-xl overflow-hidden shadow-2xl border-2 ${getThemeCardBorder()} ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{ transition: isDragging ? 'none' : 'box-shadow 0.2s' }}
      >
        {/* Header bar */}
        <div className={`flex items-center justify-between px-3 py-2 ${getThemeCardBg()} border-b ${getThemeCardBorder()}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className={`text-xs font-medium truncate ${getThemeTextPrimary()}`}>
              {activeRoom.roomName}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1 rounded hover:opacity-80 transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 ${getThemeTextMuted()}" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 ${getThemeTextMuted()}" />
              )}
            </button>
            <button
              onClick={maximize}
              className="p-1 rounded hover:opacity-80 transition-colors"
              title={t('floating_video.expand') || 'Return to Room'}
            >
              <Maximize2 className="h-3.5 w-3.5 ${getThemeTextMuted()}" />
            </button>
            <button
              onClick={disconnect}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title={t('floating_video.end_call') || 'End Call'}
            >
              <X className="h-3.5 w-3.5 text-red-500" />
            </button>
          </div>
        </div>

        {/* Video area - placeholder when minimized */}
        <div className="h-44 bg-gray-900 flex items-center justify-center relative">
          <div className="text-center">
            <Video className="h-8 w-8 text-gray-500 mx-auto mb-2" />
            <p className="text-xs text-gray-400">
              {t('floating_video.in_call') || 'In call'}
            </p>
          </div>
          {/* Gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-900/80 to-transparent" />
        </div>
      </div>
    </div>
  );
};
