import React from 'react';
import { StickyNote, CreditCard, Copy, X } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';

const COLOR_OPTIONS = [
  { key: 'yellow', value: '#facc15' },
  { key: 'green', value: '#4ade80' },
  { key: 'blue', value: '#60a5fa' },
  { key: 'pink', value: '#f472b6' },
] as const;

interface HighlightMenuProps {
  position: { x: number; y: number };
  onHighlight: (color: string) => void;
  onAddNote: () => void;
  onCreateFlashcard: () => void;
  onCopy: () => void;
  onClose: () => void;
}

const HighlightMenu: React.FC<HighlightMenuProps> = ({
  position,
  onHighlight,
  onAddNote,
  onCreateFlashcard,
  onCopy,
  onClose,
}) => {
  const { t } = useI18n();

  return (
    <div
      className="bg-gray-900 text-white rounded-xl py-2 px-3 shadow-xl flex items-center gap-2"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999,
      }}
    >
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c.key}
          onClick={() => onHighlight(c.key)}
          title={t(`highlights.colors.${c.key}`)}
          className="w-5 h-5 rounded-full border border-white/30 hover:scale-125 transition-transform"
          style={{ backgroundColor: c.value }}
        />
      ))}

      <div className="w-px h-5 bg-gray-600 mx-1" />

      <button
        onClick={onAddNote}
        title={t('highlights.add_note')}
        className="p-1 rounded hover:bg-gray-700 transition-colors"
      >
        <StickyNote size={16} />
      </button>

      <button
        onClick={onCreateFlashcard}
        title={t('highlights.create_flashcard')}
        className="p-1 rounded hover:bg-gray-700 transition-colors"
      >
        <CreditCard size={16} />
      </button>

      <button
        onClick={onCopy}
        title={t('highlights.copy')}
        className="p-1 rounded hover:bg-gray-700 transition-colors"
      >
        <Copy size={16} />
      </button>

      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-gray-700 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default HighlightMenu;
