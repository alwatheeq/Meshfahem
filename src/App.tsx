import React, { useState, useEffect, Suspense, lazy, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import { CreditProvider } from './contexts/CreditContext';
import { PersistentModalProvider } from './contexts/PersistentModalContext';
import { SubscriptionUpsellGateProvider } from './contexts/SubscriptionUpsellGateContext';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import { OnboardingProvider } from './contexts/OnboardingContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ChatProvider } from './contexts/ChatContext';
import { ToastProvider } from './components/Toast/Toast';
import { Auth } from './components/Auth/Auth';
import { Dashboard } from './components/Dashboard/Dashboard';
import { useAuth } from './hooks/useAuth';
import { useTheme, ThemeContext } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { EnvValidator } from './components/EnvValidator';
import { SubscriptionRefreshListener } from './components/SubscriptionRefreshListener';
import { ErrorLogger } from './utils/errorLogger';
import { supabase } from './lib/supabase';
import FloatingVideoPortal from './components/Dashboard/FloatingVideo/FloatingVideoPortal';

const ShareView = lazy(() => import('./components/ShareView').then(m => ({ default: m.ShareView })));
const AdminLogin = lazy(() => import('./components/Admin/AdminLogin').then(m => ({ default: m.AdminLogin })));
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminRoute = lazy(() => import('./components/Admin/AdminRoute').then(m => ({ default: m.AdminRoute })));
const PricingPage = lazy(() => import('./components/Pricing/PricingPage'));
const CheckoutPage = lazy(() => import('./components/Pricing/CheckoutPage').then(m => ({ default: m.CheckoutPage })));
const PaymentSuccess = lazy(() => import('./components/Pricing/PaymentSuccess').then(m => ({ default: m.PaymentSuccess })));
const PaymentCancel = lazy(() => import('./components/Pricing/PaymentCancel').then(m => ({ default: m.PaymentCancel })));
const SubscriptionManagementPage = lazy(() => import('./components/Dashboard/SubscriptionManagementPage').then(m => ({ default: m.SubscriptionManagementPage })));
const BillingHistoryPage = lazy(() => import('./components/Dashboard/BillingHistoryPage').then(m => ({ default: m.BillingHistoryPage })));
const GameJoinPage = lazy(() => import('./components/Dashboard/GameJoinPage').then(m => ({ default: m.GameJoinPage })));
const AccountSuspended = lazy(() => import('./components/AccountSuspended').then(m => ({ default: m.AccountSuspended })));
const ContentViewPage = lazy(() => import('./components/Dashboard/ContentViewPage').then(m => ({ default: m.ContentViewPage })));
const OnboardingWizard = lazy(() => import('./components/Onboarding/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));

// Internal component that uses hooks
const AppContentInternal: React.FC = () => {
  const { user, loading } = useAuth();
  const { getBackgroundGradient } = useTheme();
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);
  const [checkingBlock, setCheckingBlock] = useState(true);

  // Per-user key so each account gets its own onboarding gate regardless of browser history
  const onboardingDone =
    typeof localStorage === 'undefined' ||
    !user ||
    localStorage.getItem(`meshfahem_onboarding_completed_${user.id}`) === 'true';

  useEffect(() => {
    ErrorLogger.debug('AppContent - user', { component: 'App', action: 'render', userId: user?.id, userRole: user?.role });
  }, [user]);

  useEffect(() => {
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
      <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getBackgroundGradient()} flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Redirect blocked users to AccountSuspended page
  if (isBlocked) {
    return <Navigate to="/account/suspended" replace />;
  }

  // Post-login onboarding gate: show wizard (language + theme) before any tutorials or services
  if (user && !onboardingDone) {
    return (
      <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getBackgroundGradient()}`}>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        }>
          <OnboardingWizard />
        </Suspense>
      </div>
    );
  }

  // Regular users and non-authenticated users
  return (
    <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getBackgroundGradient()}`}>
      {user ? <Dashboard /> : <Auth />}
    </div>
  );
};

// Fallback component when theme is not available
const AppContentWithoutTheme: React.FC = () => {
  const { user, loading } = useAuth();
  const [isBlocked, setIsBlocked] = useState<boolean | null>(null);
  const [checkingBlock, setCheckingBlock] = useState(true);

  // Per-user key so each account gets its own onboarding gate regardless of browser history
  const onboardingDone =
    typeof localStorage === 'undefined' ||
    !user ||
    localStorage.getItem(`meshfahem_onboarding_completed_${user.id}`) === 'true';

  useEffect(() => {
    ErrorLogger.debug('AppContent - user', { component: 'App', action: 'render', userId: user?.id, userRole: user?.role });
  }, [user]);

  useEffect(() => {
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
      <div className="min-h-screen w-full min-w-full overflow-x-auto bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isBlocked) {
    return <Navigate to="/account/suspended" replace />;
  }

  if (user && !onboardingDone) {
    return (
      <div className="min-h-screen w-full min-w-full overflow-x-auto bg-gray-50 dark:bg-gray-900">
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        }>
          <OnboardingWizard />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full min-w-full overflow-x-auto bg-gray-50 dark:bg-gray-900">
      {user ? <Dashboard /> : <Auth />}
    </div>
  );
};

// Wrapper component that checks for ThemeProvider
function AppContent() {
  const themeContext = useContext(ThemeContext);
  
  if (!themeContext) {
    return <AppContentWithoutTheme />;
  }
  
  return <AppContentInternal />;
}

// Loading fallback component that can access theme
const LoadingFallbackInternal: React.FC = () => {
  const { getBackgroundGradient } = useTheme();
  return (
    <div className={`min-h-screen flex items-center justify-center ${getBackgroundGradient()}`}>
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
};

// Wrapper for LoadingFallback
const LoadingFallback: React.FC = () => {
  const themeContext = useContext(ThemeContext);
  
  if (!themeContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return <LoadingFallbackInternal />;
};

// Internal ProtectedRoute that uses hooks
const ProtectedRouteInternal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const { getBackgroundGradient } = useTheme();

  if (loading) {
    return (
      <div className={`min-h-screen w-full min-w-full overflow-x-auto ${getBackgroundGradient()} flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Wrapper for ProtectedRoute - always call useAuth unconditionally
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const themeContext = useContext(ThemeContext);
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full min-w-full overflow-x-auto bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (!themeContext) {
    return <>{children}</>;
  }
  return <ProtectedRouteInternal>{children}</ProtectedRouteInternal>;
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
                      <SubscriptionUpsellGateProvider>
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
                        <Route
                          path="/view/history/:id"
                          element={
                            <ProtectedRoute>
                              <ErrorBoundary fallbackMessage="Error loading content">
                                <ContentViewPage />
                              </ErrorBoundary>
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/view/library/:id"
                          element={
                            <ProtectedRoute>
                              <ErrorBoundary fallbackMessage="Error loading content">
                                <ContentViewPage />
                              </ErrorBoundary>
                            </ProtectedRoute>
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
                  <FloatingVideoPortal />
                        </ToastProvider>
                      </PersistentModalProvider>
                      </SubscriptionUpsellGateProvider>
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