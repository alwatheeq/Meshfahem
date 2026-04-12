import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeOnOverlay?: boolean;
}

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
  closeOnOverlay = true,
}) => {
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary } = useTheme();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlay && e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className={`relative w-full ${maxWidthClasses[maxWidth]} ${getThemeCardBg()} rounded-xl shadow-xl border ${getThemeCardBorder()} animate-scaleIn`}
      >
        {title && (
          <div className={`flex items-center justify-between p-5 border-b ${getThemeCardBorder()}`}>
            <h2 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="p-5">{children}</div>

        {footer && (
          <div className={`p-5 border-t ${getThemeCardBorder()}`}>{footer}</div>
        )}
      </div>
    </div>
  );
};
