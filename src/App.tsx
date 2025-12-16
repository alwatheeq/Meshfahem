import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { CreditProvider } from './contexts/CreditContext';
import { PersistentModalProvider } from './contexts/PersistentModalContext';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ChatProvider } from './contexts/ChatContext';
import { ToastProvider } from './components/Toast/Toast';
import { Auth } from './components/Auth/Auth';
import { Dashboard } from './components/Dashboard/Dashboard';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EnvValidator } from './components/EnvValidator';
import { SubscriptionRefreshListener } from './components/SubscriptionRefreshListener';
import { ErrorLogger } from './utils/errorLogger';
import { supabase } from './lib/supabase';

const ShareView = lazy(() => import('./components/ShareView').then(m => ({ default: m.ShareView })));
const AdminLogin = lazy(() => import('./components/Admin/AdminLogin').then(m => ({ default: m.AdminLogin })));
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminRoute = lazy(() => import('./components/Admin/AdminRoute').then(m => ({ default: m.AdminRoute })));
const PricingPage = lazy(() => import('./components/Pricing/PricingPage').then(m => ({ default: m.PricingPage })));
const CheckoutPage = lazy(() => import('./components/Pricing/CheckoutPage').then(m => ({ default: m.CheckoutPage })));
const PaymentSuccess = lazy(() => import('./components/Pricing/PaymentSuccess').then(m => ({ default: m.PaymentSuccess })));
const PaymentCancel = lazy(() => import('./components/Pricing/PaymentCancel').then(m => ({ default: m.PaymentCancel })));
const SubscriptionManagementPage = lazy(() => import('./components/Dashboard/SubscriptionManagementPage').then(m => ({ default: m.SubscriptionManagementPage })));
const BillingHistoryPage = lazy(() => import('./components/Dashboard/BillingHistoryPage').then(m => ({ default: m.BillingHistoryPage })));
const NotFound = lazy(() => import('./components/NotFound').then(m => ({ default: m.NotFound })));
const GameJoinPage = lazy(() => import('./components/Dashboard/GameJoinPage').then(m => ({ default: m.GameJoinPage })));
const MultiplayerLobby = lazy(() => import('./components/Dashboard/MultiplayerLobby'));
const MultiplayerGamePlay = lazy(() => import('./components/Dashboard/MultiplayerGamePlay'));
const MultiplayerResults = lazy(() => import('./components/Dashboard/MultiplayerResults'));
const AccountSuspended = lazy(() => import('./components/AccountSuspended').then(m => ({ default: m.AccountSuspended })));

