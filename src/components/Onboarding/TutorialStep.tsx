import React from 'react';
import { TutorialStep as TutorialStepType } from './tutorialConfigs';

interface TutorialStepProps {
  step: TutorialStepType;
  stepNumber: number;
  totalSteps: number;
}

export const TutorialStep: React.FC<TutorialStepProps> = ({
  step,
  stepNumber,
  totalSteps,
}) => {
  return (
    <div className="space-y-4">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Step {stepNumber} of {totalSteps}
        </span>
        <div className="flex space-x-1">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index + 1 <= stepNumber
                  ? 'bg-blue-600 dark:bg-blue-400 w-6'
                  : 'bg-gray-300 dark:bg-gray-600 w-1.5'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step Title */}
      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
        {step.title}
      </h3>

      {/* Step Content */}
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        {step.content}
      </p>
    </div>
  );
};


