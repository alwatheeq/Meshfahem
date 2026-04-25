import React, { useState, useRef, useContext } from 'react';
import { useI18n, I18nContext } from '../../contexts/I18nContext';
import { Upload, FileText, Settings, Info, Type, File, AlertCircle, X, Stethoscope, Scan } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { medStudentClient } from '../../utils/medStudentClient';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { useSubscription } from '../../hooks/useSubscription';
import { ErrorLogger } from '../../utils/errorLogger';
import { extractTextFromFile } from '../../utils/fileProcessor';
import type { AcademicsGenerationPreferences, QuizQuestionTypePreference } from '../../utils/academicsGenerationPreferences';
import {
  ALL_QUIZ_QUESTION_TYPES,
  DEFAULT_ACADEMICS_GENERATION_PREFERENCES,
  dashboardHasRunnableOutput,
} from '../../utils/academicsGenerationPreferences';

interface InputFormProps {
  onProcessInput: (
    input: File | string,
    flashcardCount: number,
    fromSummary: boolean,
    medicalMode?: boolean,
    useOCR?: boolean,
    generationPrefs?: AcademicsGenerationPreferences
  ) => void;
}

// Internal component that uses hooks
const InputFormContent: React.FC<InputFormProps> = ({ onProcessInput }) => {
  const [dragActive, setDragActive] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(10);
  const [fromSummary, setFromSummary] = useState(false);
  const [medicalMode, setMedicalMode] = useState(false);
  const [medicalValidation, setMedicalValidation] = useState<{ isValid: boolean; score: number; feedback: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [generationPrefs, setGenerationPrefs] = useState<AcademicsGenerationPreferences>(() => ({
    includeSummary: DEFAULT_ACADEMICS_GENERATION_PREFERENCES.includeSummary,
    includeFlashcards: DEFAULT_ACADEMICS_GENERATION_PREFERENCES.includeFlashcards,
    quizQuestionTypes: [...DEFAULT_ACADEMICS_GENERATION_PREFERENCES.quizQuestionTypes],
  }));
  const [inputMode, setInputMode] = useState<'file' | 'text' | 'ocr'>('file');
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [textInput, setTextInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: 'error' }>({
    show: false,
    message: '',
    type: 'error'
  });
  const { canAccessFeature, trackFeatureUsage } = useFeatureAccess();
  const { hasActiveSubscription } = useSubscription();

  // Auto-dismiss notification
  React.useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  const showNotification = (message: string) => {
    setNotification({ show: true, message, type: 'error' });
  };

  // Validate medical content when text changes
  React.useEffect(() => {
    const validateContent = async () => {
      if (medicalMode && textInput.trim().length > 100) {
        try {
          const validation = await medStudentClient.validateMedicalContent(textInput);
          setMedicalValidation(validation);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          ErrorLogger.error(err, { component: 'InputForm', action: 'validateMedicalContent', textLength: textInput.length });
          setMedicalValidation(null);
        }
      } else {
        setMedicalValidation(null);
      }
    };

    const timeoutId = setTimeout(validateContent, 500); // Debounce validation
    return () => clearTimeout(timeoutId);
  }, [textInput, medicalMode]);

  React.useEffect(() => {
    if (!generationPrefs.includeSummary && fromSummary) {
      setFromSummary(false);
    }
  }, [generationPrefs.includeSummary, fromSummary]);

  const toggleDashboardQuizType = (qt: QuizQuestionTypePreference) => {
    setGenerationPrefs((prev) => {
      const has = prev.quizQuestionTypes.includes(qt);
      const next = has ? prev.quizQuestionTypes.filter((x) => x !== qt) : [...prev.quizQuestionTypes, qt];
      return { ...prev, quizQuestionTypes: next };
    });
  };

  const assertRunnablePrefs = (): boolean => {
    if (!dashboardHasRunnableOutput(generationPrefs)) {
      showNotification(t('dashboard.error_generation_prefs_required'));
      return false;
    }
    return true;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      ErrorLogger.debug('Files dropped', { component: 'InputForm', action: 'handleDrop', fileCount: files.length });
      if (files.length === 1) {
        // Single file: use original flow (pass File to Dashboard)
        handleFile(files[0]).catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          ErrorLogger.error(err, { component: 'InputForm', action: 'handleDrop', fileName: files[0].name });
          showNotification('Error processing file. Please try again.');
        });
      } else {
        // Multiple files: extract and combine
        handleFiles(files);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      ErrorLogger.debug('Files selected', { component: 'InputForm', action: 'handleChange', fileCount: files.length });
      if (files.length === 1) {
        // Single file: use original flow (pass File to Dashboard)
        handleFile(files[0]).catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          ErrorLogger.error(err, { component: 'InputForm', action: 'handleChange', fileName: files[0].name });
          showNotification('Error processing file. Please try again.');
        });
      } else {
        // Multiple files: extract and combine
        handleFiles(files);
      }
    }
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!assertRunnablePrefs()) return;

    if (!hasActiveSubscription()) {
      showNotification('Please subscribe to process files');
      return;
    }

    if (!canAccessFeature('summary_generation')) {
      showNotification('You have used your trial limit for this feature. Please upgrade to continue.');
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    // Validate all files
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        showNotification(`${file.name}: ${t('dashboard.alert_invalid_file_type')}`);
        return;
      }

      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        showNotification(`${file.name}: ${t('dashboard.alert_file_too_large')}`);
        return;
      }
    }

    await trackFeatureUsage('summary_generation');
    
    // Process all files and combine text
    try {
      const extractedTexts: string[] = [];
      
      // Process files sequentially to avoid overwhelming the system
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // Extract text with progress callback (no-op for now, progress handled in Dashboard)
          const extractedData = await extractTextFromFile(file, () => {
            // Progress callback - can be used to update UI if needed
          });
          
          if (extractedData && extractedData.text && extractedData.text.trim()) {
            extractedTexts.push(extractedData.text);
          } else {
            ErrorLogger.warn('No text extracted from file', { 
              component: 'InputForm', 
              action: 'handleFiles', 
              fileName: file.name 
            });
          }
        } catch (fileError) {
          const err = fileError instanceof Error ? fileError : new Error(String(fileError));
          ErrorLogger.error(err, { 
            component: 'InputForm', 
            action: 'handleFiles', 
            fileName: file.name,
            fileIndex: i 
          });
          // Continue with other files even if one fails
          showNotification(`Error processing ${file.name}: ${err.message}`);
        }
      }
      
      if (extractedTexts.length === 0) {
        showNotification('No text could be extracted from the selected files.');
        return;
      }
      
      // Combine all text with double newlines between files
      const combinedText = extractedTexts.join('\n\n');
      
      // Pass combined text as string to onProcessInput
      onProcessInput(combinedText, flashcardCount, fromSummary, medicalMode, false, generationPrefs);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'InputForm', action: 'handleFiles', fileCount: files.length });
      showNotification('Error processing files. Please try again.');
    }
  };

  const handleFile = async (file: File) => {
    try {
      ErrorLogger.debug('Processing single file', { component: 'InputForm', action: 'handleFile', fileName: file.name, fileType: file.type, fileSize: file.size });

      if (!assertRunnablePrefs()) return;

      if (!hasActiveSubscription()) {
        showNotification('Please subscribe to process files');
        return;
      }

      if (!canAccessFeature('summary_generation')) {
        showNotification('You have used your trial limit for this feature. Please upgrade to continue.');
        return;
      }

      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];

      if (!allowedTypes.includes(file.type)) {
        showNotification(t('dashboard.alert_invalid_file_type'));
        return;
      }

      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        showNotification(t('dashboard.alert_file_too_large'));
        return;
      }

      await trackFeatureUsage('summary_generation');
      ErrorLogger.debug('Calling onProcessInput with file', { component: 'InputForm', action: 'handleFile', fileName: file.name });
      onProcessInput(file, flashcardCount, fromSummary, medicalMode, false, generationPrefs);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'InputForm', action: 'handleFile', fileName: file.name });
      showNotification('Error processing file. Please try again.');
    }
  };

  const handleOCRFile = async (file: File) => {
    if (!assertRunnablePrefs()) return;

    if (!hasActiveSubscription()) {
      showNotification('Please subscribe to process images with OCR');
      return;
    }

    if (!canAccessFeature('summary_generation')) {
      showNotification('You have used your trial limit for this feature. Please upgrade to continue.');
      return;
    }

    const allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/bmp',
      'image/tiff',
      'image/gif',
    ];

    if (!allowedImageTypes.includes(file.type)) {
      showNotification('Invalid file type for OCR. Please upload an image (JPG, PNG, BMP, TIFF, GIF).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit for images
      showNotification('File too large. Maximum size is 10MB for images.');
      return;
    }

    await trackFeatureUsage('summary_generation');
    onProcessInput(file, flashcardCount, fromSummary, medicalMode, true, generationPrefs);
  };

  const handleOCRChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleOCRFile(e.target.files[0]);
    }
  };

  const handleOCRDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleOCRFile(e.dataTransfer.files[0]);
    }
  };

  const handleTextSubmit = async () => {
    if (!assertRunnablePrefs()) return;

    if (!hasActiveSubscription()) {
      showNotification('Please subscribe to process text');
      return;
    }

    if (!canAccessFeature('summary_generation')) {
      showNotification('You have used your trial limit for this feature. Please upgrade to continue.');
      return;
    }

    if (!textInput.trim()) {
      showNotification(t('dashboard.alert_empty_text'));
      return;
    }

    if (textInput.trim().length < 100) {
      showNotification(t('dashboard.alert_short_text'));
      return;
    }

    if (textInput.length > 100000) {
      showNotification(t('dashboard.alert_long_text'));
      return;
    }

    // Additional validation for medical mode
    if (medicalMode && medicalValidation && !medicalValidation.isValid) {
      showNotification(`Medical Mode: ${medicalValidation.feedback}`);
      return;
    }

    await trackFeatureUsage('summary_generation');
    onProcessInput(textInput, flashcardCount, fromSummary, medicalMode, false, generationPrefs);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <h2 className={`text-3xl font-bold ${getThemeTextPrimary()}`}>{t('dashboard.process_content')}</h2>
          {medicalMode && (
            <div className="bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full flex items-center space-x-2 border border-red-200 dark:border-red-800">
              <Stethoscope className="h-4 w-4 text-red-700 dark:text-red-400" />
              <span className="text-red-700 dark:text-red-400 text-sm font-medium">{t('dashboard.med_student_mode_label')}</span>
            </div>
          )}
        </div>
        <p className={`text-lg ${getThemeTextSecondary()}`}>
          {t('dashboard.process_desc')}
        </p>
      </div>

      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 ${getThemeCardBorder()}`}>
        {/* Notification */}
        {notification.show && (
          <div className="mb-6 p-4 rounded-lg flex items-center space-x-3 bg-red-50 border border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium flex-1">{notification.message}</span>
            <button
              onClick={() => setNotification(prev => ({ ...prev, show: false }))}
              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        
        {/* Tab Navigation */}
        <div className={`flex mb-6 ${getThemeSubtle('ui')} rounded-lg p-1`}>
          <button
            onClick={() => setInputMode('file')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition duration-150 ${
              inputMode === 'file'
                ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm dark:shadow-none`
                : `${getThemeTextSecondary()} hover:opacity-80`
            }`}
          >
            <File className="h-4 w-4" />
            <span>{t('dashboard.upload_file')}</span>
          </button>
          <button
            onClick={() => setInputMode('text')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition duration-150 ${
              inputMode === 'text'
                ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm dark:shadow-none`
                : `${getThemeTextSecondary()} hover:opacity-80`
            }`}
          >
            <Type className="h-4 w-4" />
            <span>{t('dashboard.paste_text')}</span>
          </button>
          <button
            onClick={() => setInputMode('ocr')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition duration-150 ${
              inputMode === 'ocr'
                ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm dark:shadow-none`
                : `${getThemeTextSecondary()} hover:opacity-80`
            }`}
          >
            <Scan className="h-4 w-4" />
            <span>{t('dashboard.ocr_scan')}</span>
          </button>
        </div>

        {/* File Upload Mode */}
        {inputMode === 'file' && (
          <div
            className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors duration-150 ${
              dragActive
                ? `${getThemeCardBorder()} opacity-60 ${getThemeSubtle('bg')}`
                : `${getThemeCardBorder()} hover:opacity-60 ${getThemeSubtle('bg')} hover:opacity-80`
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,.docx"
              multiple
              onChange={handleChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="space-y-4">
              <div className={`mx-auto w-16 h-16 ${getThemeSubtle('ui')} rounded-full flex items-center justify-center ${getThemeCardBorder()}`}>
                <Upload className={`h-8 w-8 ${getThemeTextPrimary()}`} />
              </div>

              <div>
                <p className={`text-xl font-semibold ${getThemeTextPrimary()} mb-2`}>{t('dashboard.drop_file')}</p>
                <p className={getThemeTextMuted()}>{t('dashboard.supported_files')}</p>
                <p className={`text-sm ${getThemeTextMuted()} mt-1`}>You can select multiple files at once</p>
              </div>

              <div className={`flex justify-center space-x-4 text-sm ${getThemeTextMuted()}`}>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  PDF
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  PPTX
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  DOCX
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OCR Scan Mode */}
        {inputMode === 'ocr' && (
          <div
            className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors duration-150 ${
              dragActive
                ? `${getThemeCardBorder()} opacity-60 ${getThemeSubtle('bg')}`
                : `${getThemeCardBorder()} hover:opacity-60 ${getThemeSubtle('bg')} hover:opacity-80`
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleOCRDrop}
          >
            <input
              ref={ocrFileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.bmp,.tiff,.gif,image/jpeg,image/jpg,image/png,image/bmp,image/tiff,image/gif"
              onChange={handleOCRChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="space-y-4">
              <div className={`mx-auto w-16 h-16 ${getThemeSubtle('ui')} rounded-full flex items-center justify-center ${getThemeCardBorder()}`}>
                <Scan className={`h-8 w-8 ${getThemeTextPrimary()}`} />
              </div>

              <div>
                <p className={`text-xl font-semibold ${getThemeTextPrimary()} mb-2`}>{t('dashboard.ocr_scan_title')}</p>
                <p className={getThemeTextMuted()}>{t('dashboard.ocr_upload_hint')}</p>
              </div>

              <div className={`flex justify-center space-x-4 text-sm ${getThemeTextMuted()}`}>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  JPG
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  PNG
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  BMP
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  TIFF
                </div>
                <div className="flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  GIF
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Text Input Mode */}
        {inputMode === 'text' && (
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>{t('dashboard.paste_content')}</label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t('dashboard.paste_placeholder')}
                className={`w-full h-64 px-4 py-3 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none ${getThemeCardBg()} ${getThemeTextPrimary()}`}
              />
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className={getThemeTextMuted()}>
                {textInput.length.toLocaleString()} {t('dashboard.characters')}
                {textInput.length > 0 && (
                  <span className="ml-2">
                    (~{Math.ceil(textInput.length / 2000)} {t('dashboard.pages')})
                  </span>
                )}
              </span>
              <span className={getThemeTextMuted()}>{t('dashboard.min_characters')} | {t('dashboard.max_characters')}</span>
            </div>

            <button
              onClick={handleTextSubmit}
              disabled={
                textInput.trim().length < 100 ||
                textInput.length > 100000 ||
                (medicalMode && medicalValidation && !medicalValidation.isValid)
              }
              className={`w-full py-3 px-4 text-white rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ${
                medicalMode
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-600'
                  : 'bg-gray-900 hover:bg-gray-800 focus:ring-gray-500 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200'
              }`}
            >
              {medicalMode ? `🩺 ${t('dashboard.process_medical_content')}` : t('dashboard.process_text')}
            </button>

            {/* Medical Validation Feedback */}
            {medicalMode && medicalValidation && textInput.trim().length > 100 && (
              <div className={`mt-3 p-3 rounded-lg border text-sm ${
                medicalValidation.isValid
                  ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200'
                  : 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900 dark:border-orange-700 dark:text-orange-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    medicalValidation.isValid ? 'bg-green-500' : 'bg-orange-500'
                  }`}></div>
                  <span className="font-medium">
                    {t('dashboard.medical_content_score')}: {medicalValidation.score}/100
                  </span>
                </div>
                <p className="mt-1">{medicalValidation.feedback}</p>
              </div>
            )}
          </div>
        )}

        {/* Settings Section */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center space-x-2 ${getThemeTextSecondary()} hover:opacity-80 transition duration-150`}
          >
            <Settings className="h-4 w-4" />
            <span>{t('dashboard.processing_settings')}</span>
          </button>

          <div className={`flex items-center space-x-2 text-sm ${getThemeTextMuted()}`}>
            <Info className="h-4 w-4" />
            <span>{t('dashboard.content_secure')}</span>
          </div>
        </div>

        {showSettings && (
          <div className={`mt-6 p-6 ${getThemeSubtle('bg')} rounded-lg space-y-4 ${getThemeCardBorder()}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>{t('dashboard.flashcard_count')}</label>
                <select
                  value={flashcardCount}
                  onChange={(e) => setFlashcardCount(Number(e.target.value))}
                  className={`w-full px-3 py-2 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                >
                  <option value={10}>10 {t('dashboard.cards')}</option>
                  <option value={20}>20 {t('dashboard.cards')}</option>
                  <option value={30}>30 {t('dashboard.cards')}</option>
                  <option value={40}>40 {t('dashboard.cards')}</option>
                  <option value={50}>50 {t('dashboard.cards')}</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>{t('dashboard.generate_from')}</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={!fromSummary}
                      onChange={() => setFromSummary(false)}
                      className={`h-4 w-4 text-cyan-600 focus:ring-cyan-500 ${getThemeCardBorder()}`}
                    />
                    <span className={`ml-2 text-sm ${getThemeTextSecondary()}`}>{t('dashboard.full_content')}</span>
                  </label>
                  <label className={`flex items-center ${!generationPrefs.includeSummary ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      checked={fromSummary}
                      onChange={() => generationPrefs.includeSummary && setFromSummary(true)}
                      disabled={!generationPrefs.includeSummary}
                      className={`h-4 w-4 text-cyan-600 focus:ring-cyan-500 ${getThemeCardBorder()}`}
                    />
                    <span className={`ml-2 text-sm ${getThemeTextSecondary()}`}>{t('dashboard.summary')}</span>
                  </label>
                </div>
                {!generationPrefs.includeSummary && (
                  <p className={`text-xs mt-1 ${getThemeTextMuted()}`}>{t('dashboard.summary_disabled_hint')}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className={`text-sm font-medium ${getThemeTextSecondary()}`}>{t('dashboard.generation_outputs_title')}</p>
              <label className={`flex items-center gap-2 text-sm ${getThemeTextSecondary()}`}>
                <input
                  type="checkbox"
                  checked={generationPrefs.includeSummary}
                  onChange={(e) =>
                    setGenerationPrefs((p) => ({ ...p, includeSummary: e.target.checked }))
                  }
                  className={`h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 ${getThemeCardBorder()}`}
                />
                {t('dashboard.include_summary')}
              </label>
              <label className={`flex items-center gap-2 text-sm ${getThemeTextSecondary()}`}>
                <input
                  type="checkbox"
                  checked={generationPrefs.includeFlashcards}
                  onChange={(e) =>
                    setGenerationPrefs((p) => ({ ...p, includeFlashcards: e.target.checked }))
                  }
                  className={`h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 ${getThemeCardBorder()}`}
                />
                {t('dashboard.include_flashcards')}
              </label>
              <p className={`text-xs font-medium ${getThemeTextMuted()}`}>{t('dashboard.quiz_types_label')}</p>
              <p className={`text-xs ${getThemeTextMuted()}`}>{t('dashboard.quiz_types_dashboard_hint')}</p>
              <div className="flex flex-wrap gap-3">
                {ALL_QUIZ_QUESTION_TYPES.map((qt) => (
                  <label key={qt} className={`flex items-center gap-1.5 text-xs ${getThemeTextSecondary()}`}>
                    <input
                      type="checkbox"
                      checked={generationPrefs.quizQuestionTypes.includes(qt)}
                      onChange={() => toggleDashboardQuizType(qt)}
                      className={`h-3.5 w-3.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 ${getThemeCardBorder()}`}
                    />
                    {t(`dashboard.quiz_type_${qt}`)}
                  </label>
                ))}
              </div>
            </div>

            <div className={`text-sm rounded-lg p-3 ${
              medicalMode
                ? 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200'
                : `bg-blue-50 border border-blue-200 ${getThemeTextSecondary()} dark:bg-blue-900 dark:border-blue-700`
            }`}>
              <p className="font-medium mb-1">
                {medicalMode ? '🩺 Medical Processing Tips' : t('dashboard.processing_tips')}
              </p>
              <ul className="space-y-1">
                {medicalMode ? (
                  <>
                    <li>• Best for textbooks, lecture notes, clinical cases, and research papers</li>
                    <li>• Include pathophysiology, pharmacology, and clinical correlations</li>
                    <li>• Higher text quality = better board exam-style questions</li>
                    <li>• Medical terminology will be preserved and emphasized</li>
                  </>
                ) : (
                  <>
                    <li>• {t('dashboard.tip_full_content')}</li>
                    <li>• {t('dashboard.tip_summary')}</li>
                    <li>• {t('dashboard.tip_larger_text')}</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Medical Mode Toggle - Compact Version */}
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-md border border-red-200 dark:border-red-800">
                <Stethoscope className="h-5 w-5 text-red-700 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-300">{t('dashboard.medical_student_mode_title')}</h3>
                <p className="text-sm text-red-700 dark:text-red-200">
                  {t('dashboard.medical_student_mode_subtitle')}
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={medicalMode}
                onChange={(e) => setMedicalMode(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-12 h-6 rounded-full transition-colors duration-150 ${
                medicalMode
                  ? 'bg-red-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow transform transition duration-200 ${
                  medicalMode ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </div>
            </label>
          </div>
        </div>
      </div>

    </div>
  );
};

// Wrapper component that checks context availability
export const InputForm: React.FC<InputFormProps> = (props) => {
  // Check if context is available before rendering
  const i18nContext = useContext(I18nContext);
  
  // If context is not available, don't render (this should never happen in normal flow)
  if (!i18nContext) {
    console.warn('InputForm: I18nContext not available, skipping render');
    return null;
  }
  
  // Context is available, render the component
  return <InputFormContent {...props} />;
};