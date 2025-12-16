import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, FileText, MessageSquare, TrendingUp, Calendar } from 'lucide-react';
import { ErrorLogger } from '../../utils/errorLogger';
import { useTheme } from '../../contexts/ThemeContext';

interface Stats {
  totalUsers: number;
  activeUsersThisMonth: number;
  totalFeedback: number;
  pendingFeedback: number;
  totalSummaries: number;
  totalLibraryItems: number;
}

interface RecentActivity {
  type: string;
  user_email: string;
  created_at: string;
  details: string;
}

export const OverviewPage: React.FC = React.memo(() => {
  const { getThemeGradient } = useTheme();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeUsersThisMonth: 0,
    totalFeedback: 0,
    pendingFeedback: 0,
    totalSummaries: 0,
    totalLibraryItems: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
  }, []);

  const fetchStats = async () => {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [
        usersResult,
        activeUsersResult,
        feedbackResult,
        pendingFeedbackResult,
        summariesResult,
        libraryResult,
      ] = await Promise.all([
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).gte('updated_at', startOfMonth.toISOString()),
        supabase.from('user_feedback').select('id', { count: 'exact', head: true }),
        supabase.from('user_feedback').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('user_history').select('id', { count: 'exact', head: true }),
        supabase.from('user_library_items').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalUsers: usersResult.count || 0,
        activeUsersThisMonth: activeUsersResult.count || 0,
        totalFeedback: feedbackResult.count || 0,
        pendingFeedback: pendingFeedbackResult.count || 0,
        totalSummaries: summariesResult.count || 0,
        totalLibraryItems: libraryResult.count || 0,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'OverviewPage', action: 'fetchStats' });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const { data: recentFeedback } = await supabase
        .from('user_feedback')
        .select('user_email, created_at, feedback_type')
        .order('created_at', { ascending: false })
        .limit(5);

      const activities: RecentActivity[] = (recentFeedback || []).map(fb => ({
        type: 'feedback',
        user_email: fb.user_email,
        created_at: fb.created_at,
        details: `Submitted ${fb.feedback_type}`,
      }));

      setRecentActivity(activities);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'OverviewPage', action: 'fetchRecentActivity' });
    }
  };

  const StatCard: React.FC<{
    title: string;
    value: number;
    icon: React.ReactNode;
    bgColor: string;
    iconColor: string;
    trend?: string;
  }> = ({ title, value, icon, bgColor, iconColor, trend }) => (
    <div className={`${bgColor} rounded-xl p-6 border border-opacity-20`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-80 mb-1">{title}</p>
          <p className="text-3xl font-bold">{value.toLocaleString()}</p>
          {trend && (
            <p className="text-xs mt-2 opacity-70">{trend}</p>
          )}
        </div>
        <div className={`${iconColor} p-3 rounded-lg bg-white bg-opacity-20`}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor platform statistics and user activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={<Users className="h-6 w-6" />}
          bgColor={`${getThemeGradient('ui')} text-white`}
          iconColor="text-white"
        />
        <StatCard
          title="Active This Month"
          value={stats.activeUsersThisMonth}
          icon={<TrendingUp className="h-6 w-6" />}
          bgColor="bg-gradient-to-br from-green-500 to-green-600 text-white"
          iconColor="text-white"
          trend="Users with activity"
        />
        <StatCard
          title="Total Feedback"
          value={stats.totalFeedback}
          icon={<MessageSquare className="h-6 w-6" />}
          bgColor={`${getThemeGradient('ui')} text-white`}
          iconColor="text-white"
          trend={`${stats.pendingFeedback} pending`}
        />
        <StatCard
          title="Generated Summaries"
          value={stats.totalSummaries}
          icon={<FileText className="h-6 w-6" />}
          bgColor="bg-gradient-to-br from-orange-500 to-orange-600 text-white"
          iconColor="text-white"
        />
        <StatCard
          title="Library Items"
          value={stats.totalLibraryItems}
          icon={<FileText className="h-6 w-6" />}
          bgColor={`${getThemeGradient('ui')} text-white`}
          iconColor="text-white"
        />
        <StatCard
          title="Pending Feedback"
          value={stats.pendingFeedback}
          icon={<MessageSquare className="h-6 w-6" />}
          bgColor="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white"
          iconColor="text-white"
          trend="Needs review"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Recent Activity
          </h3>
          <div className="space-y-4">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex-shrink-0">
                    <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {activity.user_email}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{activity.details}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No recent activity</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                {stats.pendingFeedback} Pending Feedback
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Review user feedback and suggestions to improve the platform
              </p>
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-800">
              <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                {stats.activeUsersThisMonth} Active Users
              </h4>
              <p className="text-xs text-green-700 dark:text-green-300">
                Users who have been active this month
              </p>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-800">
              <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">
                {stats.totalSummaries} Total Summaries
              </h4>
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Content generated by users across all time
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
