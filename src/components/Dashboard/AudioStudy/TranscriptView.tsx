import React from 'react';
import { FileText } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';

export interface TranscriptViewProps {
  transcriptText: string;
  languageHint?: string;
  onGenerateRequestedContent?: () => void;
  isGenerating?: boolean;
}

/**
 * Transcript UI placeholder.
 *
 * Per requirements: doesn't actually perform speech-to-text.
 */
export const TranscriptView: React.FC<TranscriptViewProps> = ({
  transcriptText,
  languageHint,
  onGenerateRequestedContent,
  isGenerating = false
}) => {
  const { t } = useI18n();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextSecondary, getThemeTextMuted, getThemeTextPrimary, getThemeGradient } = useTheme();

  const hasText = transcriptText.trim().length > 0;

  return (
    <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg`}>
      <div className="p-4 border-b" style={{ borderColor: 'transparent' }}>
        <div className="flex items-center gap-2">
          <FileText className={`h-4 w-4 ${getThemeTextPrimary()}`} />
          <h3 className={`font-semibold ${getThemeTextPrimary()}`}>{t('audio_study.transcript_title') || 'Transcript'}</h3>
          {languageHint ? (
            <span className={`text-xs ${getThemeTextMuted()}`}>{languageHint}</span>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        {hasText ? (
          <div className={`text-sm whitespace-pre-wrap ${getThemeTextSecondary()} leading-relaxed`}>
            {transcriptText}
          </div>
        ) : (
          <div className={`text-sm ${getThemeTextMuted()}`}>{t('audio_study.no_transcript') || 'Transcript will appear here.'}</div>
        )}

        {onGenerateRequestedContent ? (
          <div className="mt-4">
            <button
              type="button"
              disabled={!hasText || isGenerating}
              onClick={onGenerateRequestedContent}
              className={`inline-flex items-center px-4 py-2 rounded-lg transition duration-150 ${
                !hasText || isGenerating
                  ? `opacity-60 cursor-not-allowed ${getThemeTextMuted()}`
                  : `${getThemeGradient('ui')} text-white hover:opacity-90`
              }`}
            >
              {isGenerating ? (t('audio_study.generating') || 'Generating...') : (t('audio_study.generate_from_transcript') || 'Generate summary/explanation')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

