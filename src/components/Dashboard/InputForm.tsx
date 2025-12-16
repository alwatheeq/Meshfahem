import React, { useState, useRef } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { Upload, FileText, Settings, Info, Type, File, AlertCircle, X, Stethoscope } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { medStudentClient } from '../../utils/medStudentClient';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { useSubscription } from '../../hooks/useSubscription';
import { SubscriptionGuard } from '../Subscription/SubscriptionGuard';
import { ErrorLogger } from '../../utils/errorLogger';

interface InputFormProps {
  onProcessInput: (input: File | string, flashcardCount: number, fromSummary: boolean, medicalMode?: boolean) => void;
}

export const InputForm: React.FC<InputFormProps> = ({ onProcessInput }) => {
  const [dragActive, setDragActive] = useState(false);
  const [flashcardCount, setFlashcardCount] = useState(10);
  const [fromSummary, setFromSummary] = useState(false);
  const [medicalMode, setMedicalMode] = useState(false);
  const [medicalValidation, setMedicalValidation] = useState<{ isValid: boolean; score: number; feedback: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const { t } = useI18n();
  const { getThemeGradient } = useTheme();
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
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
    onProcessInput(file, flashcardCount, fromSummary, medicalMode);
  };

  const handleTextSubmit = async () => {
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
    onProcessInput(textInput, flashcardCount, fromSummary, medicalMode);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('dashboard.process_content')}</h2>
          {medicalMode && (
            <div className="bg-gradient-to-r from-red-500 to-pink-600 px-3 py-1 rounded-full flex items-center space-x-2">
              <Stethoscope className="h-4 w-4 text-white" />
              <span className="text-white text-sm font-medium">Med Student Mode</span>
            </div>
          )}
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          {t('dashboard.process_desc')}
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
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
        <div className="flex mb-6 bg-gray-100 rounded-lg p-1 dark:bg-gray-700">
          <button
            onClick={() => setInputMode('file')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition duration-150 ${
              inputMode === 'file'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100 dark:shadow-none'
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <File className="h-4 w-4" />
            <span>{t('dashboard.upload_file')}</span>
          </button>
          <button
            onClick={() => setInputMode('text')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md transition duration-150 ${
              inputMode === 'text'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100 dark:shadow-none'
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Type className="h-4 w-4" />
            <span>{t('dashboard.paste_text')}</span>
          </button>
        </div>

        {/* File Upload Mode */}
        {inputMode === 'file' && (
          <div
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
              dragActive
                ? 'border-cyan-400 bg-cyan-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-700'
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
              onChange={handleChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="space-y-4">
              <div className={`mx-auto w-16 h-16 ${getThemeGradient('ui')} rounded-full flex items-center justify-center`}>
                <Upload className="h-8 w-8 text-white" />
              </div>

              <div>
                <p className="text-xl font-semibold text-gray-900 mb-2 dark:text-gray-100">{t('dashboard.drop_file')}</p>
                <p className="text-gray-500 dark:text-gray-400">{t('dashboard.supported_files')}</p>
              </div>

              <div className="flex justify-center space-x-4 text-sm text-gray-400">
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

        {/* Text Input Mode */}
        {inputMode === 'text' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">{t('dashboard.paste_content')}</label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t('dashboard.paste_placeholder')}
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                {textInput.length.toLocaleString()} {t('dashboard.characters')}
                {textInput.length > 0 && (
                  <span className="ml-2">
                    (~{Math.ceil(textInput.length / 2000)} {t('dashboard.pages')})
                  </span>
                )}
              </span>
              <span className="text-gray-400">{t('dashboard.min_characters')} | {t('dashboard.max_characters')}</span>
            </div>

            <button
              onClick={handleTextSubmit}
              disabled={
                textInput.trim().length < 100 ||
                textInput.length > 100000 ||
                (medicalMode && medicalValidation && !medicalValidation.isValid)
              }
              className={`w-full py-3 px-4 text-white rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ${
                medicalMode
                  ? 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 focus:ring-red-500 dark:from-red-500 dark:to-pink-500 dark:hover:from-red-600 dark:hover:to-pink-600'
                  : `${getThemeGradient('ui')} hover:opacity-90 focus:ring-2 focus:ring-offset-2`
              }`}
            >
              {medicalMode ? '🩺 Process Medical Content' : t('dashboard.process_text')}
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
                    Medical Content Score: {medicalValidation.score}/100
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
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition duration-150 dark:text-gray-300 dark:hover:text-gray-100"
          >
            <Settings className="h-4 w-4" />
            <span>{t('dashboard.processing_settings')}</span>
          </button>

          <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <Info className="h-4 w-4" />
            <span>{t('dashboard.content_secure')}</span>
          </div>
        </div>

        {showSettings && (
          <div className="mt-6 p-6 bg-gray-50 rounded-xl space-y-4 dark:bg-gray-900">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">{t('dashboard.flashcard_count')}</label>
                <select
                  value={flashcardCount}
                  onChange={(e) => setFlashcardCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value={10}>10 {t('dashboard.cards')}</option>
                  <option value={20}>20 {t('dashboard.cards')}</option>
                  <option value={30}>30 {t('dashboard.cards')}</option>
                  <option value={40}>40 {t('dashboard.cards')}</option>
                  <option value={50}>50 {t('dashboard.cards')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-200">{t('dashboard.generate_from')}</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={!fromSummary}
                      onChange={() => setFromSummary(false)}
                      className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-200">{t('dashboard.full_content')}</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={fromSummary}
                      onChange={() => setFromSummary(true)}
                      className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-200">{t('dashboard.summary')}</span>
                  </label>
                </div>
              </div>
            </div>

            <div className={`text-sm rounded-lg p-3 ${
              medicalMode
                ? 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900 dark:border-red-700 dark:text-red-200'
                : 'bg-blue-50 border border-blue-200 text-gray-600 dark:bg-blue-900 dark:border-blue-700 dark:text-gray-300'
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
        <div className="mt-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-xl dark:from-red-900 dark:to-pink-900 dark:border-red-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-red-500 to-pink-600 p-2 rounded-lg dark:from-red-600 dark:to-pink-700">
                <Stethoscope className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-300">Medical Student Mode</h3>
                <p className="text-sm text-red-700 dark:text-red-200">
                  Enable for medical content with enhanced clinical focus and board exam preparation
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
              <div className={`w-12 h-6 rounded-full transition duration-200 ${
                medicalMode
                  ? 'bg-gradient-to-r from-red-500 to-pink-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition duration-200 ${
                  medicalMode ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </div>
            </label>
          </div>

          {/* Medical Mode Benefits */}
          {medicalMode && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white bg-opacity-50 rounded-lg p-3 dark:bg-gray-800 dark:bg-opacity-50">
                <div className="text-sm font-medium text-red-900 dark:text-red-300">🏥 Board Exam Focus</div>
                <div className="text-xs text-red-700 dark:text-red-200">USMLE/COMLEX style questions</div>
              </div>
              <div className="bg-white bg-opacity-50 rounded-lg p-3 dark:bg-gray-800 dark:bg-opacity-50">
                <div className="text-sm font-medium text-red-900 dark:text-red-300">🧬 Pathophysiology</div>
                <div className="text-xs text-red-700 dark:text-red-200">Mechanism-based learning</div>
              </div>
              <div className="bg-white bg-opacity-50 rounded-lg p-3 dark:bg-gray-800 dark:bg-opacity-50">
                <div className="text-sm font-medium text-red-900 dark:text-red-300">🩺 Clinical Scenarios</div>
                <div className="text-xs text-red-700 dark:text-red-200">Real-world case applications</div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};