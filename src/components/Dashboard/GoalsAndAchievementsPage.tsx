import React, { useState, useEffect } from 'react';
import { Target, Plus, Calendar, TrendingUp, CheckCircle, Clock, Trash2, X, Award, Lock, Star, Users, BookOpen, Zap } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../contexts/I18nContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useConfirm } from '../../hooks/useConfirm';
import { useTheme } from '../../contexts/ThemeContext';

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

interface AchievementDefinition {
  id: string;
  achievement_key: string;
  title: string;
  description: string;
  icon_name: string;
  badge_tier: string;
  xp_reward: number;
  category: string;
  is_active: boolean;
  sort_order: number;
}

interface UserAchievement {
  achievement_id: string;
  earned_at: string;
  progress_value: number;
}

export const GoalsAndAchievementsPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getBackgroundGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [activeTab, setActiveTab] = useState<'goals' | 'achievements'>('goals');

  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const [allAchievements, setAllAchievements] = useState<AchievementDefinition[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [goalType, setGoalType] = useState<string>('daily_study_time');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [targetValue, setTargetValue] = useState(10);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [goalsRes, achievementsRes, userAchievementsRes] = await Promise.all([
        supabase
          .from('study_goals')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('achievements_definitions')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('user_achievements')
          .select('achievement_id, earned_at, progress_value')
          .eq('user_id', user.id)
      ]);

      if (goalsRes.error) {
        const message = handleSupabaseError(goalsRes.error, { 
          component: 'GoalsAndAchievementsPage', 
          action: 'fetchData',
          step: 'fetchGoals'
        });
        ErrorLogger.error(goalsRes.error, { 
          component: 'GoalsAndAchievementsPage', 
          action: 'fetchData',
          step: 'fetchGoals',
          userId: user.id
        });
        showErrorToast(message);
      } else if (goalsRes.data) {
        setGoals(goalsRes.data);
      }

      if (achievementsRes.error) {
        ErrorLogger.error(achievementsRes.error, { 
          component: 'GoalsAndAchievementsPage', 
          action: 'fetchData',
          step: 'fetchAchievements',
          userId: user.id
        });
        // Non-blocking: achievements are optional
      } else if (achievementsRes.data) {
        setAllAchievements(achievementsRes.data);
      }

      if (userAchievementsRes.error) {
        ErrorLogger.error(userAchievementsRes.error, { 
          component: 'GoalsAndAchievementsPage', 
          action: 'fetchData',
          step: 'fetchUserAchievements',
          userId: user.id
        });
        // Non-blocking: user achievements are optional
      } else if (userAchievementsRes.data) {
        setUserAchievements(userAchievementsRes.data);
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'GoalsAndAchievementsPage', 
        action: 'fetchData',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'GoalsAndAchievementsPage', 
        action: 'fetchData',
        userId: user.id
      });
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async () => {
    if (!user || !goalTitle.trim()) return;

    // Check subscription first
    if (!hasActiveSubscription()) {
      setShowSubscriptionModal(true);
      return;
    }

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
          component: 'GoalsAndAchievementsPage', 
          action: 'handleCreateGoal',
          userId: user.id
        });
        ErrorLogger.error(error, { 
          component: 'GoalsAndAchievementsPage', 
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
      await fetchData();
      showSuccessToast(t('goals.goal_created'));
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'GoalsAndAchievementsPage', 
        action: 'handleCreateGoal',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'GoalsAndAchievementsPage', 
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
          component: 'GoalsAndAchievementsPage', 
          action: 'handleDeleteGoal',
          goalId,
          userId: user?.id
        });
        ErrorLogger.error(error, { 
          component: 'GoalsAndAchievementsPage', 
          action: 'handleDeleteGoal',
          goalId,
          userId: user?.id
        });
        showErrorToast(message);
        return;
      }

      await fetchData();
      showSuccessToast(t('goals.goal_deleted') || 'Goal deleted successfully');
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'GoalsAndAchievementsPage', 
        action: 'handleDeleteGoal',
        goalId,
        userId: user?.id
      });
      ErrorLogger.error(error, { 
        component: 'GoalsAndAchievementsPage', 
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
          component: 'GoalsAndAchievementsPage', 
          action: 'handleMarkComplete',
          goalId,
          userId: user?.id
        });
        ErrorLogger.error(error, { 
          component: 'GoalsAndAchievementsPage', 
          action: 'handleMarkComplete',
          goalId,
          userId: user?.id
        });
        showErrorToast(message);
        return;
      }

      await fetchData();
      showSuccessToast(t('goals.goal_completed') || 'Goal marked as complete!');
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'GoalsAndAchievementsPage', 
        action: 'handleMarkComplete',
        goalId,
        userId: user?.id
      });
      ErrorLogger.error(error, { 
        component: 'GoalsAndAchievementsPage', 
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
    if (!dateString) return 'No deadline';
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

  const isAchievementUnlocked = (achievementId: string) => {
    return userAchievements.some(ua => ua.achievement_id === achievementId);
  };

  const getEarnedDate = (achievementId: string) => {
    const achievement = userAchievements.find(ua => ua.achievement_id === achievementId);
    return achievement?.earned_at;
  };

  const getBadgeColor = (tier: string) => {
    const colors = {
      bronze: 'from-amber-600 to-amber-800',
      silver: 'from-gray-400 to-gray-600',
      gold: 'from-yellow-400 to-yellow-600',
      platinum: 'from-cyan-400 to-cyan-600',
      diamond: 'from-purple-400 to-purple-600'
    };
    return colors[tier as keyof typeof colors] || 'from-gray-400 to-gray-600';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'study':
        return <BookOpen className="h-5 w-5" />;
      case 'social':
        return <Users className="h-5 w-5" />;
      case 'achievement':
        return <TrendingUp className="h-5 w-5" />;
      case 'special':
        return <Star className="h-5 w-5" />;
      default:
        return <Award className="h-5 w-5" />;
    }
  };

  const activeGoals = goals.filter(g => !g.is_completed);
  const completedGoals = goals.filter(g => g.is_completed);

  const filteredAchievements = selectedCategory === 'all'
    ? allAchievements
    : allAchievements.filter(a => a.category === selectedCategory);

  const earnedCount = allAchievements.filter(a => isAchievementUnlocked(a.id)).length;
  const totalXPEarned = allAchievements
    .filter(a => isAchievementUnlocked(a.id))
    .reduce((sum, a) => sum + a.xp_reward, 0);

  const categories = [
    { id: 'all', label: t('achievements.all'), icon: <Award className="h-4 w-4" /> },
    { id: 'study', label: t('achievements.category_study'), icon: <BookOpen className="h-4 w-4" /> },
    { id: 'social', label: t('achievements.category_social'), icon: <Users className="h-4 w-4" /> },
    { id: 'achievement', label: t('achievements.category_achievement'), icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'special', label: t('achievements.category_special'), icon: <Star className="h-4 w-4" /> }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className={`mt-4 ${getThemeTextSecondary()}`}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className={`min-h-screen ${getBackgroundGradient()} p-6`}>
      <div className="max-w-7xl mx-auto">
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6 mb-6`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Target className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div>
                <h1 className={`text-3xl font-bold ${getThemeTextPrimary()}`}>{t('sidebar.goals_achievements')}</h1>
                <p className={`text-sm ${getThemeTextSecondary()} mt-1`}>
                  {t('sidebar.goals_achievements_desc')}
                </p>
              </div>
            </div>
          </div>

          <div className={`flex space-x-2 border-b ${getThemeCardBorder()}`}>
            <button
              onClick={() => setActiveTab('goals')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'goals'
                  ? 'text-blue-600 dark:text-blue-400'
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5" />
                <span>{t('achievements.goals_tab')}</span>
              </div>
              {activeTab === 'goals' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('achievements')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'achievements'
                  ? 'text-blue-600 dark:text-blue-400'
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <div className="flex items-center space-x-2">
                <Award className="h-5 w-5" />
                <span>{t('achievements.achievements_tab')}</span>
              </div>
              {activeTab === 'achievements' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"></div>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'goals' ? (
          <div>
            <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6 mb-6`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    <h2 className={`text-xl font-bold ${getThemeTextPrimary()}`}>{t('goals.title')}</h2>
                    <p className={`text-sm ${getThemeTextSecondary()} mt-1`}>
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
              <div className={`${getThemeCardBg()} rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
                <div className="text-center">
                  <p className={`text-sm ${getThemeTextSecondary()} mb-2`}>{t('goals.active_goals')}</p>
                  <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{activeGoals.length}</p>
                </div>
              </div>

              <div className={`${getThemeCardBg()} rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('goals.completed')}</p>
                  <p className="text-4xl font-bold text-green-600 dark:text-green-400">{completedGoals.length}</p>
                </div>
              </div>

              <div className={`${getThemeCardBg()} rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
                <div className="text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('goals.total_goals')}</p>
                  <p className={`text-4xl font-bold ${getThemeTextPrimary()}`}>{goals.length}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {activeGoals.length > 0 && (
                <div>
                  <h2 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-4`}>{t('goals.active_goals')}</h2>
                  <div className="space-y-4">
                    {activeGoals.map((goal) => {
                      const progress = calculateProgress(goal.current_value, goal.target_value);
                      const isOverdue = goal.deadline_date && new Date(goal.deadline_date) < new Date();

                      return (
                        <div
                          key={goal.id}
                          className={`${getThemeCardBg()} rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6 ${
                            isOverdue ? 'border-2 border-red-300 dark:border-red-700' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-start space-x-3 flex-1">
                              <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg text-green-600 dark:text-green-300">
                                {getGoalTypeIcon(goal.goal_type)}
                              </div>
                              <div className="flex-1">
                                <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                                  {goal.goal_title}
                                </h3>
                                {goal.goal_description && (
                                  <p className={`text-sm ${getThemeTextSecondary()} mt-1`}>
                                    {goal.goal_description}
                                  </p>
                                )}
                                <div className={`flex items-center space-x-4 mt-2 text-sm ${getThemeTextMuted()}`}>
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
                              <span className={getThemeTextSecondary()}>{t('goals.progress')}</span>
                              <span className={`font-semibold ${getThemeTextPrimary()}`}>
                                {goal.current_value} / {goal.target_value}
                              </span>
                            </div>
                            <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-3`}>
                              <div
                                className={`h-3 rounded-full transition-colors duration-150 ${
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
                            <p className={`text-xs text-right ${getThemeTextMuted()}`}>
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
                  <h2 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-4`}>{t('goals.completed_goals')}</h2>
                  <div className="space-y-4">
                    {completedGoals.map((goal) => (
                      <div
                        key={goal.id}
                        className={`${getThemeSubtle('bg')} rounded-xl shadow p-6 opacity-75`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            <div className="bg-green-100 dark:bg-green-900 p-2 rounded-lg text-green-600 dark:text-green-300">
                              <CheckCircle className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
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
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-12 text-center">
                  <Target className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-2">{t('goals.no_goals_yet')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                    {t('goals.create_first_goal')}
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
        ) : (
          <div>
            <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6 mb-6`}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`${getThemeGradient('bg')} rounded-lg p-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 dark:text-blue-300 font-medium">{t('achievements.unlocked')}</p>
                      <p className="text-3xl font-bold text-blue-700 dark:text-blue-200 mt-1">
                        {earnedCount}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {t('achievements.of')} {allAchievements.length}
                      </p>
                    </div>
                    <Award className="h-12 w-12 text-blue-600 dark:text-blue-300 opacity-50" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900 dark:to-yellow-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-600 dark:text-yellow-300 font-medium">{t('achievements.total_xp')}</p>
                      <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-200 mt-1">
                        {totalXPEarned}
                      </p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        {t('achievements.from_achievements')}
                      </p>
                    </div>
                    <Zap className="h-12 w-12 text-yellow-600 dark:text-yellow-300 opacity-50" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 dark:text-green-300 font-medium">{t('achievements.completion')}</p>
                      <p className="text-3xl font-bold text-green-700 dark:text-green-200 mt-1">
                        {Math.round((earnedCount / allAchievements.length) * 100)}%
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {t('achievements.progress')}
                      </p>
                    </div>
                    <TrendingUp className="h-12 w-12 text-green-600 dark:text-green-300 opacity-50" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-4 mb-6">
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                      selectedCategory === category.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {category.icon}
                    <span>{category.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAchievements.map((achievement) => {
                const isUnlocked = isAchievementUnlocked(achievement.id);
                const earnedDate = getEarnedDate(achievement.id);

                return (
                  <div
                    key={achievement.id}
                    className={`bg-white dark:bg-gray-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6 transition-all ${
                      isUnlocked
                        ? 'border-2 border-yellow-400 dark:border-yellow-600'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`p-3 rounded-md ${
                          isUnlocked
                            ? `bg-gradient-to-br ${getBadgeColor(achievement.badge_tier)}`
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        {isUnlocked ? (
                          <Award className="h-8 w-8 text-white" />
                        ) : (
                          <Lock className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            achievement.badge_tier === 'bronze'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                              : achievement.badge_tier === 'silver'
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              : achievement.badge_tier === 'gold'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                              : achievement.badge_tier === 'platinum'
                              ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
                          }`}
                        >
                          {achievement.badge_tier.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                          <Zap className="h-3 w-3 mr-1" />
                          {achievement.xp_reward} XP
                        </span>
                      </div>
                    </div>

                    <h3 className={`text-lg font-bold mb-2 ${
                      isUnlocked
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {achievement.title}
                    </h3>

                    <p className={`text-sm mb-3 ${
                      isUnlocked
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'text-gray-500 dark:text-gray-500'
                    }`}>
                      {achievement.description}
                    </p>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                        {getCategoryIcon(achievement.category)}
                        <span className="capitalize">{achievement.category}</span>
                      </div>
                      {isUnlocked && earnedDate && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          {formatDate(earnedDate)}
                        </span>
                      )}
                      {!isUnlocked && (
                        <span className="text-xs text-gray-400 dark:text-gray-600 font-medium">
                          {t('achievements.locked')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredAchievements.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-12 text-center">
                <Award className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">{t('achievements.no_achievements')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('goals.create_new_goal')}</h2>
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
                  placeholder={t('goals.goal_title_placeholder')}
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
                  placeholder={t('goals.description_placeholder')}
                  maxLength={1000}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('goals.target_value')}
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
                  {t('goals.target_value_help')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('goals.deadline_optional')}
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
                  {t('common.cancel')}
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
    </>
  );
});
