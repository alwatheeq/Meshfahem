export type AudioStudyStage = 'idle' | 'transcribing' | 'show_transcript' | 'generating' | 'ready';

export interface AudioTranscriptResult {
  transcriptText: string;
  languageHint?: string;
}

export interface AudioStudyGeneratedContent {
  summaryText: string;
  flashcards?: Array<{ front: string; back: string }>;
  explanationText?: string;
}

