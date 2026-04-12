import { create } from 'zustand';

interface StudyRoom {
  id: string;
  room_code: string;
  name: string;
  description?: string;
  max_participants: number;
}

interface FloatingVideoState {
  activeRoom: StudyRoom | null;
  /** True while the Study Rooms dashboard view is mounted (SPA, not URL path). */
  studyRoomsForeground: boolean;
  isMinimized: boolean;
  isMuted: boolean;
  participantCount: number;
  joinRoom: (room: StudyRoom) => void;
  leaveRoom: () => void;
  setStudyRoomsForeground: (foreground: boolean) => void;
  toggleMinimized: () => void;
  setMinimized: (minimized: boolean) => void;
  toggleMute: () => void;
  setParticipantCount: (count: number) => void;
}

export const useFloatingVideoStore = create<FloatingVideoState>((set) => ({
  activeRoom: null,
  studyRoomsForeground: false,
  isMinimized: false,
  isMuted: false,
  participantCount: 0,

  joinRoom: (room) => set({ activeRoom: room, isMinimized: false, isMuted: false }),
  leaveRoom: () => set({ activeRoom: null, isMinimized: false, isMuted: false, participantCount: 0 }),
  setStudyRoomsForeground: (foreground) => set({ studyRoomsForeground: foreground }),
  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  setMinimized: (minimized) => set({ isMinimized: minimized }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setParticipantCount: (count) => set({ participantCount: count }),
}));
