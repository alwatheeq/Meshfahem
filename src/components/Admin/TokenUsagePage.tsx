import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Search, Download, Users, AlertTriangle, BarChart3, RefreshCw, Calendar, Activity
} from 'lucide-react';
import { getTierDisplayInfo, formatTokenUsage } from '../../utils/subscriptionHelpers';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';

interface UserWithUsage {
  user_id: string;
  email: string;
  subscription_tier: string;
  subscription_status: string;
  tokens_used: number;
  token_limit: number;
  usage_percentage: number;
  billing_cycle_end: string | null;
  days_remaining: number;
  created_at: string;
}

interface UsageHistory {
  cycle_start: string;
  cycle_end: string;
  tokens_used: number;
  token_limit: number;
  usage_percentage: number;
  subscription_tier: string;
  archived_at: string;
}

export const TokenUsagePage: React.FC = React.memo(() => {
  const { error: showErrorToast } = useToast();
  const [users, setUsers] = useState<UserWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [usageFilter, setUsageFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userHistory, setUserHistory] = useState<UsageHistory[]>([]);

  useEffect(() => {
    fetchUsageData();
  }, []);

  const fetchUsageData = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('admin_get_users_with_usage');

      if (error) throw error;

      setUsers(data || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'TokenUsagePage', action: 'fetchUsageData' });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsageData();
    setRefreshing(false);
  };

  const viewHistory = async (userId: string, email: string) => {
    try {
      const { data, error } = await supabase.rpc('get_user_usage_history', {
        p_user_id: userId,
        p_limit: 12
      });

      if (error) throw error;

      setUserHistory(data || []);
      setSelectedUser(email);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { 
        component: 'TokenUsagePage', 
        action: 'fetchUserHistory', 
        metadata: { email } 
      });
      showErrorToast('Failed to load usage history');
    }
  };

  const filteredUsers = useMemo(() =>
    users.filter(user => {
      const matchesSearch = user.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

      let matchesUsage = true;
      if (usageFilter === 'high') {
        matchesUsage = user.usage_percentage >= 80;
      } else if (usageFilter === 'medium') {
        matchesUsage = user.usage_percentage >= 50 && user.usage_percentage < 80;
      } else if (usageFilter === 'low') {
        matchesUsage = user.usage_percentage < 50;
      } else if (usageFilter === 'active') {
        matchesUsage = user.subscription_status === 'active';
      }

      return matchesSearch && matchesUsage;
    }),
    [users, debouncedSearchTerm, usageFilter]
  );

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-400 bg-red-500/20';
    if (percentage >= 80) return 'text-orange-400 bg-orange-500/20';
    if (percentage >= 50) return 'text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700';
    return 'text-green-400 bg-green-500/20';
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Tier', 'Status', 'Tokens Used', 'Token Limit', 'Usage %', 'Days Remaining', 'Cycle End'];
    const rows = filteredUsers.map(user => [
      user.email,
      user.subscription_tier,
      user.subscription_status,
      user.tokens_used.toString(),
      user.token_limit.toString(),
      user.usage_percentage.toFixed(2) + '%',
      user.days_remaining.toString(),
      user.billing_cycle_end ? new Date(user.billing_cycle_end).toLocaleDateString() : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const stats = {
    total_users: users.length,
    active_users: users.filter(u => u.subscription_status === 'active').length,
    high_usage: users.filter(u => u.usage_percentage >= 80).length,
    avg_usage: users.length > 0
      ? (users.reduce((sum, u) => sum + u.usage_percentage, 0) / users.length).toFixed(1)
      : '0'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Token Usage Monitoring</h1>
          <p className="text-gray-400 mt-1">Track and monitor user token consumption</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 p-3 rounded-lg">
              <Users className="h-6 w-6 text-blue-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Total Users</h3>
          <p className="text-3xl font-bold text-white">{stats.total_users}</p>
        </div>

        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 p-3 rounded-lg">
              <Activity className="h-6 w-6 text-green-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Active Users</h3>
          <p className="text-3xl font-bold text-white">{stats.active_users}</p>
        </div>

        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-500/20 p-3 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-orange-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">High Usage (80%+)</h3>
          <p className="text-3xl font-bold text-white">{stats.high_usage}</p>
        </div>

        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 p-3 rounded-lg">
              <BarChart3 className="h-6 w-6 text-purple-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Average Usage</h3>
          <p className="text-3xl font-bold text-white">{stats.avg_usage}%</p>
        </div>
      </div>

      <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={usageFilter}
            onChange={(e) => setUsageFilter(e.target.value)}
            className="px-5 py-2.5 bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Users</option>
            <option value="active">Active Only</option>
            <option value="high">High Usage (80%+)</option>
            <option value="medium">Medium Usage (50-80%)</option>
            <option value="low">Low Usage (&lt;50%)</option>
          </select>

          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Download className="h-5 w-5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
              <tr>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Tier
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Cycle End
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredUsers.map((user) => {
                const tierInfo = getTierDisplayInfo(user.subscription_tier);

                return (
                  <tr key={user.user_id} className="hover:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/50">
                    <td className="px-6 py-6 whitespace-nowrap">
                      <p className="text-sm font-medium text-white">{user.email}</p>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tierInfo.bgColor} ${tierInfo.color}`}>
                        {tierInfo.name}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        user.subscription_status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {user.subscription_status}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-full h-2 w-24">
                          <div
                            className={`h-2 rounded-full ${getUsageColor(user.usage_percentage)}`}
                            style={{ width: `${Math.min(100, user.usage_percentage)}%` }}
                          />
                        </div>
                        <span className={`text-sm font-semibold ${getUsageColor(user.usage_percentage)}`}>
                          {user.usage_percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm text-gray-300">
                      {formatTokenUsage(user.tokens_used)} / {formatTokenUsage(user.token_limit)}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      {user.billing_cycle_end ? (
                        <div>
                          <p className="text-sm text-gray-300">{new Date(user.billing_cycle_end).toLocaleDateString()}</p>
                          <p className="text-xs text-gray-500">{user.days_remaining} days remaining</p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <button
                        onClick={() => viewHistory(user.user_id, user.email)}
                        className="flex items-center space-x-1 px-3 py-1 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-blue-700 text-white text-sm rounded-lg transition"
                      >
                        <Calendar className="h-4 w-4" />
                        <span>History</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No users found</p>
          </div>
        )}
      </div>

      {selectedUser && userHistory.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-slate-800 rounded-xl s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div className="sticky top-0 bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-b border-slate-700 px-6 py-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Usage History - {selectedUser}</h3>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setUserHistory([]);
                }}
                className="p-2 hover:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-lg transition"
              >
                <span className="text-gray-400 text-2xl">&times;</span>
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {userHistory.map((record, idx) => (
                  <div key={idx} className="bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-lg p-6 border border-slate-600">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Billing Cycle</p>
                        <p className="text-sm text-white">{new Date(record.cycle_start).toLocaleDateString()}</p>
                        <p className="text-xs text-gray-500">to {new Date(record.cycle_end).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Tier</p>
                        <p className="text-sm text-white">{getTierDisplayInfo(record.subscription_tier).name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Usage</p>
                        <p className="text-sm text-white">
                          {formatTokenUsage(record.tokens_used)} / {formatTokenUsage(record.token_limit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Percentage</p>
                        <p className={`text-sm font-semibold ${getUsageColor(record.usage_percentage)}`}>
                          {record.usage_percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
