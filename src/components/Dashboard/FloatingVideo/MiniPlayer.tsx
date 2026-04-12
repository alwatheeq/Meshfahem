import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Mic, MicOff, Maximize2, X, GripVertical } from 'lucide-react';
import { useFloatingVideoStore } from '../../../stores/useFloatingVideoStore';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';

const MiniPlayer: React.FC = () => {
  const { activeRoom, isMuted, toggleMute, leaveRoom } = useFloatingVideoStore();
  const { getThemeCardBg, getThemeCardBorder } = useTheme();
  const { t } = useI18n();

  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const getInitialPosition = useCallback(() => {
    return {
      x: window.innerWidth - 160 - 24,
      y: window.innerHeight - 112 - 96,
    };
  }, []);

  useEffect(() => {
    if (!position) {
      setPosition(getInitialPosition());
    }
  }, [position, getInitialPosition]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const pos = position ?? getInitialPosition();
      dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position, getInitialPosition],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - 160, dragState.current.origX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 112, dragState.current.origY + dy)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  const handleExpand = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mindstudy:focus-study-rooms'));
  }, []);

  if (!activeRoom) return null;

  const pos = position ?? getInitialPosition();

  return (
    <div
      ref={containerRef}
      className={`fixed z-[9998] w-40 h-28 rounded-xl shadow-2xl overflow-hidden flex flex-col select-none ${getThemeCardBg()} border ${getThemeCardBorder()}`}
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Drag handle + room name */}
      <div
        className="flex items-center gap-1 px-1.5 py-1 cursor-grab active:cursor-grabbing bg-black/30 backdrop-blur-sm"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <GripVertical className="w-3 h-3 text-white/70 shrink-0" />
        <span className="text-[10px] text-white font-medium truncate flex-1">
          {activeRoom.name}
        </span>
      </div>

      {/* Video preview placeholder */}
      <div className="flex-1 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
        <span className="text-[9px] text-gray-500">
          {t('floating_video.video_preview') || 'Video Preview'}
        </span>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-around px-1 py-1 bg-black/40 backdrop-blur-sm">
        <button
          type="button"
          onClick={toggleMute}
          className="p-1 rounded hover:bg-white/20 transition-colors"
          title={isMuted ? (t('floating_video.unmute') || 'Unmute') : (t('floating_video.mute') || 'Mute')}
        >
          {isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-white" />
          )}
        </button>

        <button
          type="button"
          onClick={handleExpand}
          className="p-1 rounded hover:bg-white/20 transition-colors"
          title={t('floating_video.expand') || 'Expand'}
        >
          <Maximize2 className="w-3.5 h-3.5 text-white" />
        </button>

        <button
          type="button"
          onClick={leaveRoom}
          className="p-1 rounded hover:bg-red-500/40 transition-colors"
          title={t('floating_video.leave_room') || 'Leave'}
        >
          <X className="w-3.5 h-3.5 text-red-400" />
        </button>
      </div>
    </div>
  );
};

export default MiniPlayer;
