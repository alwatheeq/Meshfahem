import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Ban, Clock, AlertCircle, LogOut } from 'lucide-react';
import { ErrorLogger } from '../utils/errorLogger';

export const AccountSuspended: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [blockInfo, setBlockInfo] = useState<{
    reason: string | null;
    expiresAt: string | null;
    isPermanent: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlockStatus = async () => {
      if (!user?.id) {
        navigate('/');
        return;
      }

      try {
        const { data, error } = await supabase.rpc('check_user_block_status', {
          p_user_id: user.id
        });

        if (error) throw error;

        if (data && data.is_blocked) {
          setBlockInfo({
            reason: data.block_reason || null,
            expiresAt: data.expires_at || null,
            isPermanent: data.is_permanent || false,
          });
        } else {
          // User is not blocked, redirect to dashboard
          navigate('/');
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'AccountSuspended', action: 'fetchBlockStatus', userId: user?.id });
      } finally {
        setLoading(false);
      }
    };

    fetchBlockStatus();
  }, [user, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 dark:from-gray-900 dark:to-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!blockInfo) {
    return null;
  }

  const expirationDate = blockInfo.expiresAt 
    ? new Date(blockInfo.expiresAt).toLocaleString()
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 dark:from-gray-900 dark:to-gray-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-8 border border-red-200 dark:border-red-900">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <Ban className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Account Suspended
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Your account has been suspended and you cannot access the website.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {blockInfo.reason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">
                    Reason
                  </h3>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {blockInfo.reason}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!blockInfo.isPermanent && expirationDate && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">
                    Suspension Expires
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {expirationDate}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Your access will be restored automatically after this date.
                  </p>
                </div>
              </div>
            </div>
          )}

          {blockInfo.isPermanent && (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                This is a permanent suspension. If you believe this is an error, please contact support.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </button>

          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Need help? Contact support at{' '}
              <a 
                href="mailto:support@example.com" 
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                support@example.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

