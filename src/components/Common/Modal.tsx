import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  showCloseButton = true,
  closeOnBackdrop = true,
  className = '',
}) => {
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary } = useTheme();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm" />

      <div
        className={`relative ${getThemeCardBg()} ${getThemeCardBorder()} border rounded-xl shadow-lg ${sizeClasses[size]} w-full overflow-hidden animate-scaleIn ${className}`}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 pb-0">
            {title && (
              <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                {title}
              </h3>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors ml-auto"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            )}
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};
