import { useState, useEffect, useCallback } from 'react';

interface UseMouseProximityOptions {
  threshold?: number;
  delay?: number;
  enabled?: boolean;
}

export const useMouseProximity = ({
  threshold = 50,
  delay = 200,
  enabled = true,
}: UseMouseProximityOptions = {}) => {
  const [isNearEdge, setIsNearEdge] = useState(false);
  const [mouseX, setMouseX] = useState<number | null>(null);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!enabled) return;

      const x = event.clientX;
      setMouseX(x);

      if (x <= threshold) {
        setIsNearEdge(true);
      } else {
        setIsNearEdge(false);
      }
    },
    [threshold, enabled]
  );

  useEffect(() => {
    if (!enabled) {
      setIsNearEdge(false);
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const debouncedMouseMove = (event: MouseEvent) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleMouseMove(event);
      }, delay);
    };

    window.addEventListener('mousemove', debouncedMouseMove);

    return () => {
      window.removeEventListener('mousemove', debouncedMouseMove);
      clearTimeout(timeoutId);
    };
  }, [handleMouseMove, delay, enabled]);

  return { isNearEdge, mouseX };
};
