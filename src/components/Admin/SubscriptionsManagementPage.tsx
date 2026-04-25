import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Search, Download, Plus,
  DollarSign, TrendingUp, Users, CheckCircle, XCircle, Clock, Edit, Trash2, Ban, RotateCw
} from 'lucide-react';
import { getTierDisplayInfo, getStatusDisplayInfo, formatCurrency } from '../../utils/subscriptionHelpers';
import { SubscriptionModal } from './SubscriptionModal';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useConfirm } from '../../hooks/useConfirm';
import { usePrompt } from '../../hooks/usePrompt';
import { useDebounce } from '../../hooks/useDebounce';
import { PerformanceMonitor } from '../../utils/performanceMonitor';

interface Subscription {
  id: string;
  user_id: string;
  subscription_tier: string;
  status: string;
  start_date: string;
  end_date: string;
  next_billing_date: string | null;
  auto_renew: boolean;
  created_at: string;
  user_profiles: {
    email: string;
    display_name: string | null;
  };
}

interface Stats {
  total_subscriptions: number;
  active_subscriptions: number;
  trial_users: number;
  monthly_revenue: number;
  churn_rate: number;
}

export const SubscriptionsManagementPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const { prompt, PromptModal } = usePrompt();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_subscriptions: 0,
    active_subscriptions: 0,
    trial_users: 0,
    monthly_revenue: 0,
    churn_rate: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    return PerformanceMonitor.measureAsync('SubscriptionsManagementPage.fetchSubscriptions', async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          user_profiles!inner(email, display_name)
        `)
        .order('created_at', { ascending: false });

        if (error) throw error;

        setSubscriptions(data || []);
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        ErrorLogger.error(error, { component: 'SubscriptionsManagementPage', action: 'fetchSubscriptions' });
        toast.error('Failed to load subscriptions');
      } finally {
        setLoading(false);
      }
    });
  }, [toast]);

  const fetchStats = useCallback(async () => {
    try {
      const { data: allSubs, error: subsError } = await supabase
        .from('subscriptions')
        .select('subscription_tier, status');

      if (subsError) throw subsError;

      const activeSubs = allSubs?.filter(s => s.status === 'active') || [];
      const trialUsers = allSubs?.filter(s => s.subscription_tier.includes('trial') && s.status === 'active') || [];

      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('amount, created_at')
        .eq('status', 'succeeded')
        .gte('created_at', new Date(new Date().setDate(new Date().getDate() - 30)).toISOString());

      if (transError) throw transError;

      const monthlyRevenue = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      setStats({
        total_subscriptions: allSubs?.length || 0,
        active_subscriptions: activeSubs.length,
        trial_users: trialUsers.length,
        monthly_revenue: monthlyRevenue,
        churn_rate: 0
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      ErrorLogger.error(error, { component: 'SubscriptionsManagementPage', action: 'fetchStats' });
    }
  }, []);

  useEffect(() => {
    void fetchSubscriptions();
    void fetchStats();
  }, [fetchSubscriptions, fetchStats]);

  const filteredSubscriptions = useMemo(() =>
    subscriptions.filter(sub => {
      const matchesSearch = sub.user_profiles.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           sub.user_profiles.display_name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || sub.status === filterStatus;
      const matchesTier = filterTier === 'all' || sub.subscription_tier === filterTier;

      return matchesSearch && matchesStatus && matchesTier;
    }),
    [subscriptions, debouncedSearchTerm, filterStatus, filterTier]
  );

  const handleCreateNew = () => {
    setModalMode('create');
    setSelectedSubscription(null);
    setShowModal(true);
  };

  const handleEdit = (subscription: Subscription) => {
    setModalMode('edit');
    setSelectedSubscription(subscription);
    setShowModal(true);
  };

  const handleCancel = async (subscription: Subscription) => {
    if (subscription.status === 'canceled') {
      toast.warning('This subscription is already canceled.');
      return;
    }

    const reason = await prompt('Enter a reason for cancellation (optional):', '', {
      title: 'Cancel Subscription',
      message: 'Enter a reason for cancellation (optional):',
      placeholder: 'Reason (optional)',
    });
    if (reason === null) return;

    const confirmed = await confirm(`Are you sure you want to cancel this subscription for ${subscription.user_profiles.email}? They will retain access until ${new Date(subscription.end_date).toLocaleDateString()}.`, {
      title: 'Cancel Subscription',
      variant: 'destructive',
      confirmText: 'Cancel Subscription',
    });
    if (!confirmed) {
      return;
    }

    try {
      if (!user?.id) {
        toast.error('You must be logged in as an admin');
        return;
      }

      const { data, error } = await supabase.rpc('admin_cancel_subscription', {
        p_subscription_id: subscription.id,
        p_admin_id: user.id,
        p_reason: reason || null
      });

      if (error) throw error;

      if (data && !data.success) {
        toast.error(data.error || 'Failed to cancel subscription');
        return;
      }

      toast.success('Subscription canceled successfully! User will retain access until end of billing period.');
      
      // Log audit action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'subscriptions',
          p_record_id: subscription.id,
          p_old_values: { status: subscription.status },
          p_new_values: { status: 'canceled' },
          p_description: `Canceled subscription for ${subscription.user_profiles.email}${reason ? ` - Reason: ${reason}` : ''}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log admin action', { 
          component: 'SubscriptionsManagementPage', 
          action: 'handleCancel', 
          metadata: { subscriptionId: subscription.id, error: logError.message } 
        });
      }
      
      fetchSubscriptions();
      fetchStats();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      ErrorLogger.error(error, { 
        component: 'SubscriptionsManagementPage', 
        action: 'cancelSubscription', 
        metadata: { subscriptionId: subscription.id } 
      });
      toast.error('Failed to cancel subscription. Please try again.');
    }
  };

  const handleReactivate = async (subscription: Subscription) => {
    if (subscription.status === 'active') {
      toast.warning('This subscription is already active.');
      return;
    }

    const extendDaysInput = await prompt('Extend subscription by days (optional, default: 30):', '30', {
      title: 'Reactivate Subscription',
      message: 'Extend subscription by days (optional):',
      placeholder: '30'
    });
    if (extendDaysInput === null) return;

    const extendDays = extendDaysInput ? parseInt(extendDaysInput) : null;

    const confirmed = await confirm(
      `Reactivate subscription for ${subscription.user_profiles.email}?${extendDays ? ` Subscription will be extended by ${extendDays} days.` : ''}`,
      {
        title: 'Reactivate Subscription',
        variant: 'default',
        confirmText: 'Reactivate'
      }
    );
    if (!confirmed) return;

    try {
      if (!user?.id) {
        toast.error('You must be logged in as an admin');
        return;
      }

      const { data, error } = await supabase.rpc('admin_reactivate_subscription', {
        p_subscription_id: subscription.id,
        p_admin_id: user.id,
        p_extend_days: extendDays
      });

      if (error) throw error;

      if (data && !data.success) {
        toast.error(data.error || 'Failed to reactivate subscription');
        return;
      }

      toast.success('Subscription reactivated successfully!');
      
      // Log audit action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'subscriptions',
          p_record_id: subscription.id,
          p_old_values: { status: subscription.status },
          p_new_values: { status: 'active' },
          p_description: `Reactivated subscription for ${subscription.user_profiles.email}${extendDays ? ` - Extended by ${extendDays} days` : ''}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log action', { 
          component: 'SubscriptionsManagementPage', 
          action: 'handleReactivate', 
          metadata: { subscriptionId: subscription.id, error: logError.message } 
        });
      }
      
      fetchSubscriptions();
      fetchStats();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      ErrorLogger.error(error, { 
        component: 'SubscriptionsManagementPage', 
        action: 'reactivateSubscription', 
        metadata: { subscriptionId: subscription.id } 
      });
      toast.error('Failed to reactivate subscription. Please try again.');
    }
  };

  const handleDelete = async (subscription: Subscription) => {
    const confirmed = await confirm(`Are you sure you want to permanently delete this subscription for ${subscription.user_profiles.email}? This action cannot be undone.`, {
      title: 'Delete Subscription',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', subscription.id);

      if (error) throw error;

      // Log audit action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'DELETE',
          p_table_name: 'subscriptions',
          p_record_id: subscription.id,
          p_old_values: { user_id: subscription.user_id, subscription_tier: subscription.subscription_tier, status: subscription.status },
          p_description: `Deleted subscription for ${subscription.user_profiles.email}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log admin action', { 
          component: 'SubscriptionsManagementPage', 
          action: 'handleDelete', 
          metadata: { subscriptionId: subscription.id, error: logError.message } 
        });
      }

      toast.success('Subscription deleted successfully!');
      fetchSubscriptions();
      fetchStats();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      ErrorLogger.error(error, { 
        component: 'SubscriptionsManagementPage', 
        action: 'deleteSubscription', 
        metadata: { subscriptionId: subscription.id } 
      });
      toast.error('Failed to delete subscription. Please try again.');
    }
  };

  const handleModalSuccess = () => {
    fetchSubscriptions();
    fetchStats();
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Name', 'Tier', 'Status', 'Start Date', 'End Date', 'Auto Renew'];
    const rows = filteredSubscriptions.map(sub => [
      sub.user_profiles.email,
      sub.user_profiles.name || '',
      sub.subscription_tier,
      sub.status,
      new Date(sub.start_date).toLocaleDateString(),
      new Date(sub.end_date).toLocaleDateString(),
      sub.auto_renew ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return <LoadingSkeleton type="table" count={10} className="mt-8" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Subscriptions Management</h1>
          <p className="text-gray-400 mt-1">Manage and monitor all user subscriptions</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center space-x-2 px-5 py-2.5 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-green-700 text-white rounded-lg transition"
        >
          <Plus className="h-5 w-5" />
          <span>New Subscription</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 p-3 rounded-lg">
              <Users className="h-6 w-6 text-blue-400" />
            </div>
            <TrendingUp className="h-5 w-5 text-green-400" />
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Total Subscriptions</h3>
          <p className="text-3xl font-bold text-white">{stats.total_subscriptions}</p>
        </div>

        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Active Subscriptions</h3>
          <p className="text-3xl font-bold text-white">{stats.active_subscriptions}</p>
        </div>

        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-500/20 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-orange-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Trial Users</h3>
          <p className="text-3xl font-bold text-white">{stats.trial_users}</p>
        </div>

        <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 p-3 rounded-lg">
              <DollarSign className="h-6 w-6 text-purple-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm mb-1">Monthly Revenue</h3>
          <p className="text-3xl font-bold text-white">{formatCurrency(stats.monthly_revenue)}</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md p-6 border border-slate-700">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-5 py-2.5 bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="canceled">Canceled</option>
            <option value="expired">Expired</option>
            <option value="payment_failed">Payment Failed</option>
          </select>

          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value)}
            className="px-5 py-2.5 bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Tiers</option>
            <option value="trial_1day">Legacy 1-day</option>
            <option value="trial_7day">7-Day Trial</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="biannual">Biannual</option>
          </select>

          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Download className="h-5 w-5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Subscriptions Table */}
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
                  Start Date
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  End Date
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Auto Renew
                </th>
                <th className="px-6 py-6 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredSubscriptions.map((subscription) => {
                const tierInfo = getTierDisplayInfo(subscription.subscription_tier);
                const statusInfo = getStatusDisplayInfo(subscription.status);

                return (
                  <tr key={subscription.id} className="hover:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/50">
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {subscription.user_profiles.name || 'No Name'}
                        </p>
                        <p className="text-xs text-gray-400">{subscription.user_profiles.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tierInfo.bgColor} ${tierInfo.color}`}>
                        {tierInfo.name}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.bgColor} ${statusInfo.color}`}>
                        {statusInfo.name}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm text-gray-300">
                      {new Date(subscription.start_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm text-gray-300">
                      {new Date(subscription.end_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      {subscription.auto_renew ? (
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400" />
                      )}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(subscription)}
                          className="p-2 hover:bg-blue-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 rounded-lg transition"
                          title="Edit subscription"
                        >
                          <Edit className="h-4 w-4 text-blue-400" />
                        </button>
                        {subscription.status === 'active' ? (
                          <button
                            onClick={() => handleCancel(subscription)}
                            className="p-2 hover:bg-orange-500/20 rounded-lg transition"
                            title="Cancel subscription"
                          >
                            <Ban className="h-4 w-4 text-orange-400" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(subscription)}
                            className="p-2 hover:bg-green-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 rounded-lg transition"
                            title="Reactivate subscription"
                          >
                            <RotateCw className="h-4 w-4 text-green-400" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(subscription)}
                          className="p-2 hover:bg-red-500 shadow-[0_2px_8px_rgba(0,0,0,0.08)]/20 rounded-lg transition"
                          title="Delete subscription"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredSubscriptions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No subscriptions found</p>
          </div>
        )}
      </div>

      {showModal && (
        <SubscriptionModal
          subscription={selectedSubscription || undefined}
          mode={modalMode}
          onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}
      {ConfirmModal}
      {PromptModal}
    </div>
  );
});
