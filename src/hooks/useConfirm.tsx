import React, { useState, useCallback } from 'react';
import { ConfirmationModal } from '../components/Common/ConfirmationModal';

interface UseConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export const useConfirm = (): {
  confirm: (message: string, options?: UseConfirmOptions) => Promise<boolean>;
  ConfirmModal: JSX.Element | null;
} => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    message: string;
    title: string;
    confirmText: string;
    cancelText: string;
    variant: 'default' | 'destructive';
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (
      message: string,
      options?: UseConfirmOptions
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfig({
          message,
          title: options?.title || 'Confirm Action',
          confirmText: options?.confirmText || 'Confirm',
          cancelText: options?.cancelText || 'Cancel',
          variant: options?.variant || 'default',
          resolve,
        });
        setIsOpen(true);
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (config) {
      config.resolve(true);
      setIsOpen(false);
      setConfig(null);
    }
  }, [config]);

  const handleCancel = useCallback(() => {
    if (config) {
      config.resolve(false);
      setIsOpen(false);
      setConfig(null);
    }
  }, [config]);

  const ConfirmModal = config ? (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      title={config.title}
      message={config.message}
      confirmText={config.confirmText}
      cancelText={config.cancelText}
      variant={config.variant}
    />
  ) : null;

  return {
    confirm,
    ConfirmModal,
  };
};

