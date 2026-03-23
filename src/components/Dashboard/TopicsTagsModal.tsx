import React, { useState, useEffect } from 'react';
import { X, Tag, BookOpen, CheckCircle2, Globe, Lock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n } from '../../contexts/I18nContext';

interface UserTag {
  id: string;
  name: string;
  is_public?: boolean;
  user_id?: string;
}

interface TopicsTagsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: UserTag[];
  predefinedTopics: string[];
  selectedTags: string[];
  selectedTopics: string[];
  onApply: (tags: string[], topics: string[]) => void;
}

const modalKey = (k: string) => `library.topics_tags_modal.${k}`;

export const TopicsTagsModal: React.FC<TopicsTagsModalProps> = ({
  isOpen,
  onClose,
  tags,
  predefinedTopics,
  selectedTags,
  selectedTopics,
  onApply
}) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [activeTab, setActiveTab] = useState<'topics' | 'tags'>('topics');
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>(selectedTags);
  const [localSelectedTopics, setLocalSelectedTopics] = useState<string[]>(selectedTopics);

  useEffect(() => {
    if (isOpen) {
      setLocalSelectedTags(selectedTags);
      setLocalSelectedTopics(selectedTopics);
    }
  }, [isOpen, selectedTags, selectedTopics]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(localSelectedTags, localSelectedTopics);
    onClose();
  };

  const handleClear = () => {
    setLocalSelectedTags([]);
    setLocalSelectedTopics([]);
  };

  const toggleTag = (tagId: string) => {
    setLocalSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const toggleTopic = (topic: string) => {
    setLocalSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(tp => tp !== topic) : [...prev, topic]
    );
  };

  const totalSelected = localSelectedTags.length + localSelectedTopics.length;

  const sortedTags = [...tags].sort((a, b) => {
    if (a.is_public !== b.is_public) return (a.is_public ? -1 : 1);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const tileBase = `relative p-3 rounded-md border transition-colors duration-150 text-left text-sm`;
  const tileSelected = `border-2 ${getThemeCardBorder()} ${getThemeSubtle('ui')} shadow-sm`;
  const tileUnselected = `border ${getThemeCardBorder()} hover:opacity-80`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col dark:shadow-none`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b ${getThemeCardBorder()}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className={`text-lg sm:text-xl font-semibold ${getThemeTextPrimary()}`}>
                {t(modalKey('title'))}
              </h3>
              <p className={`text-sm ${getThemeTextMuted()} mt-1`}>
                {t(modalKey('subtitle'))}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`shrink-0 p-2 ${getThemeTextMuted()} hover:opacity-80 rounded-lg transition duration-150`}
              aria-label={t(modalKey('close_dialog'))}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex mt-4 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('topics')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-colors duration-150 ${
                activeTab === 'topics'
                  ? `${getThemeGradient('ui')} text-white shadow-md hover:opacity-90`
                  : `${getThemeSubtle('ui')} ${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t(modalKey('tab_topics'))}</span>
              {localSelectedTopics.length > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    activeTab === 'topics'
                      ? `${getThemeCardBg()} ${getThemeTextPrimary()}`
                      : `${getThemeSubtle('ui')} ${getThemeTextSecondary()}`
                  }`}
                >
                  {localSelectedTopics.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tags')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition-colors duration-150 ${
                activeTab === 'tags'
                  ? `${getThemeGradient('ui')} text-white shadow-md hover:opacity-90`
                  : `${getThemeSubtle('ui')} ${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <Tag className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t(modalKey('tab_tags'))}</span>
              {localSelectedTags.length > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    activeTab === 'tags'
                      ? `${getThemeCardBg()} ${getThemeTextPrimary()}`
                      : `${getThemeSubtle('ui')} ${getThemeTextSecondary()}`
                  }`}
                >
                  {localSelectedTags.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === 'topics' && (
            <div>
              <div className="mb-3">
                <h4 className={`text-sm font-semibold ${getThemeTextSecondary()} mb-1`}>
                  {t(modalKey('section_topics_title'))}
                </h4>
                <p className={`text-xs ${getThemeTextMuted()}`}>
                  {t(modalKey('section_topics_desc'))}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {predefinedTopics.map((topic) => {
                  const isSelected = localSelectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      className={`${tileBase} ${isSelected ? tileSelected : tileUnselected}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <BookOpen className={`h-4 w-4 shrink-0 ${isSelected ? getThemeTextPrimary() : getThemeTextMuted()}`} aria-hidden />
                            <span className={`font-medium ${isSelected ? getThemeTextPrimary() : getThemeTextSecondary()}`}>
                              {topic}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className={`h-5 w-5 shrink-0 ${getThemeTextPrimary()}`} aria-hidden />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {predefinedTopics.length === 0 && (
                <div className={`text-center py-10 ${getThemeTextMuted()}`}>
                  <BookOpen className={`h-10 w-10 mx-auto mb-3 ${getThemeTextMuted()}`} aria-hidden />
                  <p className="text-sm">{t(modalKey('empty_topics'))}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tags' && (
            <div>
              <div className="mb-3">
                <h4 className={`text-sm font-semibold ${getThemeTextSecondary()} mb-1`}>
                  {t(modalKey('section_tags_title'))}
                </h4>
                <p className={`text-xs ${getThemeTextMuted()}`}>
                  {t(modalKey('section_tags_desc'))}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {sortedTags.map((tag) => {
                  const isSelected = localSelectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`${tileBase} ${isSelected ? tileSelected : tileUnselected}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Tag className={`h-4 w-4 shrink-0 ${isSelected ? getThemeTextPrimary() : getThemeTextMuted()}`} aria-hidden />
                            <span className={`font-medium ${isSelected ? getThemeTextPrimary() : getThemeTextSecondary()}`}>
                              {tag.name}
                            </span>
                          </div>
                          {tag.is_public ? (
                            <div className={`flex items-center gap-1 text-xs ${getThemeTextSecondary()}`}>
                              <Globe className="h-3 w-3 shrink-0" aria-hidden />
                              <span>{t(modalKey('visibility_public'))}</span>
                            </div>
                          ) : (
                            <div className={`flex items-center gap-1 text-xs ${getThemeTextMuted()}`}>
                              <Lock className="h-3 w-3 shrink-0" aria-hidden />
                              <span>{t(modalKey('visibility_private'))}</span>
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <CheckCircle2 className={`h-5 w-5 shrink-0 ${getThemeTextPrimary()}`} aria-hidden />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {tags.length === 0 && (
                <div className={`text-center py-10 ${getThemeTextMuted()}`}>
                  <Tag className={`h-10 w-10 mx-auto mb-3 ${getThemeTextMuted()}`} aria-hidden />
                  <p className="text-sm">{t(modalKey('empty_tags_title'))}</p>
                  <p className="text-xs mt-2">{t(modalKey('empty_tags_hint'))}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 sm:p-5 border-t ${getThemeCardBorder()} ${getThemeSubtle('bg')}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className={`text-sm ${getThemeTextSecondary()}`}>
              {totalSelected === 1
                ? t(modalKey('filters_selected_one'), { count: totalSelected })
                : t(modalKey('filters_selected_other'), { count: totalSelected })}
            </div>
            {totalSelected > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-orange-600 hover:text-orange-800 font-medium dark:text-orange-400 dark:hover:text-orange-200"
              >
                {t(modalKey('clear_all'))}
              </button>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2.5 text-sm ${getThemeTextSecondary()} border ${getThemeCardBorder()} rounded-lg hover:opacity-80 transition duration-150`}
            >
              {t(modalKey('cancel'))}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className={`flex-1 px-4 py-2.5 text-sm text-white ${getThemeGradient('ui')} hover:opacity-90 rounded-lg transition duration-150 font-medium shadow-md`}
            >
              {t(modalKey('apply'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
