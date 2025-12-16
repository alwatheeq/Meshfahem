import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { ErrorLogger } from '../../utils/errorLogger';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const [verifying, setVerifying] = useState(true);
  const [isAdminVerified, setIsAdminVerified] = useState(false);

  useEffect(() => {
    const verifyAdminStatus = async () => {
      if (!user || loading) {
        setVerifying(false);
        return;
      }

      ErrorLogger.debug('Verifying admin status', { component: 'AdminRoute', action: 'verifyAdminStatus', userEmail: user.email });

      // Double-check admin status by querying admin_users table directly
      const { data: adminData, error } = await supabase
        .from('admin_users')
        .select('id, is_active')
        .eq('id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'AdminRoute', action: 'verifyAdminStatus', userId: user.id });
        setIsAdminVerified(false);
        setVerifying(false);
        return;
      }

      const isVerified = !!adminData;
      ErrorLogger.debug('Admin verification result', { component: 'AdminRoute', action: 'verifyAdminStatus', isVerified, userEmail: user.email });

      if (isVerified) {
        ErrorLogger.info('Admin status verified from admin_users table', { component: 'AdminRoute', action: 'verifyAdminStatus', userEmail: user.email });
      } else {
        ErrorLogger.warn('User not found in admin_users table or inactive', { component: 'AdminRoute', action: 'verifyAdminStatus', userEmail: user.email, userId: user.id });
      }

      setIsAdminVerified(isVerified);
      setVerifying(false);
    };

    verifyAdminStatus();
  }, [user, loading]);

  if (loading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    ErrorLogger.debug('No user, redirecting to login', { component: 'AdminRoute', action: 'verifyAccess' });
    return <Navigate to="/admin/login" replace />;
  }

  // Check both the user.role from AuthContext AND the direct verification
  if (user.role !== 'admin' || !isAdminVerified) {
    ErrorLogger.debug('Access denied - redirecting to home', { component: 'AdminRoute', action: 'verifyAccess', userRole: user.role, isAdminVerified });
    return <Navigate to="/" replace />;
  }

  ErrorLogger.debug('Access granted', { component: 'AdminRoute', action: 'verifyAccess', userId: user.id });
  return <>{children}</>;
};
