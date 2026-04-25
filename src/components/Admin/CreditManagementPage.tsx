import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { usePrompt } from '../../hooks/usePrompt';
import { Coins, Search, Plus, Minus, TrendingUp, Download } from 'lucide-react';

interface UserCredit {
  id: string;
  email: string;
  display_name: string | null;
  credits_remaining: number;
  credits_total: number;
  credits_cycle_start: string | null;
  credits_cycle_end: string | null;
}

interface CreditStats {
  total_users: number;
  total_credits: number;
  users_with_credits: number;
  users_low_credits: number;
}

export const CreditManagementPage: React.FC = React.memo(() => {
  const { user: adminUser } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const { prompt, PromptModal } = usePrompt();
  const [users, setUsers] = useState<UserCredit[]>([]);
  const [stats, setStats] = useState<CreditStats>({
    total_users: 0,
    total_credits: 0,
    users_with_credits: 0,
    users_low_credits: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [_selectedUser, _setSelectedUser] = useState<UserCredit | null>(null);
  const [adjustingUserId, setAdjustingUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, display_name, credits_remaining, credits_total, credits_cycle_start, credits_cycle_end')
        .order('credits_remaining', { ascending: false });

      if (error) throw error;

      setUsers((data || []) as UserCredit[]);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CreditManagementPage', action: 'fetchUsers' });
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('credits_remaining, credits_total')
        .eq('user_role', 'user');

      if (error) throw error;

      const totalCredits = (data || []).reduce((sum, u) => sum + (u.credits_remaining || 0), 0);
      const usersWithCredits = (data || []).filter(u => (u.credits_remaining || 0) > 0).length;
      const usersLowCredits = (data || []).filter(u => (u.credits_remaining || 0) < 100).length;

      setStats({
        total_users: data?.length || 0,
        total_credits: totalCredits,
        users_with_credits: usersWithCredits,
        users_low_credits: usersLowCredits,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'CreditManagementPage', action: 'fetchStats' });
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
    void fetchStats();
  }, [fetchUsers, fetchStats]);

  const handleAdjustCredits = async (userId: string, userEmail: string, currentCredits: number) => {
    if (!adminUser?.id) {
      toast.error('You must be logged in as an admin');
      return;
    }

    const action = await prompt('Action (add/subtract/set):', 'add', {
      title: 'Adjust Credits',
      message: 'Action: add, subtract, or set',
      placeholder: 'add'
    });
    if (!action || !['add', 'subtract', 'set'].includes(action.toLowerCase())) {
      toast.error('Invalid action. Must be: add, subtract, or set');
      return;
    }

    const amountInput = await prompt('Amount:', '0', {
      title: 'Adjust Credits',
      message: 'Amount:',
      placeholder: '0'
    });
    if (amountInput === null) return;

    const amount = parseInt(amountInput);
    if (isNaN(amount) || amount < 0) {
      toast.error('Invalid amount');
      return;
    }

    let newCredits = currentCredits;
    if (action.toLowerCase() === 'add') {
      newCredits = currentCredits + amount;
    } else if (action.toLowerCase() === 'subtract') {
      newCredits = Math.max(0, currentCredits - amount);
    } else {
      newCredits = amount;
    }

    const confirmed = await confirm(
      `${action === 'add' ? 'Add' : action === 'subtract' ? 'Subtract' : 'Set'} ${amount} credits for ${userEmail}? New total: ${newCredits}`,
      {
        title: 'Confirm Credit Adjustment',
        variant: 'default',
        confirmText: 'Adjust'
      }
    );
    if (!confirmed) return;

    try {
      setAdjustingUserId(userId);
      const { error } = await supabase
        .from('user_profiles')
        .update({
          credits_remaining: newCredits,
          credits_total: newCredits > (currentCredits || 0) ? newCredits : undefined
        })
        .eq('id', userId);

      if (error) throw error;

      // Log admin action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'user_profiles',
          p_record_id: userId,
          p_old_values: { credits_remaining: currentCredits },
          p_new_values: { credits_remaining: newCredits },
          p_description: `Admin ${adminUser.email} ${action} ${amount} credits for ${userEmail}. New total: ${newCredits}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log action', { 
          component: 'CreditManagementPage', 
          action: 'adjustCredits', 
          metadata: { userId, error: logError.message } 
        });
      }

      toast.success(`Credits adjusted successfully! New total: ${newCredits}`);
      await fetchUsers();
      await fetchStats();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'CreditManagementPage', 
        action: 'adjustCredits', 
        metadata: { userId } 
      });
      toast.error('Failed to adjust credits');
    } finally {
      setAdjustingUserId(null);
    }
  };

  const exportCreditsToCSV = async () => {
    const headers = ['Email', 'Display Name', 'Credits Remaining', 'Credits Total', 'Cycle Start', 'Cycle End'];
    const rows = filteredUsers.map(user => [
      user.email,
      user.display_name || '',
      (user.credits_remaining || 0).toString(),
      (user.credits_total || 0).toString(),
      user.credits_cycle_start ? new Date(user.credits_cycle_start).toLocaleDateString() : '',
      user.credits_cycle_end ? new Date(user.credits_cycle_end).toLocaleDateString() : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credits-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredUsers.length} users to CSV`);
  };

  const filteredUsers = useMemo(() =>
    users.filter(user =>
      user.email.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      user.display_name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    ),
    [users, debouncedSearchQuery]
  );

  if (loading) {
    return <LoadingSkeleton type="table" count={10} className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Credit Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage user credits</p>
        </div>
        <button
          onClick={exportCreditsToCSV}
          className="flex items-center space-x-2 px-5 py-2.5 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-green-700 transition"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Coins className="h-5 w-5 text-blue-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Credits</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_credits.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Users with Credits</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.users_with_credits}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Minus className="h-5 w-5 text-orange-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Low Credits (&lt;100)</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.users_low_credits}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Coins className="h-5 w-5 text-purple-500" />
          </div>
          <h3 className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Users</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_users}</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Credits Remaining</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Credits Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cycle End</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.map((user) => {
                const creditsRemaining = user.credits_remaining || 0;
                const isLow = creditsRemaining < 100;
                return (
                  <tr key={user.id} className="hover:bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-slate-700/50">
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{user.email}</div>
                        {user.display_name && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{user.display_name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`text-sm font-semibold ${
                        isLow ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                      }`}>
                        {creditsRemaining.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {(user.credits_total || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {user.credits_cycle_end
                        ? new Date(user.credits_cycle_end).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <button
                        onClick={() => handleAdjustCredits(user.id, user.email, creditsRemaining)}
                        disabled={adjustingUserId === user.id}
                        className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                      >
                        {adjustingUserId === user.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span>Adjust</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No users found</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal />
      <PromptModal />
    </div>
  );
});

