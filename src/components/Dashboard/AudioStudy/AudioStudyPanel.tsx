import React, { useState } from 'react';
import type { AudioStudyStage, AudioTranscriptResult, AudioStudyGeneratedContent } from './AudioStudyTypes';
import { AudioUpload } from './AudioUpload';
import { TranscriptView } from './TranscriptView';
import { AudioSummaryGenerator } from './AudioSummaryGenerator';
import { AudioTtsPlayer } from './AudioTtsPlayer';

/**
 * Audio studying panel placeholder.
 *
 * This file exists for future wiring. It does not connect to any backend transcription/TTS APIs yet.
 */
export const AudioStudyPanel: React.FC = () => {
  const [stage] = useState<AudioStudyStage>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transcript] = useState<AudioTranscriptResult>({ transcriptText: '', languageHint: undefined });
  const [generated] = useState<AudioStudyGeneratedContent>({
    summaryText: '',
    explanationText: ''
  });

  return (
    <div className="space-y-4">
      <AudioUpload
        stage={stage}
        selectedFile={selectedFile}
        onSelectFile={(f) => setSelectedFile(f)}
      />

      <TranscriptView
        transcriptText={transcript.transcriptText}
        languageHint={transcript.languageHint}
        isGenerating={false}
      />

      <AudioSummaryGenerator
        isGenerating={false}
        hasTranscript={transcript.transcriptText.trim().length > 0}
        generatedText={generated}
      />

      <AudioTtsPlayer textToPlay={generated.summaryText} />
    </div>
  );
};

