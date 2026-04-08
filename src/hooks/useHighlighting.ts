import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { ErrorLogger } from '../utils/errorLogger';

export interface Highlight {
  id: string;
  userId: string;
  sourceType: 'library' | 'history' | 'summary';
  sourceId: string | null;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  chunkIndex: number;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'orange';
  note: string | null;
  createdAt: string;
}

export interface TextSelection {
  text: string;
  startOffset: number;
  endOffset: number;
  chunkIndex: number;
}

interface UseHighlightingReturn {
  highlights: Highlight[];
  loading: boolean;
  activeSelection: TextSelection | null;
  showMenu: boolean;
  menuPosition: { x: number; y: number };
  loadHighlights: (sourceType: string, sourceId: string) => Promise<void>;
  handleTextSelect: (chunkIndex?: number) => void;
  createHighlight: (color?: Highlight['color']) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;
  updateNote: (id: string, note: string) => Promise<void>;
  clearSelection: () => void;
}

export function useHighlighting(
  sourceType: 'library' | 'history' | 'summary',
  sourceId: string | null
): UseHighlightingReturn {
  const { user } = useAuth();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSelection, setActiveSelection] = useState<TextSelection | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const loadHighlights = useCallback(async (srcType: string, srcId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_highlights')
        .select('*')
        .eq('user_id', user.id)
        .eq('source_type', srcType)
        .eq('source_id', srcId)
        .order('start_offset', { ascending: true });

      if (error) {
        ErrorLogger.error(error, { component: 'useHighlighting', action: 'loadHighlights' });
        return;
      }

      setHighlights((data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        selectedText: row.selected_text,
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        chunkIndex: row.chunk_index,
        color: row.color,
        note: row.note,
        createdAt: row.created_at,
      })));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (sourceId) {
      loadHighlights(sourceType, sourceId);
    }
  }, [sourceType, sourceId, loadHighlights]);

  const handleTextSelect = useCallback((chunkIndex: number = 0) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setShowMenu(false);
      setActiveSelection(null);
      return;
    }

    const text = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Get offset within the content container
    const container = range.startContainer.parentElement?.closest('[data-highlight-container]');
    if (!container) {
      // Still capture selection even without container
      setActiveSelection({
        text,
        startOffset: 0,
        endOffset: text.length,
        chunkIndex,
      });
    } else {
      const containerText = container.textContent || '';
      const startOffset = containerText.indexOf(text);
      setActiveSelection({
        text,
        startOffset: startOffset >= 0 ? startOffset : 0,
        endOffset: startOffset >= 0 ? startOffset + text.length : text.length,
        chunkIndex,
      });
    }

    setMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
    setShowMenu(true);
  }, []);

  const createHighlight = useCallback(async (color: Highlight['color'] = 'yellow') => {
    if (!user || !activeSelection || !sourceId) return;

    const { data, error } = await supabase
      .from('user_highlights')
      .insert({
        user_id: user.id,
        source_type: sourceType,
        source_id: sourceId,
        selected_text: activeSelection.text,
        start_offset: activeSelection.startOffset,
        end_offset: activeSelection.endOffset,
        chunk_index: activeSelection.chunkIndex,
        color,
      })
      .select()
      .single();

    if (error) {
      ErrorLogger.error(error, { component: 'useHighlighting', action: 'createHighlight' });
      return;
    }

    if (data) {
      setHighlights((prev) => [...prev, {
        id: data.id,
        userId: data.user_id,
        sourceType: data.source_type,
        sourceId: data.source_id,
        selectedText: data.selected_text,
        startOffset: data.start_offset,
        endOffset: data.end_offset,
        chunkIndex: data.chunk_index,
        color: data.color,
        note: data.note,
        createdAt: data.created_at,
      }]);
    }

    clearSelection();
  }, [user, activeSelection, sourceType, sourceId]);

  const deleteHighlight = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('user_highlights')
      .delete()
      .eq('id', id);

    if (error) {
      ErrorLogger.error(error, { component: 'useHighlighting', action: 'deleteHighlight' });
      return;
    }

    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const updateNote = useCallback(async (id: string, note: string) => {
    const { error } = await supabase
      .from('user_highlights')
      .update({ note, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      ErrorLogger.error(error, { component: 'useHighlighting', action: 'updateNote' });
      return;
    }

    setHighlights((prev) => prev.map((h) => h.id === id ? { ...h, note } : h));
  }, []);

  const clearSelection = useCallback(() => {
    setShowMenu(false);
    setActiveSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return {
    highlights,
    loading,
    activeSelection,
    showMenu,
    menuPosition,
    loadHighlights,
    handleTextSelect,
    createHighlight,
    deleteHighlight,
    updateNote,
    clearSelection,
  };
}
