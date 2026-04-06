import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTTSOptions {
  lang?: string;
}

interface UseTTSReturn {
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  error: string;
}

export const useTTS = ({ lang = 'en-US' }: UseTTSOptions = {}): UseTTSReturn => {
  // Computed once — `window.speechSynthesis` availability never changes at runtime.
  const isSupportedRef = useRef(
    typeof window !== 'undefined' && 'speechSynthesis' in window
  );
  const isSupported = isSupportedRef.current;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState(
    isSupported ? '' : 'Text-to-speech is not supported in this browser.'
  );

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) {
        setError('Text-to-speech is not supported in this browser.');
        return;
      }

      setError('');
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
      };
      utterance.onerror = (e) => {
        setIsSpeaking(false);
        setIsPaused(false);
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          setError(`Speech error: ${e.error}`);
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, lang]
  );

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    setIsSpeaking(false);
    setIsPaused(true);
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.resume();
    setIsSpeaking(true);
    setIsPaused(false);
  }, [isSupported]);

  useEffect(() => {
    return () => {
      if (isSupportedRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { speak, stop, pause, resume, isSpeaking, isPaused, error };
};

// Usage:
// const { speak, stop, pause, resume, isSpeaking, isPaused, error } = useTTS({ lang: 'en-US' });
// <button onClick={() => speak(summaryText)} disabled={isSpeaking}>Read aloud</button>
// <button onClick={pause} disabled={!isSpeaking}>Pause</button>
// <button onClick={resume} disabled={!isPaused}>Resume</button>
// <button onClick={stop}>Stop</button>
// {error && <p>{error}</p>}
