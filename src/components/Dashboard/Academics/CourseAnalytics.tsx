import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Clock, Layers } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';

interface QuizScorePoint {
  label: string;
  score: number;
}

interface CourseAnalyticsProps {
  courseId: string;
}

export const CourseAnalytics: React.FC<CourseAnalyticsProps> = ({ courseId }) => {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { error: showErrorToast } = useToast();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
    getThemeSubtle,
    getThemeAccent,
  } = useTheme();

  const [quizScores, setQuizScores] = useState<QuizScorePoint[]>([]);
  const [masteryPct, setMasteryPct] = useState(0);
  const [totalStudyMinutes, setTotalStudyMinutes] = useState(0);
  const [loading, setLoading] = useState(true);

  const accentColor = getThemeAccent().replace('bg-', '');

  const loadAnalytics = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Quiz scores
      const { data: courseQuizzes } = await supabase
        .from('academics_course_quizzes')
        .select('quiz_session_id, quiz_sessions(id, quiz_title, questions_json)')
        .eq('course_id', courseId);

      const quizSessionIds = (courseQuizzes || []).map((q) => q.quiz_session_id);

      let scores: QuizScorePoint[] = [];
      if (quizSessionIds.length > 0) {
        const { data: attempts } = await supabase
          .from('quiz_attempts')
          .select('quiz_session_id, score, created_at')
          .in('quiz_session_id', quizSessionIds)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        const sessionTitleMap: Record<string, string> = {};
        (courseQuizzes || []).forEach((q, idx) => {
          const qs = q.quiz_sessions as { id: string; quiz_title: string; questions_json: unknown[] } | null;
          sessionTitleMap[q.quiz_session_id] = qs?.quiz_title || `Quiz ${idx + 1}`;
        });

        scores = (attempts || []).map((a) => ({
          label: sessionTitleMap[a.quiz_session_id] || 'Quiz',
          score: typeof a.score === 'number' ? a.score : 0,
        }));
      }
      setQuizScores(scores);

      // SRS mastery: % of cards with interval > 21 days
      const { data: courseItems } = await supabase
        .from('academics_course_items')
        .select('item_id')
        .eq('course_id', courseId);

      const itemIds = (courseItems || []).map((ci) => ci.item_id);

      if (itemIds.length > 0) {
        const { data: srsStates } = await supabase
          .from('srs_flashcard_state')
          .select('interval_days')
          .eq('user_id', user.id)
          .in('item_id', itemIds);

        const total = (srsStates || []).length;
        const mastered = (srsStates || []).filter((s) => s.interval_days > 21).length;
        setMasteryPct(total > 0 ? Math.round((mastered / total) * 100) : 0);
      } else {
        setMasteryPct(0);
      }

      // Study time
      if (itemIds.length > 0) {
        const { data: sessions } = await supabase
          .from('study_sessions')
          .select('duration_seconds')
          .eq('user_id', user.id)
          .in('item_id', itemIds);

        const totalSeconds = (sessions || []).reduce(
          (sum, s) => sum + (typeof s.duration_seconds === 'number' ? s.duration_seconds : 0),
          0
        );
        setTotalStudyMinutes(Math.round(totalSeconds / 60));
      } else {
        setTotalStudyMinutes(0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showErrorToast(msg);
    } finally {
      setLoading(false);
    }
  }, [user, courseId, showErrorToast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const studyHours = Math.floor(totalStudyMinutes / 60);
  const studyMins = totalStudyMinutes % 60;
  const hasData = quizScores.length > 0 || masteryPct > 0 || totalStudyMinutes > 0;

  if (loading) {
    return (
      <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6`}>
        <div className={`animate-pulse text-sm ${getThemeTextMuted()}`}>
          {t('course_analytics.loading') || 'Loading analytics…'}
        </div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6`} dir={dir}>
        <div className="flex items-center gap-3">
          <BarChart3 className={`h-5 w-5 ${getThemeTextMuted()}`} />
          <span className={`text-sm ${getThemeTextMuted()}`}>
            {t('course_analytics.no_data') || 'No analytics data yet'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6 space-y-6`} dir={dir}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${getThemeGradient('ui')} text-white`}>
          <BarChart3 className="h-5 w-5" />
        </div>
        <h3 className={`font-semibold ${getThemeTextPrimary()}`}>
          {t('course_analytics.title') || 'Course Analytics'}
        </h3>
      </div>

      {/* Quiz scores chart */}
      {quizScores.length > 0 && (
        <div>
          <h4 className={`text-sm font-medium ${getThemeTextSecondary()} mb-3`}>
            {t('course_analytics.quiz_scores') || 'Quiz Scores'}
          </h4>
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={quizScores} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className={getThemeTextMuted()}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  className={getThemeTextMuted()}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    fontSize: '12px',
                    border: '1px solid #e5e7eb',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={`var(--theme-accent, ${accentColor})`}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Mastery progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className={`h-4 w-4 ${getThemeTextSecondary()}`} />
            <h4 className={`text-sm font-medium ${getThemeTextSecondary()}`}>
              {t('course_analytics.flashcard_mastery') || 'Flashcard Mastery'}
            </h4>
          </div>
          <span className={`text-sm font-semibold ${getThemeTextPrimary()}`}>{masteryPct}%</span>
        </div>
        <div className={`w-full h-3 rounded-full ${getThemeSubtle('bg')} overflow-hidden`}>
          <div
            className={`h-full rounded-full ${getThemeAccent()} transition-all duration-500`}
            style={{ width: `${masteryPct}%` }}
          />
        </div>
        <p className={`text-xs ${getThemeTextMuted()} mt-1`}>
          {t('course_analytics.mastery_desc') || 'Cards with interval > 21 days'}
        </p>
      </div>

      {/* Study time */}
      <div className="flex items-center gap-3">
        <Clock className={`h-4 w-4 ${getThemeTextSecondary()}`} />
        <div>
          <h4 className={`text-sm font-medium ${getThemeTextSecondary()}`}>
            {t('course_analytics.study_time') || 'Study Time'}
          </h4>
          <span className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
            {studyHours > 0
              ? `${studyHours}h ${studyMins}m`
              : `${studyMins}m`}
          </span>
        </div>
      </div>
    </div>
  );
};
