import React, { useEffect, useRef } from 'react';
import { useFloatingVideoStore } from '../../../stores/useFloatingVideoStore';
import MiniPlayer from './MiniPlayer';

const FloatingVideoPortal: React.FC = () => {
  const { activeRoom, isMinimized, setMinimized, studyRoomsForeground } = useFloatingVideoStore();
  const prevForegroundRef = useRef(studyRoomsForeground);

  useEffect(() => {
    const prev = prevForegroundRef.current;
    const curr = studyRoomsForeground;
    prevForegroundRef.current = curr;

    if (!activeRoom) return;

    if (prev && !curr) {
      setMinimized(true);
    } else if (!prev && curr) {
      setMinimized(false);
    }
  }, [studyRoomsForeground, activeRoom, setMinimized]);

  if (!activeRoom) return null;
  if (!isMinimized) return null;

  return <MiniPlayer />;
};

export { FloatingVideoPortal };
export default FloatingVideoPortal;
