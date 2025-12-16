import React, { useState, Suspense, lazy } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { OverviewPage } from './OverviewPage';
import { PageLoadingSkeleton } from '../Common/LoadingSkeleton';

const UsersPage = lazy(() => import('./UsersPage').then(m => ({ default: m.UsersPage })));
const FeedbackManagementPage = lazy(() => import('./FeedbackManagementPage').then(m => ({ default: m.FeedbackManagementPage })));
const FoldersManagementPage = lazy(() => import('./FoldersManagementPage').then(m => ({ default: m.FoldersManagementPage })));
const TagsManagementPage = lazy(() => import('./TagsManagementPage').then(m => ({ default: m.TagsManagementPage })));
const SubscriptionsManagementPage = lazy(() => import('./SubscriptionsManagementPage').then(m => ({ default: m.SubscriptionsManagementPage })));
const TokenUsagePage = lazy(() => import('./TokenUsagePage').then(m => ({ default: m.TokenUsagePage })));
const AnalyticsPage = lazy(() => import('./AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const AdminUsersManagementPage = lazy(() => import('./AdminUsersManagementPage').then(m => ({ default: m.AdminUsersManagementPage })));
const TransactionsPage = lazy(() => import('./TransactionsPage').then(m => ({ default: m.TransactionsPage })));
const AuditLogPage = lazy(() => import('./AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const UserActivityPage = lazy(() => import('./UserActivityPage').then(m => ({ default: m.UserActivityPage })));
const CreditManagementPage = lazy(() => import('./CreditManagementPage').then(m => ({ default: m.CreditManagementPage })));

export type AdminView = 'overview' | 'users' | 'user-activity' | 'feedback' | 'folders' | 'tags' | 'subscriptions' | 'token-usage' | 'analytics' | 'admin-users' | 'transactions' | 'audit-log' | 'credits';

export const AdminDashboard: React.FC = () => {
  const [currentView, setCurrentView] = useState<AdminView>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <AdminHeader toggleSidebar={toggleSidebar} />

      <div className="flex min-h-screen">
        <AdminSidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          isSidebarOpen={isSidebarOpen}
        />

        <main className={`flex-1 transition-all duration-300 ${
          isSidebarOpen ? 'ml-64' : 'ml-16'
        }`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Suspense fallback={<PageLoadingSkeleton />}>
              {currentView === 'overview' && <OverviewPage key="overview" />}
              {currentView === 'users' && <UsersPage key="users" />}
              {currentView === 'user-activity' && <UserActivityPage key="user-activity" />}
              {currentView === 'credits' && <CreditManagementPage key="credits" />}
              {currentView === 'feedback' && <FeedbackManagementPage key="feedback" />}
              {currentView === 'folders' && <FoldersManagementPage key="folders" />}
              {currentView === 'tags' && <TagsManagementPage key="tags" />}
              {currentView === 'subscriptions' && <SubscriptionsManagementPage key="subscriptions" />}
              {currentView === 'token-usage' && <TokenUsagePage key="token-usage" />}
              {currentView === 'analytics' && <AnalyticsPage key="analytics" />}
              {currentView === 'admin-users' && <AdminUsersManagementPage key="admin-users" />}
              {currentView === 'transactions' && <TransactionsPage key="transactions" />}
              {currentView === 'audit-log' && <AuditLogPage key="audit-log" />}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};
