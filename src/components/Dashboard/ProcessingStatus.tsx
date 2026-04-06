import React, { useContext, useState, useEffect } from 'react';
import { Loader2, Brain, Zap, X, Stethoscope, Heart, Activity, Scan } from 'lucide-react';
import { useI18n, I18nContext } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';

interface ProcessingStatusProps {
  stage: 'uploading' | 'processing';
  progress: number;
  message: string;
  mode: 'fast' | 'staged';
  medicalMode?: boolean;
  medicalScore?: number;
  extractionMethod?: string;
  confidence?: number;
  onReset: () => void;
}

// Informational facts array
const generalFacts = [
  "Did you know that taking breaks while studying can improve memory retention by up to 40%?",
  "Have you ever thought about how spaced repetition helps your brain form stronger neural connections?",
  "Interesting fact: The brain processes visual information 60,000 times faster than text!",
  "Fun fact: Active recall (like flashcards) is 50% more effective than passive reading!",
  "Did you know that writing notes by hand improves comprehension compared to typing?",
  "Have you ever considered that teaching others what you've learned helps solidify your own understanding?",
  "Interesting fact: The spacing effect shows that studying over multiple sessions is more effective than cramming!",
  "Fun fact: Your brain creates new neural pathways every time you learn something new!",
  "Did you know that getting enough sleep is crucial for memory consolidation?",
  "Have you ever thought about how different learning styles can optimize your study sessions?",
  "Interesting fact: The Pomodoro Technique (25-minute study blocks) can boost productivity significantly!",
  "Fun fact: Multitasking while studying can reduce learning efficiency by up to 40%!"
];

const medicalFacts = [
  "Did you know that spaced repetition is especially effective for memorizing medical terminology?",
  "Have you ever thought about how clinical case studies help bridge theory and practice?",
  "Interesting fact: Active recall through flashcards improves long-term retention of medical concepts!",
  "Fun fact: Teaching medical concepts to others helps you understand them at a deeper level!",
  "Did you know that visual learning aids like diagrams can help understand complex pathophysiology?",
  "Have you ever considered that breaking down complex medical topics into smaller chunks improves comprehension?",
  "Interesting fact: Regular review of medical content helps prevent the forgetting curve!",
  "Fun fact: Connecting new medical knowledge to existing concepts creates stronger memory associations!"
];

// Internal component that uses hooks
const ProcessingStatusContent: React.FC<ProcessingStatusProps> = ({
  stage: _stage,
  progress,
  message,
  mode,
  medicalMode = false,
  medicalScore,
  extractionMethod,
  confidence,
  onReset
}) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  
  // Select facts based on medical mode
  const facts = medicalMode ? medicalFacts : generalFacts;
  
  // Rotate facts every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFactIndex((prevIndex) => (prevIndex + 1) % facts.length);
    }, 4000); // 4 seconds
    
    return () => clearInterval(interval);
  }, [facts.length]);
  
  return (
    <div className="max-w-4xl mx-auto"> {/* Apply dark mode classes to main container */}
      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 ${getThemeCardBorder()}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-full border ${
              medicalMode 
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : `${getThemeSubtle('ui')} ${getThemeCardBorder()}`
            }`}>
              {mode === 'fast' ? (
                medicalMode ? <Activity className="h-6 w-6 text-red-700 dark:text-red-400" /> : <Zap className={`h-6 w-6 ${getThemeTextPrimary()}`} />
              ) : (
                medicalMode ? <Stethoscope className="h-6 w-6 text-red-700 dark:text-red-400" /> : <Brain className={`h-6 w-6 ${getThemeTextPrimary()}`} />
              )}
            </div>
            <div> {/* Apply dark mode classes to text */}
              <h3 className={`text-xl font-semibold ${getThemeTextPrimary()}`}>
                {medicalMode ? (
                  mode === 'fast' 
                    ? '🏥 Fast Medical Processing'
                    : '🩺 Comprehensive Medical Analysis'
                ) : (
                  mode === 'fast' ? t('processing.fast_processing') : t('processing.staged_processing')
                )}
              </h3>
              <p className={getThemeTextSecondary()}>
                {medicalMode ? (
                  mode === 'fast' 
                    ? 'Rapid medical content analysis for board exam preparation'
                    : 'In-depth clinical analysis with pathophysiology and differential diagnosis focus'
                ) : (
                  mode === 'fast' ? t('processing.fast_desc') : t('processing.staged_desc')
                )}
              </p>
              {/* OCR Indicator */}
              {extractionMethod === 'OCR' && (
                <div className="flex items-center space-x-2 mt-2">
                  <div className="flex items-center space-x-1">
                    <Scan className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Using OCR to extract text from image
                    </span>
                  </div>
                  {confidence !== undefined && (
                    <div className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                      Confidence: {Math.round(confidence * 100)}%
                    </div>
                  )}
                </div>
              )}
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
            className={`p-2 ${getThemeTextMuted()} hover:opacity-80 transition duration-150`}
            title={t('processing.cancel_processing')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-sm font-medium ${getThemeTextSecondary()}`}>{message}</span>
              <span className={`text-sm ${getThemeTextMuted()}`}>{progress}%</span>
            </div>
            <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-4`}>
              <div className={`h-4 rounded-full transition-colors duration-150 ease-out ${
                medicalMode
                  ? 'bg-red-600'
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
            <div className="text-center max-w-2xl">
              <p className={`text-lg font-medium ${getThemeTextPrimary()} transition-opacity duration-500`}>
                {facts[currentFactIndex]}
              </p>
              <p className={`text-sm ${getThemeTextMuted()} mt-1`}>
                {medicalMode 
                  ? 'Analyzing clinical content with medical education focus'
                  : t('processing.processing_desc')
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrapper component that checks context availability
export const ProcessingStatus: React.FC<ProcessingStatusProps> = (props) => {
  // Check if context is available before rendering
  const i18nContext = useContext(I18nContext);
  
  // If context is not available, don't render (this should never happen in normal flow)
  if (!i18nContext) {
    console.warn('ProcessingStatus: I18nContext not available, skipping render');
    return null;
  }
  
  // Context is available, render the component
  return <ProcessingStatusContent {...props} />;
};