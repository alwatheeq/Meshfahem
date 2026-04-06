import React, { useRef } from 'react';
import { Upload, Mic, FileAudio } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import type { AudioStudyStage } from './AudioStudyTypes';

export interface AudioUploadProps {
  stage: AudioStudyStage;
  selectedFile: File | null;
  onSelectFile: (file: File) => void;
}

/**
 * Audio upload UI placeholder.
 *
 * Per requirements: we don't activate speech-to-text generation yet (no API chosen),
 * so this component only selects a file and shows UI scaffolding.
 */
export const AudioUpload: React.FC<AudioUploadProps> = ({ stage, selectedFile, onSelectFile }) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBorder, getThemeTextSecondary, getThemeTextMuted } = useTheme();

  const inputRef = useRef<HTMLInputElement | null>(null);

  const isDisabled = stage !== 'idle';

  return (
    <div className={`p-4 rounded-lg border ${getThemeCardBorder()} ${getThemeTextSecondary()}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-md ${getThemeGradient('ui')} text-white`}>
            <Mic className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{t('audio_study.upload_title') || 'Audio Study'}</h3>
            <p className={`${getThemeTextMuted()} text-sm`}>
              {t('audio_study.upload_desc') || 'Upload an audio file to study from it (transcription coming soon).'}
            </p>
          </div>
        </div>
        <FileAudio className="h-5 w-5 opacity-70" />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          disabled={isDisabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onSelectFile(file);
          }}
          className="hidden"
        />

        <button
          type="button"
          disabled={isDisabled}
          onClick={() => inputRef.current?.click()}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg transition duration-150 ${
            isDisabled
              ? `opacity-60 cursor-not-allowed ${getThemeTextMuted()} border ${getThemeCardBorder()}`
              : `${getThemeGradient('ui')} text-white hover:opacity-90`
          }`}
        >
          <Upload className="h-4 w-4" />
          <span>{t('audio_study.choose_file') || 'Choose audio'}</span>
        </button>

        {selectedFile ? (
          <div className="text-sm">
            <div className={`font-medium ${getThemeTextSecondary()}`}>{selectedFile.name}</div>
            <div className={`${getThemeTextMuted()}`}>{selectedFile.type || 'audio'}</div>
          </div>
        ) : (
          <div className={`text-sm ${getThemeTextMuted()}`}>
            {t('audio_study.no_file_selected') || 'No file selected'}
          </div>
        )}
      </div>
    </div>
  );
};

