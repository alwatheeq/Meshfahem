import React, { useEffect, useState, useMemo } from 'react';
import { BarChart3, Brain, Target, Clock, TrendingUp } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';
import {
  computeFlashcardTopicScores,
  computeTopicQuizScores,
  mergeTopicScores,
} from '../../../utils/academicsAnalytics';

interface CourseAnalyticsProps {
  courseId: string;
  courseItems: Array<{ item_id: string }>;
  courseQuizzes: Array<{ quiz_session_id: string }>;
}

type FlashcardLog = { item_id: string | null; user_rating: string };
type QuizAttemptRow = { quiz_session_id: string; answers_json: Record<string, string> | null; created_at: string; score: number | null };
type QuizSessionRow = { id: string; questions_json: Array<{ index?: number; topic?: string; correct_answer?: string }> };

export const CourseAnalytics: React.FC<CourseAnalyticsProps> = ({ courseId, courseItems, courseQuizzes }) => {
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

  const [loading, setLoading] = useState(true);
  const [flashcardLogs, setFlashcardLogs] = useState<FlashcardLog[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttemptRow[]>([]);
  const [quizSessions, setQuizSessions] = useState<QuizSessionRow[]>([]);
  const [itemTopicsMap, setItemTopicsMap] = useState<Record<string, string[]>>({});
  const [totalStudyMinutes, setTotalStudyMinutes] = useState(0);

  const itemIds = useMemo(() => courseItems.map((ci) => ci.item_id), [courseItems]);
  const quizSessionIds = useMemo(() => courseQuizzes.map((cq) => cq.quiz_session_id), [courseQuizzes]);

  useEffect(() => {
    if (!user || itemIds.length === 0) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch flashcard study logs
        const { data: logs, error: logsErr } = await supabase
          .from('flashcard_study_log')
          .select('item_id, user_rating')
          .eq('user_id', user.id)
          .in('item_id', itemIds);

        if (logsErr) ErrorLogger.error(logsErr, { component: 'CourseAnalytics', action: 'fetchFlashcardLogs' });
        setFlashcardLogs((logs as FlashcardLog[]) || []);

        // Fetch item topics for mapping
        const { data: itemData } = await supabase
          .from('user_library_items')
          .select('id, topics')
          .in('id', itemIds);

        const topicsMap: Record<string, string[]> = {};
        (itemData || []).forEach((item: any) => {
          topicsMap[item.id] = item.topics || ['General'];
        });
        setItemTopicsMap(topicsMap);

        // Fetch quiz sessions and attempts
        if (quizSessionIds.length > 0) {
          const { data: sessions, error: sessErr } = await supabase
            .from('quiz_sessions')
            .select('id, questions_json')
            .in('id', quizSessionIds);

          if (sessErr) ErrorLogger.error(sessErr, { component: 'CourseAnalytics', action: 'fetchQuizSessions' });
          setQuizSessions((sessions as QuizSessionRow[]) || []);

          const { data: attempts, error: attErr } = await supabase
            .from('quiz_attempts')
            .select('quiz_session_id, answers_json, created_at, score')
            .eq('user_id', user.id)
            .in('quiz_session_id', quizSessionIds)
            .order('created_at', { ascending: true });

          if (attErr) ErrorLogger.error(attErr, { component: 'CourseAnalytics', action: 'fetchQuizAttempts' });
          setQuizAttempts((attempts as QuizAttemptRow[]) || []);
        }

        // Fetch total study time
        const { data: studyTime } = await supabase
          .from('flashcard_study_log')
          .select('duration_seconds')
          .eq('user_id', user.id)
          .in('item_id', itemIds);

        const totalSeconds = (studyTime || []).reduce((sum: number, r: any) => sum + (r.duration_seconds || 0), 0);
        setTotalStudyMinutes(Math.round(totalSeconds / 60));
      } catch (err) {
        ErrorLogger.error(err, { component: 'CourseAnalytics', action: 'fetchData' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, itemIds, quizSessionIds]);

  const topicScores = useMemo(() => {
    const flashScores = computeFlashcardTopicScores(flashcardLogs as any, itemTopicsMap);
    const quizScores = computeTopicQuizScores(
      quizSessions as any,
      quizAttempts.map((a) => ({ quiz_session_id: a.quiz_session_id, answers_json: a.answers_json || {} }))
    );
    return mergeTopicScores(quizScores, flashScores);
  }, [flashcardLogs, quizAttempts, quizSessions, itemTopicsMap]);

  const overallScore = useMemo(() => {
    if (topicScores.length === 0) return 0;
    const total = topicScores.reduce((sum, ts) => sum + ts.score, 0);
    return Math.round(total / topicScores.length);
  }, [topicScores]);

  const flashcardMastery = useMemo(() => {
    const total = flashcardLogs.length;
    if (total === 0) return { total: 0, easy: 0, good: 0, hard: 0 };
    const easy = flashcardLogs.filter((l) => l.user_rating === 'easy').length;
    const good = flashcardLogs.filter((l) => l.user_rating === 'good').length;
    const hard = flashcardLogs.filter((l) => l.user_rating === 'hard').length;
    return { total, easy, good, hard };
  }, [flashcardLogs]);

  const quizTrend = useMemo(() => {
    return quizAttempts
      .filter((a) => a.score !== null)
      .map((a) => ({ date: a.created_at, score: a.score as number }));
  }, [quizAttempts]);

  const maxTopicScore = useMemo(() => {
    return topicScores.length > 0 ? Math.max(...topicScores.map((ts) => ts.score), 100) : 100;
  }, [topicScores]);

  if (loading) {
    return (
      <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()} animate-pulse`}>
        <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="h-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-blue-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-blue-500" />
        <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
          {t('academics.courseAnalytics') || 'Course Analytics'}
        </h3>
      </div>

      {/* Overall Score */}
      <div className={`rounded-lg p-4 mb-6 ${getThemeSubtle()}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${getThemeTextSecondary()}`}>
            {t('academics.overallScore') || 'Overall Score'}
          </span>
          <span className={`text-2xl font-bold ${getThemeTextPrimary()}`}>{overallScore}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${getBarColor(overallScore)}`}
            style={{ width: `${overallScore}%` }}
          />
        </div>
      </div>

      {/* Topic Breakdown */}
      {topicScores.length > 0 && (
        <div className="mb-6">
          <h4 className={`text-sm font-semibold mb-3 ${getThemeTextSecondary()}`}>
            {t('academics.topicBreakdown') || 'Topic Breakdown'}
          </h4>
          <div className="space-y-2">
            {topicScores.map((ts) => (
              <div key={ts.topic}>
                <div className="flex justify-between mb-1">
                  <span className={`text-xs truncate max-w-[70%] ${getThemeTextMuted()}`}>{ts.topic}</span>
                  <span className={`text-xs font-medium ${getThemeTextSecondary()}`}>{ts.score}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getBarColor(ts.score)}`}
                    style={{ width: `${(ts.score / maxTopicScore) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flashcard Mastery */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-purple-500" />
          <h4 className={`text-sm font-semibold ${getThemeTextSecondary()}`}>
            {t('academics.flashcardMastery') || 'Flashcard Mastery'}
          </h4>
        </div>
        {flashcardMastery.total > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-lg p-3 text-center ${getThemeSubtle()}`}>
              <div className="text-green-500 font-bold text-lg">{flashcardMastery.easy}</div>
              <div className={`text-xs ${getThemeTextMuted()}`}>{t('academics.easy') || 'Easy'}</div>
            </div>
            <div className={`rounded-lg p-3 text-center ${getThemeSubtle()}`}>
              <div className="text-blue-500 font-bold text-lg">{flashcardMastery.good}</div>
              <div className={`text-xs ${getThemeTextMuted()}`}>{t('academics.good') || 'Good'}</div>
            </div>
            <div className={`rounded-lg p-3 text-center ${getThemeSubtle()}`}>
              <div className="text-orange-500 font-bold text-lg">{flashcardMastery.hard}</div>
              <div className={`text-xs ${getThemeTextMuted()}`}>{t('academics.hard') || 'Hard'}</div>
            </div>
          </div>
        ) : (
          <p className={`text-sm ${getThemeTextMuted()}`}>
            {t('academics.noFlashcardData') || 'No flashcard study data yet.'}
          </p>
        )}
      </div>

      {/* Quiz Score Trends */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <h4 className={`text-sm font-semibold ${getThemeTextSecondary()}`}>
            {t('academics.quizTrends') || 'Quiz Score Trends'}
          </h4>
        </div>
        {quizTrend.length > 0 ? (
          <div className="flex items-end gap-1 h-24">
            {quizTrend.map((qt, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className={`text-[10px] ${getThemeTextMuted()}`}>{qt.score}%</span>
                <div
                  className={`w-full rounded-t ${getBarColor(qt.score)} transition-all duration-300`}
                  style={{ height: `${Math.max(qt.score, 5)}%` }}
                  title={`${new Date(qt.date).toLocaleDateString()} - ${qt.score}%`}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-sm ${getThemeTextMuted()}`}>
            {t('academics.noQuizData') || 'No quiz attempts yet.'}
          </p>
        )}
      </div>

      {/* Total Study Time */}
      <div className={`flex items-center gap-3 rounded-lg p-3 ${getThemeSubtle()}`}>
        <Clock className="w-5 h-5 text-indigo-500" />
        <div>
          <div className={`text-sm font-medium ${getThemeTextSecondary()}`}>
            {t('academics.totalStudyTime') || 'Total Study Time'}
          </div>
          <div className={`text-lg font-bold ${getThemeTextPrimary()}`}>
            {totalStudyMinutes >= 60
              ? `${Math.floor(totalStudyMinutes / 60)}h ${totalStudyMinutes % 60}m`
              : `${totalStudyMinutes}m`}
          </div>
        </div>
      </div>
    </div>
  );
};
