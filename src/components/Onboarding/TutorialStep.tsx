import React from 'react';
import { TutorialStep as TutorialStepType } from './tutorialConfigs';
import { useTheme } from '../../contexts/ThemeContext';

interface TutorialStepProps {
  step: TutorialStepType;
  stepNumber: number;
  totalSteps: number;
  stepLabel?: string;
}

export const TutorialStep: React.FC<TutorialStepProps> = ({
  step,
  stepNumber,
  totalSteps,
  stepLabel,
}) => {
  const { getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSolid, getThemeSubtle } = useTheme();
  const progressText = stepLabel ?? `Step ${stepNumber} of ${totalSteps}`;
  return (
    <div className="space-y-4">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-sm font-medium ${getThemeTextMuted()}`}>
          {progressText}
        </span>
        <div className="flex space-x-1">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-colors duration-150 ${
                index + 1 <= stepNumber
                  ? `${getThemeSolid('ui')} w-6`
                  : `${getThemeSubtle('ui')} w-1.5`
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step Title */}
      <h3 className={`text-xl font-bold ${getThemeTextPrimary()}`}>
        {step.title}
      </h3>

      {/* Step Content */}
      <p className={`${getThemeTextSecondary()} leading-relaxed`}>
        {step.content}
      </p>
    </div>
  );
};


