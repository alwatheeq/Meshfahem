import React, { useState, useEffect } from 'react';
import { Target, Plus, Calendar, TrendingUp, CheckCircle, Clock, Edit2, Trash2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../contexts/I18nContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useConfirm } from '../../hooks/useConfirm';

interface StudyGoal {
  id: string;
  goal_type: string;
  goal_title: string;
  goal_description: string;
  target_value: number;
  current_value: number;
  deadline_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export const StudyGoalsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [goalType, setGoalType] = useState<string>('daily_study_time');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [targetValue, setTargetValue] = useState(10);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchGoals();
    }
  }, [user]);

  const fetchGoals = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('study_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'StudyGoalsPage', 
          action: 'fetchGoals',
          userId: user.id
        });
        ErrorLogger.error(error, { 
          component: 'StudyGoalsPage', 
          action: 'fetchGoals',
          userId: user.id
        });
        showErrorToast(message);
        return;
      }

      if (data) {
        setGoals(data);
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'StudyGoalsPage', 
        action: 'fetchGoals',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'StudyGoalsPage', 
        action: 'fetchGoals',
        userId: user.id
      });
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async () => {
    if (!user || !goalTitle.trim()) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase
        .from('study_goals')
        .insert({
          user_id: user.id,
          goal_type: goalType,
          goal_title: goalTitle.trim(),
          goal_description: goalDescription.trim() || null,
          target_value: targetValue,
          deadline_date: deadlineDate || null
        });

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'StudyGoalsPage', 
          action: 'handleCreateGoal',
          userId: user.id
        });
        ErrorLogger.error(error, { 
          component: 'StudyGoalsPage', 
          action: 'handleCreateGoal',
          userId: user.id
        });
        showErrorToast(message || t('goals.create_failed'));
        return;
      }

      setGoalTitle('');
      setGoalDescription('');
      setTargetValue(10);
      setDeadlineDate('');
      setShowCreateModal(false);
      await fetchGoals();
      showSuccessToast(t('goals.goal_created'));
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'StudyGoalsPage', 
        action: 'handleCreateGoal',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'StudyGoalsPage', 
        action: 'handleCreateGoal',
        userId: user.id
      });
      showErrorToast(message || t('goals.create_failed'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    const confirmed = await confirm(t('goals.confirm_delete'), {
      title: t('goals.confirm_delete_title') || 'Delete Goal',
      variant: 'destructive',
      confirmText: t('goals.delete') || 'Delete',
    });
    if (!confirmed) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error } = await supabase
        .from('study_goals')
        .delete()
        .eq('id', goalId);

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'StudyGoalsPage', 
          action: 'handleDeleteGoal',
          goalId,
          userId: user?.id
        });
        ErrorLogger.error(error, { 
          component: 'StudyGoalsPage', 
          action: 'handleDeleteGoal',
          goalId,
          userId: user?.id
        });
        showErrorToast(message);
        return;
      }

      await fetchGoals();
      showSuccessToast(t('goals.goal_deleted') || 'Goal deleted successfully');
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'StudyGoalsPage', 
        action: 'handleDeleteGoal',
        goalId,
        userId: user?.id
      });
      ErrorLogger.error(error, { 
        component: 'StudyGoalsPage', 
        action: 'handleDeleteGoal',
        goalId,
        userId: user?.id
      });
      showErrorToast(message);
    }
  };

  const handleMarkComplete = async (goalId: string) => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { error } = await supabase
        .from('study_goals')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString()
        })
        .eq('id', goalId);

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'StudyGoalsPage', 
          action: 'handleMarkComplete',
          goalId,
          userId: user?.id
        });
        ErrorLogger.error(error, { 
          component: 'StudyGoalsPage', 
          action: 'handleMarkComplete',
          goalId,
          userId: user?.id
        });
        showErrorToast(message);
        return;
      }

      await fetchGoals();
      showSuccessToast(t('goals.goal_completed') || 'Goal marked as complete!');
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'StudyGoalsPage', 
        action: 'handleMarkComplete',
        goalId,
        userId: user?.id
      });
      ErrorLogger.error(error, { 
        component: 'StudyGoalsPage', 
        action: 'handleMarkComplete',
        goalId,
        userId: user?.id
      });
      showErrorToast(message);
    }
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('goals.no_deadline');
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getGoalTypeLabel = (type: string) => {
    const labelKey = `goals.type_${type}`;
    return t(labelKey);
  };

  const getGoalTypeIcon = (type: string) => {
    switch (type) {
      case 'daily_study_time':
        return <Clock className="h-5 w-5" />;
      case 'weekly_flashcards':
        return <TrendingUp className="h-5 w-5" />;
      case 'quiz_streak':
        return <Target className="h-5 w-5" />;
      case 'items_published':
        return <CheckCircle className="h-5 w-5" />;
      default:
        return <Target className="h-5 w-5" />;
    }
  };

  const activeGoals = goals.filter(g => !g.is_completed);
  const completedGoals = goals.filter(g => g.is_completed);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Target className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('goals.title')}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {t('goals.subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>{t('goals.new_goal')}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('goals.active_goals')}</p>
              <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{activeGoals.length}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('goals.completed')}</p>
              <p className="text-4xl font-bold text-green-600 dark:text-green-400">{completedGoals.length}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('goals.total_goals')}</p>
              <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">{goals.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {activeGoals.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('goals.active_goals')}</h2>
              <div className="space-y-4">
                {activeGoals.map((goal) => {
                  const progress = calculateProgress(goal.current_value, goal.target_value);
                  const isOverdue = goal.deadline_date && new Date(goal.deadline_date) < new Date();

                  return (
                    <div
                      key={goal.id}
                      className={`bg-white dark:bg-gray-800 rounded-xl shadow p-6 ${
                        isOverdue ? 'border-2 border-red-300 dark:border-red-700' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start space-x-3 flex-1">
                          <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg text-green-600 dark:text-green-300">
                            {getGoalTypeIcon(goal.goal_type)}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {goal.goal_title}
                            </h3>
                            {goal.goal_description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {goal.goal_description}
                              </p>
                            )}
                            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                              <span className="flex items-center">
                                <Target className="h-4 w-4 mr-1" />
                                {getGoalTypeLabel(goal.goal_type)}
                              </span>
                              <span className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {formatDate(goal.deadline_date)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {progress >= 100 && (
                            <button
                              onClick={() => handleMarkComplete(goal.id)}
                              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                              title="Mark as complete"
                            >
                              <CheckCircle className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/20"
                            title="Delete goal"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{t('goals.progress')}</span>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {goal.current_value} / {goal.target_value}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all duration-300 ${
                              progress >= 100
                                ? 'bg-green-600'
                                : progress >= 75
                                ? 'bg-blue-600'
                                : progress >= 50
                                ? 'bg-yellow-600'
                                : 'bg-orange-600'
                            }`}
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-right text-gray-500">
                          {Math.round(progress)}% {t('goals.complete')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {completedGoals.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('goals.completed_goals')}</h2>
              <div className="space-y-4">
                {completedGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="bg-gray-50 dark:bg-gray-700 rounded-xl shadow p-6 opacity-75"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg text-green-600 dark:text-green-300">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {goal.goal_title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {t('goals.completed_on')} {formatDate(goal.completed_at)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteGoal(goal.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/20"
                        title="Delete goal"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {goals.length === 0 && !loading && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
              <Target className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">No goals yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                Create your first study goal to start tracking your progress!
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                {t('goals.create_goal')}
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create New Goal</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('goals.goal_type')}
                </label>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="daily_study_time">{t('goals.type_daily_study_time')}</option>
                  <option value="weekly_flashcards">{t('goals.type_weekly_flashcards')}</option>
                  <option value="quiz_streak">{t('goals.type_quiz_streak')}</option>
                  <option value="items_published">{t('goals.type_items_published')}</option>
                  <option value="custom">{t('goals.type_custom')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('goals.goal_title')}
                </label>
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g., Study 30 minutes daily"
                  maxLength={200}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('goals.goal_description')}
                </label>
                <textarea
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder="Describe your goal..."
                  maxLength={1000}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target Value
                </label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(Number(e.target.value))}
                  min="1"
                  max="10000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set the target number to achieve your goal
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Deadline (Optional)
                </label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGoal}
                  disabled={creating || !goalTitle.trim()}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? t('goals.creating') : t('goals.create_goal')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {ConfirmModal}
    </div>
  );
};
