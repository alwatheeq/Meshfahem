import React from 'react';
import { FileText, RefreshCw, Copy, Check, BookOpen, FileSearch, X, Download, Folder, Tag, Plus, AlertCircle, CheckCircle2, Stethoscope, GraduationCap, Heart, Activity, Globe, Lock } from 'lucide-react';
import html2pdf from 'html2pdf.js'; // Ensure html2pdf.js is correctly imported
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { PREDEFINED_TOPICS } from '../../utils/config.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useChatContext } from '../../contexts/ChatContext';

interface SummaryDisplayProps {
  summaryChunks: string[];
  flashcards: Array<{ front: string; back: string }>;
  originalText: string;
  topics?: string[];
  medicalMode?: boolean;
  medicalScore?: number;
  onPublishToLibrary: (summary: string, flashcards: Array<{ front: string; back: string }>, originalText: string) => Promise<boolean>;
  onReset: () => void;
  isSharedView?: boolean;
}

interface UserFolder {
  id: string;
  name: string;
}

interface UserTag {
  id: string;
  name: string;
  is_public?: boolean;
  user_id?: string;
}
export const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ 
  summaryChunks, 
  flashcards, 
  originalText,
  topics = [],
  medicalMode = false,
  medicalScore,
  onPublishToLibrary, 
  onReset,
  isSharedView = false
}) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getThemeText } = useTheme();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const { setChatContext, clearChatContext } = useChatContext();
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [published, setPublished] = React.useState(false);
  const [showOriginalText, setShowOriginalText] = React.useState(false);
  const [showPublishModal, setShowPublishModal] = React.useState(false);
  const [folders, setFolders] = React.useState<UserFolder[]>([]);
  const [tags, setTags] = React.useState<UserTag[]>([]);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>('');
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [selectedPredefinedTopics, setSelectedPredefinedTopics] = React.useState<string[]>([]);
  const [newTagName, setNewTagName] = React.useState('');
  const [showCreateTag, setShowCreateTag] = React.useState(false);
  const [showCreateFolderInput, setShowCreateFolderInput] = React.useState(false);
  const [newFolderNameInput, setNewFolderNameInput] = React.useState('');
  const [creatingFolder, setCreatingFolder] = React.useState(false);

  React.useEffect(() => {
    if (showPublishModal && user) {
      fetchFolders();
      fetchTags();
    }
  }, [showPublishModal, user]);

  // Calculate combined summary
  const combinedSummary = summaryChunks.join('\n\n');

  // Set chat context when summary is displayed
  React.useEffect(() => {
    if (summaryChunks.length > 0 && !isSharedView) {
      setChatContext({
        summaryText: combinedSummary,
        originalText: originalText,
        topics: topics || [],
        medicalMode: medicalMode || false,
        contextType: 'summary',
        contextId: null,
      });
    } else {
      clearChatContext();
    }

    // Clear context when component unmounts
    return () => {
      clearChatContext();
    };
  }, [summaryChunks, originalText, topics, medicalMode, isSharedView, combinedSummary, setChatContext, clearChatContext]);

  const fetchFolders = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_folders')
        .select('id, name')
        .order('name');

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'SummaryDisplay', 
          action: 'fetchFolders'
        });
        ErrorLogger.error(error, { 
          component: 'SummaryDisplay', 
          action: 'fetchFolders',
          userId: user.id
        });
        showErrorToast(message);
        return;
      }

      setFolders(data || []);
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'SummaryDisplay', 
        action: 'fetchFolders'
      });
      ErrorLogger.error(error, { 
        component: 'SummaryDisplay', 
        action: 'fetchFolders',
        userId: user.id
      });
      showErrorToast(message);
    }
  };

  const fetchTags = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, is_public, user_id')
        .or(`user_id.eq.${user.id},is_public.eq.true`)
        .order('is_public', { ascending: false })
        .order('name');

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'SummaryDisplay', 
          action: 'fetchTags'
        });
        ErrorLogger.error(error, { 
          component: 'SummaryDisplay', 
          action: 'fetchTags',
          userId: user.id
        });
        showErrorToast(message);
        return;
      }

      setTags(data || []);
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'SummaryDisplay', 
        action: 'fetchTags'
      });
      ErrorLogger.error(error, { 
        component: 'SummaryDisplay', 
        action: 'fetchTags',
        userId: user.id
      });
      showErrorToast(message);
    }
  };

  const createTag = async () => {
    if (!user || !newTagName.trim()) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({
          user_id: user.id,
          name: newTagName.trim(),
          is_public: true
        })
        .select()
        .single();

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'SummaryDisplay', 
          action: 'createTag',
          tagName: newTagName.trim()
        });
        ErrorLogger.error(error, { 
          component: 'SummaryDisplay', 
          action: 'createTag',
          tagName: newTagName.trim(),
          userId: user.id
        });
        showErrorToast(message);
        return;
      }

      setTags(prev => [...prev, data]);
      setSelectedTagIds(prev => [...prev, data.id]);
      setNewTagName('');
      setShowCreateTag(false);
      showSuccessToast(t('publish_modal.tag_created_success') || 'Tag created successfully');
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'SummaryDisplay', 
        action: 'createTag'
      });
      ErrorLogger.error(error, { 
        component: 'SummaryDisplay', 
        action: 'createTag',
        userId: user.id
      });
      showErrorToast(message);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      ErrorLogger.error(err, { 
        component: 'SummaryDisplay', 
        action: 'copyToClipboard',
        index
      });
      showErrorToast('Failed to copy to clipboard');
    }
  };

  const handlePublishToLibrary = async (folderId?: string, tagIds?: string[]) => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setPublishing(true);
    try {
      // Process predefined topics - create tags if they don't exist
      const finalTagIds = [...(tagIds || [])];
      
      for (const topicName of selectedPredefinedTopics) {
        // Check if tag already exists
        let existingTag = tags.find(tag => tag.name.toLowerCase() === topicName.toLowerCase());
        
        if (existingTag) {
          if (!finalTagIds.includes(existingTag.id)) {
            finalTagIds.push(existingTag.id);
          }
        } else {
          // Create new tag
          try {
            const { data: newTag, error: createError } = await supabase
              .from('tags')
              .insert({
                user_id: user!.id,
                name: topicName
              })
              .select()
              .single();

            if (createError) {
              ErrorLogger.error(createError, { 
                component: 'SummaryDisplay', 
                action: 'handlePublishToLibrary',
                step: 'createTopicTag',
                topicName,
                userId: user!.id
              });
              // Non-blocking: continue even if tag creation fails
            } else {
              finalTagIds.push(newTag.id);
              // Update local tags state
              setTags(prev => [...prev, newTag]);
            }
          } catch (tagError) {
            ErrorLogger.error(tagError, { 
              component: 'SummaryDisplay', 
              action: 'handlePublishToLibrary',
              step: 'createTopicTag',
              topicName,
              userId: user!.id
            });
            // Non-blocking: continue even if tag creation fails
          }
        }
      }
      
      // First publish to library
      const result = await publishToLibraryWithMetadata(combinedSummary, flashcards, originalText, folderId, finalTagIds);
      if (result.success) {
        setPublished(true);
        setShowPublishModal(false);
        showSuccessToast('Item published to library successfully!');
        setTimeout(() => setPublished(false), 3000);

        // Trigger library refresh event with item ID
        window.dispatchEvent(new CustomEvent('libraryItemPublished', {
          detail: { 
            id: result.itemId,
            folderId, 
            tagIds: finalTagIds, 
            timestamp: Date.now() 
          }
        }));
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'SummaryDisplay', 
        action: 'handlePublishToLibrary'
      });
      ErrorLogger.error(error, { 
        component: 'SummaryDisplay', 
        action: 'handlePublishToLibrary',
        userId: user?.id
      });
      showErrorToast(message);
    } finally {
      setPublishing(false);
    }
  };

  const publishToLibraryWithMetadata = async (
    summary: string,
    flashcards: Array<{ front: string; back: string }>,
    originalText: string,
    folderId?: string,
    tagIds?: string[]
  ): Promise<{ success: boolean; itemId?: string }> => {
    if (!user || !user.id) {
      showErrorToast('Please log in to publish to library');
      ErrorLogger.error(new Error('No authenticated user found'), { 
        component: 'SummaryDisplay', 
        action: 'publishToLibraryWithMetadata'
      });
      return { success: false };
    }

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return { success: false };
    }

    try {
      // Create a descriptive title with fallback
      let title = 'Generated Content';

      // Try to use translation, but have fallback
      try {
        const translatedTitle = t('common.generated_content');
        if (translatedTitle && translatedTitle !== 'common.generated_content') {
          title = translatedTitle;
        }
      } catch (e) {
        // Translation key not found, using fallback - non-critical
      }

      // Create more descriptive title from summary
      if (summary && summary.trim().length > 0) {
        const summaryWords = summary.trim().split(' ').slice(0, 6).join(' ');
        const timestamp = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        title = `${summaryWords}... - ${timestamp}`;
      } else {
        // If no summary, create title from timestamp
        const timestamp = new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        title = `${title} - ${timestamp}`;
      }

      // Ensure title is never empty
      if (!title || title.trim().length === 0) {
        title = `Library Item ${Date.now()}`;
      }

      // Validate folder if provided
      if (folderId) {
        const { data: folderExists, error: folderError } = await supabase
          .from('user_folders')
          .select('id')
          .eq('id', folderId)
          .eq('user_id', user.id)
          .single();

        if (folderError || !folderExists) {
          ErrorLogger.error(folderError || new Error('Folder not found'), { 
            component: 'SummaryDisplay', 
            action: 'publishToLibraryWithMetadata',
            step: 'validateFolder',
            folderId,
            userId: user.id
          });
          folderId = undefined;
        }
      }

      const { data: libraryItem, error } = await supabase
        .from('user_library_items')
        .insert({
          user_id: user.id,
          title: title,
          summary_text: summary || '',
          flashcards_json: flashcards || [],
          source_type: 'processed',
          original_text_content: originalText || '',
          topics: topics || [],
          folder_id: folderId || null,
          is_public: true,
          shareable_link: crypto.randomUUID()
        })
        .select()
        .single();

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'SummaryDisplay', 
          action: 'publishToLibraryWithMetadata',
          step: 'insertLibraryItem',
          userId: user.id,
          folderId,
          tagCount: tagIds?.length || 0
        });
        ErrorLogger.error(error, { 
          component: 'SummaryDisplay', 
          action: 'publishToLibraryWithMetadata',
          step: 'insertLibraryItem',
          userId: user.id,
          folderId,
          tagCount: tagIds?.length || 0,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint
        });
        showErrorToast(message);
        return { success: false };
      }

      // Verify item was created
      if (!libraryItem || !libraryItem.id) {
        const errorMsg = 'Failed to publish: No item created';
        ErrorLogger.error(new Error(errorMsg), { 
          component: 'SummaryDisplay', 
          action: 'publishToLibraryWithMetadata',
          step: 'verifyItemCreated',
          userId: user.id
        });
        showErrorToast(errorMsg);
        return { success: false };
      }

      // Verify item is actually in database
      const { data: verifyItem, error: verifyError } = await supabase
        .from('user_library_items')
        .select('id, title, created_at')
        .eq('id', libraryItem.id)
        .single();

      if (verifyError || !verifyItem) {
        ErrorLogger.error(verifyError || new Error('Item verification failed'), { 
          component: 'SummaryDisplay', 
          action: 'publishToLibraryWithMetadata',
          step: 'verifyItemInDatabase',
          itemId: libraryItem.id,
          userId: user.id
        });
        showErrorToast('Item published but may not be visible. Please refresh the library page.');
        // Still return success with item ID since item was created
        return { success: true, itemId: libraryItem.id };
      }

      // Add tags if selected
      if (tagIds && tagIds.length > 0) {
        const tagInserts = tagIds.map(tagId => ({
          item_id: libraryItem.id,
          tag_id: tagId
        }));

        const { error: tagError } = await supabase
          .from('item_tags')
          .insert(tagInserts);

        if (tagError) {
          ErrorLogger.error(tagError, { 
            component: 'SummaryDisplay', 
            action: 'publishToLibraryWithMetadata',
            step: 'addTags',
            itemId: libraryItem.id,
            tagIds,
            userId: user.id
          });
          // Don't fail the entire operation if tags fail
        }
      }

      return { success: true, itemId: libraryItem.id };
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'SummaryDisplay', 
        action: 'publishToLibraryWithMetadata',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'SummaryDisplay', 
        action: 'publishToLibraryWithMetadata',
        userId: user.id
      });
      showErrorToast(message);
      return { success: false };
    }
  };

  const createFolderInPublishModal = async () => {
    if (!user || !newFolderNameInput.trim()) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      setCreatingFolder(true);
      const { data, error } = await supabase
        .from('user_folders')
        .insert({
          user_id: user.id,
          name: newFolderNameInput.trim()
        })
        .select()
        .single();

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'SummaryDisplay', 
          action: 'createFolderInPublishModal',
          folderName: newFolderNameInput.trim(),
          userId: user.id
        });
        ErrorLogger.error(error, { 
          component: 'SummaryDisplay', 
          action: 'createFolderInPublishModal',
          folderName: newFolderNameInput.trim(),
          userId: user.id
        });
        showErrorToast(message || t('publish_modal.failed_create_folder'));
        return;
      }

      // Update folders list and select the new folder
      setFolders(prev => [...prev, data]);
      setSelectedFolderId(data.id);
      setNewFolderNameInput('');
      setShowCreateFolderInput(false);
      showSuccessToast(t('publish_modal.folder_created_success'));
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'SummaryDisplay', 
        action: 'createFolderInPublishModal',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'SummaryDisplay', 
        action: 'createFolderInPublishModal',
        userId: user.id
      });
      showErrorToast(message || t('publish_modal.failed_create_folder'));
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleShowPublishModal = () => {
    setShowPublishModal(true);
    setSelectedFolderId('');
    setSelectedTagIds([]);
    setSelectedPredefinedTopics([]);
  };
  const exportAsTxt = () => {
    const content = `${t('summary.document_summary').toUpperCase()}\n${'='.repeat(50)}\n\n${combinedSummary}\n\n\n${t('common.flashcards').toUpperCase()}\n${'='.repeat(50)}\n\n${flashcards.map((card, index) => `${index + 1}. Q: ${card.front}\n   A: ${card.back}`).join('\n\n')}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsPdf = () => {
    const questionLabel = t('flashcards.question');
    const answerLabel = t('flashcards.answer');
    
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">${t('summary.document_summary')}</h1>
        <div style="margin: 20px 0; padding: 15px; background-color: #f8fafc; border-left: 4px solid #2563eb;">
          <p style="white-space: pre-wrap;">${combinedSummary}</p>
        </div>
        
        <h2 style="color: #2563eb; margin-top: 30px;">${t('common.flashcards')}</h2>
        ${flashcards.map((card, index) => `
          <div style="margin: 15px 0; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #fff;">
            <div style="font-weight: bold; color: #1e40af; margin-bottom: 8px;">${questionLabel} ${index + 1}:</div>
            <div style="margin-bottom: 10px;">${card.front}</div>
            <div style="font-weight: bold; color: #059669; margin-bottom: 5px;">${answerLabel}:</div>
            <div>${card.back}</div>
          </div>
        `).join('')}
      </div>
    `;

    const opt = {
      margin: 1,
      filename: `summary-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  if (showOriginalText) {
    return (
      <div className="bg-white rounded-2xl shadow-xl">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-2 rounded-lg">
                <FileSearch className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('summary.original_text')}</h3>
                <p className="text-sm text-gray-500">
                  {t('summary.full_extracted')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => copyToClipboard(originalText, -2)}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition duration-150"
              >
                {copiedIndex === -2 ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span>{t('summary.copy_text')}</span>
              </button>

              <button
                onClick={() => setShowOriginalText(false)}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm text-orange-600 hover:text-orange-800 transition duration-150"
              >
                <X className="h-4 w-4" />
                <span>{t('summary.back_to_summary')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 max-h-96 overflow-y-auto">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
              {originalText && originalText.trim() ? originalText : t('summary.no_original_text')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="bg-white rounded-2xl shadow-xl dark:bg-gray-800 dark:shadow-none">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              medicalMode
                ? 'bg-gradient-to-r from-red-500 to-pink-600 dark:from-red-600 dark:to-pink-700'
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700'
            }`}>
              {medicalMode ? (
                <Stethoscope className="h-5 w-5 text-white" />
              ) : (
                <FileText className="h-5 w-5 text-white" />
              )}
            </div>
            <div> {/* Apply dark mode classes to summary header text */}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {medicalMode ? '🏥 Medical Content Summary' : t('summary.document_summary')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {medicalMode ? (
                  <>
                    {summaryChunks.length} clinical section{summaryChunks.length === 1 ? '' : 's'} processed
                    {medicalScore && (
                      <span className="ml-2">• Medical Score: {medicalScore}/100</span>
                    )}
                  </>
                ) : (
                  `${summaryChunks.length} ${summaryChunks.length === 1 ? t('summary.sections_processed') : t('summary.sections_processed_plural')}`
                )}
              </p>
              
              {/* Topics Display */}
              {topics.length > 0 && (
                <div className="flex items-center space-x-2 mt-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {medicalMode ? '🩺 Medical Specialties:' : t('summary.topics')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {topics.map((topic, index) => (
                      <span
                        key={index}
                        className={`px-2 py-1 text-xs rounded-full ${
                          medicalMode
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        }`}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => copyToClipboard(combinedSummary, -1)}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition duration-150 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
            >
              {copiedIndex === -1 ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span>{t('summary.copy_all')}</span>
            </button>
            
            <button
              onClick={() => setShowOriginalText(true)}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm text-orange-600 hover:text-orange-800 transition duration-150 dark:text-orange-400 dark:hover:text-orange-200"
              title={!originalText || !originalText.trim() ? t('summary.no_original_text_available') : t('summary.view_original_text')}
            >
              <FileSearch className="h-4 w-4" />
              <span>{t('summary.dual_mode')}</span>
            </button>
            
            <div className="flex items-center space-x-2">
              {/* Export Dropdown */}
              <div className="relative group">
                <button className="flex items-center space-x-2 px-3 py-1.5 text-sm text-purple-600 hover:text-purple-800 border border-purple-300 rounded-lg hover:bg-purple-50 transition duration-150 dark:border-purple-600 dark:hover:bg-purple-900 dark:text-purple-400 dark:hover:text-purple-200">
                  <Download className="h-4 w-4" />
                  <span>{t('summary.export')}</span>
                </button>
                
                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 dark:bg-gray-700 dark:border-gray-600 dark:shadow-none">
                  <button
                    onClick={exportAsTxt}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    {t('summary.export_txt')}
                  </button>
                  <button
                    onClick={exportAsPdf}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-lg dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    {t('summary.export_pdf')}
                  </button>
                </div>
              </div>

              {!isSharedView && (
                <button
                  onClick={handleShowPublishModal}
                  disabled={publishing || published}
                  className={`flex items-center space-x-2 px-4 py-2 text-sm rounded-lg transition duration-150 ${
                    published 
                      ? 'text-green-600 bg-green-50 border border-green-200'
                      : medicalMode
                        ? 'text-white bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 disabled:opacity-50 dark:from-red-500 dark:to-pink-500 dark:hover:from-red-600 dark:hover:to-pink-600'
                        : `text-white ${getThemeGradient('ui')} hover:opacity-90 disabled:opacity-50`
                  }`}
                >
                  {publishing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : published ? (
                    <Check className="h-4 w-4" />
                  ) : medicalMode ? (
                    <GraduationCap className="h-4 w-4" />
                  ) : (
                    <BookOpen className="h-4 w-4" />
                  )}
                  <span>
                    {published ? t('summary.published') : publishing ? t('summary.publishing') : medicalMode ? '📚 Save to Medical Library' : t('summary.publish_library')}
                  </span>
                </button>
              )}
            </div>
            
            {!isSharedView && (
              <button
                onClick={onReset}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 transition duration-150 dark:text-blue-400 dark:hover:text-blue-200"
              >
                <RefreshCw className="h-4 w-4" />
                <span>{t('summary.new_document')}</span>
              </button>
            )}
          </div>
        </div>
      </div> {/* Apply dark mode classes to summary content */}
      <div className="p-6 max-h-96 overflow-y-auto dark:text-gray-200">
        {/* Medical Mode Enhanced Summary Display */}
        {medicalMode && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg dark:bg-red-900 dark:border-red-600">
            <div className="flex items-center space-x-2 mb-2">
              <Activity className="h-4 w-4 text-red-600 dark:text-red-300" />
              <span className="font-medium text-red-900 dark:text-red-300">Clinical Summary</span>
            </div>
            <p className="text-sm text-red-800 dark:text-red-200">
              This summary has been optimized for medical education with emphasis on pathophysiology, 
              clinical correlations, and board exam high-yield information.
            </p>
          </div>
        )}
        <div className="text-gray-700 leading-relaxed dark:text-gray-200">
          {combinedSummary.split('\n').map((line, index) => {
            // Skip empty lines (they're handled by spacing in the section headers)
            if (line.trim().length === 0) {
              return null;
            }
            
            // Check if line is a section header (starts with === and ends with ===)
            const isSectionHeader = /^=== .+ ===$/.test(line.trim());
            if (isSectionHeader) {
              const sectionName = line.trim().replace(/^=== | ===$/g, '');
              return (
                <h3
                  key={index}
                  className={`text-xl font-bold mt-6 mb-3 ${getThemeText()}`}
                >
                  {sectionName}
                </h3>
              );
            }
            // Regular bullet point or content line
            return (
              <p key={index} className="mb-2 whitespace-pre-wrap">
                {line}
              </p>
            );
          })}
        </div>
      </div>
      
    </div>

    {/* Publish to Library Modal */}
    {showPublishModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 dark:bg-gray-950 dark:bg-opacity-75">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col dark:bg-gray-800 dark:shadow-none">

          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('publish_modal.publish_to_library')}</h3>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{t('publish_modal.choose_folder_tags')}</p>
            <div className="mt-2 p-2 rounded-lg text-xs flex items-center space-x-2 bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">All published items are PUBLIC and visible to all subscribed users in the community library.</span>
            </div>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Folder Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  <Folder className="h-4 w-4 inline mr-1" />
                  {t('publish_modal.folder_optional')}
                </label>
                <button
                  onClick={() => setShowCreateFolderInput(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center dark:text-blue-400 dark:hover:text-blue-200"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('publish_modal.create_new_folder')}
                </button>
              </div>
              
              {showCreateFolderInput && (
                <div className="mb-2 p-2 bg-blue-50 rounded-lg dark:bg-blue-900">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newFolderNameInput}
                      onChange={(e) => setNewFolderNameInput(e.target.value)}
                      placeholder={t('publish_modal.new_folder_name')}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                      onKeyPress={(e) => e.key === 'Enter' && createFolderInPublishModal()}
                    />
                    <button
                      onClick={createFolderInPublishModal}
                      disabled={creatingFolder}
                      className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50 dark:text-green-400 dark:hover:text-green-200"
                    >
                      {creatingFolder ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateFolderInput(false);
                        setNewFolderNameInput('');
                      }}
                      className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">{t('publish_modal.no_folder')}</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>

            {/* Predefined Topics Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-gray-200">
                <Tag className="h-4 w-4 inline mr-1" />
                {t('publish_modal.suggested_topics')}
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto p-2 bg-gray-50 rounded-lg dark:bg-gray-900">
                {PREDEFINED_TOPICS.map(topic => (
                  <label key={topic} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedPredefinedTopics.includes(topic)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPredefinedTopics(prev => [...prev, topic]);
                        } else {
                          setSelectedPredefinedTopics(prev => prev.filter(t => t !== topic));
                        }
                      }}
                      className="h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded mr-2 flex-shrink-0"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-200">{topic}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                {t('publish_modal.selected_topics_note')}
              </p>
            </div>
            {/* Tag Selection - Required */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  <Tag className="h-4 w-4 inline mr-1" />
                  Tags (for organization) <span className="text-red-600">*</span>
                </label>
                <button
                  onClick={() => setShowCreateTag(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center dark:text-blue-400 dark:hover:text-blue-200"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Private Tag
                </button>
              </div>

              {/* Tag purpose explanation */}
              <div className="mb-2 p-2 rounded-lg text-xs flex items-center space-x-2 bg-blue-50 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>
                  Tags help organize and filter your library items. Select at least one tag to categorize your content.
                </span>
              </div>

              {showCreateTag && (
                <div className="mb-2 p-2 bg-blue-50 rounded-lg dark:bg-blue-900">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="New private tag name"
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                      onKeyPress={(e) => e.key === 'Enter' && createTag()}
                    />
                    <button
                      onClick={createTag}
                      className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateTag(false);
                        setNewTagName('');
                      }}
                      className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">Private tags are for your personal organization only</p>
                </div>
              )}

              {/* Public Tags Section */}
              {tags.filter(t => t.is_public).length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Globe className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                    <span className="text-xs font-semibold text-green-700 dark:text-green-300">Public Tags (Available to All)</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto p-2 bg-green-50 rounded-lg dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    {tags.filter(t => t.is_public).map(tag => (
                      <label key={tag.id} className="flex items-center justify-between hover:bg-green-100 dark:hover:bg-green-900/30 p-1 rounded">
                        <div className="flex items-center flex-1">
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTagIds(prev => [...prev, tag.id]);
                              } else {
                                setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                              }
                            }}
                            className="h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded mr-2 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-200">{tag.name}</span>
                        </div>
                        <Globe className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Private Tags Section */}
              {tags.filter(t => !t.is_public && t.user_id).length > 0 && (
                <div>
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Lock className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Your Private Tags</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto p-2 bg-gray-50 rounded-lg dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                    {tags.filter(t => !t.is_public && t.user_id).map(tag => (
                      <label key={tag.id} className="flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                        <div className="flex items-center flex-1">
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTagIds(prev => [...prev, tag.id]);
                              } else {
                                setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                              }
                            }}
                            className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-200">{tag.name}</span>
                        </div>
                        <Lock className="h-3 w-3 text-gray-400 dark:text-gray-600 flex-shrink-0" />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {tags.length === 0 && (
                <p className="text-xs text-gray-500 italic p-2 dark:text-gray-400">No tags available. Create a private tag or select a predefined topic above.</p>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 flex justify-end space-x-3 flex-shrink-0 dark:border-gray-700">
            <button
              onClick={() => setShowPublishModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition duration-150 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                const totalTags = selectedTagIds.length + selectedPredefinedTopics.length;
                if (totalTags === 0) {
                  showErrorToast('Please select at least one tag or topic before publishing');
                  return;
                }
                handlePublishToLibrary(selectedFolderId || undefined, selectedTagIds);
              }}
              disabled={publishing || (selectedTagIds.length === 0 && selectedPredefinedTopics.length === 0)}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition duration-150 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {publishing ? t('summary.publishing') : t('summary.publish_library')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};