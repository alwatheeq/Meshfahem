import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useHighlights, Highlight } from '../../../hooks/useHighlights';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';
import HighlightMenu from './HighlightMenu';

const COLOR_MAP: Record<string, string> = {
  yellow: 'rgba(250, 204, 21, 0.35)',
  green: 'rgba(74, 222, 128, 0.35)',
  blue: 'rgba(96, 165, 250, 0.35)',
  pink: 'rgba(244, 114, 182, 0.35)',
};

interface HighlightLayerProps {
  text: string;
  itemId?: string;
  children?: React.ReactNode;
  /** When `text` is a slice of a longer stored document, offset of `text[0]` in that document (for highlight ranges). */
  globalOffset?: number;
}

const HighlightLayer: React.FC<HighlightLayerProps> = ({ text, itemId, children, globalOffset = 0 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { highlights, addHighlight, removeHighlight } = useHighlights(itemId);
  const { t } = useI18n();
  const _theme = useTheme();

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingRange, setPendingRange] = useState<{ start: number; end: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const localHighlights = useMemo(() => {
    if (!highlights.length) return [];
    return highlights
      .filter((h) => h.end_offset > globalOffset && h.start_offset < globalOffset + text.length)
      .map((h) => ({
        ...h,
        start_offset: Math.max(0, h.start_offset - globalOffset),
        end_offset: Math.min(text.length, h.end_offset - globalOffset),
      }))
      .filter((h) => h.end_offset > h.start_offset)
      .sort((a, b) => a.start_offset - b.start_offset);
  }, [highlights, globalOffset, text.length]);

  const getOffsetInContainer = useCallback((node: Node, offset: number): number | null => {
    if (!containerRef.current) return null;
    const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    while (walker.nextNode()) {
      if (walker.currentNode === node) return charCount + offset;
      charCount += (walker.currentNode.textContent?.length ?? 0);
    }
    return null;
  }, []);

  const handleSelectionEnd = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      setMenuPos(null);
      setPendingRange(null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setMenuPos(null);
      setPendingRange(null);
      return;
    }

    const start = getOffsetInContainer(range.startContainer, range.startOffset);
    const end = getOffsetInContainer(range.endContainer, range.endOffset);
    if (start === null || end === null || start === end) return;

    const rect = range.getBoundingClientRect();
    setMenuPos({ x: rect.left + rect.width / 2 - 100, y: rect.top - 50 });
    setPendingRange({ start: Math.min(start, end), end: Math.max(start, end) });
  }, [getOffsetInContainer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('mouseup', handleSelectionEnd);
    el.addEventListener('touchend', handleSelectionEnd);
    return () => {
      el.removeEventListener('mouseup', handleSelectionEnd);
      el.removeEventListener('touchend', handleSelectionEnd);
    };
  }, [handleSelectionEnd]);

  const handleHighlight = useCallback(async (color: string) => {
    if (!pendingRange) return;
    await addHighlight(pendingRange.start + globalOffset, pendingRange.end + globalOffset, color);
    window.getSelection()?.removeAllRanges();
    setMenuPos(null);
    setPendingRange(null);
  }, [pendingRange, addHighlight, globalOffset]);

  const handleCopy = useCallback(() => {
    if (!pendingRange) return;
    const selectedText = text.slice(pendingRange.start, pendingRange.end);
    navigator.clipboard.writeText(selectedText);
    setMenuPos(null);
    setPendingRange(null);
  }, [pendingRange, text]);

  const closeMenu = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setMenuPos(null);
    setPendingRange(null);
  }, []);

  const renderHighlightedText = () => {
    if (!localHighlights.length) return text;

    const sorted = localHighlights;
    const parts: React.ReactNode[] = [];
    let cursor = 0;

    sorted.forEach((hl: Highlight) => {
      if (hl.start_offset > cursor) {
        parts.push(<span key={`t-${cursor}`}>{text.slice(cursor, hl.start_offset)}</span>);
      }
      parts.push(
        <mark
          key={hl.id}
          style={{ backgroundColor: COLOR_MAP[hl.color] || COLOR_MAP.yellow, borderRadius: '2px', position: 'relative' }}
          className="relative group cursor-pointer"
          onMouseEnter={() => setHoveredId(hl.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {text.slice(hl.start_offset, hl.end_offset)}
          {hoveredId === hl.id && (
            <button
              onClick={(e) => { e.stopPropagation(); removeHighlight(hl.id); }}
              title={t('highlights.remove')}
              className="absolute -top-3 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
              style={{ zIndex: 10 }}
            >
              <X size={10} />
            </button>
          )}
        </mark>
      );
      cursor = hl.end_offset;
    });

    if (cursor < text.length) {
      parts.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
    }

    return parts;
  };

  return (
    <div ref={containerRef} className="relative">
      {children ?? <div className="whitespace-pre-wrap">{renderHighlightedText()}</div>}

      {menuPos && (
        <HighlightMenu
          position={menuPos}
          onHighlight={handleHighlight}
          onAddNote={() => { closeMenu(); }}
          onCreateFlashcard={() => { closeMenu(); }}
          onCopy={handleCopy}
          onClose={closeMenu}
        />
      )}
    </div>
  );
};

export default HighlightLayer;
