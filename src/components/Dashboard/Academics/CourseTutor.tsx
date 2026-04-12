import React, { useCallback, useEffect, useState } from 'react';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { ChatAssistant } from '../../ChatAssistant/ChatAssistant';

interface CourseTutorProps {
  courseId: string;
  courseName: string;
  topicName: string;
}

export const CourseTutor: React.FC<CourseTutorProps> = ({ courseId, courseName: _courseName, topicName }) => {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { error: showErrorToast } = useToast();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextMuted,
    getThemeGradient,
  } = useTheme();

  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  void _courseName;

  const loadContext = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data: courseItems, error: itemsErr } = await supabase
        .from('academics_course_items')
        .select('item_id')
        .eq('course_id', courseId);

      if (itemsErr) throw itemsErr;

      const itemIds = (courseItems || []).map((ci) => ci.item_id);
      if (itemIds.length === 0) {
        setContext('');
        setLoading(false);
        return;
      }

      const { data: libraryItems, error: libErr } = await supabase
        .from('user_library_items')
        .select('summary_text')
        .in('id', itemIds);

      if (libErr) throw libErr;

      const summaries = (libraryItems || [])
        .map((item) => (typeof item.summary_text === 'string' ? item.summary_text : ''))
        .filter(Boolean);

      setContext(summaries.join('\n\n---\n\n'));
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, showErrorToast]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  if (loading) {
    return (
      <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6`}>
        <div className={`animate-pulse text-sm ${getThemeTextMuted()}`}>
          {t('ai_tutor.loading') || 'Loading tutor…'}
        </div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg p-6`} dir={dir}>
        <div className="flex items-center gap-3">
          <Bot className={`h-5 w-5 ${getThemeTextMuted()}`} />
          <span className={`text-sm ${getThemeTextMuted()}`}>
            {t('ai_tutor.no_context') || 'Upload materials to this course to enable the AI tutor'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${getThemeCardBg()} border ${getThemeCardBorder()} rounded-lg overflow-hidden`} dir={dir}>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-5"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getThemeGradient('ui')} text-white`}>
            <Bot className="h-5 w-5" />
          </div>
          <span className={`font-semibold ${getThemeTextPrimary()}`}>
            {t('ai_tutor.title') || 'AI Course Tutor'}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className={`h-5 w-5 ${getThemeTextMuted()}`} />
        ) : (
          <ChevronDown className={`h-5 w-5 ${getThemeTextMuted()}`} />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5">
          <ChatAssistant
            summaryText={context}
            topics={[topicName]}
            contextType="summary"
            medicalMode={false}
          />
        </div>
      )}
    </div>
  );
};
