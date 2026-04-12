import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Plus, Trash2, Clock } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { Badge } from '../../Common/Badge';
import { ConfirmationModal } from '../../Common/ConfirmationModal';

interface Exam {
  id: string;
  exam_name: string;
  exam_date: string;
  created_at: string;
}

interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  isPast: boolean;
}

interface ExamSchedulerProps {
  courseId: string;
}

function getCountdown(examDate: string): Countdown {
  const diff = new Date(examDate).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, isPast: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, isPast: false };
}

export const ExamScheduler: React.FC<ExamSchedulerProps> = ({ courseId }) => {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
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

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [, setTick] = useState(0);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown ticker — update every 60 s
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const loadExams = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('academics_exams')
        .select('id, exam_name, exam_date, created_at')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .order('exam_date', { ascending: true });

      if (error) throw error;
      setExams(data || []);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, showErrorToast]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const handleAdd = async () => {
    if (!user) return;
    const name = newName.trim();
    if (!name) {
      showErrorToast(t('exam_scheduler.name_required') || 'Exam name is required');
      return;
    }
    if (!newDate) {
      showErrorToast(t('exam_scheduler.date_required') || 'Date is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('academics_exams').insert({
        user_id: user.id,
        course_id: courseId,
        exam_name: name,
        exam_date: new Date(newDate).toISOString(),
      });
      if (error) throw error;

      setNewName('');
      setNewDate('');
      setShowForm(false);
      await loadExams();
      showSuccessToast(t('exam_scheduler.added') || 'Exam added');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from('academics_exams')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      await loadExams();
      showSuccessToast(t('exam_scheduler.deleted') || 'Exam deleted');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6`}>
        <div className={`animate-pulse text-sm ${getThemeTextMuted()}`}>
          {t('exam_scheduler.loading') || 'Loading exams…'}
        </div>
      </div>
    );
  }

  return (
    <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6 space-y-5`} dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getThemeGradient('ui')} text-white`}>
            <CalendarDays className="h-5 w-5" />
          </div>
          <h3 className={`font-semibold ${getThemeTextPrimary()}`}>
            {t('exam_scheduler.title') || 'Exam Schedule'}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${getThemeAccent()} text-white`}
        >
          <Plus className="h-4 w-4" />
          {t('exam_scheduler.add_exam') || 'Add Exam'}
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className={`p-4 rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle('bg')} space-y-3`}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('exam_scheduler.name_placeholder') || 'Exam name'}
            className={`w-full px-3 py-2 rounded-lg border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} text-sm`}
          />
          <input
            type="datetime-local"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} text-sm`}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={`px-3 py-1.5 rounded-lg text-sm ${getThemeSubtle('ui')} ${getThemeTextSecondary()}`}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleAdd}
              className={`px-4 py-1.5 rounded-lg text-sm ${getThemeAccent()} text-white disabled:opacity-50`}
            >
              {saving
                ? (t('exam_scheduler.saving') || 'Saving…')
                : (t('common.save') || 'Save')}
            </button>
          </div>
        </div>
      )}

      {/* Exam list */}
      {exams.length === 0 ? (
        <p className={`text-sm ${getThemeTextMuted()}`}>
          {t('exam_scheduler.empty') || 'No exams scheduled yet'}
        </p>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const countdown = getCountdown(exam.exam_date);
            return (
              <div
                key={exam.id}
                className={`flex items-center justify-between gap-4 p-4 rounded-lg border ${getThemeCardBorder()} ${
                  countdown.isPast ? 'opacity-60' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium truncate ${countdown.isPast ? getThemeTextMuted() : getThemeTextPrimary()}`}>
                      {exam.exam_name}
                    </span>
                    {countdown.isPast && (
                      <Badge variant="default" size="sm">
                        {t('exam_scheduler.past') || 'Past'}
                      </Badge>
                    )}
                  </div>
                  <div className={`text-xs ${getThemeTextMuted()} mt-1`}>
                    {new Date(exam.exam_date).toLocaleString()}
                  </div>
                </div>

                {!countdown.isPast && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Clock className={`h-3.5 w-3.5 ${getThemeTextSecondary()}`} />
                    <span className={`text-sm font-medium ${getThemeTextSecondary()}`}>
                      {countdown.days > 0 && `${countdown.days}d `}
                      {countdown.hours}h {countdown.minutes}m
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDeleteTarget(exam)}
                  className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  aria-label={t('exam_scheduler.delete') || 'Delete'}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('exam_scheduler.delete_title') || 'Delete Exam'}
        message={
          t('exam_scheduler.delete_message', { name: deleteTarget?.exam_name ?? '' }) ||
          `Are you sure you want to delete "${deleteTarget?.exam_name}"?`
        }
        confirmText={t('common.delete') || 'Delete'}
        cancelText={t('common.cancel') || 'Cancel'}
        variant="destructive"
      />
    </div>
  );
};
