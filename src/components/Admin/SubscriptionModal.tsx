import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';

interface User {
  id: string;
  email: string;
}

interface Subscription {
  id?: string;
  user_id: string;
  subscription_tier: string;
  status: string;
  end_date: string;
  auto_renew: boolean;
}

interface SubscriptionModalProps {
  subscription?: Subscription;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  subscription,
  onClose,
  onSuccess,
  mode,
}) => {
  const { user } = useAuth();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    user_id: subscription?.user_id || '',
    subscription_tier: subscription?.subscription_tier || 'trial_7day',
    status: subscription?.status || 'active',
    duration_days: '30',
    auto_renew: subscription?.auto_renew ?? false,
  });

  useEffect(() => {
    if (mode === 'create') {
      fetchUsers();
    }
  }, [mode]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email')
        .order('email');

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'SubscriptionModal', action: 'fetchUsers' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + parseInt(formData.duration_days));

      if (mode === 'create') {
        const { data: existingActive, error: checkError } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', formData.user_id)
          .eq('status', 'active')
          .maybeSingle();

        if (checkError) throw checkError;

        if (existingActive) {
          const confirmCancel = await confirm(
            'This user already has an active subscription. Do you want to cancel it and create a new one?',
            {
              title: 'Active Subscription Found',
              variant: 'default',
            }
          );
          if (!confirmCancel) {
            setSaving(false);
            return;
          }

          await supabase
            .from('subscriptions')
            .update({ status: 'canceled', canceled_at: new Date().toISOString() })
            .eq('id', existingActive.id);
        }

        const billingCycleEnd = new Date(startDate);
        if (formData.subscription_tier === 'trial_7day') {
          billingCycleEnd.setTime(endDate.getTime());
        } else {
          billingCycleEnd.setDate(billingCycleEnd.getDate() + 30);
        }

        const tokenLimits: Record<string, number> = {
          trial_7day: 121000,
          monthly: 520000,
          quarterly: 520000,
          biannual: 520000,
        };

        const { error: insertError } = await supabase.from('subscriptions').insert({
          user_id: formData.user_id,
          subscription_tier: formData.subscription_tier,
          status: formData.status,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          billing_cycle_start: startDate.toISOString(),
          billing_cycle_end: billingCycleEnd.toISOString(),
          token_limit: tokenLimits[formData.subscription_tier] || 100000,
          tokens_used_current_cycle: 0,
          auto_renew: formData.auto_renew,
          trial_end_date: formData.subscription_tier.startsWith('trial') ? endDate.toISOString() : null,
        });

        if (insertError) throw insertError;

        // Log audit action
        if (user?.id) {
          const createdUser = users.find(u => u.id === formData.user_id);
          await supabase.rpc('log_admin_action', {
            p_action_type: 'CREATE',
            p_table_name: 'subscriptions',
            p_record_id: null,
            p_new_values: { user_id: formData.user_id, subscription_tier: formData.subscription_tier, status: formData.status },
            p_description: `Created ${formData.subscription_tier} subscription for ${createdUser?.email || formData.user_id}`
          }).catch(err => ErrorLogger.warn('Failed to log admin action', { component: 'SubscriptionModal', action: 'handleSave', mode: 'create', error: err instanceof Error ? err : new Error(String(err)) }));
        }

        showSuccessToast('Subscription created successfully!');
      } else {
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            subscription_tier: formData.subscription_tier,
            status: formData.status,
            end_date: endDate.toISOString(),
            auto_renew: formData.auto_renew,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription!.id);

        if (updateError) throw updateError;

        // Log audit action
        if (user?.id) {
          try {
            await supabase.rpc('log_admin_action', {
              p_action_type: 'UPDATE',
              p_table_name: 'subscriptions',
              p_record_id: subscription!.id,
              p_old_values: { subscription_tier: subscription!.subscription_tier, status: subscription!.status, auto_renew: subscription!.auto_renew },
              p_new_values: { subscription_tier: formData.subscription_tier, status: formData.status, auto_renew: formData.auto_renew },
              p_description: `Updated subscription: ${formData.subscription_tier} (${formData.status})`
            });
          } catch (logErr: unknown) {
            const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
            ErrorLogger.warn('Failed to log admin action', { 
              component: 'SubscriptionModal', 
              action: 'handleSave', 
              metadata: { mode: 'edit', subscriptionId: subscription!.id, error: logError.message } 
            });
          }
        }

        showSuccessToast('Subscription updated successfully!');
      }

      onSuccess();
      onClose();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { 
        component: 'SubscriptionModal', 
        action: 'handleSave', 
        metadata: { mode, userId: formData.user_id, tier: formData.subscription_tier } 
      });
      showErrorToast('Failed to save subscription. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = useMemo(() =>
    users.filter((user) =>
      user.email.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ),
    [users, debouncedSearchTerm]
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-b border-gray-200 dark:border-gray-700 px-6 py-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {mode === 'create' ? 'Create New Subscription' : 'Edit Subscription'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-gray-700 rounded-lg transition"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select User
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
                />
              </div>
              <select
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                required
                className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
                size={6}
              >
                <option value="">Choose a user...</option>
                {loading ? (
                  <option disabled>Loading users...</option>
                ) : (
                  filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subscription Tier
            </label>
            <select
              value={formData.subscription_tier}
              onChange={(e) => setFormData({ ...formData, subscription_tier: e.target.value })}
              required
              className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            >
              <option value="trial_7day">7-Day Trial (121K tokens)</option>
              <option value="monthly">Monthly (520K tokens/30 days)</option>
              <option value="quarterly">Quarterly (520K tokens/30 days)</option>
              <option value="biannual">Biannual (520K tokens/30 days)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
              className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            >
              <option value="active">Active</option>
              <option value="canceled">Canceled</option>
              <option value="expired">Expired</option>
              <option value="payment_failed">Payment Failed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Duration (Days from now)
            </label>
            <input
              type="number"
              min="1"
              max="3650"
              value={formData.duration_days}
              onChange={(e) => setFormData({ ...formData, duration_days: e.target.value })}
              required
              className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Common durations: 1 day (trial), 7 days (trial), 30 days (monthly), 90 days (quarterly), 180 days (biannual)
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="auto_renew"
              checked={formData.auto_renew}
              onChange={(e) => setFormData({ ...formData, auto_renew: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="auto_renew" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Auto-renew enabled
            </label>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={saving || (mode === 'create' && !formData.user_id)}
              className="flex-1 px-5 py-2.5 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{mode === 'create' ? 'Create Subscription' : 'Update Subscription'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
      {ConfirmModal}
    </div>
  );
};
