import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Timer, Coffee, ChevronUp, ChevronDown } from 'lucide-react';
import { usePomodoroStore } from '../../stores/usePomodoroStore';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type PomodoroTimerVariant = 'floating' | 'embedded';

export interface PomodoroTimerProps {
  /** `floating` = bottom-right chip (dashboard). `embedded` = full width inside a parent (e.g. notification panel). */
  variant?: PomodoroTimerVariant;
}

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ variant = 'floating' }) => {
  const isEmbedded = variant === 'embedded';
  const [expanded, setExpanded] = useState(isEmbedded);
  const { t } = useI18n();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeGradient,
  } = useTheme();

  const {
    isRunning,
    mode,
    timeRemaining,
    sessionsCompleted,
    start,
    pause,
    reset,
    tick,
  } = usePomodoroStore();

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning, tick]);

  const ModeIcon = mode === 'work' ? Timer : Coffee;
  const modeLabel = mode === 'work' ? t('pomodoro.work') : t('pomodoro.break');

  const breakOverlayZ = isEmbedded ? 'z-[200]' : 'z-40';

  const timerCard = (
    <div
      className={`${isEmbedded ? 'w-full' : 'w-64'} rounded-2xl shadow-lg border ${getThemeCardBg()} ${getThemeCardBorder()} p-4 space-y-3`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 ${getThemeTextPrimary()}`}>
          <ModeIcon className="h-5 w-5" />
          <span className="font-semibold text-sm">{modeLabel}</span>
        </div>
        {!isEmbedded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={`p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition ${getThemeTextSecondary()}`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="text-center">
        <p className={`text-4xl font-mono font-bold ${getThemeTextPrimary()}`}>{formatTime(timeRemaining)}</p>
      </div>

      <p className={`text-center text-xs ${getThemeTextSecondary()}`}>
        {t('pomodoro.sessions_completed', { count: sessionsCompleted })}
      </p>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={isRunning ? pause : start}
          className={`p-2.5 rounded-full text-white transition bg-gradient-to-r ${getThemeGradient('ui')} hover:opacity-90`}
        >
          {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={reset}
          className={`p-2 rounded-full border transition hover:bg-black/5 dark:hover:bg-white/10 ${getThemeCardBorder()} ${getThemeTextSecondary()}`}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {mode === 'break' && isRunning && (
        <div className={`fixed inset-0 ${breakOverlayZ} flex items-center justify-center bg-black/30 backdrop-blur-lg`}>
          <div className="text-center space-y-4">
            <Coffee className="mx-auto h-16 w-16 text-white animate-pulse" />
            <h2 className="text-3xl font-bold text-white">{t('pomodoro.take_a_break')}</h2>
            <p className="text-lg text-white/80">{t('pomodoro.break_message')}</p>
            <p className="text-5xl font-mono font-bold text-white">{formatTime(timeRemaining)}</p>
            <button
              type="button"
              onClick={pause}
              className="mt-4 px-6 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
            >
              {t('pomodoro.pause')}
            </button>
          </div>
        </div>
      )}

      {isEmbedded ? (
        <div className="w-full min-w-0">{timerCard}</div>
      ) : (
        <div className="fixed bottom-24 right-6 z-50">
          {expanded ? (
            timerCard
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition hover:scale-105 ${getThemeCardBg()} ${getThemeCardBorder()} ${getThemeTextPrimary()}`}
            >
              <ModeIcon className="h-4 w-4" />
              <span className="font-mono text-sm font-semibold">{formatTime(timeRemaining)}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRunning) pause();
                    else start();
                  }}
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition"
                >
                  {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <ChevronUp className="h-3.5 w-3.5 opacity-50" />
              </div>
            </button>
          )}
        </div>
      )}
    </>
  );
};

export { PomodoroTimer };
export default PomodoroTimer;
