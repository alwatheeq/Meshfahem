import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { calculateNextReview, ratingToQuality, isCardDue } from '../utils/srsAlgorithm';
import { ErrorLogger } from '../utils/errorLogger';

export interface SrsCard {
  id: string;
  userId: string;
  itemId: string;
  cardIndex: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewAt: string;
  lastReviewedAt: string | null;
}

interface UseSRSReturn {
  dueCards: SrsCard[];
  loading: boolean;
  totalCards: number;
  dueCount: number;
  loadCardStates: (itemId: string) => Promise<void>;
  loadDueCardsForCourse: (courseItemIds: string[]) => Promise<void>;
  recordReview: (itemId: string, cardIndex: number, rating: 'again' | 'hard' | 'good' | 'easy') => Promise<void>;
  initializeCards: (itemId: string, cardCount: number) => Promise<void>;
}

export function useSRS(): UseSRSReturn {
  const { user } = useAuth();
  const [dueCards, setDueCards] = useState<SrsCard[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadCardStates = useCallback(async (itemId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('srs_card_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('item_id', itemId)
        .order('card_index', { ascending: true });

      if (error) {
        ErrorLogger.error(error, { component: 'useSRS', action: 'loadCardStates' });
        return;
      }

      const cards: SrsCard[] = (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        itemId: row.item_id,
        cardIndex: row.card_index,
        easeFactor: row.ease_factor,
        intervalDays: row.interval_days,
        repetitions: row.repetitions,
        nextReviewAt: row.next_review_at,
        lastReviewedAt: row.last_reviewed_at,
      }));

      setTotalCards(cards.length);
      setDueCards(cards.filter((c) => isCardDue(c.nextReviewAt)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadDueCardsForCourse = useCallback(async (courseItemIds: string[]) => {
    if (!user || courseItemIds.length === 0) {
      setDueCards([]);
      setTotalCards(0);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('srs_card_state')
        .select('*')
        .eq('user_id', user.id)
        .in('item_id', courseItemIds);

      if (error) {
        ErrorLogger.error(error, { component: 'useSRS', action: 'loadDueCardsForCourse' });
        return;
      }

      const cards: SrsCard[] = (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        itemId: row.item_id,
        cardIndex: row.card_index,
        easeFactor: row.ease_factor,
        intervalDays: row.interval_days,
        repetitions: row.repetitions,
        nextReviewAt: row.next_review_at,
        lastReviewedAt: row.last_reviewed_at,
      }));

      setTotalCards(cards.length);
      setDueCards(cards.filter((c) => isCardDue(c.nextReviewAt)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const recordReview = useCallback(async (
    itemId: string,
    cardIndex: number,
    rating: 'again' | 'hard' | 'good' | 'easy'
  ) => {
    if (!user) return;

    // Get current state
    const { data: existing } = await supabase
      .from('srs_card_state')
      .select('*')
      .eq('user_id', user.id)
      .eq('item_id', itemId)
      .eq('card_index', cardIndex)
      .single();

    const quality = ratingToQuality(rating);
    const current = existing || { ease_factor: 2.5, interval_days: 0, repetitions: 0 };
    const result = calculateNextReview(
      quality,
      current.ease_factor,
      current.interval_days,
      current.repetitions
    );

    const upsertData = {
      user_id: user.id,
      item_id: itemId,
      card_index: cardIndex,
      ease_factor: result.easeFactor,
      interval_days: result.intervalDays,
      repetitions: result.repetitions,
      next_review_at: result.nextReviewAt.toISOString(),
      last_reviewed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('srs_card_state')
      .upsert(upsertData, { onConflict: 'user_id,item_id,card_index' });

    if (error) {
      ErrorLogger.error(error, { component: 'useSRS', action: 'recordReview' });
    }

    // Update local state
    setDueCards((prev) => prev.filter(
      (c) => !(c.itemId === itemId && c.cardIndex === cardIndex)
    ));
  }, [user]);

  const initializeCards = useCallback(async (itemId: string, cardCount: number) => {
    if (!user || cardCount === 0) return;

    // Check which cards already exist
    const { data: existing } = await supabase
      .from('srs_card_state')
      .select('card_index')
      .eq('user_id', user.id)
      .eq('item_id', itemId);

    const existingIndices = new Set((existing || []).map((r: any) => r.card_index));
    const newCards = [];

    for (let i = 0; i < cardCount; i++) {
      if (!existingIndices.has(i)) {
        newCards.push({
          user_id: user.id,
          item_id: itemId,
          card_index: i,
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          next_review_at: new Date().toISOString(),
        });
      }
    }

    if (newCards.length > 0) {
      const { error } = await supabase.from('srs_card_state').insert(newCards);
      if (error) {
        ErrorLogger.error(error, { component: 'useSRS', action: 'initializeCards' });
      }
    }
  }, [user]);

  return {
    dueCards,
    loading,
    totalCards,
    dueCount: dueCards.length,
    loadCardStates,
    loadDueCardsForCourse,
    recordReview,
    initializeCards,
  };
}