function AppContent() {
  const { user, loading } = useAuth();
  const { getThemeGradient } = useTheme();
  const [isBlocked, setIsBlocked] = React.useState<boolean | null>(null);
  const [checkingBlock, setCheckingBlock] = React.useState(true);

  React.useEffect(() => {
    ErrorLogger.debug('AppContent - user', { component: 'App', action: 'render', userId: user?.id, userRole: user?.role });
  }, [user]);

  React.useEffect(() => {
    const checkBlockStatus = async () => {
      if (!user || user.role === 'admin') {
        setCheckingBlock(false);
        setIsBlocked(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc('check_user_block_status', {
          p_user_id: user.id
        });

        if (error) {
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
            component: 'App', 
            action: 'checkBlockStatus', 
            userId: user.id 
          });
          setIsBlocked(false);
        } else if (data && data.is_blocked) {
          setIsBlocked(true);
        } else {
          setIsBlocked(false);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'App', action: 'checkBlockStatus', userId: user.id });
        setIsBlocked(false);
      } finally {
        setCheckingBlock(false);
      }
    };

    checkBlockStatus();
  }, [user]);

  if (loading || checkingBlock) {
    return (
      <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getThemeGradient('bg')} flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Redirect blocked users to AccountSuspended page
  if (isBlocked) {
    return <Navigate to="/account/suspended" replace />;
  }

  // Redirect admin users to admin dashboard
  if (user?.role === 'admin') {
    ErrorLogger.debug('Admin user detected, redirecting to admin dashboard', { component: 'App', action: 'redirectAdmin', userId: user?.id });
    return <Navigate to="/admin/dashboard" replace />;
  }

  // Regular users and non-authenticated users
  return (
    <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getThemeGradient('bg')}`}>
      {user ? <Dashboard /> : <Auth />}
    </div>
  );
}

// Loading fallback component that can access theme
const LoadingFallback: React.FC = () => {
  const { getThemeGradient } = useTheme();
  return (
    <div className={`min-h-screen flex items-center justify-center ${getThemeGradient('bg')}`}>
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
};

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { getThemeGradient } = useTheme();

  if (loading) {
    return (
      <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getThemeGradient('bg')} flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Block admin users from accessing regular user routes
  if (user.role === 'admin') {
    ErrorLogger.debug('Admin user blocked from user route, redirecting to admin dashboard', { component: 'App', action: 'protectedRoute', userId: user.id });
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <EnvValidator>
        <Router>
          <I18nProvider>
            <AuthProvider>
              <CreditProvider>
                <UserPreferencesProvider>
                  <OnboardingProvider>
                    <ThemeProvider>
                      <ChatProvider>
                      <PersistentModalProvider>
                        <ToastProvider>
                      <SubscriptionRefreshListener />
                  <ErrorBoundary fallbackMessage="Authentication Error">
                    <Suspense fallback={
                      <LoadingFallback />
                    }>
                      <Routes>
                        <Route path="/share/:shareableLinkId" element={
                          <ErrorBoundary fallbackMessage="Error loading shared content">
                            <ShareView />
                          </ErrorBoundary>
                        } />
                        <Route path="/join/:gameCode" element={
                          <ErrorBoundary fallbackMessage="Error joining game">
                            <GameJoinPage />
                          </ErrorBoundary>
                        } />
                        <Route path="/pricing" element={
                          <ErrorBoundary fallbackMessage="Error loading pricing page">
                            <PricingPage />
                          </ErrorBoundary>
                        } />
                        <Route path="/checkout" element={
                          <ErrorBoundary fallbackMessage="Error loading checkout">
                            <CheckoutPage />
                          </ErrorBoundary>
                        } />
                        <Route path="/payment/success" element={<PaymentSuccess />} />
                        <Route path="/payment/cancel" element={<PaymentCancel />} />
                        <Route path="/account/suspended" element={<AccountSuspended />} />
                        <Route
                          path="/profile/subscription"
                          element={
                            <ProtectedRoute>
                              <ErrorBoundary fallbackMessage="Error loading subscription page">
                                <SubscriptionManagementPage />
                              </ErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/profile/billing"
                          element={
                            <ProtectedRoute>
                              <ErrorBoundary fallbackMessage="Error loading billing history">
                                <BillingHistoryPage />
                              </ErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/admin/login" element={
                          <ErrorBoundary fallbackMessage="Error loading admin login">
                            <AdminLogin />
                          </ErrorBoundary>
                        } />
                        <Route
                          path="/admin/dashboard"
                          element={
                            <AdminRoute>
                              <ErrorBoundary fallbackMessage="Error loading admin dashboard">
                                <AdminDashboard />
                              </ErrorBoundary>
                            </AdminRoute>
                          }
                        />
                        <Route path="/*" element={
                          <ErrorBoundary fallbackMessage="Application Error">
                            <AppContent />
                          </ErrorBoundary>
                        } />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                        </ToastProvider>
                      </PersistentModalProvider>
                      </ChatProvider>
                    </ThemeProvider>
                  </OnboardingProvider>
                </UserPreferencesProvider>
              </CreditProvider>
            </AuthProvider>
          </I18nProvider>
        </Router>
      </EnvValidator>
    </ErrorBoundary>
  );
}

export default App;