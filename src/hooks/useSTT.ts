import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

interface UseSTTOptions {
  lang?: string;
}

interface UseSTTReturn {
  start: () => void;
  stop: () => void;
  transcript: string;
  isListening: boolean;
  error: string;
}

export const useSTT = ({ lang = 'en-US' }: UseSTTOptions = {}): UseSTTReturn => {
  // Capture constructor once — global API never changes at runtime.
  const ctorRef = useRef(
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined
  );

  const isSupported = ctorRef.current !== undefined;

  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(
    isSupported
      ? ''
      : 'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
  );

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Accumulates only final (confirmed) segments; resets on each start().
  const finalTranscriptRef = useRef('');

  const start = useCallback(() => {
    const Ctor = ctorRef.current;
    if (!isSupported || !Ctor) {
      setError(
        'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
      );
      return;
    }

    if (isListening) return;

    setError('');
    setTranscript('');
    finalTranscriptRef.current = '';

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // Always show: confirmed final text + current interim (replaced each event).
      setTranscript(finalTranscriptRef.current + interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setError('Microphone access was denied. Please allow microphone permissions.');
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Please try again.');
      } else if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, isListening, lang]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return { start, stop, transcript, isListening, error };
};

// Usage:
// const { start, stop, transcript, isListening, error } = useSTT({ lang: 'en-US' });
// <button onClick={isListening ? stop : start}>{isListening ? 'Stop listening' : 'Start listening'}</button>
// <p>{transcript}</p>
// {error && <p>{error}</p>}
