import React, { useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useTTS } from '../../../hooks/useTTS';
import { sanitizeForTts } from './readAloudUtils';

export interface ReadAloudButtonProps {
  text: string;
  lang?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onRequestRead?: (text: string) => void;
}

export const ReadAloudButton: React.FC<ReadAloudButtonProps> = ({
  text,
  lang = 'en-US',
  className,
  ariaLabel,
  disabled = false,
  onRequestRead,
}) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBorder, getThemeTextMuted } = useTheme();
  const { speak, stop, isSpeaking } = useTTS({ lang });

  const safeText = sanitizeForTts(text);
  const canRead = safeText.length > 0 && !disabled;

  const handleClick = useCallback(() => {
    if (!canRead) return;
    if (isSpeaking) {
      stop();
      return;
    }
    speak(safeText);
    onRequestRead?.(safeText);
  }, [canRead, isSpeaking, stop, speak, safeText, onRequestRead]);

  const label = isSpeaking
    ? t('read_aloud.stop_reading') || 'Stop reading'
    : ariaLabel || t('read_aloud.read_aloud') || 'Read aloud';

  return (
    <button
      type="button"
      disabled={!canRead}
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-sm transition-opacity duration-150 ${
        canRead
          ? `${getThemeGradient('ui')} text-white hover:opacity-90`
          : `opacity-60 cursor-not-allowed ${getThemeTextMuted()}`
      } ${getThemeCardBorder()} ${className || ''}`}
    >
      {isSpeaking ? (
        <VolumeX className="h-4 w-4" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </button>
  );
};
