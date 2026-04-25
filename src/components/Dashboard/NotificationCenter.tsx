import React, { useState, useMemo } from 'react';
import { Bell, X, Check, AlertCircle, Info, CheckCircle, XCircle, Timer } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { PomodoroTimer } from './PomodoroTimer';

type NotificationTab = 'alerts' | 'timer';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationTab>('alerts');

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => n.notification_type !== 'trial_expiring'),
    [notifications]
  );

  const visibleUnreadCount = useMemo(
    () => visibleNotifications.filter((n) => !n.is_read).length,
    [visibleNotifications]
  );

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'payment_failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'subscription_renewed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'trial_expiring':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'subscription_canceled':
        return <Info className="h-5 w-5 text-blue-500" />;
      case 'admin_notification':
        return <Info className="h-5 w-5 text-purple-500" />;
      default:
        return <Bell className={`h-5 w-5 ${getThemeTextMuted()}`} />;
    }
  };

  const _getNotificationColor = (type: string) => {
    switch (type) {
      case 'payment_failed':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'subscription_renewed':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'trial_expiring':
        return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
      case 'subscription_canceled':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'admin_notification':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
      default:
        return `${getThemeSubtle('bg')} ${getThemeCardBorder()}`;
    }
  };

  const handleNotificationClick = (notification: { id: string; action_url?: string }) => {
    markAsRead(notification.id);
    if (notification.action_url) {
      navigate(notification.action_url);
      setIsOpen(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) setActiveTab('alerts');
        }}
        className={`relative p-2 hover:opacity-60 rounded-lg transition duration-200`}
      >
        <Bell className={`h-6 w-6 ${getThemeTextSecondary()}`} />
        {visibleUnreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {visibleUnreadCount > 9 ? '9+' : visibleUnreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Panel */}
          <div className={`absolute right-0 mt-2 w-96 ${getThemeCardBg()} rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-lg ${getThemeCardBorder()} z-50 max-h-[min(600px,80vh)] flex flex-col`}>
            {/* Header */}
            <div className={`p-4 border-b ${getThemeCardBorder()} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={`text-lg font-bold ${getThemeTextPrimary()}`}>Notifications</h3>
                {activeTab === 'alerts' && visibleUnreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium flex items-center space-x-1 shrink-0"
                  >
                    <Check className="h-4 w-4" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>
              <div
                className={`flex rounded-lg p-0.5 ${getThemeSubtle('bg')} border ${getThemeCardBorder()}`}
                role="tablist"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'alerts'}
                  onClick={() => setActiveTab('alerts')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-sm font-medium transition ${
                    activeTab === 'alerts'
                      ? `${getThemeCardBg()} shadow-sm ${getThemeTextPrimary()}`
                      : `${getThemeTextMuted()} hover:opacity-80`
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  Alerts
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'timer'}
                  onClick={() => setActiveTab('timer')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-sm font-medium transition ${
                    activeTab === 'timer'
                      ? `${getThemeCardBg()} shadow-sm ${getThemeTextPrimary()}`
                      : `${getThemeTextMuted()} hover:opacity-80`
                  }`}
                >
                  <Timer className="h-4 w-4" />
                  Timer
                </button>
              </div>
              {activeTab === 'alerts' && visibleUnreadCount > 0 && (
                <p className={`text-sm ${getThemeTextMuted()}`}>{visibleUnreadCount} unread</p>
              )}
            </div>

            {activeTab === 'alerts' ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {visibleNotifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-3`} />
                      <p className={getThemeTextMuted()}>No notifications</p>
                      <p className={`text-sm ${getThemeTextMuted()} mt-1`}>
                        You're all caught up!
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {visibleNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 hover:opacity-60 transition cursor-pointer ${
                            !notification.is_read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                          }`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="flex-shrink-0 mt-1">
                              {getNotificationIcon(notification.notification_type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${
                                !notification.is_read
                                  ? `font-semibold ${getThemeTextPrimary()}`
                                  : getThemeTextSecondary()
                              }`}>
                                {notification.message}
                              </p>
                              <p className={`text-xs ${getThemeTextMuted()} mt-1`}>
                                {formatTimeAgo(notification.created_at)}
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              {!notification.is_read && (
                                <div className="h-2 w-2 bg-blue-500 rounded-full" />
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotification(notification.id);
                                }}
                                className={`ml-2 p-1 hover:opacity-60 rounded transition`}
                              >
                                <X className={`h-4 w-4 ${getThemeTextMuted()}`} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {visibleNotifications.length > 0 && (
                  <div className={`p-3 border-t ${getThemeCardBorder()} text-center`}>
                    <button
                      onClick={() => {
                        setIsOpen(false);
                      }}
                      className={`text-sm ${getThemeTextSecondary()} hover:opacity-80`}
                    >
                      Close
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 overflow-y-auto min-h-0 p-4">
                <PomodoroTimer variant="embedded" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
