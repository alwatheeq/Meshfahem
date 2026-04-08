import React, { useState } from 'react';
import { Timer, Play, Pause, RotateCcw, SkipForward, Coffee, BookOpen, Settings, X } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { usePomodoro } from '../../hooks/usePomodoro';

interface PomodoroTimerProps {
  onBreakStart?: () => void;
  onBreakEnd?: () => void;
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ onBreakStart, onBreakEnd }) => {
  const { t } = useI18n();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
  } = useTheme();

  const {
    isRunning,
    isBreak,
    formattedTime,
    progress,
    sessionCount,
    totalStudySeconds,
    settings,
    start,
    pause,
    reset,
    skipBreak,
    updateSettings,
  } = usePomodoro();

  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Notify parent about break state changes
  React.useEffect(() => {
    if (isBreak) {
      onBreakStart?.();
    } else {
      onBreakEnd?.();
    }
  }, [isBreak, onBreakStart, onBreakEnd]);

  const studyMinutes = Math.floor(totalStudySeconds / 60);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          isRunning
            ? isBreak
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : `${getThemeCardBg()} ${getThemeCardBorder()} border hover:shadow-md`
        }`}
      >
        <Timer className="h-4 w-4" />
        {isRunning ? formattedTime : (t('pomodoro.title') || 'Pomodoro')}
      </button>
    );
  }

  return (
    <>
      {/* Break overlay */}
      {isBreak && isRunning && (
        <div className="fixed inset-0 z-[9998] backdrop-blur-md bg-black/30 flex items-center justify-center transition-all">
          <div className={`${getThemeCardBg()} rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border ${getThemeCardBorder()}`}>
            <div className="mb-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                <Coffee className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className={`text-xl font-bold ${getThemeTextPrimary()}`}>
                {t('pomodoro.break_time') || 'Break Time!'}
              </h3>
              <p className={`mt-2 ${getThemeTextSecondary()}`}>
                {t('pomodoro.take_a_break') || 'Rest your eyes and stretch.'}
              </p>
            </div>

            <div className="text-4xl font-mono font-bold text-amber-600 dark:text-amber-400 mb-6">
              {formattedTime}
            </div>

            <button
              onClick={skipBreak}
              className="px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
            >
              <SkipForward className="h-4 w-4 inline mr-2" />
              {t('pomodoro.skip_break') || 'Skip Break'}
            </button>
          </div>
        </div>
      )}

      {/* Timer panel */}
      <div className={`${getThemeCardBg()} ${getThemeCardBorder()} border rounded-xl shadow-lg p-4 w-72`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isBreak ? (
              <Coffee className="h-4 w-4 text-amber-500" />
            ) : (
              <BookOpen className="h-4 w-4 text-emerald-500" />
            )}
            <span className={`text-sm font-medium ${getThemeTextPrimary()}`}>
              {isBreak
                ? (t('pomodoro.break_time') || 'Break')
                : (t('pomodoro.work_session') || 'Focus')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
            >
              <Settings className="h-3.5 w-3.5 text-gray-400" />
            </button>
            <button
              onClick={() => setExpanded(false)}
              className={`p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
            >
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Progress ring */}
        <div className="flex justify-center mb-3">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="50" cy="50" r="42"
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
                className={isBreak ? 'text-amber-500' : 'text-emerald-500'}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-mono font-bold ${getThemeTextPrimary()}`}>
                {formattedTime}
              </span>
              <span className={`text-xs ${getThemeTextMuted()}`}>
                {t('pomodoro.session') || 'Session'} {sessionCount + 1}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            onClick={reset}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={t('pomodoro.reset') || 'Reset'}
          >
            <RotateCcw className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </button>
          <button
            onClick={isRunning ? pause : start}
            className={`p-3 rounded-full text-white transition-all shadow-md ${
              isRunning
                ? 'bg-red-500 hover:bg-red-600'
                : isBreak
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-emerald-500 hover:bg-emerald-600'
            }`}
          >
            {isRunning ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          {isBreak && (
            <button
              onClick={skipBreak}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t('pomodoro.skip_break') || 'Skip Break'}
            >
              <SkipForward className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* Stats */}
        <div className={`text-center text-xs ${getThemeTextMuted()}`}>
          {studyMinutes > 0 && (
            <span>{t('pomodoro.studied') || 'Studied'}: {studyMinutes} min</span>
          )}
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className={`mt-3 pt-3 border-t ${getThemeCardBorder()} space-y-2`}>
            <div className="flex items-center justify-between">
              <label className={`text-xs ${getThemeTextSecondary()}`}>
                {t('pomodoro.work_minutes') || 'Work (min)'}
              </label>
              <input
                type="number"
                min={1} max={60}
                value={settings.workMinutes}
                onChange={(e) => updateSettings({ workMinutes: Number(e.target.value) || 25 })}
                className={`w-14 px-2 py-1 text-xs text-center rounded border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()}`}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className={`text-xs ${getThemeTextSecondary()}`}>
                {t('pomodoro.break_minutes') || 'Break (min)'}
              </label>
              <input
                type="number"
                min={1} max={30}
                value={settings.breakMinutes}
                onChange={(e) => updateSettings({ breakMinutes: Number(e.target.value) || 5 })}
                className={`w-14 px-2 py-1 text-xs text-center rounded border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()}`}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
