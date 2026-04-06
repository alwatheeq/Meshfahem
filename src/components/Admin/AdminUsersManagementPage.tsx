import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../Toast/Toast';
import { LoadingButton } from '../Common/LoadingButton';
import { Shield, Search, UserPlus, UserX, UserCheck, Clock, Calendar, AlertCircle } from 'lucide-react';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { useConfirm } from '../../hooks/useConfirm';
import { useTheme } from '../../contexts/ThemeContext';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  created_by: string | null;
  last_login_at: string | null;
  is_active: boolean;
  notes: string | null;
  creator_email?: string;
}

interface LoginAttempt {
  id: string;
  email: string;
  success: boolean;
  user_id: string | null;
  attempted_at: string;
  error_message: string | null;
  ip_address: string | null;
}

export const AdminUsersManagementPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { getThemeGradient } = useTheme();
  const toast = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedAdminEmail, setSelectedAdminEmail] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminNotes, setNewAdminNotes] = useState('');
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  useEffect(() => {
    fetchAdminUsers();
    fetchLoginAttempts();
  }, []);

  const fetchAdminUsers = async () => {
    try {
      setLoading(true);

      // Get admin users with creator info
      const { data, error } = await supabase
        .from('admin_users')
        .select(`
          *,
          creator:admin_users!created_by(email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const adminsWithCreator = (data || []).map(admin => ({
        ...admin,
        creator_email: admin.creator?.email || null
      }));

      setAdminUsers(adminsWithCreator);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'AdminUsersManagementPage', action: 'fetchAdminUsers' });
    } finally {
      setLoading(false);
    }
  };

  const fetchLoginAttempts = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_login_attempts')
        .select('*')
        .order('attempted_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setLoginAttempts(data || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'AdminUsersManagementPage', action: 'fetchLoginAttempts' });
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) {
      toast.warning('Please enter an email address');
      return;
    }

    setIsAddingAdmin(true);
    try {
      const { data, error} = await supabase.rpc('add_admin_by_email', {
        admin_email: newAdminEmail.trim(),
        admin_notes: newAdminNotes.trim() || null
      });

      if (error) throw error;

      // Log the action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'CREATE',
          p_table_name: 'admin_users',
          p_record_id: data?.user_id || null,
          p_new_values: { email: newAdminEmail.trim() },
          p_description: `Added new admin user: ${newAdminEmail.trim()}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log action', { 
          component: 'AdminUsersManagementPage', 
          action: 'handleAddAdmin', 
          metadata: { error: logError.message } 
        });
      }

      toast.success('Admin user added successfully!');
      setShowAddModal(false);
      setNewAdminEmail('');
      setNewAdminNotes('');
      fetchAdminUsers();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { 
        component: 'AdminUsersManagementPage', 
        action: 'handleAddAdmin', 
        metadata: { email: newAdminEmail } 
      });
      toast.error(error.message || 'Failed to add admin user');
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handleDeactivateAdmin = async (adminEmail: string) => {
    if (adminEmail === user?.email) {
      toast.error('You cannot deactivate your own admin account');
      return;
    }

    const confirmed = await confirm(`Are you sure you want to deactivate admin access for ${adminEmail}?`, {
      title: 'Deactivate Admin',
      variant: 'destructive',
      confirmText: 'Deactivate',
    });
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase.rpc('deactivate_admin_by_email', {
        admin_email: adminEmail
      });

      if (error) throw error;

      // Log the action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'admin_users',
          p_old_values: { is_active: true },
          p_new_values: { is_active: false },
          p_description: `Deactivated admin user: ${adminEmail}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log action', { 
          component: 'AdminUsersManagementPage', 
          action: 'handleDeactivateAdmin', 
          metadata: { adminEmail, error: logError.message } 
        });
      }

      toast.success('Admin user deactivated successfully');
      fetchAdminUsers();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { 
        component: 'AdminUsersManagementPage', 
        action: 'handleDeactivateAdmin', 
        metadata: { adminEmail } 
      });
      toast.error(error.message || 'Failed to deactivate admin user');
    }
  };

  const handleReactivateAdmin = async (adminEmail: string) => {
    const confirmed = await confirm(`Are you sure you want to reactivate admin access for ${adminEmail}?`, {
      title: 'Reactivate Admin',
      variant: 'default',
      confirmText: 'Reactivate',
    });
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase.rpc('reactivate_admin_by_email', {
        admin_email: adminEmail
      });

      if (error) throw error;

      // Log the action
      try {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'admin_users',
          p_old_values: { is_active: false },
          p_new_values: { is_active: true },
          p_description: `Reactivated admin user: ${adminEmail}`
        });
      } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log action', { 
          component: 'AdminUsersManagementPage', 
          action: 'handleReactivateAdmin', 
          metadata: { adminEmail, error: logError.message } 
        });
      }

      toast.success('Admin user reactivated successfully');
      fetchAdminUsers();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { 
        component: 'AdminUsersManagementPage', 
        action: 'handleReactivateAdmin', 
        metadata: { adminEmail } 
      });
      toast.error(error.message || 'Failed to reactivate admin user');
    }
  };

  const handleViewHistory = (email: string) => {
    setSelectedAdminEmail(email);
    setShowHistoryModal(true);
  };

  const filteredAdminUsers = useMemo(() =>
    adminUsers.filter(admin =>
      admin.email.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    ),
    [adminUsers, debouncedSearchQuery]
  );

  const filteredLoginAttempts = useMemo(() =>
    loginAttempts.filter(attempt =>
      selectedAdminEmail ? attempt.email === selectedAdminEmail : true
    ),
    [loginAttempts, selectedAdminEmail]
  );

  const stats = {
    total_admins: adminUsers.length,
    active_admins: adminUsers.filter(a => a.is_active).length,
    inactive_admins: adminUsers.filter(a => !a.is_active).length,
    recent_logins: loginAttempts.filter(a => a.success).length
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Users Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage administrator access and permissions</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-blue-700 transition"
        >
          <UserPlus className="h-4 w-4" />
          <span>Add Admin</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className={`${getThemeGradient('ui')} text-white rounded-md p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Total Admins</p>
              <p className="text-3xl font-bold mt-1">{stats.total_admins}</p>
            </div>
            <Shield className="h-8 w-8 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Active Admins</p>
              <p className="text-3xl font-bold mt-1">{stats.active_admins}</p>
            </div>
            <UserCheck className="h-8 w-8 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Inactive Admins</p>
              <p className="text-3xl font-bold mt-1">{stats.inactive_admins}</p>
            </div>
            <UserX className="h-8 w-8 opacity-80" />
          </div>
        </div>

        <div className={`${getThemeGradient('ui')} text-white rounded-md p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Recent Logins</p>
              <p className="text-3xl font-bold mt-1">{stats.recent_logins}</p>
            </div>
            <Clock className="h-8 w-8 opacity-80" />
          </div>
        </div>
      </div>

      {/* Admin Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search admin users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAdminUsers.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-slate-700/50">
                  <td className="px-6 py-6 whitespace-nowrap">
                    <div className="flex items-center">
                      <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {admin.email}
                        </div>
                        {admin.notes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {admin.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 whitespace-nowrap">
                    {admin.is_active ? (
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-gray-800 dark:bg-gray-900/30 dark:text-gray-300">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-6 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {admin.creator_email || 'System'}
                    </div>
                  </td>
                  <td className="px-6 py-6 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {admin.last_login_at
                        ? new Date(admin.last_login_at).toLocaleString()
                        : 'Never'
                      }
                    </div>
                  </td>
                  <td className="px-6 py-6 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleViewHistory(admin.email)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        View History
                      </button>
                      {admin.email !== user?.email && (
                        admin.is_active ? (
                          <button
                            onClick={() => handleDeactivateAdmin(admin.email)}
                            className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivateAdmin(admin.email)}
                            className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                          >
                            Reactivate
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredAdminUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No admin users found</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Admin Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add Admin User</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewAdminEmail('');
                  setNewAdminNotes('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <AlertCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={newAdminNotes}
                  onChange={(e) => setNewAdminNotes(e.target.value)}
                  placeholder="Additional information about this admin..."
                  rows={3}
                  className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
                />
              </div>

              <div className="bg-blue-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  The user must already have an account in the system. They will be added to the admin_users table.
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <LoadingButton
                  onClick={handleAddAdmin}
                  loading={isAddingAdmin}
                  variant="primary"
                  className="flex-1"
                >
                  Add Admin
                </LoadingButton>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewAdminEmail('');
                    setNewAdminNotes('');
                  }}
                  disabled={isAddingAdmin}
                  className="flex-1 px-5 py-2.5 bg-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Login History - {selectedAdminEmail}
              </h3>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedAdminEmail('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <AlertCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-3">
                {filteredLoginAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className={`p-6 rounded-lg border ${
                      attempt.success
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          {attempt.success ? (
                            <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <UserX className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                          <span className={`font-semibold ${
                            attempt.success
                              ? 'text-green-800 dark:text-green-200'
                              : 'text-red-800 dark:text-red-200'
                          }`}>
                            {attempt.success ? 'Successful Login' : 'Failed Login'}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(attempt.attempted_at).toLocaleString()}</span>
                          </div>
                          {attempt.error_message && (
                            <div className="mt-1 text-red-600 dark:text-red-400">
                              Error: {attempt.error_message}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {filteredLoginAttempts.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-gray-400">No login attempts found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {ConfirmModal}
    </div>
  );
});
