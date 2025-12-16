import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

export interface Notification {
  id: string;
  user_id: string;
  notification_type: 'payment_failed' | 'subscription_renewed' | 'trial_expiring' | 'subscription_canceled' | 'admin_notification';
  message: string;
  is_read: boolean;
  action_url: string | null;
  expires_at: string | null;
  created_at: string;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      setupRealtimeSubscription();
    }
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useNotifications', action: 'fetchNotifications', userId: user.id });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        handleSupabaseError(error, { component: 'useNotifications', action: 'fetchNotifications', userId: user.id });
        ErrorLogger.error(error, { component: 'useNotifications', action: 'fetchNotifications', userId: user.id });
        throw error;
      }

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useNotifications', action: 'fetchNotifications', userId: user.id });
      ErrorLogger.error(error, { component: 'useNotifications', action: 'fetchNotifications', userId: user.id });
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  };

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useNotifications', action: 'markAsRead', userId: user.id, notificationId });
      return;
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) {
        handleSupabaseError(error, { component: 'useNotifications', action: 'markAsRead', userId: user.id, notificationId });
        ErrorLogger.error(error, { component: 'useNotifications', action: 'markAsRead', userId: user.id, notificationId });
        throw error;
      }

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useNotifications', action: 'markAsRead', userId: user.id, notificationId });
      ErrorLogger.error(error, { component: 'useNotifications', action: 'markAsRead', userId: user.id, notificationId });
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useNotifications', action: 'markAllAsRead', userId: user.id });
      return;
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        handleSupabaseError(error, { component: 'useNotifications', action: 'markAllAsRead', userId: user.id });
        ErrorLogger.error(error, { component: 'useNotifications', action: 'markAllAsRead', userId: user.id });
        throw error;
      }

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useNotifications', action: 'markAllAsRead', userId: user.id });
      ErrorLogger.error(error, { component: 'useNotifications', action: 'markAllAsRead', userId: user.id });
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user) return;

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useNotifications', action: 'deleteNotification', userId: user.id, notificationId });
      return;
    }

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) {
        handleSupabaseError(error, { component: 'useNotifications', action: 'deleteNotification', userId: user.id, notificationId });
        ErrorLogger.error(error, { component: 'useNotifications', action: 'deleteNotification', userId: user.id, notificationId });
        throw error;
      }

      const wasUnread = notifications.find(n => n.id === notificationId)?.is_read === false;
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      handleSupabaseError(error, { component: 'useNotifications', action: 'deleteNotification', userId: user.id, notificationId });
      ErrorLogger.error(error, { component: 'useNotifications', action: 'deleteNotification', userId: user.id, notificationId });
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: fetchNotifications
  };
};
