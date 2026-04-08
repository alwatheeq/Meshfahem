import { useState, useCallback, useRef, useEffect } from 'react';

export interface PomodoroSettings {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
}

interface PomodoroState {
  isRunning: boolean;
  isBreak: boolean;
  timeRemaining: number; // seconds
  sessionCount: number;
  totalStudySeconds: number;
  settings: PomodoroSettings;
}

interface UsePomodoroReturn extends PomodoroState {
  start: () => void;
  pause: () => void;
  reset: () => void;
  skipBreak: () => void;
  updateSettings: (settings: Partial<PomodoroSettings>) => void;
  formattedTime: string;
  progress: number; // 0-100
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
};

const STORAGE_KEY = 'meshfahem_pomodoro_settings';

function loadSettings(): PomodoroSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function usePomodoro(): UsePomodoroReturn {
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(settings.workMinutes * 60);
  const [sessionCount, setSessionCount] = useState(0);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalDuration = isBreak
    ? (sessionCount > 0 && sessionCount % settings.sessionsBeforeLongBreak === 0
        ? settings.longBreakMinutes
        : settings.breakMinutes) * 60
    : settings.workMinutes * 60;

  const progress = totalDuration > 0
    ? Math.round(((totalDuration - timeRemaining) / totalDuration) * 100)
    : 0;

  const formattedTime = `${String(Math.floor(timeRemaining / 60)).padStart(2, '0')}:${String(timeRemaining % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Timer finished
            if (!isBreak) {
              // Work session complete → start break
              setSessionCount((s) => s + 1);
              setIsBreak(true);
              const nextIsLongBreak = (sessionCount + 1) % settings.sessionsBeforeLongBreak === 0;
              return (nextIsLongBreak ? settings.longBreakMinutes : settings.breakMinutes) * 60;
            } else {
              // Break complete → start work
              setIsBreak(false);
              return settings.workMinutes * 60;
            }
          }
          if (!isBreak) {
            setTotalStudySeconds((s) => s + 1);
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isBreak, sessionCount, settings]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeRemaining(settings.workMinutes * 60);
    setSessionCount(0);
    setTotalStudySeconds(0);
  }, [settings]);

  const skipBreak = useCallback(() => {
    setIsBreak(false);
    setTimeRemaining(settings.workMinutes * 60);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<PomodoroSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return {
    isRunning,
    isBreak,
    timeRemaining,
    sessionCount,
    totalStudySeconds,
    settings,
    start,
    pause,
    reset,
    skipBreak,
    updateSettings,
    formattedTime,
    progress,
  };
}
