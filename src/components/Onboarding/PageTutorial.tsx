import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { TutorialConfig } from './tutorialConfigs';
import { TutorialStep } from './TutorialStep';

interface PageTutorialProps {
  config: TutorialConfig;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

export const PageTutorial: React.FC<PageTutorialProps> = ({
  config,
  isOpen,
  onClose,
  onComplete,
  onSkip,
}) => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeBorder } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = config.steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const currentStepData = config.steps[currentStep];

  if (!isOpen) return null;

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    onComplete();
    onClose();
    // Reset to first step for next time (if needed)
    setCurrentStep(0);
  };

  const handleSkip = () => {
    onSkip();
    onClose();
    setCurrentStep(0);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Prevent closing by clicking backdrop
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-70 backdrop-blur-md"></div>

      {/* Tutorial Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className={`${getThemeGradient('ui')} p-6 text-white relative`}>
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-all duration-200 group"
            aria-label="Skip Tutorial"
          >
            <X className="h-5 w-5 group-hover:rotate-90 transition-transform duration-200" />
          </button>

          <div className="pr-12">
            <h2 className="text-2xl font-bold mb-1">{config.title}</h2>
            <p className="text-white text-opacity-90 text-sm">
              Learn how to use this page
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <TutorialStep
            step={currentStepData}
            stepNumber={currentStep + 1}
            totalSteps={totalSteps}
          />
        </div>

        {/* Footer with Navigation */}
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Skip Button */}
            <button
              onClick={handleSkip}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium"
            >
              Skip Tutorial
            </button>

            {/* Navigation Buttons */}
            <div className="flex items-center space-x-3">
              {/* Previous Button */}
              {!isFirstStep && (
                <button
                  onClick={handlePrevious}
                  className={`flex items-center space-x-2 px-4 py-2 border ${getThemeBorder()} rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
              )}

              {/* Next/Close Button */}
              <button
                onClick={handleNext}
                className={`flex items-center space-x-2 px-6 py-2 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition-opacity font-semibold shadow-lg`}
              >
                <span>{isLastStep ? 'Close' : 'Next'}</span>
                {!isLastStep && <ChevronRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};


