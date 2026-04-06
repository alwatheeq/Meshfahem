import React from 'react';
import { Wand2, Sparkles } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';

export interface AudioSummaryGeneratorProps {
  isGenerating: boolean;
  hasTranscript: boolean;
  onGenerateRequestedContent?: () => void;
  generatedText?: {
    summaryText?: string;
    explanationText?: string;
  };
}

/**
 * Placeholder for generating summary/explanation from transcript.
 * No API activation yet.
 */
export const AudioSummaryGenerator: React.FC<AudioSummaryGeneratorProps> = ({
  isGenerating,
  hasTranscript,
  onGenerateRequestedContent,
  generatedText
}) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBorder, getThemeTextMuted, getThemeTextSecondary, getThemeTextPrimary, getThemeCardBg } = useTheme();

  const canGenerate = hasTranscript && !isGenerating;

  return (
    <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg`}>
      <div className="p-4 border-b" style={{ borderColor: 'transparent' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            <h3 className={`font-semibold ${getThemeTextPrimary()}`}>{t('audio_study.generate_title') || 'Generate Study Tools'}</h3>
          </div>
        </div>
        <p className={`${getThemeTextMuted()} text-sm mt-1`}>
          {t('audio_study.generate_desc') || 'Transcription -> summary/explanation (coming soon).'}
        </p>
      </div>

      <div className="p-4">
        <button
          type="button"
          disabled={!canGenerate}
          onClick={onGenerateRequestedContent}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg transition duration-150 ${
            !canGenerate
              ? `opacity-60 cursor-not-allowed ${getThemeTextMuted()}`
              : `${getThemeGradient('ui')} text-white hover:opacity-90`
          }`}
        >
          {isGenerating ? <Sparkles className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span>{isGenerating ? (t('audio_study.generating') || 'Generating...') : (t('audio_study.generate_from_transcript') || 'Generate from transcript')}</span>
        </button>

        {generatedText ? (
          <div className="mt-4">
            {generatedText.summaryText ? (
              <div className="mb-3">
                <h4 className={`font-semibold ${getThemeTextPrimary()}`}>{t('audio_study.summary') || 'Summary'}</h4>
                <div className={`text-sm whitespace-pre-wrap ${getThemeTextSecondary()}`}>{generatedText.summaryText}</div>
              </div>
            ) : null}
            {generatedText.explanationText ? (
              <div>
                <h4 className={`font-semibold ${getThemeTextPrimary()}`}>{t('audio_study.explanation') || 'Clearer Explanation'}</h4>
                <div className={`text-sm whitespace-pre-wrap ${getThemeTextSecondary()}`}>{generatedText.explanationText}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

