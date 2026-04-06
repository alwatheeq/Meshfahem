import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { adminHelpers } from '../../utils/adminHelpers';
import { Shield, Mail, Lock, AlertCircle } from 'lucide-react';
import { handleApiError, handleSupabaseError, isOffline } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const { signIn, signOut, user } = useAuth();
  const { getThemeGradient } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkedExistingSession, setCheckedExistingSession] = useState(false);

  // Check for existing session on mount
  React.useEffect(() => {
    const checkExistingSession = async () => {
      if (checkedExistingSession) return;

      setCheckedExistingSession(true);

      if (user) {
        ErrorLogger.debug('Existing session detected on page load', { 
          component: 'AdminLogin', 
          action: 'checkExistingSession', 
          userId: user.id,
          metadata: { userRole: user.role }
        });

        // If already an admin, redirect to dashboard
        if (user.role === 'admin') {
          ErrorLogger.info('Admin session detected, redirecting to dashboard', { component: 'AdminLogin', action: 'checkExistingSession', userId: user.id });
          navigate('/admin/dashboard', { replace: true });
        } else {
          // If a regular user is logged in, sign them out
          ErrorLogger.warn('Regular user session detected on admin login page', { component: 'AdminLogin', action: 'checkExistingSession', userId: user.id });
          ErrorLogger.debug('Signing out regular user - admin portal requires admin account', { component: 'AdminLogin', action: 'checkExistingSession', userId: user.id });
          await signOut();
          setError('You were signed out. Admin portal requires an admin account.');
          setTimeout(() => setError(''), 4000);
        }
      }
    };

    checkExistingSession();
  }, [user, navigate, signOut, checkedExistingSession]);

  // This effect handles post-login admin verification
  // It only runs after initial session check is complete and user changes
  const [loginAttempted, setLoginAttempted] = useState(false);

  React.useEffect(() => {
    const checkAdminAccess = async () => {
      // Only run if we've checked existing session and this is from a login attempt
      if (!user || !checkedExistingSession || !loginAttempted) return;

      ErrorLogger.debug('Verifying admin access after login attempt', { 
        component: 'AdminLogin', 
        action: 'checkAdminAccess', 
        userId: user.id,
        metadata: { userEmail: user.email, userRole: user.role }
      });

      if (user.role === 'admin') {
        ErrorLogger.info('Admin role confirmed from admin_users table', { component: 'AdminLogin', action: 'checkAdminAccess', userId: user.id });

        // Update last_login_at timestamp
        try {
          await adminHelpers.updateLastLogin(user.id);
          ErrorLogger.debug('Updated last_login_at timestamp', { component: 'AdminLogin', action: 'updateLastLogin', userId: user.id });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          handleSupabaseError(error, { component: 'AdminLogin', action: 'updateLastLogin', userId: user.id });
          ErrorLogger.error(error, { component: 'AdminLogin', action: 'updateLastLogin', userId: user.id });
        }

        // Log successful admin login
        try {
          await adminHelpers.logLoginAttempt(user.email, true, user.id);
          ErrorLogger.debug('Logged successful admin login attempt', { component: 'AdminLogin', action: 'logLoginAttempt', userId: user.id });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          handleSupabaseError(error, { component: 'AdminLogin', action: 'logLoginAttempt', userId: user.id });
          ErrorLogger.error(error, { component: 'AdminLogin', action: 'logLoginAttempt', userId: user.id });
        }

        ErrorLogger.debug('Navigating to /admin/dashboard', { component: 'AdminLogin', action: 'checkAdminAccess', userId: user.id });
        setLoginAttempted(false); // Reset for next attempt
        navigate('/admin/dashboard', { replace: true });
      } else {
        ErrorLogger.warn('Non-admin user detected after login', { 
          component: 'AdminLogin', 
          action: 'checkAdminAccess', 
          userId: user.id 
        });
        const accessError = new Error('User not found in admin_users table or inactive');
        ErrorLogger.warn(accessError.message, { 
          component: 'AdminLogin', 
          action: 'checkAdminAccess', 
          userId: user.id 
        });
        setError('Access denied. This account is not registered as an admin. Only authorized administrators can access this portal.');

        // Log failed admin access attempt (authenticated but not admin)
        try {
          await adminHelpers.logLoginAttempt(
            user.email,
            false,
            user.id,
            'User authenticated but not in admin_users table or inactive'
          );
          ErrorLogger.debug('Logged non-admin access attempt', { component: 'AdminLogin', action: 'logLoginAttempt-failed', userId: user.id });
        } catch (logErr) {
          const error = logErr instanceof Error ? logErr : new Error(String(logErr));
          handleSupabaseError(error, { component: 'AdminLogin', action: 'logLoginAttempt-failed', userId: user.id });
          ErrorLogger.error(error, { component: 'AdminLogin', action: 'logLoginAttempt-failed', userId: user.id });
        }

        // CRITICAL: Sign out non-admin users immediately
        // This prevents them from being logged in as regular users
        ErrorLogger.debug('Signing out non-admin user to prevent regular user access', { component: 'AdminLogin', action: 'checkAdminAccess', userId: user.id });
        await supabase.auth.signOut();

        setLoading(false);
        setLoginAttempted(false); // Reset for next attempt

        // Clear error after 5 seconds and allow retry
        setTimeout(() => {
          setError('');
        }, 5000);
      }
    };

    checkAdminAccess();
  }, [user, navigate, checkedExistingSession, loginAttempted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isOffline()) {
      const errorMessage = 'No internet connection. Please check your network and try again.';
      ErrorLogger.warn('Offline detected', { 
        component: 'AdminLogin', 
        action: 'handleSubmit', 
        metadata: { email } 
      });
      setError(errorMessage);
      setLoading(false);
      return;
    }

    try {
      ErrorLogger.debug('Attempting to sign in', { 
        component: 'AdminLogin', 
        action: 'handleSubmit', 
        metadata: { email } 
      });
      await signIn(email, password);
      ErrorLogger.debug('Sign in successful, waiting for auth state to update', { 
        component: 'AdminLogin', 
        action: 'handleSubmit', 
        metadata: { email } 
      });

      // Set flag to indicate this is from a login attempt
      setLoginAttempted(true);

      // The useEffect will handle admin verification and navigation once user state is updated
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = handleApiError(error, { 
        component: 'AdminLogin', 
        action: 'handleSubmit', 
        metadata: { email } 
      });
      ErrorLogger.error(error, { 
        component: 'AdminLogin', 
        action: 'handleSubmit', 
        metadata: { email } 
      });

      // Log failed login attempt
      try {
        await adminHelpers.logLoginAttempt(email, false, undefined, errorMessage || error.message);
        ErrorLogger.debug('Logged failed login attempt', { 
          component: 'AdminLogin', 
          action: 'handleSubmit', 
          metadata: { email } 
        });
      } catch (logErr) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        handleSupabaseError(logError, { 
          component: 'AdminLogin', 
          action: 'logLoginAttempt-error', 
          metadata: { email } 
        });
        ErrorLogger.error(logError, { 
          component: 'AdminLogin', 
          action: 'logLoginAttempt-error', 
          metadata: { email } 
        });
      }

      // Provide more specific error messages
      if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Email address not confirmed. Please check your email for a confirmation link.');
      } else {
        setError('Invalid credentials or you do not have admin access');
      }
      setLoading(false);
      setLoginAttempted(false); // Reset flag on error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6">
      <div className="max-w-md w-full">
        <div className="bg-slate-800 rounded-lg s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg p-8 border border-slate-700">
          <div className="flex justify-center mb-8">
            <div className={`${getThemeGradient('ui')} p-6 rounded-lg shadow`}>
              <Shield className="h-12 w-12 text-white" />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-center text-white mb-2">
            Admin Portal
          </h2>
          <p className="text-center text-gray-300 mb-8">
            Sign in to access the administration panel
          </p>

          {error && (
            <div className="mb-8 p-6 bg-red-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/30 border border-red-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-200 mb-2">{error}</p>
                {error.includes('admin') && (
                  <p className="text-xs text-red-300">
                    Note: Admin access is controlled by the admin_users table in Supabase. Contact a system administrator to request admin access.
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-200 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white placeholder-gray-400 transition"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white placeholder-gray-400 transition"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full ${getThemeGradient('ui')} text-white py-3 px-6 rounded-lg font-semibold hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition shadow`}
            >
              {loading ? 'Signing in...' : 'Sign In to Admin Panel'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-blue-400 hover:text-blue-300 transition"
            >
              Return to main application
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Admin access only. Unauthorized access attempts are logged.
        </p>
      </div>
    </div>
  );
};
