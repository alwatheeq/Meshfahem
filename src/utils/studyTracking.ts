import { supabase } from '../lib/supabase';
import { handleSupabaseError } from './errorHandler';
import { ErrorLogger } from './errorLogger';

export interface StudySessionData {
  sessionType: 'flashcard_study' | 'quiz_attempt' | 'content_review' | 'video_watch';
  relatedItemId?: string;
  durationMinutes: number;
  flashcardsReviewed?: number;
  startedAt: Date;
}

/**
 * Records a study session to track user statistics
 * This automatically updates streaks, study time, and other metrics
 */
export const recordStudySession = async (
  userId: string,
  sessionData: StudySessionData
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('study_sessions')
      .insert({
        user_id: userId,
        session_type: sessionData.sessionType,
        related_item_id: sessionData.relatedItemId || null,
        duration_minutes: sessionData.durationMinutes,
        flashcards_reviewed: sessionData.flashcardsReviewed || 0,
        started_at: sessionData.startedAt.toISOString(),
        completed_at: new Date().toISOString()
      });

    if (error) {
      handleSupabaseError(error, { component: 'studyTracking', action: 'recordStudySession', userId });
      ErrorLogger.error(error, { component: 'studyTracking', action: 'recordStudySession', userId });
      return false;
    }

    ErrorLogger.info('Study session recorded successfully', { component: 'studyTracking', action: 'recordStudySession', userId, sessionType: sessionData.sessionType });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    handleSupabaseError(err, { component: 'studyTracking', action: 'recordStudySession', userId });
    ErrorLogger.error(err, { component: 'studyTracking', action: 'recordStudySession', userId });
    return false;
  }
};

/**
 * Helper to calculate study duration from start time
 */
export const calculateStudyDuration = (startTime: Date): number => {
  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.max(1, Math.round(durationMs / 60000)); // At least 1 minute
  return durationMinutes;
};

/**
 * Records a flashcard study session
 */
export const recordFlashcardStudy = async (
  userId: string,
  flashcardCount: number,
  itemId?: string,
  startTime?: Date
): Promise<boolean> => {
  const start = startTime || new Date();
  const duration = startTime ? calculateStudyDuration(startTime) : 1;

  return recordStudySession(userId, {
    sessionType: 'flashcard_study',
    relatedItemId: itemId,
    durationMinutes: duration,
    flashcardsReviewed: flashcardCount,
    startedAt: start
  });
};

/**
 * Records a quiz attempt session
 */
export const recordQuizAttempt = async (
  userId: string,
  quizId: string,
  startTime: Date
): Promise<boolean> => {
  const duration = calculateStudyDuration(startTime);

  return recordStudySession(userId, {
    sessionType: 'quiz_attempt',
    relatedItemId: quizId,
    durationMinutes: duration,
    startedAt: startTime
  });
};

/**
 * Records a content review session
 */
export const recordContentReview = async (
  userId: string,
  itemId: string,
  startTime: Date
): Promise<boolean> => {
  const duration = calculateStudyDuration(startTime);

  return recordStudySession(userId, {
    sessionType: 'content_review',
    relatedItemId: itemId,
    durationMinutes: duration,
    startedAt: startTime
  });
};

/**
 * Records a video watch session
 */
export const recordVideoWatch = async (
  userId: string,
  videoId: string,
  durationMinutes: number
): Promise<boolean> => {
  return recordStudySession(userId, {
    sessionType: 'video_watch',
    relatedItemId: videoId,
    durationMinutes: durationMinutes,
    startedAt: new Date()
  });
};
