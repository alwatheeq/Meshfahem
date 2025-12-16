import React, { useState, useCallback } from 'react';
import { PromptModal } from '../components/Common/PromptModal';

interface UsePromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  validate?: (value: string) => string | null;
}

export const usePrompt = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    defaultValue: string;
    title: string;
    message?: string;
    placeholder: string;
    confirmText: string;
    cancelText: string;
    validate?: (value: string) => string | null;
    resolve: (value: string | null) => void;
  } | null>(null);

  const prompt = useCallback(
    (
      message: string,
      defaultValue: string = '',
      options?: UsePromptOptions
    ): Promise<string | null> => {
      return new Promise((resolve) => {
        setConfig({
          defaultValue,
          title: options?.title || 'Enter Value',
          message: options?.message || message,
          placeholder: options?.placeholder || 'Enter value',
          confirmText: options?.confirmText || 'Confirm',
          cancelText: options?.cancelText || 'Cancel',
          validate: options?.validate,
          resolve,
        });
        setIsOpen(true);
      });
    },
    []
  );

  const handleConfirm = useCallback(
    (value: string) => {
      if (config) {
        config.resolve(value);
        setIsOpen(false);
        setConfig(null);
      }
    },
    [config]
  );

  const handleCancel = useCallback(() => {
    if (config) {
      config.resolve(null);
      setIsOpen(false);
      setConfig(null);
    }
  }, [config]);

  const PromptModalComponent = config ? (
    <PromptModal
      isOpen={isOpen}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title={config.title}
      message={config.message}
      placeholder={config.placeholder}
      defaultValue={config.defaultValue}
      confirmText={config.confirmText}
      cancelText={config.cancelText}
      validate={config.validate}
    />
  ) : null;

  return {
    prompt,
    PromptModal: PromptModalComponent,
  };
};

