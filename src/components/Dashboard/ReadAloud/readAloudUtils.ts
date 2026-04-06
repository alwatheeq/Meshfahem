/**
 * Placeholder utilities for read-aloud.
 *
 * We keep these as a separate module so later, when TTS is selected/implemented,
 * we only need to update this module (and potentially the ReadAloudButton).
 */

export const sanitizeForTts = (input: string): string => {
  return (input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
};

