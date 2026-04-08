import React, { useEffect, useState, useCallback } from 'react';
import { Calendar, Plus, Trash2, Clock, BookOpen } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';

interface ExamSchedulerProps {
  courseId: string;
}

interface Exam {
  id: string;
  course_id: string;
  user_id: string;
  exam_name: string;
  exam_date: string;
  created_at: string;
}

export const ExamScheduler: React.FC<ExamSchedulerProps> = ({ courseId }) => {
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
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newExamName, setNewExamName] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [totalCourseCards, setTotalCourseCards] = useState(0);

  const fetchExams = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('course_exams')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .order('exam_date', { ascending: true });

      if (error) {
        ErrorLogger.error(error, { component: 'ExamScheduler', action: 'fetchExams' });
        return;
      }
      setExams(data || []);
    } catch (err) {
      ErrorLogger.error(err, { component: 'ExamScheduler', action: 'fetchExams' });
    } finally {
      setLoading(false);
    }
  }, [user, courseId]);

  const fetchTotalCards = useCallback(async () => {
    if (!user) return;
    try {
      const { count } = await supabase
        .from('srs_card_state')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('item_id', [courseId]);

      setTotalCourseCards(count || 0);
    } catch (err) {
      ErrorLogger.error(err, { component: 'ExamScheduler', action: 'fetchTotalCards' });
    }
  }, [user, courseId]);

  useEffect(() => {
    fetchExams();
    fetchTotalCards();
  }, [fetchExams, fetchTotalCards]);

  const handleAddExam = async () => {
    if (!user || !newExamName.trim() || !newExamDate) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('course_exams').insert({
        course_id: courseId,
        user_id: user.id,
        exam_name: newExamName.trim(),
        exam_date: newExamDate,
      });

      if (error) {
        ErrorLogger.error(error, { component: 'ExamScheduler', action: 'addExam' });
        showErrorToast(t('academics.examAddError') || 'Failed to add exam.');
        return;
      }

      showSuccessToast(t('academics.examAdded') || 'Exam added successfully!');
      setNewExamName('');
      setNewExamDate('');
      setShowAddForm(false);
      fetchExams();
    } catch (err) {
      ErrorLogger.error(err, { component: 'ExamScheduler', action: 'addExam' });
      showErrorToast(t('academics.examAddError') || 'Failed to add exam.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('course_exams')
        .delete()
        .eq('id', examId)
        .eq('user_id', user.id);

      if (error) {
        ErrorLogger.error(error, { component: 'ExamScheduler', action: 'deleteExam' });
        showErrorToast(t('academics.examDeleteError') || 'Failed to delete exam.');
        return;
      }

      showSuccessToast(t('academics.examDeleted') || 'Exam deleted.');
      setExams((prev) => prev.filter((e) => e.id !== examId));
    } catch (err) {
      ErrorLogger.error(err, { component: 'ExamScheduler', action: 'deleteExam' });
    }
  };

  const getDaysLeft = (examDate: string): number => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exam = new Date(examDate);
    exam.setHours(0, 0, 0, 0);
    return Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getStudyPlan = (examDate: string): string => {
    const daysLeft = getDaysLeft(examDate);
    if (daysLeft <= 0) return t('academics.examToday') || 'Exam is today or has passed!';
    if (totalCourseCards === 0) return t('academics.noCardsYet') || 'Add study materials to generate a plan.';
    const cardsPerDay = Math.ceil(totalCourseCards / daysLeft);
    return `${t('academics.studySuggestion') || 'Study'} ~${cardsPerDay} ${t('academics.cardsPerDay') || 'cards/day'} ${t('academics.toCoverAll') || 'to cover all material'}`;
  };

  const getDaysLeftColor = (days: number): string => {
    if (days <= 0) return 'text-red-500';
    if (days <= 3) return 'text-red-500';
    if (days <= 7) return 'text-orange-500';
    return 'text-green-500';
  };

  if (loading) {
    return (
      <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()} animate-pulse`}>
        <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-red-500" />
          <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
            {t('academics.examScheduler') || 'Exam Scheduler'}
          </h3>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${getThemeTextSecondary()}`}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Add Exam Form */}
      {showAddForm && (
        <div className={`rounded-lg p-4 mb-4 ${getThemeSubtle()}`}>
          <div className="space-y-3">
            <input
              type="text"
              value={newExamName}
              onChange={(e) => setNewExamName(e.target.value)}
              placeholder={t('academics.examNamePlaceholder') || 'Exam name (e.g. Midterm)'}
              className={`w-full px-3 py-2 rounded-lg border text-sm ${getThemeCardBg()} ${getThemeCardBorder()} ${getThemeTextPrimary()} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <input
              type="date"
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className={`w-full px-3 py-2 rounded-lg border text-sm ${getThemeCardBg()} ${getThemeCardBorder()} ${getThemeTextPrimary()} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddExam}
                disabled={saving || !newExamName.trim() || !newExamDate}
                className={`flex-1 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r ${getThemeGradient()} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {saving
                  ? (t('academics.saving') || 'Saving...')
                  : (t('academics.addExam') || 'Add Exam')}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewExamName(''); setNewExamDate(''); }}
                className={`px-4 py-2 rounded-lg text-sm ${getThemeTextMuted()} hover:bg-gray-100 dark:hover:bg-gray-800`}
              >
                {t('common.cancel') || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exam List */}
      {exams.length === 0 ? (
        <div className={`text-center py-6 ${getThemeTextMuted()}`}>
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('academics.noExams') || 'No exams scheduled. Add one to start planning!'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const daysLeft = getDaysLeft(exam.exam_date);
            return (
              <div
                key={exam.id}
                className={`rounded-lg p-4 border ${getThemeCardBorder()} ${getThemeSubtle()}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-medium truncate ${getThemeTextPrimary()}`}>{exam.exam_name}</h4>
                    <p className={`text-xs mt-0.5 ${getThemeTextMuted()}`}>
                      {new Date(exam.exam_date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <div className={`flex items-center gap-1 ${getDaysLeftColor(daysLeft)}`}>
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {daysLeft <= 0
                          ? (t('academics.examPassed') || 'Passed')
                          : `${daysLeft} ${t('academics.daysLeft') || 'days left'}`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* Study Plan Suggestion */}
                {daysLeft > 0 && totalCourseCards > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                    <span className={`text-xs ${getThemeTextMuted()}`}>{getStudyPlan(exam.exam_date)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
