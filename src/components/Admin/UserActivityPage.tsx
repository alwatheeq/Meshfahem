import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { Activity, Clock, TrendingUp, Users, Calendar, Eye } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

interface UserActivity {
  id: string;
  email: string;
  display_name: string | null;
  last_login_at: string | null;
  created_at: string;
  total_sessions: number;
  total_study_time: number;
  recent_actions: number;
  library_items: number;
}

interface ActivityStats {
  total_users: number;
  active_today: number;
  active_this_week: number;
  active_this_month: number;
  total_study_time: number;
}

export const UserActivityPage: React.FC = React.memo(() => {
  const toast = useToast();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [stats, setStats] = useState<ActivityStats>({
    total_users: 0,
    active_today: 0,
    active_this_week: 0,
    active_this_month: 0,
    total_study_time: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedUser, setSelectedUser] = useState<UserActivity | null>(null);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchActivities();
    fetchStats();
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      // Fetch user profiles with activity data
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, email, display_name, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch last login times (from admin_users if admin, or estimate from user_history)
      const userIds = (profiles || []).map(p => p.id);
      
      // Get study sessions count and total time
      const { data: sessions, error: sessionsError } = await supabase
        .from('study_sessions')
        .select('user_id, duration_minutes, completed_at')
        .in('user_id', userIds);

      if (sessionsError) {
        ErrorLogger.warn(sessionsError instanceof Error ? sessionsError : new Error(String(sessionsError)), {
          component: 'UserActivityPage',
          action: 'fetchActivities',
          step: 'fetchSessions'
        });
      }

      // Get recent actions count (last 7 days from user_history)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: recentHistory, error: historyError } = await supabase
        .from('user_history')
        .select('user_id')
        .in('user_id', userIds)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (historyError) {
        ErrorLogger.warn(historyError instanceof Error ? historyError : new Error(String(historyError)), {
          component: 'UserActivityPage',
          action: 'fetchActivities',
          step: 'fetchHistory'
        });
      }

      // Get library items count
      const { data: libraryItems, error: libraryError } = await supabase
        .from('user_library_items')
        .select('user_id')
        .in('user_id', userIds);

      if (libraryError) {
        ErrorLogger.warn(libraryError instanceof Error ? libraryError : new Error(String(libraryError)), {
          component: 'UserActivityPage',
          action: 'fetchActivities',
          step: 'fetchLibrary'
        });
      }

      // Aggregate data
      const sessionMap = new Map<string, { count: number; totalTime: number }>();
      (sessions || []).forEach(session => {
        const existing = sessionMap.get(session.user_id) || { count: 0, totalTime: 0 };
        sessionMap.set(session.user_id, {
          count: existing.count + 1,
          totalTime: existing.totalTime + (session.duration_minutes || 0)
        });
      });

      const historyMap = new Map<string, number>();
      (recentHistory || []).forEach(item => {
        historyMap.set(item.user_id, (historyMap.get(item.user_id) || 0) + 1);
      });

      const libraryMap = new Map<string, number>();
      (libraryItems || []).forEach(item => {
        libraryMap.set(item.user_id, (libraryMap.get(item.user_id) || 0) + 1);
      });

      // Get last login from admin_users for admin users, or estimate from sessions
      const { data: adminUsers, error: adminError } = await supabase
        .from('admin_users')
        .select('id, last_login_at')
        .in('id', userIds);

      const adminLoginMap = new Map<string, string>();
      (adminUsers || []).forEach(admin => {
        if (admin.last_login_at) {
          adminLoginMap.set(admin.id, admin.last_login_at);
        }
      });

      // Get most recent session time for non-admin users
      const sessionTimeMap = new Map<string, string>();
      (sessions || []).forEach(session => {
        const existing = sessionTimeMap.get(session.user_id);
        if (!existing || (session.completed_at && session.completed_at > existing)) {
          if (session.completed_at) {
            sessionTimeMap.set(session.user_id, session.completed_at);
          }
        }
      });

      const activitiesData: UserActivity[] = (profiles || []).map(profile => {
        const sessionData = sessionMap.get(profile.id) || { count: 0, totalTime: 0 };
        const lastLogin = adminLoginMap.get(profile.id) || sessionTimeMap.get(profile.id) || null;

        return {
          id: profile.id,
          email: profile.email,
          display_name: profile.display_name,
          last_login_at: lastLogin,
          created_at: profile.created_at,
          total_sessions: sessionData.count,
          total_study_time: sessionData.totalTime,
          recent_actions: historyMap.get(profile.id) || 0,
          library_items: libraryMap.get(profile.id) || 0,
        };
      });

      setActivities(activitiesData);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'UserActivityPage', action: 'fetchActivities' });
      toast.error('Failed to load user activities');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_role', 'user');

      if (profilesError) throw profilesError;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const userIds = (profiles || []).map(p => p.id);

      // Get active users
      const { data: sessionsToday, error: todayError } = await supabase
        .from('study_sessions')
        .select('user_id')
        .in('user_id', userIds)
        .gte('completed_at', today.toISOString());

      const { data: sessionsWeek, error: weekError } = await supabase
        .from('study_sessions')
        .select('user_id')
        .in('user_id', userIds)
        .gte('completed_at', weekAgo.toISOString());

      const { data: sessionsMonth, error: monthError } = await supabase
        .from('study_sessions')
        .select('user_id')
        .in('user_id', userIds)
        .gte('completed_at', monthAgo.toISOString());

      const { data: allSessions, error: allSessionsError } = await supabase
        .from('study_sessions')
        .select('duration_minutes')
        .in('user_id', userIds);

      const activeToday = new Set((sessionsToday || []).map(s => s.user_id)).size;
      const activeWeek = new Set((sessionsWeek || []).map(s => s.user_id)).size;
      const activeMonth = new Set((sessionsMonth || []).map(s => s.user_id)).size;
      const totalStudyTime = (allSessions || []).reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

      setStats({
        total_users: profiles?.length || 0,
        active_today: activeToday,
        active_this_week: activeWeek,
        active_this_month: activeMonth,
        total_study_time: totalStudyTime,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'UserActivityPage', action: 'fetchStats' });
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setDetailsLoading(true);
    try {
      const [sessionsResult, historyResult, libraryResult] = await Promise.all([
        supabase
          .from('study_sessions')
          .select('*')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .limit(10),
        supabase
          .from('user_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('user_library_items')
          .select('id, title, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setUserDetails({
        sessions: sessionsResult.data || [],
        history: historyResult.data || [],
        library: libraryResult.data || [],
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'UserActivityPage', action: 'fetchUserDetails', userId });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleViewUser = (user: UserActivity) => {
    setSelectedUser(user);
    fetchUserDetails(user.id);
  };

  const filteredActivities = useMemo(() =>
    activities.filter(activity =>
      activity.email.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      activity.display_name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    ),
    [activities, debouncedSearchQuery]
  );

  if (loading) {
    return <LoadingSkeleton type="table" count={10} className="mt-6" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Activity Monitoring</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor user activity and engagement</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Users</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_users}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Activity className="h-5 w-5 text-green-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Today</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active_today}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="h-5 w-5 text-purple-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active This Week</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active_this_week}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="h-5 w-5 text-orange-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active This Month</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.active_this_month}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Clock className="h-5 w-5 text-red-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Study Time</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{Math.round(stats.total_study_time / 60)}h</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
            />
            <Activity className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          </div>
        </div>

        {/* Activity Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Sessions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Study Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Recent Actions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Library Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredActivities.map((activity) => (
                <tr key={activity.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{activity.email}</div>
                      {activity.display_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{activity.display_name}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {activity.last_login_at
                      ? new Date(activity.last_login_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {activity.total_sessions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {Math.round(activity.total_study_time / 60)}h {activity.total_study_time % 60}m
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {activity.recent_actions}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {activity.library_items}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleViewUser(activity)}
                      className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <Eye className="h-4 w-4" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredActivities.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No users found</p>
            </div>
          )}
        </div>
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Activity Details: {selectedUser.email}
              </h3>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setUserDetails(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6">
              {detailsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : userDetails && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Recent Study Sessions</h4>
                    <div className="space-y-2">
                      {userDetails.sessions.length > 0 ? (
                        userDetails.sessions.map((session: any) => (
                          <div key={session.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{session.session_type}</span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">{session.duration_minutes} min</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(session.completed_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No study sessions</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Recent History</h4>
                    <div className="space-y-2">
                      {userDetails.history.length > 0 ? (
                        userDetails.history.map((item: any) => (
                          <div key={item.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <div className="text-sm text-gray-900 dark:text-white">{item.action_type || 'Action'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(item.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No recent history</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Recent Library Items</h4>
                    <div className="space-y-2">
                      {userDetails.library.length > 0 ? (
                        userDetails.library.map((item: any) => (
                          <div key={item.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{item.title || 'Untitled'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(item.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No library items</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

