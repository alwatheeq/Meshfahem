import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PomodoroMode = 'work' | 'break';

interface PomodoroState {
  isRunning: boolean;
  mode: PomodoroMode;
  timeRemaining: number;
  workDuration: number;
  breakDuration: number;
  sessionsCompleted: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  tick: () => void;
  switchMode: () => void;
  setWorkDuration: (seconds: number) => void;
  setBreakDuration: (seconds: number) => void;
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      mode: 'work' as PomodoroMode,
      timeRemaining: 25 * 60,
      workDuration: 25 * 60,
      breakDuration: 5 * 60,
      sessionsCompleted: 0,

      start: () => set({ isRunning: true }),
      pause: () => set({ isRunning: false }),

      reset: () => {
        const { mode, workDuration, breakDuration } = get();
        set({
          isRunning: false,
          timeRemaining: mode === 'work' ? workDuration : breakDuration,
        });
      },

      tick: () => {
        const { timeRemaining, isRunning } = get();
        if (!isRunning || timeRemaining <= 0) return;
        set({ timeRemaining: timeRemaining - 1 });
        if (timeRemaining - 1 <= 0) {
          get().switchMode();
        }
      },

      switchMode: () => {
        const { mode, workDuration, breakDuration, sessionsCompleted } = get();
        if (mode === 'work') {
          set({
            mode: 'break',
            timeRemaining: breakDuration,
            isRunning: true,
            sessionsCompleted: sessionsCompleted + 1,
          });
        } else {
          set({
            mode: 'work',
            timeRemaining: workDuration,
            isRunning: false,
          });
        }
      },

      setWorkDuration: (seconds) => {
        const { mode, isRunning } = get();
        set({ workDuration: seconds });
        if (mode === 'work' && !isRunning) {
          set({ timeRemaining: seconds });
        }
      },

      setBreakDuration: (seconds) => {
        const { mode, isRunning } = get();
        set({ breakDuration: seconds });
        if (mode === 'break' && !isRunning) {
          set({ timeRemaining: seconds });
        }
      },
    }),
    {
      name: 'meshfahem-pomodoro',
      partialize: (state) => ({
        mode: state.mode,
        timeRemaining: state.timeRemaining,
        workDuration: state.workDuration,
        breakDuration: state.breakDuration,
        sessionsCompleted: state.sessionsCompleted,
      }),
    }
  )
);
