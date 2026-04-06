import React from 'react';
import { X, Crown, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';

interface PersistentSubscriptionModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  featureName: string;
  featureTitle: string;
  benefits: string[];
}

export const PersistentSubscriptionModal: React.FC<PersistentSubscriptionModalProps> = ({
  isOpen,
  onDismiss,
  featureName: _featureName,
  featureTitle,
  benefits
}) => {
  const navigate = useNavigate();
  const { t: _t } = useI18n();
  const { getThemeGradient: _getThemeGradient } = useTheme();

  if (!isOpen) return null;

  const handleViewPlans = () => {
    onDismiss();
    navigate('/pricing');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black bg-opacity-70 backdrop-blur-md"></div>

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-lg max-w-lg w-full overflow-hidden animate-scaleIn border border-gray-100 dark:border-gray-700">
        <div className="bg-gray-900 dark:bg-gray-100 p-6 text-white dark:text-gray-900 relative">
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors duration-150 group"
            aria-label="Close"
          >
            <X className="h-5 w-5 group-hover:rotate-90 transition-transform duration-200" />
          </button>

          <div className="flex items-center space-x-3 mb-2">
            <div className="bg-white bg-opacity-20 p-3 rounded-md backdrop-blur-sm">
              <Crown className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Upgrade to Premium</h2>
              <p className="text-white text-opacity-90 text-sm">Unlock unlimited access</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                {featureTitle}
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              This feature requires a premium subscription. Upgrade now to unlock this and many other powerful features.
            </p>
          </div>

          <div className="space-y-3 mb-6">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Premium includes:
            </p>
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{benefit}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col space-y-3">
            <button
              onClick={handleViewPlans}
              className="w-full py-3 px-4 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-md font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors duration-150 shadow flex items-center justify-center space-x-2"
            >
              <span>View Plans & Pricing</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-2 px-4 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition text-sm font-medium"
            >
              Maybe Later
            </button>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-3 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cancel anytime • Secure payment • 24/7 support
          </p>
        </div>
      </div>

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
