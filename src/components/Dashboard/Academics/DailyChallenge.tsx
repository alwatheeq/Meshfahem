import React, { useEffect, useState, useCallback } from 'react';
import { Zap, CheckCircle, Star, RefreshCw } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';

interface DailyChallengeProps {
  courseId: string;
  courseItemIds: string[];
}

interface Challenge {
  id: string;
  user_id: string;
  course_id: string;
  challenge_date: string;
  challenge_type: 'flashcard' | 'quiz';
  target_item_id: string;
  completed: boolean;
  xp_earned: number;
}

export const DailyChallenge: React.FC<DailyChallengeProps> = ({ courseId, courseItemIds }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
    getThemeSubtle,
  } = useTheme();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchTodayChallenge = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('daily_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('challenge_date', todayStr)
        .maybeSingle();

      if (error) {
        ErrorLogger.error(error, { component: 'DailyChallenge', action: 'fetchTodayChallenge' });
        return;
      }

      if (data) {
        setChallenge(data as Challenge);
      } else {
        // No challenge for today, auto-generate one
        await generateChallenge();
      }
    } catch (err) {
      ErrorLogger.error(err, { component: 'DailyChallenge', action: 'fetchTodayChallenge' });
    } finally {
      setLoading(false);
    }
  }, [user, courseId, todayStr]);

  const generateChallenge = useCallback(async () => {
    if (!user || courseItemIds.length === 0) {
      setLoading(false);
      return;
    }
    setGenerating(true);
    try {
      // Pick a random item from the course
      const randomIndex = Math.floor(Math.random() * courseItemIds.length);
      const targetItemId = courseItemIds[randomIndex];
      const challengeType: 'flashcard' | 'quiz' = Math.random() > 0.5 ? 'flashcard' : 'quiz';

      const { data, error } = await supabase
        .from('daily_challenges')
        .insert({
          user_id: user.id,
          course_id: courseId,
          challenge_date: todayStr,
          challenge_type: challengeType,
          target_item_id: targetItemId,
          completed: false,
          xp_earned: 0,
        })
        .select()
        .single();

      if (error) {
        ErrorLogger.error(error, { component: 'DailyChallenge', action: 'generateChallenge' });
        return;
      }

      setChallenge(data as Challenge);
    } catch (err) {
      ErrorLogger.error(err, { component: 'DailyChallenge', action: 'generateChallenge' });
    } finally {
      setGenerating(false);
    }
  }, [user, courseId, courseItemIds, todayStr]);

  useEffect(() => {
    fetchTodayChallenge();
  }, [fetchTodayChallenge]);

  const handleCompleteChallenge = async () => {
    if (!user || !challenge || challenge.completed) return;
    try {
      const xp = challenge.challenge_type === 'quiz' ? 50 : 30;
      const { error } = await supabase
        .from('daily_challenges')
        .update({ completed: true, xp_earned: xp })
        .eq('id', challenge.id)
        .eq('user_id', user.id);

      if (error) {
        ErrorLogger.error(error, { component: 'DailyChallenge', action: 'completeChallenge' });
        return;
      }

      setChallenge((prev) => prev ? { ...prev, completed: true, xp_earned: xp } : null);
    } catch (err) {
      ErrorLogger.error(err, { component: 'DailyChallenge', action: 'completeChallenge' });
    }
  };

  if (loading || generating) {
    return (
      <div className={`rounded-xl border p-6 bg-gradient-to-r ${getThemeGradient()} animate-pulse`}>
        <div className="h-6 w-48 rounded bg-white/20 mb-3" />
        <div className="h-4 w-32 rounded bg-white/20" />
      </div>
    );
  }

  if (!challenge && courseItemIds.length === 0) {
    return (
      <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()}`}>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
            {t('academics.dailyChallenge') || 'Daily Challenge'}
          </h3>
        </div>
        <p className={`text-sm ${getThemeTextMuted()}`}>
          {t('academics.addItemsForChallenge') || 'Add study materials to your course to unlock daily challenges.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        challenge?.completed
          ? `${getThemeCardBg()} ${getThemeCardBorder()}`
          : ''
      }`}
    >
      {/* Banner Card with Gradient */}
      <div
        className={`p-6 ${
          challenge?.completed
            ? `${getThemeSubtle()}`
            : `bg-gradient-to-r ${getThemeGradient()} text-white`
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {challenge?.completed ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <Zap className={`w-5 h-5 ${challenge?.completed ? 'text-yellow-500' : 'text-yellow-300'}`} />
            )}
            <h3
              className={`text-lg font-semibold ${
                challenge?.completed ? getThemeTextPrimary() : 'text-white'
              }`}
            >
              {t('academics.dailyChallenge') || 'Daily Challenge'}
            </h3>
          </div>
          {challenge?.completed && challenge.xp_earned > 0 && (
            <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2.5 py-1 rounded-full text-xs font-semibold">
              <Star className="w-3.5 h-3.5" />
              +{challenge.xp_earned} XP
            </div>
          )}
        </div>

        {challenge && (
          <div className="space-y-3">
            <div>
              <p
                className={`text-sm ${
                  challenge.completed ? getThemeTextSecondary() : 'text-white/90'
                }`}
              >
                {challenge.challenge_type === 'flashcard'
                  ? (t('academics.flashcardChallenge') || 'Review a set of flashcards and rate them all')
                  : (t('academics.quizChallenge') || 'Complete a quiz with a passing score')}
              </p>
              <p
                className={`text-xs mt-1 ${
                  challenge.completed ? getThemeTextMuted() : 'text-white/70'
                }`}
              >
                {challenge.challenge_type === 'flashcard'
                  ? (t('academics.flashcardChallengeReward') || 'Earn 30 XP upon completion')
                  : (t('academics.quizChallengeReward') || 'Earn 50 XP upon completion')}
              </p>
            </div>

            {challenge.completed ? (
              <div className={`flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400`}>
                <CheckCircle className="w-4 h-4" />
                {t('academics.challengeCompleted') || 'Challenge completed!'}
              </div>
            ) : (
              <button
                onClick={handleCompleteChallenge}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors"
              >
                {t('academics.markComplete') || 'Mark as Complete'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
