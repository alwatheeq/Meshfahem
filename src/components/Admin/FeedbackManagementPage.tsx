import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Filter, Eye, X, Clock, Image as ImageIcon, Download, Trash2 } from 'lucide-react';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';

interface Feedback {
  id: string;
  user_id: string;
  user_email: string;
  feedback_type: 'feedback' | 'suggestion';
  feedback_text: string;
  media_urls: string[];
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
}

export const FeedbackManagementPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeedbacks(data || []);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'FeedbackManagementPage', action: 'fetchFeedbacks' });
    } finally {
      setLoading(false);
    }
  };

  const updateFeedbackStatus = async (id: string, newStatus: 'pending' | 'reviewed' | 'resolved') => {
    try {
      const { error } = await supabase
        .from('user_feedback')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setFeedbacks(prev =>
        prev.map(fb => (fb.id === id ? { ...fb, status: newStatus } : fb))
      );

      if (selectedFeedback?.id === id) {
        setSelectedFeedback(prev => prev ? { ...prev, status: newStatus } : null);
      }

      // Log audit action
      if (user?.id) {
        try {
          await supabase.rpc('log_admin_action', {
            p_action_type: 'UPDATE',
            p_table_name: 'user_feedback',
            p_record_id: id,
            p_old_values: { status: feedbacks.find(f => f.id === id)?.status },
            p_new_values: { status: newStatus },
            p_description: `Updated feedback status to ${newStatus}`
          });
        } catch (logErr: unknown) {
          const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
          ErrorLogger.warn('Failed to log admin action', { 
            component: 'FeedbackManagementPage', 
            action: 'updateFeedbackStatus', 
            metadata: { feedbackId: id, error: logError.message } 
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'FeedbackManagementPage', 
        action: 'updateFeedbackStatus', 
        metadata: { feedbackId: id, newStatus } 
      });
      showErrorToast('Failed to update feedback status');
    }
  };

  const deleteFeedback = async (id: string) => {
    const confirmed = await confirm('Are you sure you want to delete this feedback? This action cannot be undone.', {
      title: 'Delete Feedback',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase
        .from('user_feedback')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setFeedbacks(prev => prev.filter(fb => fb.id !== id));

      if (selectedFeedback?.id === id) {
        setSelectedFeedback(null);
      }

      // Log audit action
      if (user?.id) {
        try {
          await supabase.rpc('log_admin_action', {
            p_action_type: 'DELETE',
            p_table_name: 'user_feedback',
            p_record_id: id,
            p_old_values: { feedback_text: feedbacks.find(f => f.id === id)?.feedback_text, status: feedbacks.find(f => f.id === id)?.status },
            p_description: `Deleted feedback from ${feedbacks.find(f => f.id === id)?.user_email || 'unknown user'}`
          });
        } catch (logErr: unknown) {
          const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
          ErrorLogger.warn('Failed to log admin action', { 
            component: 'FeedbackManagementPage', 
            action: 'deleteFeedback', 
            metadata: { feedbackId: id, error: logError.message } 
          });
        }
      }

      showSuccessToast('Feedback deleted successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'FeedbackManagementPage', 
        action: 'deleteFeedback', 
        metadata: { feedbackId: id } 
      });
      showErrorToast('Failed to delete feedback');
    }
  };

  const exportFeedbackToCSV = () => {
    const headers = ['Email', 'Type', 'Status', 'Feedback', 'Created At'];
    const rows = filteredFeedbacks.map(fb => [
      fb.user_email,
      fb.feedback_type,
      fb.status,
      fb.feedback_text.replace(/"/g, '""'),
      new Date(fb.created_at).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feedback-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredFeedbacks = useMemo(() =>
    feedbacks.filter(fb => {
      const matchesSearch = fb.feedback_text.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                            fb.user_email.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || fb.status === statusFilter;
      const matchesType = typeFilter === 'all' || fb.feedback_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    }),
    [feedbacks, debouncedSearchQuery, statusFilter, typeFilter]
  );

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white',
      reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const getTypeBadge = (type: string) => {
    return type === 'feedback'
      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
      : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Feedback Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Review and manage user feedback and suggestions</p>
        </div>
        <button
          onClick={exportFeedbackToCSV}
          className="flex items-center space-x-2 px-5 py-2.5 bg-green-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-white rounded-lg hover:bg-green-700 transition"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white appearance-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white appearance-none"
            >
              <option value="all">All Types</option>
              <option value="feedback">Feedback</option>
              <option value="suggestion">Suggestion</option>
            </select>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Preview
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] divide-y divide-gray-200 dark:divide-gray-700">
                {filteredFeedbacks.map((feedback) => (
                  <tr key={feedback.id} className="hover:bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-slate-700/50">
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {feedback.user_email}
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeBadge(feedback.feedback_type)}`}>
                        {feedback.feedback_type}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      <div className="text-sm text-gray-900 dark:text-white max-w-xs truncate">
                        {feedback.feedback_text}
                      </div>
                      {feedback.media_urls.length > 0 && (
                        <div className="flex items-center space-x-1 mt-1">
                          <ImageIcon className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {feedback.media_urls.length} attachment{feedback.media_urls.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(feedback.status)}`}>
                        {feedback.status}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(feedback.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setSelectedFeedback(feedback)}
                          className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => deleteFeedback(feedback.id)}
                          className="flex items-center space-x-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredFeedbacks.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No feedback found matching your filters</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border-b border-gray-200 dark:border-gray-700 px-6 py-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Feedback Details</h3>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="p-2 hover:bg-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-gray-700 rounded-lg transition"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    User Email
                  </label>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{selectedFeedback.user_email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Type
                  </label>
                  <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${getTypeBadge(selectedFeedback.feedback_type)}`}>
                    {selectedFeedback.feedback_type}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Submission Date
                </label>
                <p className="text-base text-gray-900 dark:text-white">
                  {new Date(selectedFeedback.created_at).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Status
                </label>
                <div className="flex items-center space-x-2">
                  <span className={`px-3 py-1 inline-flex text-sm font-semibold rounded-full ${getStatusBadge(selectedFeedback.status)}`}>
                    {selectedFeedback.status}
                  </span>
                  <select
                    value={selectedFeedback.status}
                    onChange={(e) => updateFeedbackStatus(selectedFeedback.id, e.target.value as 'pending' | 'reviewed' | 'resolved')}
                    className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Feedback Message
                </label>
                <div className="bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-700 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{selectedFeedback.feedback_text}</p>
                </div>
              </div>

              {selectedFeedback.media_urls.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Attachments ({selectedFeedback.media_urls.length})
                  </label>
                  <div className="grid grid-cols-2 gap-6">
                    {selectedFeedback.media_urls.map((url, index) => {
                      const isVideo = url.match(/\.(mp4|mov|webm)$/i);
                      return (
                        <div key={index} className="relative group">
                          {isVideo ? (
                            <video
                              src={url}
                              controls
                              className="w-full h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                            />
                          ) : (
                            <img
                              src={url}
                              alt={`Attachment ${index + 1}`}
                              className="w-full h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                            />
                          )}
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 bg-white dark:bg-slate-800 p-2 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow opacity-0 group-hover:opacity-100 transition"
                          >
                            <Eye className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {ConfirmModal}
    </div>
  );
});
