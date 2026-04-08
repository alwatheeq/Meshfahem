import React, { useState } from 'react';
import { BarChart3, Brain, Calendar, Zap, GraduationCap } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { CourseAnalytics } from './CourseAnalytics';
import { SrsReviewPanel } from './SrsReviewPanel';
import { ExamScheduler } from './ExamScheduler';
import { DailyChallenge } from './DailyChallenge';
import { CourseTutor } from './CourseTutor';

interface CourseDetailViewProps {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseTopicName: string;
  courseItems: Array<{
    id: string;
    item_id: string;
    user_library_items?: { id: string; title: string; topics: string[] | null } | null;
  }>;
  courseQuizzes: Array<{
    id: string;
    quiz_session_id: string;
    quiz_sessions?: { id: string; quiz_title: string } | null;
  }>;
  courseScore: number;
  topicScores: Array<{ topic: string; score: number }>;
}

type TabKey = 'overview' | 'review' | 'exams' | 'challenge' | 'tutor';

const TABS: Array<{ key: TabKey; icon: React.ElementType; labelKey: string; fallback: string }> = [
  { key: 'overview', icon: BarChart3, labelKey: 'academics.course_detail.overview', fallback: 'Overview' },
  { key: 'review', icon: Brain, labelKey: 'academics.course_detail.review', fallback: 'Review' },
  { key: 'exams', icon: Calendar, labelKey: 'academics.course_detail.exams', fallback: 'Exams' },
  { key: 'challenge', icon: Zap, labelKey: 'academics.course_detail.challenge', fallback: 'Challenge' },
  { key: 'tutor', icon: GraduationCap, labelKey: 'academics.course_detail.tutor', fallback: 'Tutor' },
];

export const CourseDetailView: React.FC<CourseDetailViewProps> = ({
  courseId,
  courseName,
  courseCode,
  courseTopicName,
  courseItems,
  courseQuizzes,
  courseScore,
  topicScores,
}) => {
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

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const scoreColor =
    courseScore >= 80
      ? 'text-green-400'
      : courseScore >= 50
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div className={`rounded-2xl border ${getThemeCardBg()} ${getThemeCardBorder()} overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-5 ${getThemeGradient()}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h2 className={`text-xl font-bold truncate ${getThemeTextPrimary()}`}>
              {courseName}
            </h2>
            <div className={`flex items-center gap-2 mt-1 text-sm ${getThemeTextSecondary()}`}>
              {courseCode && (
                <>
                  <span className="font-mono">{courseCode}</span>
                  <span className={getThemeTextMuted()}>·</span>
                </>
              )}
              <span>{courseTopicName}</span>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${getThemeSubtle()} border ${getThemeCardBorder()}`}
          >
            <span className={`text-xs font-medium ${getThemeTextMuted()}`}>
              {t('academics.course_detail.score') || 'Score'}
            </span>
            <span className={`text-lg font-bold ${scoreColor}`}>
              {courseScore}%
            </span>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className={`flex overflow-x-auto border-b ${getThemeCardBorder()}`}>
        {TABS.map(({ key, icon: Icon, labelKey, fallback }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(key)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors
                ${
                  isActive
                    ? `${getThemeTextPrimary()} ${getThemeSubtle()} border-b-2 border-current`
                    : `${getThemeTextMuted()} hover:${getThemeTextSecondary()}`
                }
              `}
            >
              <Icon size={16} />
              <span>{t(labelKey) || fallback}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {activeTab === 'overview' && (
          <CourseAnalytics
            courseId={courseId}
            courseItems={courseItems}
            courseQuizzes={courseQuizzes}
            courseScore={courseScore}
            topicScores={topicScores}
          />
        )}
        {activeTab === 'review' && (
          <SrsReviewPanel courseId={courseId} courseItems={courseItems} />
        )}
        {activeTab === 'exams' && (
          <ExamScheduler courseId={courseId} courseName={courseName} />
        )}
        {activeTab === 'challenge' && (
          <DailyChallenge courseId={courseId} courseItems={courseItems} />
        )}
        {activeTab === 'tutor' && (
          <CourseTutor courseId={courseId} courseName={courseName} courseItems={courseItems} />
        )}
      </div>
    </div>
  );
};
