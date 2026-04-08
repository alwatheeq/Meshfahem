import React, { useState } from 'react';
import { Highlighter, StickyNote, CreditCard, Trash2, X } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Highlight } from '../../hooks/useHighlighting';

type HighlightColor = Highlight['color'];

interface HighlightMenuProps {
  position: { x: number; y: number };
  mode: 'create' | 'edit';
  currentColor?: HighlightColor;
  currentNote?: string | null;
  onCreateHighlight: (color: HighlightColor) => void;
  onDeleteHighlight?: () => void;
  onUpdateNote?: (note: string) => void;
  onCreateFlashcard?: () => void;
  onClose: () => void;
}

const COLORS: { value: HighlightColor; bg: string; ring: string }[] = [
  { value: 'yellow', bg: 'bg-yellow-300', ring: 'ring-yellow-400' },
  { value: 'green', bg: 'bg-emerald-300', ring: 'ring-emerald-400' },
  { value: 'blue', bg: 'bg-blue-300', ring: 'ring-blue-400' },
  { value: 'pink', bg: 'bg-pink-300', ring: 'ring-pink-400' },
  { value: 'orange', bg: 'bg-orange-300', ring: 'ring-orange-400' },
];

export const HighlightMenu: React.FC<HighlightMenuProps> = ({
  position,
  mode,
  currentColor,
  currentNote,
  onCreateHighlight,
  onDeleteHighlight,
  onUpdateNote,
  onCreateFlashcard,
  onClose,
}) => {
  const { t } = useI18n();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary } = useTheme();
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState(currentNote || '');

  return (
    <div
      className="fixed z-[9999] animate-fadeIn"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className={`${getThemeCardBg()} ${getThemeCardBorder()} border rounded-xl shadow-xl p-2 min-w-[180px]`}>
        {/* Color picker */}
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <Highlighter className="h-3.5 w-3.5 text-gray-400 mr-1" />
          {COLORS.map(({ value, bg, ring }) => (
            <button
              key={value}
              onClick={() => onCreateHighlight(value)}
              className={`w-6 h-6 rounded-full ${bg} hover:scale-110 transition-transform ${
                currentColor === value ? `ring-2 ${ring} ring-offset-1` : ''
              }`}
              title={t(`highlighting.${value}`) || value}
            />
          ))}
        </div>

        {/* Divider */}
        <div className={`border-t ${getThemeCardBorder()} my-1`} />

        {/* Actions */}
        <div className="space-y-0.5">
          {onCreateFlashcard && (
            <button
              onClick={onCreateFlashcard}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium ${getThemeTextSecondary()} hover:opacity-80 transition-colors`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              {t('highlighting.create_flashcard') || 'Create Flashcard'}
            </button>
          )}

          <button
            onClick={() => setShowNote(!showNote)}
            className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium ${getThemeTextSecondary()} hover:opacity-80 transition-colors`}
          >
            <StickyNote className="h-3.5 w-3.5" />
            {t('highlighting.add_note') || 'Add Note'}
          </button>

          {mode === 'edit' && onDeleteHighlight && (
            <button
              onClick={onDeleteHighlight}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('highlighting.remove') || 'Remove Highlight'}
            </button>
          )}
        </div>

        {/* Note input */}
        {showNote && (
          <div className={`mt-2 pt-2 border-t ${getThemeCardBorder()}`}>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={t('highlighting.note_placeholder') || 'Add a note...'}
              className={`w-full px-2 py-1.5 text-xs rounded-lg border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} resize-none focus:outline-none focus:ring-1 focus:ring-blue-400`}
              rows={2}
              autoFocus
            />
            <button
              onClick={() => {
                onUpdateNote?.(noteText);
                setShowNote(false);
              }}
              className="mt-1 w-full px-2 py-1 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            >
              {t('common.save') || 'Save'}
            </button>
          </div>
        )}

        {/* Close button - small X in corner */}
        <button
          onClick={onClose}
          className={`absolute -top-2 -right-2 w-5 h-5 rounded-full ${getThemeCardBg()} ${getThemeCardBorder()} border flex items-center justify-center hover:opacity-80 transition-colors`}
        >
          <X className="h-3 w-3 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Arrow */}
      <div className={`w-3 h-3 mx-auto -mt-1.5 rotate-45 ${getThemeCardBg()} border-b border-r ${getThemeCardBorder()}`} />
    </div>
  );
};
