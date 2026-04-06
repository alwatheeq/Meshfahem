import React from 'react';
import { Move } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useI18n } from '../../../contexts/I18nContext';

interface FreeFormToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  compact?: boolean;
}

export const FreeFormToggle: React.FC<FreeFormToggleProps> = ({
  enabled,
  onToggle,
  compact = false
}) => {
  const { getThemeTextSecondary } = useTheme();
  const { t } = useI18n();

  return (
    <div className="relative group">
      <button
        onClick={() => onToggle(!enabled)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${
          enabled
            ? 'border-gray-700 dark:border-gray-200 bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900'
            : `border-gray-200 dark:border-gray-700 ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5`
        }`}
        title={enabled
          ? (t('free_form.disable') || 'Disable Free-Form Mode')
          : (t('free_form.enable') || 'Enable Free-Form Mode')}
      >
        <Move className="h-3.5 w-3.5" />
        {!compact && (
          <span className="text-sm font-medium">
            {t('free_form.available') || 'Free-Form'}
          </span>
        )}
        {/* Pill indicator */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors ${
          enabled
            ? 'bg-white/20 text-white dark:bg-black/10 dark:text-gray-900'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
        }`}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>

      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 text-white text-xs rounded-xl py-2 px-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 shadow-lg pointer-events-none">
        <p className="font-semibold mb-1 flex items-center gap-1.5">
          <Move className="h-3 w-3" />
          <span>{t('free_form.available') || 'Free-Form Mode'}</span>
        </p>
        <p className="text-gray-300 leading-relaxed">
          {t('free_form.tooltip') || 'Arrange widgets freely on your screen. Perfect for multi-tasking and custom layouts.'}
        </p>
      </div>
    </div>
  );
};
