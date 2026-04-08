import React, { useMemo } from 'react';
import { GraduationCap } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { ChatAssistant } from '../../ChatAssistant/ChatAssistant';
import { ErrorLogger } from '../../../utils/errorLogger';

interface CourseTutorProps {
  courseId: string;
  courseName: string;
  courseTopics: string[];
  courseScore: number;
}

export const CourseTutor: React.FC<CourseTutorProps> = ({
  courseId,
  courseName,
  courseTopics,
  courseScore,
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

  const contextSummary = useMemo(() => {
    try {
      const topicsStr = courseTopics.length > 0 ? courseTopics.join(', ') : 'General';
      return `Course: ${courseName}\nTopics: ${topicsStr}\nCurrent Score: ${courseScore}%\n\nYou are a tutor for this course. Help the student understand the topics, answer questions, explain concepts, and suggest study strategies based on their current score.`;
    } catch (err) {
      ErrorLogger.error(err, { component: 'CourseTutor', action: 'buildContext' });
      return `Course: ${courseName}`;
    }
  }, [courseName, courseTopics, courseScore]);

  return (
    <div className={`rounded-xl border overflow-hidden ${getThemeCardBg()} ${getThemeCardBorder()}`}>
      {/* Tutor Header */}
      <div className={`p-4 border-b ${getThemeCardBorder()} ${getThemeSubtle()}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${getThemeGradient()}`}>
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
              {t('academics.courseTutor') || 'Course Tutor'}
            </h3>
            <p className={`text-sm ${getThemeTextMuted()}`}>
              {t('academics.courseTutorDesc') || 'Ask questions about'} {courseName}
            </p>
          </div>
        </div>

        {/* Course context pills */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getThemeSubtle()} ${getThemeTextSecondary()}`}>
            {t('academics.score') || 'Score'}: {courseScore}%
          </span>
          {courseTopics.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${getThemeSubtle()} ${getThemeTextMuted()}`}
            >
              {topic}
            </span>
          ))}
          {courseTopics.length > 3 && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${getThemeSubtle()} ${getThemeTextMuted()}`}>
              +{courseTopics.length - 3} {t('academics.more') || 'more'}
            </span>
          )}
        </div>
      </div>

      {/* Chat Assistant */}
      <div className="p-4">
        <ChatAssistant
          summaryText={contextSummary}
          topics={courseTopics}
          contextType="library_item"
          contextId={courseId}
        />
      </div>
    </div>
  );
};
