import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';
import { usePrompt } from '../../hooks/usePrompt';
import { getTierDisplayInfo, getStatusDisplayInfo } from '../../utils/subscriptionHelpers';
import { PerformanceMonitor } from '../../utils/performanceMonitor';
import { Search, Calendar, TrendingUp, Eye, X, Download, CheckCircle, XCircle, UserPlus, UserX, Ban, CheckSquare, Square, Tag, FileText } from 'lucide-react';
import { BlockUserModal } from './BlockUserModal';

interface UserProfile {
  id: string;
  email: string;
  monthly_usage: number;
  last_reset: string;
  user_role: string;
  created_at: string;
  updated_at: string;
  has_paid?: boolean;
  payment_date?: string;
  payment_notes?: string;
  subscription?: {
    id: string;
    subscription_tier: string;
    status: string;
    end_date: string;
  } | null;
  is_blocked?: boolean;
  block_reason?: string | null;
  block_expires_at?: string | null;
}

interface UserStats {
  historyCount: number;
  libraryCount: number;
  feedbackCount: number;
}

interface UserTagRow {
  id: string;
  tag_name: string;
}

interface UserNoteRow {
  id: string;
  note: string;
  admin_email: string;
  created_at: string;
}

export const UsersPage: React.FC = React.memo(() => {
  const { user: adminUser } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const { prompt, PromptModal } = usePrompt();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [subscribingUserId, setSubscribingUserId] = useState<string | null>(null);
  const [unsubscribingUserId, setUnsubscribingUserId] = useState<string | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [selectedUserForBlock, setSelectedUserForBlock] = useState<UserProfile | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectMultipleMode, setSelectMultipleMode] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [userNotes, setUserNotes] = useState<UserNoteRow[]>([]);
  const [userTags, setUserTags] = useState<UserTagRow[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    return PerformanceMonitor.measureAsync('UsersPage.fetchUsers', async () => {
      try {
        // Fetch user profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        // Fetch active subscriptions for all users
        const userIds = (profiles || []).map(p => p.id);
        const { data: subscriptions, error: subsError } = await supabase
          .from('subscriptions')
          .select('id, user_id, subscription_tier, status, end_date')
          .in('user_id', userIds)
          .eq('status', 'active');

        if (subsError) {
          const error = subsError instanceof Error ? subsError : new Error(String(subsError));
          ErrorLogger.warn('Failed to fetch subscriptions', { 
            component: 'UsersPage', 
            action: 'fetchUsers', 
            metadata: { step: 'fetchSubscriptions', error: error.message } 
          });
        }

        // Map subscriptions to users
        const subscriptionMap = new Map(
          (subscriptions || []).map(sub => [sub.user_id, sub])
        );

        const usersWithSubscriptions = (profiles || []).map(profile => ({
          ...profile,
          subscription: subscriptionMap.get(profile.id) || null
        })) as UserProfile[];

        setUsers(usersWithSubscriptions);
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        ErrorLogger.error(err, { component: 'UsersPage', action: 'fetchUsers' });
        toast.error('Failed to load users');
      } finally {
        setLoading(false);
      }
    });
  };

  const fetchUserStats = async (userId: string) => {
    setStatsLoading(true);
    try {
      const [historyResult, libraryResult, feedbackResult] = await Promise.all([
        supabase.from('user_history').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('user_library_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('user_feedback').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      setUserStats({
        historyCount: historyResult.count || 0,
        libraryCount: libraryResult.count || 0,
        feedbackCount: feedbackResult.count || 0,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      ErrorLogger.error(err, { component: 'UsersPage', action: 'fetchUserStats' });
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchUserNotesAndTags = async (userId: string) => {
    try {
      const [notesResult, tagsResult] = await Promise.all([
        supabase.rpc('get_user_notes', { p_user_id: userId }),
        supabase.rpc('get_user_tags', { p_user_id: userId })
      ]);

      if (notesResult.data) setUserNotes(notesResult.data as UserNoteRow[]);
      if (tagsResult.data) setUserTags(tagsResult.data as UserTagRow[]);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'UsersPage', action: 'fetchUserNotesAndTags', userId });
    }
  };

  const handleBulkSubscribe = async () => {
    if (!adminUser?.id || selectedItems.size === 0) return;

    const tier = await prompt('Subscription tier (trial_7day, monthly, quarterly, biannual):', 'monthly', {
      title: 'Bulk Subscribe Users',
      message: 'Enter subscription tier:',
      placeholder: 'monthly'
    });
    if (!tier || !['trial_7day', 'monthly', 'quarterly', 'biannual'].includes(tier)) {
      toast.error('Invalid subscription tier');
      return;
    }

    const durationInput = await prompt('Duration in days (default: 30):', '30', {
      title: 'Bulk Subscribe Users',
      message: 'Duration in days:',
      placeholder: '30'
    });
    if (durationInput === null) return;
    const durationDays = parseInt(durationInput) || 30;

    const confirmed = await confirm(
      `Subscribe ${selectedItems.size} users to ${tier} for ${durationDays} days?`,
      { title: 'Bulk Subscribe', variant: 'default', confirmText: 'Subscribe' }
    );
    if (!confirmed) return;

    const userIds = Array.from(selectedItems);
    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        const { data, error } = await supabase.rpc('admin_subscribe_user', {
          p_user_id: userId,
          p_subscription_tier: tier,
          p_duration_days: durationDays,
          p_admin_id: adminUser.id,
          p_notes: null
        });

        if (error || (data && !data.success)) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    toast.success(`Subscribed ${successCount} users${failCount > 0 ? `, ${failCount} failed` : ''}`);
    await fetchUsers();
    setSelectedItems(new Set());
    setSelectMultipleMode(false);
  };

  const handleBulkUnsubscribe = async () => {
    if (!adminUser?.id || selectedItems.size === 0) return;

    const confirmed = await confirm(
      `Unsubscribe ${selectedItems.size} users?`,
      { title: 'Bulk Unsubscribe', variant: 'destructive', confirmText: 'Unsubscribe' }
    );
    if (!confirmed) return;

    const userIds = Array.from(selectedItems);
    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        const { data, error } = await supabase.rpc('admin_unsubscribe_user', {
          p_user_id: userId,
          p_admin_id: adminUser.id,
          p_reason: 'Bulk unsubscribe'
        });

        if (error || (data && !data.success)) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    toast.success(`Unsubscribed ${successCount} users${failCount > 0 ? `, ${failCount} failed` : ''}`);
    await fetchUsers();
    setSelectedItems(new Set());
    setSelectMultipleMode(false);
  };

  const handleBulkBlock = async () => {
    if (!adminUser?.id || selectedItems.size === 0) return;

    const reason = await prompt('Reason for blocking:', '', {
      title: 'Bulk Block Users',
      message: 'Reason (required):',
      placeholder: 'Reason...'
    });
    if (!reason) {
      toast.error('Reason is required');
      return;
    }

    const confirmed = await confirm(
      `Block ${selectedItems.size} users?`,
      { title: 'Bulk Block', variant: 'destructive', confirmText: 'Block' }
    );
    if (!confirmed) return;

    const userIds = Array.from(selectedItems);
    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        const { data, error } = await supabase.rpc('admin_block_user', {
          p_user_id: userId,
          p_admin_id: adminUser.id,
          p_reason: reason,
          p_expires_at: null
        });

        if (error || (data && !data.success)) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    toast.success(`Blocked ${successCount} users${failCount > 0 ? `, ${failCount} failed` : ''}`);
    await fetchUsers();
    setSelectedItems(new Set());
    setSelectMultipleMode(false);
  };

  const handleBulkUnblock = async () => {
    if (!adminUser?.id || selectedItems.size === 0) return;

    const confirmed = await confirm(
      `Unblock ${selectedItems.size} users?`,
      { title: 'Bulk Unblock', variant: 'default', confirmText: 'Unblock' }
    );
    if (!confirmed) return;

    const userIds = Array.from(selectedItems);
    let successCount = 0;
    let failCount = 0;

    for (const userId of userIds) {
      try {
        const { data, error } = await supabase.rpc('admin_unblock_user', {
          p_user_id: userId,
          p_admin_id: adminUser.id,
          p_reason: 'Bulk unblock'
        });

        if (error || (data && !data.success)) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    toast.success(`Unblocked ${successCount} users${failCount > 0 ? `, ${failCount} failed` : ''}`);
    await fetchUsers();
    setSelectedItems(new Set());
    setSelectMultipleMode(false);
  };

  const handleViewUser = (user: UserProfile) => {
    setSelectedUser(user);
    fetchUserStats(user.id);
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
    setUserStats(null);
  };

  const handleTogglePaymentStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const userEmail = users.find(u => u.id === userId)?.email || userId;

      const { error } = await supabase
        .from('user_profiles')
        .update({
          has_paid: !currentStatus,
          payment_date: !currentStatus ? new Date().toISOString() : null,
        })
        .eq('id', userId);

      if (error) throw error;

      // Log the action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'user_profiles',
          p_record_id: userId,
          p_old_values: { has_paid: currentStatus },
          p_new_values: { has_paid: !currentStatus },
          p_description: `${!currentStatus ? 'Marked' : 'Unmarked'} user as paid: ${userEmail}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log action', { 
          component: 'UsersPage', 
          action: 'togglePaymentStatus', 
          metadata: { userId, userEmail, error: logError.message } 
        });
      }

      toast.success(`Payment status updated successfully`);
      await fetchUsers();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      ErrorLogger.error(err, { 
        component: 'UsersPage', 
        action: 'togglePaymentStatus', 
        metadata: { userId } 
      });
      toast.error('Failed to update payment status');
    }
  };

  const handleSubscribeUser = async (userId: string, userEmail: string) => {
    if (!adminUser?.id) {
      toast.error('You must be logged in as an admin');
      return;
    }

    const tier = await prompt('Subscription tier (trial_7day, monthly, quarterly, biannual):', 'monthly', {
      title: 'Subscribe User',
      message: 'Enter subscription tier:',
      placeholder: 'monthly'
    });
    if (!tier || !['trial_7day', 'monthly', 'quarterly', 'biannual'].includes(tier)) {
      toast.error('Invalid subscription tier. Must be: trial_7day, monthly, quarterly, or biannual');
      return;
    }

    const durationInput = await prompt('Duration in days (default: 30):', '30', {
      title: 'Subscribe User',
      message: 'Duration in days:',
      placeholder: '30'
    });
    if (durationInput === null) return;

    const durationDays = parseInt(durationInput) || 30;

    const confirmed = await confirm(
      `Subscribe ${userEmail} to ${tier} for ${durationDays} days?`,
      {
        title: 'Confirm Subscription',
        variant: 'default',
        confirmText: 'Subscribe'
      }
    );
    if (!confirmed) return;

    try {
      setSubscribingUserId(userId);
      const { data, error } = await supabase.rpc('admin_subscribe_user', {
        p_user_id: userId,
        p_subscription_tier: tier,
        p_duration_days: durationDays,
        p_admin_id: adminUser.id,
        p_notes: null
      });

      if (error) throw error;

      if (data && !data.success) {
        toast.error(data.error || 'Failed to subscribe user');
        return;
      }

      toast.success(`User subscribed successfully!`);
      await fetchUsers();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'UsersPage', action: 'handleSubscribeUser', userId });
      toast.error('Failed to subscribe user');
    } finally {
      setSubscribingUserId(null);
    }
  };

  const handleUnsubscribeUser = async (userId: string, userEmail: string) => {
    if (!adminUser?.id) {
      toast.error('You must be logged in as an admin');
      return;
    }

    const reason = await prompt('Reason for unsubscription (optional):', '', {
      title: 'Unsubscribe User',
      message: 'Reason (optional):',
      placeholder: 'Reason...'
    });
    if (reason === null) return;

    const confirmed = await confirm(
      `Unsubscribe ${userEmail}? They will retain access until the end of their billing period.`,
      {
        title: 'Confirm Unsubscription',
        variant: 'destructive',
        confirmText: 'Unsubscribe'
      }
    );
    if (!confirmed) return;

    try {
      setUnsubscribingUserId(userId);
      const { data, error } = await supabase.rpc('admin_unsubscribe_user', {
        p_user_id: userId,
        p_admin_id: adminUser.id,
        p_reason: reason || null
      });

      if (error) throw error;

      if (data && !data.success) {
        toast.error(data.error || 'Failed to unsubscribe user');
        return;
      }

      toast.success(`User unsubscribed successfully!`);
      await fetchUsers();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'UsersPage', action: 'handleUnsubscribeUser', userId });
      toast.error('Failed to unsubscribe user');
    } finally {
      setUnsubscribingUserId(null);
    }
  };

  const exportUsersToCSV = async () => {
    const headers = ['Email', 'Role', 'Subscription Status', 'Subscription Tier', 'Payment Status', 'Monthly Usage', 'Created At', 'Last Reset'];
    const rows = filteredUsers.map(user => [
      user.email,
      user.user_role,
      user.subscription?.status || 'None',
      user.subscription?.subscription_tier || 'N/A',
      user.has_paid ? 'Paid' : 'Unpaid',
      user.monthly_usage.toString(),
      new Date(user.created_at).toLocaleString(),
      new Date(user.last_reset).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    // Log the export action
    try {
      await supabase.rpc('log_admin_action', {
        p_action_type: 'EXPORT',
        p_table_name: 'user_profiles',
        p_description: `Exported ${filteredUsers.length} user records to CSV`
      });
    } catch (logErr: unknown) {
      const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
      ErrorLogger.warn('Failed to log action', { 
        component: 'UsersPage', 
        action: 'exportToCSV', 
        metadata: { userCount: filteredUsers.length, error: logError.message } 
      });
    }

    toast.success(`Exported ${filteredUsers.length} users to CSV`);
  };

  const filteredUsers = useMemo(() =>
    users.filter(user =>
      user.email.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage all registered users</p>
        </div>
        <div className="flex items-center space-x-2">
          {selectMultipleMode && selectedItems.size > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedItems.size} selected
              </span>
              <button
                onClick={handleBulkSubscribe}
                className="flex items-center space-x-2 px-3 py-2 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-green-700 transition text-sm"
              >
                <UserPlus className="h-4 w-4" />
                <span>Subscribe</span>
              </button>
              <button
                onClick={handleBulkUnsubscribe}
                className="flex items-center space-x-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm"
              >
                <UserX className="h-4 w-4" />
                <span>Unsubscribe</span>
              </button>
              <button
                onClick={handleBulkBlock}
                className="flex items-center space-x-2 px-3 py-2 bg-red-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-red-700 transition text-sm"
              >
                <Ban className="h-4 w-4" />
                <span>Block</span>
              </button>
              <button
                onClick={handleBulkUnblock}
                className="flex items-center space-x-2 px-3 py-2 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-green-700 transition text-sm"
              >
                <Ban className="h-4 w-4" />
                <span>Unblock</span>
              </button>
              <button
                onClick={() => {
                  setSelectedItems(new Set());
                  setSelectMultipleMode(false);
                }}
                className="px-3 py-2 bg-gray-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-gray-700 transition text-sm"
              >
                Cancel
              </button>
            </div>
          )}
          {!selectMultipleMode && (
            <>
              <button
                onClick={() => setSelectMultipleMode(true)}
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-blue-700 transition"
              >
                <CheckSquare className="h-4 w-4" />
                <span>Select Multiple</span>
              </button>
              <button
                onClick={exportUsersToCSV}
                className="flex items-center space-x-2 px-5 py-2.5 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-green-700 transition"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search users by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-700">
                <tr>
                  {selectMultipleMode && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-12">
                      <button
                        onClick={() => {
                          if (selectedItems.size === filteredUsers.length) {
                            setSelectedItems(new Set());
                          } else {
                            setSelectedItems(new Set(filteredUsers.map(u => u.id)));
                          }
                        }}
                        className="p-1"
                      >
                        {selectedItems.size === filteredUsers.length ? (
                          <CheckSquare className="h-5 w-5 text-blue-600" />
                        ) : (
                          <Square className="h-5 w-5 text-gray-400" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Subscription
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Monthly Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-slate-700/50">
                    {selectMultipleMode && (
                      <td className="px-6 py-6 whitespace-nowrap">
                        <button
                          onClick={() => {
                            const newSelected = new Set(selectedItems);
                            if (newSelected.has(user.id)) {
                              newSelected.delete(user.id);
                            } else {
                              newSelected.add(user.id);
                            }
                            setSelectedItems(newSelected);
                          }}
                          className="p-1"
                        >
                          {selectedItems.has(user.id) ? (
                            <CheckSquare className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Square className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.user_role === 'admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {user.user_role}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        {user.is_blocked && (
                          <span className="px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded bg-red-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-red-800 dark:bg-red-900/30 dark:text-red-300">
                            Blocked
                          </span>
                        )}
                        {user.subscription ? (
                          <>
                            <span className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded ${
                              getStatusDisplayInfo(user.subscription.status).bgColor
                            } ${getStatusDisplayInfo(user.subscription.status).color}`}>
                              {getStatusDisplayInfo(user.subscription.status).name}
                            </span>
                            <span className={`px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded ${
                              getTierDisplayInfo(user.subscription.subscription_tier).bgColor
                            } ${getTierDisplayInfo(user.subscription.subscription_tier).color}`}>
                              {getTierDisplayInfo(user.subscription.subscription_tier).name}
                            </span>
                          </>
                        ) : (
                          <span className="px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                            No Subscription
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <button
                        onClick={() => handleTogglePaymentStatus(user.id, user.has_paid || false)}
                        className={`flex items-center space-x-2 px-3 py-1 rounded-lg transition ${
                          user.has_paid
                            ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
                            : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'
                        }`}
                        title={user.has_paid ? 'Mark as unpaid' : 'Mark as paid'}
                      >
                        {user.has_paid ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="text-xs font-semibold">
                          {user.has_paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm text-gray-900 dark:text-white">{user.monthly_usage}</span>
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleViewUser(user)}
                          className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View</span>
                        </button>
                        {user.user_role !== 'admin' && (
                          <>
                            {user.subscription?.status === 'active' ? (
                              <button
                                onClick={() => handleUnsubscribeUser(user.id, user.email)}
                                disabled={unsubscribingUserId === user.id}
                                className="flex items-center space-x-1 text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 disabled:opacity-50"
                                title="Unsubscribe user"
                              >
                                {unsubscribingUserId === user.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                                ) : (
                                  <UserX className="h-4 w-4" />
                                )}
                                <span>Unsubscribe</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSubscribeUser(user.id, user.email)}
                                disabled={subscribingUserId === user.id}
                                className="flex items-center space-x-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                title="Subscribe user"
                              >
                                {subscribingUserId === user.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                                ) : (
                                  <UserPlus className="h-4 w-4" />
                                )}
                                <span>Subscribe</span>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedUserForBlock(user);
                                setBlockModalOpen(true);
                              }}
                              disabled={selectMultipleMode}
                              className={`flex items-center space-x-1 ${
                                user.is_blocked
                                  ? 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300'
                                  : 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300'
                              } disabled:opacity-50`}
                              title={user.is_blocked ? 'Unblock user' : 'Block user'}
                            >
                              <Ban className="h-4 w-4" />
                              <span>{user.is_blocked ? 'Unblock' : 'Block'}</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                fetchUserNotesAndTags(user.id);
                                setShowNotesModal(true);
                              }}
                              disabled={selectMultipleMode}
                              className="flex items-center space-x-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-50"
                              title="View notes and tags"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No users found matching your search</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-b border-gray-200 dark:border-gray-700 px-6 py-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Details</h3>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Email Address
                  </label>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    User Role
                  </label>
                  <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${
                    selectedUser.user_role === 'admin'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {selectedUser.user_role}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Payment Status
                  </label>
                  <div className="flex items-center space-x-2">
                    {selectedUser.has_paid ? (
                      <span className="flex items-center space-x-2 px-3 py-1 bg-green-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-sm font-semibold">
                        <CheckCircle className="h-4 w-4" />
                        <span>Paid</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-2 px-3 py-1 bg-red-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-full text-sm font-semibold">
                        <XCircle className="h-4 w-4" />
                        <span>Unpaid</span>
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Payment Date
                  </label>
                  <p className="text-base text-gray-900 dark:text-white">
                    {selectedUser.payment_date ? new Date(selectedUser.payment_date).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Monthly Usage
                  </label>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{selectedUser.monthly_usage}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Last Reset
                  </label>
                  <p className="text-base text-gray-900 dark:text-white">
                    {new Date(selectedUser.last_reset).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Account Created
                  </label>
                  <p className="text-base text-gray-900 dark:text-white">
                    {new Date(selectedUser.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Last Updated
                  </label>
                  <p className="text-base text-gray-900 dark:text-white">
                    {new Date(selectedUser.updated_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {statsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : userStats && (
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Activity Statistics</h4>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-blue-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-blue-900/30 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">History Items</p>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">{userStats.historyCount}</p>
                    </div>
                    <div className="bg-green-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-green-900/30 rounded-lg p-6 border border-green-200 dark:border-green-800">
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium">Library Items</p>
                      <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">{userStats.libraryCount}</p>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                      <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Feedback</p>
                      <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-1">{userStats.feedbackCount}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedUserForBlock && (
        <BlockUserModal
          isOpen={blockModalOpen}
          onClose={() => {
            setBlockModalOpen(false);
            setSelectedUserForBlock(null);
          }}
          onSuccess={async () => {
            await fetchUsers();
            setBlockModalOpen(false);
            setSelectedUserForBlock(null);
          }}
          userId={selectedUserForBlock.id}
          userEmail={selectedUserForBlock.email}
          isCurrentlyBlocked={selectedUserForBlock.is_blocked || false}
        />
      )}

      {/* Notes and Tags Modal */}
      {selectedUser && showNotesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-b border-gray-200 dark:border-gray-700 px-6 py-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Notes & Tags: {selectedUser.email}
              </h3>
              <button
                onClick={() => {
                  setShowNotesModal(false);
                  setSelectedUser(null);
                  setUserNotes([]);
                  setUserTags([]);
                }}
                className="p-2 hover:bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Tags Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                    <Tag className="h-5 w-5" />
                    <span>Tags</span>
                  </h4>
                  <button
                    onClick={async () => {
                      const tagName = await prompt('Enter tag name:', '', {
                        title: 'Add Tag',
                        message: 'Tag name:',
                        placeholder: 'e.g., VIP, Trial User'
                      });
                      if (!tagName || !adminUser?.id) return;

                      try {
                        const { error } = await supabase
                          .from('user_tags')
                          .insert({
                            user_id: selectedUser.id,
                            tag_name: tagName.trim(),
                            created_by: adminUser.id
                          });

                        if (error) throw error;
                        toast.success('Tag added successfully');
                        await fetchUserNotesAndTags(selectedUser.id);
                      } catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        ErrorLogger.error(err, { component: 'UsersPage', action: 'addTag', userId: selectedUser.id });
                        toast.error('Failed to add tag');
                      }
                    }}
                    className="px-3 py-1 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-blue-700 transition text-sm"
                  >
                    Add Tag
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {userTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-3 py-1 bg-blue-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-sm flex items-center space-x-2"
                    >
                      <span>{tag.tag_name}</span>
                      <button
                        onClick={async () => {
                          try {
                            const { error } = await supabase
                              .from('user_tags')
                              .delete()
                              .eq('id', tag.id);

                            if (error) throw error;
                            toast.success('Tag removed');
                            await fetchUserNotesAndTags(selectedUser.id);
                          } catch (error) {
                            const err = error instanceof Error ? error : new Error(String(error));
                            ErrorLogger.error(err, { 
                              component: 'UsersPage', 
                              action: 'removeTag', 
                              metadata: { tagId: tag.id } 
                            });
                            toast.error('Failed to remove tag');
                          }
                        }}
                        className="hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {userTags.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No tags</p>
                  )}
                </div>
              </div>

              {/* Notes Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Notes</span>
                  </h4>
                  <button
                    onClick={async () => {
                      const note = await prompt('Enter note:', '', {
                        title: 'Add Note',
                        message: 'Note:',
                        placeholder: 'Add a note about this user...'
                      });
                      if (!note || !adminUser?.id) return;

                      try {
                        const { error } = await supabase
                          .from('user_notes')
                          .insert({
                            user_id: selectedUser.id,
                            admin_id: adminUser.id,
                            note: note.trim()
                          });

                        if (error) throw error;
                        toast.success('Note added successfully');
                        await fetchUserNotesAndTags(selectedUser.id);
                      } catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        ErrorLogger.error(err, { component: 'UsersPage', action: 'addNote', userId: selectedUser.id });
                        toast.error('Failed to add note');
                      }
                    }}
                    className="px-3 py-1 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-green-700 transition text-sm"
                  >
                    Add Note
                  </button>
                </div>
                <div className="space-y-3">
                  {userNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded-lg p-6 border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-gray-900 dark:text-white">{note.note}</p>
                          <div className="mt-2 flex items-center space-x-6 text-xs text-gray-500 dark:text-gray-400">
                            <span>By: {note.admin_email}</span>
                            <span>{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        {note.admin_email === adminUser?.email && (
                          <button
                            onClick={async () => {
                              try {
                                const { error } = await supabase
                                  .from('user_notes')
                                  .delete()
                                  .eq('id', note.id);

                                if (error) throw error;
                                toast.success('Note deleted');
                                await fetchUserNotesAndTags(selectedUser.id);
                              } catch (error) {
                                const err = error instanceof Error ? error : new Error(String(error));
                                ErrorLogger.error(err, { 
                                  component: 'UsersPage', 
                                  action: 'deleteNote', 
                                  metadata: { noteId: note.id } 
                                });
                                toast.error('Failed to delete note');
                              }
                            }}
                            className="ml-2 text-red-600 hover:text-red-800"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {userNotes.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No notes</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ConfirmModal}
      {PromptModal}
    </div>
  );
});
