import React from 'react';
import { X, AlertCircle } from 'lucide-react';

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditsRemaining?: number;
  cycleEnd?: string;
}

export const InsufficientCreditsModal: React.FC<InsufficientCreditsModalProps> = ({
  isOpen,
  onClose,
  creditsRemaining = 0,
  cycleEnd
}) => {
  if (!isOpen) return null;

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'soon';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'soon';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-lg max-w-md w-full p-6 relative">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon */}
          <div className="flex items-center justify-center mb-4">
            <div className="bg-red-100 dark:bg-red-900/20 rounded-full p-3">
              <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
            Insufficient Credits
          </h2>

          {/* Message */}
          <div className="text-center space-y-4 mb-6">
            <p className="text-gray-700 dark:text-gray-300">
              You don't have enough credits to complete this action.
            </p>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Current Balance
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {creditsRemaining.toLocaleString()} credits
              </p>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your credits will refresh on{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {formatDate(cycleEnd)}
              </span>
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};
