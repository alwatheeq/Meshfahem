import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Highlight {
  id: string;
  user_id: string;
  item_id: string;
  start_offset: number;
  end_offset: number;
  color: string;
  note: string | null;
  is_public: boolean;
  created_at: string;
}

export function useHighlights(itemId: string | undefined) {
  const { user } = useAuth();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHighlights = useCallback(async () => {
    if (!itemId || !user) { setHighlights([]); setLoading(false); return; }
    const { data } = await supabase
      .from('user_highlights')
      .select('*')
      .eq('item_id', itemId)
      .eq('user_id', user.id)
      .order('start_offset');
    setHighlights(data || []);
    setLoading(false);
  }, [itemId, user]);

  useEffect(() => { fetchHighlights(); }, [fetchHighlights]);

  const addHighlight = useCallback(async (startOffset: number, endOffset: number, color: string, note?: string) => {
    if (!itemId || !user) return null;
    const { data, error } = await supabase
      .from('user_highlights')
      .insert({ user_id: user.id, item_id: itemId, start_offset: startOffset, end_offset: endOffset, color, note: note || null })
      .select()
      .single();
    if (!error && data) setHighlights(prev => [...prev, data].sort((a, b) => a.start_offset - b.start_offset));
    return data;
  }, [itemId, user]);

  const updateHighlight = useCallback(async (id: string, updates: Partial<Pick<Highlight, 'color' | 'note' | 'is_public'>>) => {
    const { error } = await supabase.from('user_highlights').update(updates).eq('id', id);
    if (!error) setHighlights(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
  }, []);

  const removeHighlight = useCallback(async (id: string) => {
    const { error } = await supabase.from('user_highlights').delete().eq('id', id);
    if (!error) setHighlights(prev => prev.filter(h => h.id !== id));
  }, []);

  return { highlights, loading, addHighlight, updateHighlight, removeHighlight, refetch: fetchHighlights };
}
