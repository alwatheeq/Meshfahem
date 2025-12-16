import React from 'react';
import { Loader2, FileText, Brain, Zap, X, Stethoscope, Heart, Activity } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';

interface ProcessingStatusProps {
  stage: 'uploading' | 'processing';
  progress: number;
  message: string;
  mode: 'fast' | 'staged';
  medicalMode?: boolean;
  medicalScore?: number;
  onReset: () => void;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  stage,
  progress,
  message,
  mode,
  medicalMode = false,
  medicalScore,
  onReset
}) => {
  const { t } = useI18n();
  const { getThemeGradient } = useTheme();
  
  return (
    <div className="max-w-4xl mx-auto"> {/* Apply dark mode classes to main container */}
      <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-full ${
              medicalMode 
                ? 'bg-gradient-to-r from-red-500 to-pink-600 dark:from-red-600 dark:to-pink-700'
                : getThemeGradient('ui')
            }`}>
              {mode === 'fast' ? (
                medicalMode ? <Activity className="h-6 w-6 text-white" /> : <Zap className="h-6 w-6 text-white" />
              ) : (
                medicalMode ? <Stethoscope className="h-6 w-6 text-white" /> : <Brain className="h-6 w-6 text-white" />
              )}
            </div>
            <div> {/* Apply dark mode classes to text */}
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {medicalMode ? (
                  mode === 'fast' 
                    ? '🏥 Fast Medical Processing'
                    : '🩺 Comprehensive Medical Analysis'
                ) : (
                  mode === 'fast' ? t('processing.fast_processing') : t('processing.staged_processing')
                )}
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                {medicalMode ? (
                  mode === 'fast' 
                    ? 'Rapid medical content analysis for board exam preparation'
                    : 'In-depth clinical analysis with pathophysiology and differential diagnosis focus'
                ) : (
                  mode === 'fast' ? t('processing.fast_desc') : t('processing.staged_desc')
                )}
              </p>
              {/* Medical Score Display */}
              {medicalMode && medicalScore && (
                <div className="flex items-center space-x-2 mt-2">
                  <div className="flex items-center space-x-1">
                    <Heart className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      Medical Content Score: {medicalScore}/100
                    </span>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    medicalScore >= 80 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                      : medicalScore >= 65
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {medicalScore >= 80 ? 'Excellent' : medicalScore >= 65 ? 'Good' : 'Fair'}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={onReset}
            className="p-2 text-gray-400 hover:text-gray-600 transition duration-150 dark:text-gray-500 dark:hover:text-gray-300"
            title={t('processing.cancel_processing')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{message}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
              <div className={`h-4 rounded-full transition-all duration-500 ease-out ${
                medicalMode
                  ? 'bg-gradient-to-r from-red-500 to-pink-600'
                  : getThemeGradient('ui')
              }`}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-3 py-8">
            <Loader2 className={`h-8 w-8 animate-spin ${
              medicalMode ? 'text-red-500' : 'text-cyan-500'
            }`} />
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
                {medicalMode ? '🩺 Processing Medical Content' : t('processing.processing_document')}
              </p>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                {medicalMode 
                  ? 'Analyzing clinical content with medical education focus'
                  : t('processing.processing_desc')
                }
              </p>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${
            medicalMode
              ? 'bg-red-50 border-red-200 dark:bg-red-900 dark:border-red-700'
              : 'bg-blue-50 border-blue-200 dark:bg-blue-900 dark:border-blue-700'
          }`}>
            <div className="flex items-start space-x-3">
              {medicalMode ? (
                <Stethoscope className="h-5 w-5 text-red-600 mt-0.5 dark:text-red-300" />
              ) : (
                <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
              )}
              <div className="text-sm"> {/* Apply dark mode classes to text */}
                <p className={`font-medium ${
                  medicalMode ? 'text-red-800 dark:text-red-300' : 'text-blue-800 dark:text-blue-300'
                }`}>
                  {medicalMode ? '🏥 Medical Processing Steps:' : t('processing.whats_happening')}
                </p>
                <ul className={`mt-1 space-y-1 ${
                  medicalMode ? 'text-red-700 dark:text-red-200' : 'text-blue-700 dark:text-blue-200'
                }`}>
                  {medicalMode ? (
                    <>
                      <li>• Analyzing medical terminology and clinical concepts</li>
                      <li>• Generating board exam-focused summaries</li>
                      <li>• Creating clinical scenario flashcards</li>
                      <li>• Detecting medical specialties and topics</li>
                      <li>• Optimizing for pathophysiology understanding</li>
                    </>
                  ) : (
                    <>
                      <li>• {t('processing.extracting_text')}</li>
                      <li>• {t('processing.checking_cache')}</li>
                      <li>• {t('processing.generating_content')}</li>
                      {mode === 'staged' && (
                        <li>• {t('processing.batch_processing')}</li>
                      )}
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};