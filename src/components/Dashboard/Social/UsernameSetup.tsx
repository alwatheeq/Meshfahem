import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2, AtSign } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { useDebounce } from '../../../hooks/useDebounce';
import { ErrorLogger } from '../../../utils/errorLogger';

interface UsernameSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (username: string) => void;
}

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export const UsernameSetup: React.FC<UsernameSetupProps> = ({ isOpen, onClose, onSave }) => {
  const { t } = useI18n();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
  } = useTheme();

  const [input, setInput] = useState('');
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const debouncedInput = useDebounce(input, 400);

  // Validate input on change
  useEffect(() => {
    if (!input) {
      setValidationError(null);
      setIsAvailable(null);
      return;
    }
    if (input.length < 3) {
      setValidationError(t('social.username_too_short') || 'Username must be at least 3 characters');
      setIsAvailable(null);
      return;
    }
    if (input.length > 20) {
      setValidationError(t('social.username_too_long') || 'Username must be at most 20 characters');
      setIsAvailable(null);
      return;
    }
    if (!USERNAME_REGEX.test(input)) {
      setValidationError(t('social.username_invalid_chars') || 'Only lowercase letters, numbers, and underscores');
      setIsAvailable(null);
      return;
    }
    setValidationError(null);
  }, [input, t]);

  // Check availability when debounced input changes
  useEffect(() => {
    if (!debouncedInput || validationError || debouncedInput.length < 3) {
      return;
    }
    let cancelled = false;
    const checkAvailability = async () => {
      setChecking(true);
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('username', debouncedInput)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) {
          setIsAvailable(!data);
        }
      } catch (err) {
        ErrorLogger.log(err as Error, { component: 'UsernameSetup', action: 'checkAvailability' });
        if (!cancelled) setIsAvailable(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    checkAvailability();
    return () => { cancelled = true; };
  }, [debouncedInput, validationError]);

  const handleSave = async () => {
    if (!isAvailable || validationError || saving) return;
    setSaving(true);
    try {
      onSave(input);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    setIsAvailable(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const canSave = !!input && !validationError && isAvailable === true && !checking && !saving;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm" />

      <div className={`relative ${getThemeCardBg()} rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-scaleIn border ${getThemeCardBorder()}`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getThemeGradient()} flex items-center justify-center`}>
                <AtSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                  {t('social.set_username') || 'Set Your Username'}
                </h3>
                <p className={`text-sm ${getThemeTextMuted()}`}>
                  {t('social.username_description') || 'Choose a unique username for your profile'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${getThemeTextMuted()}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Input */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${getThemeTextSecondary()}`}>
              {t('social.username') || 'Username'}
            </label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${getThemeTextMuted()}`}>@</span>
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                maxLength={20}
                placeholder="your_username"
                className={`w-full pl-8 pr-10 py-2.5 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm`}
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checking && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                {!checking && isAvailable === true && <Check className="w-4 h-4 text-emerald-500" />}
                {!checking && isAvailable === false && <X className="w-4 h-4 text-red-500" />}
              </div>
            </div>
          </div>

          {/* Status messages */}
          <div className="mb-6 min-h-[24px]">
            {validationError && (
              <div className="flex items-center gap-1.5 text-sm text-red-500">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
            {!validationError && isAvailable === true && (
              <div className="flex items-center gap-1.5 text-sm text-emerald-500">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{t('social.username_available') || 'Username is available!'}</span>
              </div>
            )}
            {!validationError && isAvailable === false && (
              <div className="flex items-center gap-1.5 text-sm text-red-500">
                <X className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{t('social.username_taken') || 'Username is already taken'}</span>
              </div>
            )}
            {!validationError && !isAvailable && !checking && input.length >= 3 && (
              <p className={`text-xs ${getThemeTextMuted()}`}>
                {t('social.username_rules') || '3-20 characters, lowercase letters, numbers, and underscores only'}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-xl border ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={`px-5 py-2 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving') || 'Saving...'}
                </span>
              ) : (
                t('common.save') || 'Save'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
