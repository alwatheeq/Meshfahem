import React, { useState } from 'react';
import { X, Ban, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useAuth } from '../../hooks/useAuth';

interface BlockUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  userEmail: string;
  isCurrentlyBlocked: boolean;
}

export const BlockUserModal: React.FC<BlockUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userEmail,
  isCurrentlyBlocked,
}) => {
  const { user: adminUser } = useAuth();
  const toast = useToast();
  const [blockType, setBlockType] = useState<'permanent' | 'temporary'>('permanent');
  const [expirationDate, setExpirationDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adminUser?.id) {
      toast.error('You must be logged in as an admin');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for blocking');
      return;
    }

    if (blockType === 'temporary' && !expirationDate) {
      toast.error('Please select an expiration date for temporary block');
      return;
    }

    try {
      setLoading(true);

      if (isCurrentlyBlocked) {
        // Unblock user
        const { data, error } = await supabase.rpc('admin_unblock_user', {
          p_user_id: userId,
          p_admin_id: adminUser.id,
          p_reason: reason || null
        });

        if (error) throw error;

        if (data && !data.success) {
          toast.error(data.error || 'Failed to unblock user');
          return;
        }

        toast.success('User unblocked successfully!');
      } else {
        // Block user
        const expiresAt = blockType === 'temporary' && expirationDate 
          ? new Date(expirationDate).toISOString() 
          : null;

        const { data, error } = await supabase.rpc('admin_block_user', {
          p_user_id: userId,
          p_admin_id: adminUser.id,
          p_reason: reason,
          p_expires_at: expiresAt
        });

        if (error) throw error;

        if (data && !data.success) {
          toast.error(data.error || 'Failed to block user');
          return;
        }

        toast.success(`User ${blockType === 'permanent' ? 'permanently' : 'temporarily'} blocked successfully!`);
      }

      onSuccess();
      handleClose();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'BlockUserModal', 
        action: isCurrentlyBlocked ? 'unblockUser' : 'blockUser', 
        userId 
      });
      toast.error(`Failed to ${isCurrentlyBlocked ? 'unblock' : 'block'} user`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setBlockType('permanent');
    setExpirationDate('');
    setReason('');
    onClose();
  };

  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-md w-full">
        <div className="sticky top-0 bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-b border-gray-200 dark:border-gray-700 px-6 py-6 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isCurrentlyBlocked ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {isCurrentlyBlocked ? (
                <Ban className="h-5 w-5 text-green-500" />
              ) : (
                <Ban className="h-5 w-5 text-red-500" />
              )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {isCurrentlyBlocked ? 'Unblock User' : 'Block User'}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-gray-700 rounded-lg transition"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {isCurrentlyBlocked ? (
                <>Unblocking <span className="font-semibold text-gray-900 dark:text-white">{userEmail}</span> will restore their access to the website.</>
              ) : (
                <>Blocking <span className="font-semibold text-gray-900 dark:text-white">{userEmail}</span> will prevent them from accessing the website.</>
              )}
            </p>
          </div>

          {!isCurrentlyBlocked && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Block Type
              </label>
              <div className="flex space-x-6">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="blockType"
                    value="permanent"
                    checked={blockType === 'permanent'}
                    onChange={(e) => {
                      setBlockType(e.target.value as 'permanent' | 'temporary');
                      setExpirationDate('');
                    }}
                    className="w-4 h-4 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Permanent</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="blockType"
                    value="temporary"
                    checked={blockType === 'temporary'}
                    onChange={(e) => setBlockType(e.target.value as 'permanent' | 'temporary')}
                    className="w-4 h-4 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Temporary</span>
                </label>
              </div>
            </div>
          )}

          {!isCurrentlyBlocked && blockType === 'temporary' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Clock className="h-4 w-4 inline mr-1" />
                Expiration Date
              </label>
              <input
                type="datetime-local"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                min={minDate}
                required={blockType === 'temporary'}
                className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              Reason {isCurrentlyBlocked ? '(optional)' : '(required)'}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isCurrentlyBlocked ? 'Reason for unblocking...' : 'Reason for blocking...'}
              required={!isCurrentlyBlocked}
              rows={4}
              className="w-full px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 text-white rounded-lg transition ${
                isCurrentlyBlocked
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>{isCurrentlyBlocked ? 'Unblocking...' : 'Blocking...'}</span>
                </span>
              ) : (
                isCurrentlyBlocked ? 'Unblock User' : 'Block User'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

