import React, { useEffect, useMemo } from 'react';
import { RotateCcw, Award, Layers } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useSRS } from '../../../hooks/useSRS';
import { calculateMastery } from '../../../utils/srsAlgorithm';
import { ErrorLogger } from '../../../utils/errorLogger';

interface SrsReviewPanelProps {
  courseItemIds: string[];
  onStartReview: (dueCards: any[]) => void;
}

export const SrsReviewPanel: React.FC<SrsReviewPanelProps> = ({ courseItemIds, onStartReview }) => {
  const { t } = useI18n();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
    getThemeSubtle,
  } = useTheme();

  const { dueCards, loading, totalCards, dueCount, loadDueCardsForCourse } = useSRS();

  useEffect(() => {
    if (courseItemIds.length > 0) {
      loadDueCardsForCourse(courseItemIds).catch((err) => {
        ErrorLogger.error(err, { component: 'SrsReviewPanel', action: 'loadDueCards' });
      });
    }
  }, [courseItemIds, loadDueCardsForCourse]);

  const masteryPercent = useMemo(() => {
    if (dueCards.length === 0 && totalCards === 0) return 0;
    // Calculate average mastery across all cards that have been loaded
    // Use due cards' ease/repetitions for a rough average
    if (totalCards === 0) return 0;
    // Cards not due = mastered to some degree; due cards are lower mastery
    const masteredCount = totalCards - dueCount;
    // Simple heuristic: mastered cards ~80% mastery, due cards ~20%
    const avgMastery = totalCards > 0
      ? Math.round(((masteredCount * 80) + (dueCount * 20)) / totalCards)
      : 0;
    return avgMastery;
  }, [totalCards, dueCount, dueCards]);

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (masteryPercent / 100) * circumference;

  const handleStartReview = () => {
    if (dueCards.length > 0) {
      onStartReview(dueCards);
    }
  };

  if (loading) {
    return (
      <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()} animate-pulse`}>
        <div className="h-6 w-40 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="h-24 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-6 ${getThemeCardBg()} ${getThemeCardBorder()}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <RotateCcw className="w-5 h-5 text-purple-500" />
        <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
          {t('academics.srsReview') || 'Spaced Repetition Review'}
        </h3>
      </div>

      <div className="flex items-center gap-6">
        {/* Progress Ring */}
        <div className="relative flex-shrink-0">
          <svg width="96" height="96" className="-rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="text-purple-500 transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${getThemeTextPrimary()}`}>{masteryPercent}%</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className={`text-sm ${getThemeTextSecondary()}`}>
              {t('academics.totalCards') || 'Total Cards'}: <strong>{totalCards}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-orange-500" />
            <span className={`text-sm ${getThemeTextSecondary()}`}>
              {t('academics.dueToday') || 'Due Today'}: <strong className="text-orange-500">{dueCount}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-green-500" />
            <span className={`text-sm ${getThemeTextSecondary()}`}>
              {t('academics.mastery') || 'Mastery'}: <strong className="text-green-500">{masteryPercent}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Start Review Button */}
      <button
        onClick={handleStartReview}
        disabled={dueCount === 0}
        className={`w-full mt-5 py-3 px-4 rounded-lg font-medium text-white transition-all duration-200 ${
          dueCount > 0
            ? `bg-gradient-to-r ${getThemeGradient()} hover:opacity-90 active:scale-[0.98]`
            : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed opacity-60'
        }`}
      >
        {dueCount > 0
          ? `${t('academics.startReview') || 'Start Review'} (${dueCount} ${t('academics.cards') || 'cards'})`
          : t('academics.allCaughtUp') || 'All caught up! No cards due.'}
      </button>
    </div>
  );
};
