import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight, Home } from 'lucide-react';
import { useSubscription } from '../../hooks/useSubscription';

export const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const { getThemeGradient } = useTheme();
  const [searchParams] = useSearchParams();
  const { refresh } = useSubscription();
  const sessionId = searchParams.get('session_id');
  const isTrial = searchParams.get('trial') === 'true';

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} flex items-center justify-center p-6`}>
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-green-100 dark:bg-green-900/30 p-6 rounded-full">
            <CheckCircle className="h-16 w-16 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-4">
          Welcome Aboard!
        </h1>

        <p className="text-lg text-gray-600 dark:text-gray-400 text-center mb-8">
          Your subscription has been activated successfully. You now have full access to all premium features!
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-6 mb-8">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">What's Next?</h2>
          <ul className="space-y-3">
            {!isTrial && (
              <li className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-gray-300">
                  Your 7-day free trial has started - you won't be charged until it ends
                </span>
              </li>
            )}
            {isTrial && (
              <li className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700 dark:text-gray-300">
                  Your 1-day free trial is active - try each feature once!
                </span>
              </li>
            )}
            <li className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">
                Generate unlimited summaries, flashcards, and quizzes
              </span>
            </li>
            <li className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">
                Save your work to your library for future reference
              </span>
            </li>
            <li className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">
                Join study rooms and collaborate with others
              </span>
            </li>
            <li className="flex items-start space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">
                Track your progress and earn achievements
              </span>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/')}
            className={`w-full ${getThemeGradient('ui')} hover:opacity-90 text-white font-bold py-4 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2`}
          >
            <Home className="h-5 w-5" />
            <span>Start Using the App</span>
            <ArrowRight className="h-5 w-5" />
          </button>

          <button
            onClick={() => navigate('/profile/subscription')}
            className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold py-3 px-6 rounded-lg transition duration-200"
          >
            View Subscription Details
          </button>
        </div>

        {sessionId && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
              Session ID: {sessionId}
            </p>
          </div>
        )}

        <div className="mt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Need help? Contact us at <a href="mailto:support@example.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@example.com</a>
          </p>
        </div>
      </div>
    </div>
  );
};
