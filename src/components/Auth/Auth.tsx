import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, BookOpen, Mail, Shield } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { LanguageToggle } from '../LanguageToggle';

export const Auth: React.FC = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const { t } = useI18n();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const { getThemeGradient } = useTheme();

  const handleSubmit = async (e: React.FormEvent, isRetry: boolean = false) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setSuccess(t('auth.signup_success_message'));
        setRetryAttempts(0);
        setEmail('');
        setPassword('');
      } else {
        await signIn(email, password);
        setRetryAttempts(0);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('auth.authentication_failed');

      // Check if it's a database error during signup
      if (isSignUp && errorMessage.toLowerCase().includes('database')) {
        if (isRetry) {
          setError('Signup is temporarily unavailable. Please try again in a few moments.');
        } else {
          setError('There was a temporary issue creating your account. Would you like to retry?');
        }
        setRetryAttempts(prev => prev + 1);
      } else {
        setError(errorMessage);
        setRetryAttempts(0);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setError(error instanceof Error ? error.message : t('auth.google_sign_in_failed'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative">
      <div className="absolute top-6 right-6">
        <LanguageToggle />
      </div>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center items-center space-x-2 mb-4">
            <div className={`${getThemeGradient('ui')} p-3 rounded-xl`}>
              <FileText className="h-8 w-8 text-white" /> 
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('app_name')}</h1>
          </div>
          <p className="text-gray-600">
            {t('auth.title')}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
              {retryAttempts > 0 && retryAttempts < 3 && isSignUp && (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={loading}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 underline disabled:opacity-50"
                >
                  Retry Sign-Up
                </button>
              )}
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 text-sm font-medium">{success}</p>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>{t('auth.continue_with_google')}</span>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t('auth.or_continue_with_email')}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('auth.email_address')}</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-400"
                disabled={loading}
                placeholder={t('auth.enter_email')}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('auth.password')}</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-150 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-400"
                disabled={loading}
                placeholder={t('auth.enter_password')}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white ${getThemeGradient('ui')} hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 transition duration-150`}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  isSignUp ? t('auth.sign_up') : t('auth.sign_in')
                )}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setSuccess(null);
                }}
                className="text-blue-600 hover:text-blue-500 text-sm font-medium transition duration-150 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {isSignUp ? t('auth.have_account') : t('auth.need_account')}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center space-x-4 mt-6">
            <div className="flex items-center">
              <BookOpen className="h-4 w-4 mr-1" />
              <span>{t('auth.pages_per_month')}</span>
            </div>
            <div className="flex items-center">
              <FileText className="h-4 w-4 mr-1" />
              <span>{t('auth.supported_formats')}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => navigate('/admin/login')}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition duration-150"
          >
            <Shield className="h-4 w-4" />
            <span>Admin Access</span>
          </button>
        </div>
      </div>
    </div>
  );
};