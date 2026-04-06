import React from 'react';
import { FlashcardViewer } from '../FlashcardViewer';

interface FlashcardsWidgetProps {
  flashcards: Array<{ front: string; back: string }>;
  medicalMode?: boolean;
  itemId?: string | null;
}

export const FlashcardsWidget: React.FC<FlashcardsWidgetProps> = ({
  flashcards,
  medicalMode = false,
  itemId
}) => {
  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden">
      <FlashcardViewer flashcards={flashcards} medicalMode={medicalMode} itemId={itemId || undefined} />
    </div>
  );
};

