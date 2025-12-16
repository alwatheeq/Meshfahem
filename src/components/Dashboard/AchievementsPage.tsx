import React, { useState, useEffect } from 'react';
import { Award, Lock, Star, TrendingUp, Users, BookOpen, Zap } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ErrorLogger } from '../../utils/errorLogger';

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

export const AchievementsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient } = useTheme();
  const [allAchievements, setAllAchievements] = useState<AchievementDefinition[]>([]);
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const [achievementsRes, userAchievementsRes] = await Promise.all([
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

      if (!achievementsRes.error && achievementsRes.data) {
        setAllAchievements(achievementsRes.data);
      }

      if (!userAchievementsRes.error && userAchievementsRes.data) {
        setUserAchievements(userAchievementsRes.data);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'AchievementsPage', action: 'fetchAchievements', userId: user?.id });
    } finally {
      setLoading(false);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

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
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('achievements.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <Award className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('achievements.title')}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {t('achievements.subtitle')}
              </p>
            </div>
          </div>

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

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-6">
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
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all ${
                  isUnlocked
                    ? 'border-2 border-yellow-400 dark:border-yellow-600'
                    : 'opacity-75 hover:opacity-100'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`p-3 rounded-xl ${
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
            <Award className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">{t('achievements.no_achievements')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
