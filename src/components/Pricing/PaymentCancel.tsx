import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export const PaymentCancel: React.FC = () => {
  const navigate = useNavigate();
  const { getThemeGradient } = useTheme();

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-orange-100 dark:bg-orange-900/30 p-6 rounded-full">
            <XCircle className="h-16 w-16 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-4">
          Payment Canceled
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-400 text-center mb-8">
          Your payment was canceled. No charges have been made to your account.
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-6 mb-8">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Need assistance?</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            If you encountered any issues during checkout or have questions about our plans, we're here to help!
          </p>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>• Review our pricing and features</li>
            <li>• Contact support if you need help</li>
            <li>• Try again when you're ready</li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/pricing')}
            className={`w-full ${getThemeGradient('ui')} hover:opacity-90 text-white font-bold py-4 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2`}
          >
            <RefreshCw className="h-5 w-5" />
            <span>Try Again</span>
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Return to Dashboard</span>
          </button>
        </div>

        <div className="mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Questions? Contact us at <a href="mailto:support@example.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@example.com</a>
          </p>
        </div>
      </div>
    </div>
  );
};
