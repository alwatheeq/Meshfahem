import React, { useState, useEffect } from 'react';
import { MessageSquare, Lightbulb, Upload, X, Video, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { useTheme } from '../../contexts/ThemeContext';

interface UploadedFile {
  file: File;
  preview: string;
  type: 'image' | 'video';
}

export const FeedbackPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { t: _t } = useI18n();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('feedback');
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [activeTab, setActiveTab] = useState<'feedback' | 'suggestion'>('feedback');
  const [feedbackText, setFeedbackText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const maxFiles = 5;
  const maxImageSize = 5 * 1024 * 1024;
  const maxVideoSize = 50 * 1024 * 1024;
  const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const acceptedVideoTypes = ['video/mp4', 'video/mov', 'video/webm'];

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, showTutorial]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadedFile[] = [];

    Array.from(files).forEach((file) => {
      if (uploadedFiles.length + newFiles.length >= maxFiles) {
        const errorMsg = `Maximum ${maxFiles} files allowed`;
        setErrorMessage(errorMsg);
        showErrorToast(errorMsg);
        return;
      }

      const isImage = acceptedImageTypes.includes(file.type);
      const isVideo = acceptedVideoTypes.includes(file.type);

      if (!isImage && !isVideo) {
        const errorMsg = 'Only images (JPG, PNG, GIF, WebP) and videos (MP4, MOV, WebM) are allowed';
        setErrorMessage(errorMsg);
        showErrorToast(errorMsg);
        return;
      }

      if (isImage && file.size > maxImageSize) {
        const errorMsg = 'Image files must be less than 5MB';
        setErrorMessage(errorMsg);
        showErrorToast(errorMsg);
        return;
      }

      if (isVideo && file.size > maxVideoSize) {
        const errorMsg = 'Video files must be less than 50MB';
        setErrorMessage(errorMsg);
        showErrorToast(errorMsg);
        return;
      }

      const preview = URL.createObjectURL(file);
      newFiles.push({
        file,
        preview,
        type: isImage ? 'image' : 'video'
      });
    });

    if (newFiles.length > 0) {
      setUploadedFiles([...uploadedFiles, ...newFiles]);
      setErrorMessage('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    const newFiles = [...uploadedFiles];
    URL.revokeObjectURL(newFiles[index].preview);
    newFiles.splice(index, 1);
    setUploadedFiles(newFiles);
  };

  const uploadFilesToStorage = async (): Promise<string[]> => {
    if (isOffline()) {
      handleOfflineError(showErrorToast);
      throw new Error('You are currently offline. Please check your connection and try again.');
    }

    const uploadedUrls: string[] = [];

    for (const fileData of uploadedFiles) {
      const sanitizedFileName = fileData.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${user!.id}/${Date.now()}_${sanitizedFileName}`;

      try {
        const { data, error } = await supabase.storage
          .from('feedback-media')
          .upload(fileName, fileData.file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          const message = handleSupabaseError(error, { 
            component: 'FeedbackPage', 
            action: 'uploadFilesToStorage',
            fileName: fileData.file.name,
            filePath: fileName
          });
          ErrorLogger.error(error, { 
            component: 'FeedbackPage', 
            action: 'uploadFilesToStorage',
            fileName: fileData.file.name,
            filePath: fileName,
            userId: user!.id
          });
          throw new Error(message);
        }

        if (!data) {
          const errorMsg = `Upload succeeded but no data returned for ${fileData.file.name}`;
          ErrorLogger.error(new Error(errorMsg), { 
            component: 'FeedbackPage', 
            action: 'uploadFilesToStorage',
            fileName: fileData.file.name
          });
          throw new Error(errorMsg);
        }

        const { data: urlData } = supabase.storage
          .from('feedback-media')
          .getPublicUrl(data.path);

        uploadedUrls.push(urlData.publicUrl);
      } catch (err) {
        const message = handleApiError(err, { 
          component: 'FeedbackPage', 
          action: 'uploadFilesToStorage',
          fileName: fileData.file.name
        });
        ErrorLogger.error(err, { 
          component: 'FeedbackPage', 
          action: 'uploadFilesToStorage',
          fileName: fileData.file.name
        });
        throw new Error(message);
      }
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      showErrorToast('You must be logged in to submit feedback');
      return;
    }

    if (!feedbackText.trim()) {
      showErrorToast('Please enter your feedback or suggestion');
      return;
    }

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      let mediaUrls: string[] = [];

      if (uploadedFiles.length > 0) {
        try {
          mediaUrls = await uploadFilesToStorage();
        } catch (uploadError) {
          const message = handleApiError(uploadError, { 
            component: 'FeedbackPage', 
            action: 'handleSubmit',
            step: 'fileUpload'
          });
          showErrorToast(message);
          setSubmitStatus('error');
          return;
        }
      }

      const { error: dbError } = await supabase
        .from('user_feedback')
        .insert({
          user_id: user.id,
          feedback_type: activeTab,
          feedback_text: feedbackText,
          media_urls: mediaUrls,
          user_email: user.email || 'unknown@email.com'
        });

      if (dbError) {
        const message = handleSupabaseError(dbError, { 
          component: 'FeedbackPage', 
          action: 'handleSubmit',
          step: 'databaseInsert'
        });
        ErrorLogger.error(dbError, { 
          component: 'FeedbackPage', 
          action: 'handleSubmit',
          step: 'databaseInsert',
          userId: user.id
        });
        showErrorToast(message);
        setSubmitStatus('error');
        return;
      }

      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback-email`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            feedbackType: activeTab,
            feedbackText: feedbackText,
            mediaUrls: mediaUrls,
            userEmail: user.email || 'unknown@email.com'
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          ErrorLogger.error(new Error(`Email notification failed: ${response.status}`), { 
            component: 'FeedbackPage', 
            action: 'handleSubmit',
            step: 'emailNotification',
            status: response.status,
            errorText
          });
          // Non-blocking: feedback was saved, just email failed
        }
      } catch (emailError) {
        ErrorLogger.error(emailError, { 
          component: 'FeedbackPage', 
          action: 'handleSubmit',
          step: 'emailNotification'
        });
        // Non-blocking: feedback was saved, just email failed
      }

      setSubmitStatus('success');
      showSuccessToast(`Thank you! Your ${activeTab} has been submitted successfully.`);
      setFeedbackText('');
      uploadedFiles.forEach(file => URL.revokeObjectURL(file.preview));
      setUploadedFiles([]);

      setTimeout(() => {
        setSubmitStatus('idle');
      }, 5000);

    } catch (error) {
      const message = handleApiError(error, { 
        component: 'FeedbackPage', 
        action: 'handleSubmit'
      });
      ErrorLogger.error(error, { 
        component: 'FeedbackPage', 
        action: 'handleSubmit',
        userId: user.id
      });
      showErrorToast(message);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className={`text-3xl font-bold ${getThemeTextPrimary()} mb-2`}>
          Feedback & Suggestions
        </h2>
        <p className={`text-lg ${getThemeTextSecondary()}`}>
          Help us improve by sharing your thoughts and ideas
        </p>
      </div>

      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm overflow-hidden dark:shadow-none`}>
        <div className={`flex border-b ${getThemeCardBorder()}`}>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'feedback'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-900 dark:text-blue-300'
                : `${getThemeTextSecondary()} hover:opacity-80 hover:opacity-60`
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>Feedback</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('suggestion')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'suggestion'
                ? 'bg-green-50 text-green-700 border-b-2 border-green-600 dark:bg-green-900 dark:text-green-300'
                : `${getThemeTextSecondary()} hover:opacity-80 hover:opacity-60`
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Lightbulb className="h-5 w-5" />
              <span>Suggestion</span>
            </div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>
              {activeTab === 'feedback' ? 'Your Feedback' : 'Your Suggestion'}
              <span className="text-red-500 ml-1">*</span>
            </label>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder={
                activeTab === 'feedback'
                  ? 'Tell us about your experience, report bugs, or share what you think...'
                  : 'Share your ideas for new features or improvements...'
              }
              className={`w-full px-4 py-3 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${getThemeCardBg()} ${getThemeTextPrimary()}`}
              rows={8}
              maxLength={2000}
              disabled={isSubmitting}
            />
            <div className="flex justify-between mt-2">
              <p className={`text-sm ${getThemeTextMuted()}`}>
                {activeTab === 'feedback' ? 'Describe any issues or feedback' : 'Describe your suggestion in detail'}
              </p>
              <p className={`text-sm ${getThemeTextMuted()}`}>
                {feedbackText.length}/2000
              </p>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>
              Attach Images or Videos (Optional)
            </label>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900'
                  : `${getThemeCardBorder()} hover:opacity-60`
              }`}
            >
              <Upload className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-4`} />
              <p className={`${getThemeTextSecondary()} mb-2`}>
                Drag and drop files here, or click to browse
              </p>
              <p className={`text-sm ${getThemeTextMuted()}`}>
                Images (JPG, PNG, GIF, WebP) up to 5MB • Videos (MP4, MOV, WebM) up to 50MB
              </p>
              <p className={`text-xs ${getThemeTextMuted()} mt-1`}>
                Maximum {maxFiles} files
              </p>
              <input
                type="file"
                multiple
                accept={[...acceptedImageTypes, ...acceptedVideoTypes].join(',')}
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                id="file-upload"
                disabled={isSubmitting}
              />
              <label
                htmlFor="file-upload"
                className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition duration-150"
              >
                Browse Files
              </label>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {uploadedFiles.map((fileData, index) => (
                  <div key={index} className="relative group">
                    <div className={`aspect-square rounded-lg overflow-hidden ${getThemeSubtle('ui')}`}>
                      {fileData.type === 'image' ? (
                        <img
                          src={fileData.preview}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className={`h-12 w-12 ${getThemeTextMuted()}`} />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <p className={`text-xs ${getThemeTextMuted()} mt-1 truncate`}>
                      {fileData.file.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900 dark:border-red-700">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-300" />
              <p className="text-red-700 text-sm dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          {submitStatus === 'success' && (
            <div className="flex items-center space-x-2 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900 dark:border-green-700">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-300" />
              <p className="text-green-700 text-sm dark:text-green-300">
                Thank you! Your {activeTab} has been submitted successfully.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <p className={`text-sm ${getThemeTextMuted()}`}>
              <span className="text-red-500">*</span> Required field
            </p>
            <button
              type="submit"
              disabled={isSubmitting || !feedbackText.trim()}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition duration-150 ${
                activeTab === 'feedback'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-800'
                  : 'bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span>Submit {activeTab === 'feedback' ? 'Feedback' : 'Suggestion'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 bg-blue-50 rounded-md p-6 dark:bg-blue-900">
        <h3 className="text-lg font-semibold text-blue-900 mb-2 dark:text-blue-300">
          What happens next?
        </h3>
        <ul className="space-y-2 text-blue-800 text-sm dark:text-blue-200">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>Your {activeTab} will be reviewed by our team</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>We appreciate all feedback and suggestions to improve the app</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>You may receive a follow-up if we need additional information</span>
          </li>
        </ul>
      </div>

      {/* Feedback Tutorial */}
      {tutorialConfig && (
        <PageTutorial
          config={tutorialConfig}
          isOpen={isTutorialOpen}
          onClose={() => {}}
          onComplete={completeTutorial}
          onSkip={skipTutorial}
        />
      )}
    </div>
  );
});
