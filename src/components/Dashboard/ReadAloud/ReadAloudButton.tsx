import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';

export interface ReadAloudButtonProps {
  text: string;
  className?: string;
  ariaLabel?: string;
  // When true, shows the "disabled" icon/state (future: when TTS is running).
  disabled?: boolean;
  // Optional callback for future wiring.
  onRequestRead?: (text: string) => void;
}

/**
 * Read-aloud button (placeholder).
 *
 * Note: Per requirements, we don't activate TTS yet (no API/tts provider selected).
 * This component is ready to be wired later.
 */
export const ReadAloudButton: React.FC<ReadAloudButtonProps> = ({
  text,
  className,
  ariaLabel,
  disabled = false,
  onRequestRead
}) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBorder, getThemeTextMuted } = useTheme();

  const safeText = (text ?? '').trim();
  const canRead = safeText.length > 0 && !disabled;

  return (
    <button
      type="button"
      disabled={!canRead}
      aria-label={ariaLabel || t('read_aloud.read_aloud') || 'Read aloud'}
      title={disabled ? (t('read_aloud.coming_soon') || 'Coming soon') : (t('read_aloud.read_aloud') || 'Read aloud')}
      onClick={() => {
        if (!canRead) return;
        // Placeholder: no TTS yet. Call optional callback so future wiring can hook in.
        onRequestRead?.(safeText);
      }}
      className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-sm transition-opacity duration-150 ${
        canRead
          ? `${getThemeGradient('ui')} text-white hover:opacity-90`
          : `opacity-60 cursor-not-allowed ${getThemeTextMuted()}`
      } ${getThemeCardBorder()} ${className || ''}`}
    >
      {canRead ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
};

