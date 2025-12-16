import React, { useState } from 'react';
import { X, Tag, BookOpen, CheckCircle2, Globe, Lock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

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

export const TopicsTagsModal: React.FC<TopicsTagsModalProps> = ({
  isOpen,
  onClose,
  tags,
  predefinedTopics,
  selectedTags,
  selectedTopics,
  onApply
}) => {
  const [activeTab, setActiveTab] = useState<'topics' | 'tags'>('topics');
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>(selectedTags);
  const [localSelectedTopics, setLocalSelectedTopics] = useState<string[]>(selectedTopics);

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
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  const totalSelected = localSelectedTags.length + localSelectedTopics.length;

  const sortedTags = [...tags].sort((a, b) => {
    if (a.is_public !== b.is_public) return (a.is_public ? -1 : 1);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col dark:bg-gray-800 dark:shadow-none">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Filter by Topics & Tags
              </h3>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                Select topics and tags to filter your library content
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition duration-150 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex mt-4 space-x-2">
            <button
              onClick={() => setActiveTab('topics')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'topics'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md dark:from-green-600 dark:to-emerald-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Topics</span>
              {localSelectedTopics.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'topics'
                    ? 'bg-white text-green-600 dark:bg-gray-900 dark:text-green-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                }`}>
                  {localSelectedTopics.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('tags')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'tags'
                  ? `${getThemeGradient('ui')} text-white shadow-md`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              <Tag className="h-4 w-4" />
              <span>Tags</span>
              {localSelectedTags.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'tags'
                    ? 'bg-white text-blue-600 dark:bg-gray-900 dark:text-blue-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                }`}>
                  {localSelectedTags.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'topics' && (
            <div>
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-200">
                  Select Topics
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Choose one or more topics to filter your library items
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {predefinedTopics.map((topic) => {
                  const isSelected = localSelectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      onClick={() => toggleTopic(topic)}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                        isSelected
                          ? 'border-green-500 bg-green-50 shadow-md dark:border-green-600 dark:bg-green-900/30'
                          : 'border-gray-200 hover:border-green-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-green-600 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <BookOpen className={`h-4 w-4 ${
                              isSelected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                            }`} />
                            <span className={`font-medium text-sm ${
                              isSelected ? 'text-green-900 dark:text-green-200' : 'text-gray-700 dark:text-gray-200'
                            }`}>
                              {topic}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 dark:text-green-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {predefinedTopics.length === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>No topics available</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tags' && (
            <div>
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-200">
                  Select Tags
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Choose one or more tags to filter your library items
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sortedTags.map((tag) => {
                  const isSelected = localSelectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-md dark:border-blue-600 dark:bg-blue-900/30'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-blue-600 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <Tag className={`h-4 w-4 ${
                              isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                            }`} />
                            <span className={`font-medium text-sm ${
                              isSelected ? 'text-blue-900 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200'
                            }`}>
                              {tag.name}
                            </span>
                          </div>
                          {tag.is_public ? (
                            <div className="flex items-center space-x-1 text-xs text-green-600 dark:text-green-400">
                              <Globe className="h-3 w-3" />
                              <span>Public</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                              <Lock className="h-3 w-3" />
                              <span>Private</span>
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 dark:text-blue-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {tags.length === 0 && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Tag className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p>No tags available yet</p>
                  <p className="text-xs mt-2">Create tags when publishing items to your library</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold">{totalSelected}</span> filter{totalSelected !== 1 ? 's' : ''} selected
            </div>
            {totalSelected > 0 && (
              <button
                onClick={handleClear}
                className="text-sm text-orange-600 hover:text-orange-800 font-medium dark:text-orange-400 dark:hover:text-orange-200"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-100 transition duration-150 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className={`flex-1 px-4 py-2.5 text-sm text-white ${getThemeGradient('ui')} hover:opacity-90 rounded-lg transition duration-150 font-medium shadow-md`}
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
