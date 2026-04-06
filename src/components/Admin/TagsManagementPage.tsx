import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Tag, Search, Edit2, Trash2, User, X, Save } from 'lucide-react';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { useConfirm } from '../../hooks/useConfirm';

interface TagData {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  user_email?: string;
  usage_count?: number;
}

export const TagsManagementPage: React.FC = React.memo(() => {
  const { error: showErrorToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select(`
          *,
          user_profiles!inner(email)
        `)
        .order('name');

      if (tagsError) throw tagsError;

      const tagsWithCounts = await Promise.all(
        (tagsData || []).map(async (tag) => {
          const { count } = await supabase
            .from('item_tags')
            .select('id', { count: 'exact', head: true })
            .eq('tag_id', tag.id);

          return {
            ...tag,
            user_email: tag.user_profiles?.email || 'Unknown',
            usage_count: count || 0,
          };
        })
      );

      setTags(tagsWithCounts);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'TagsManagementPage', action: 'fetchTags' });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (tag: TagData) => {
    setEditingTag(tag.id);
    setEditingName(tag.name);
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditingName('');
  };

  const handleSaveEdit = async (tagId: string) => {
    if (!editingName.trim()) return;

    try {
      const { error } = await supabase
        .from('tags')
        .update({ name: editingName.trim() })
        .eq('id', tagId);

      if (error) throw error;

      // Log audit action
      if (user?.id) {
        const oldTag = tags.find(t => t.id === tagId);
        try {
          await supabase.rpc('log_admin_action', {
            p_action_type: 'UPDATE',
            p_table_name: 'tags',
            p_record_id: tagId,
            p_old_values: { name: oldTag?.name },
            p_new_values: { name: editingName.trim() },
            p_description: `Updated tag name from "${oldTag?.name}" to "${editingName.trim()}"`
          });
        } catch (logErr: unknown) {
        const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
        ErrorLogger.warn('Failed to log admin action', { 
          component: 'TagsManagementPage', 
          action: 'handleSaveEdit', 
          metadata: { tagId, error: logError.message } 
        });
      }
      }

      await fetchTags();
      setEditingTag(null);
      setEditingName('');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'TagsManagementPage', 
        action: 'handleSaveEdit', 
        metadata: { tagId } 
      });
      showErrorToast('Failed to update tag');
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string, usageCount: number) => {
    const confirmMsg = usageCount > 0
      ? `This tag "${tagName}" is used on ${usageCount} items. All associations will be removed. Continue?`
      : `Delete tag "${tagName}"?`;

    const confirmed = await confirm(confirmMsg, {
      title: 'Delete Tag',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    try {
      await supabase
        .from('item_tags')
        .delete()
        .eq('tag_id', tagId);

      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      // Log audit action
      if (user?.id) {
        try {
          await supabase.rpc('log_admin_action', {
            p_action_type: 'DELETE',
            p_table_name: 'tags',
            p_record_id: tagId,
            p_old_values: { name: tagName, usage_count: usageCount },
            p_description: `Deleted tag "${tagName}"${usageCount > 0 ? ` (removed from ${usageCount} items)` : ''}`
          });
        } catch (logErr: unknown) {
          const logError = logErr instanceof Error ? logErr : new Error(String(logErr));
          ErrorLogger.warn('Failed to log admin action', { 
            component: 'TagsManagementPage', 
            action: 'handleDeleteTag', 
            metadata: { tagId, error: logError.message } 
          });
        }
      }

      await fetchTags();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { 
        component: 'TagsManagementPage', 
        action: 'handleDeleteTag', 
        metadata: { tagId } 
      });
      showErrorToast('Failed to delete tag');
    }
  };

  const filteredTags = useMemo(() =>
    tags.filter(tag =>
      tag.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      tag.user_email?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    ),
    [tags, debouncedSearchQuery]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tag Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View, edit, and manage all user tags</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search tags by name or user email..."
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Tag Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] divide-y divide-gray-200 dark:divide-gray-700">
                {filteredTags.map((tag) => (
                  <tr key={tag.id} className="hover:bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:bg-slate-700/50">
                    <td className="px-6 py-6">
                      {editingTag === tag.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:text-white"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(tag.id)}
                            className="p-1 text-green-600 hover:text-green-800 dark:text-green-400"
                            title="Save"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 text-red-600 hover:text-red-800 dark:text-red-400"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <Tag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {tag.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {tag.user_email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        tag.usage_count === 0
                          ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                      }`}>
                        {tag.usage_count} {tag.usage_count === 1 ? 'item' : 'items'}
                      </span>
                    </td>
                    <td className="px-6 py-6 whitespace-nowrap">
                      {editingTag !== tag.id && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleStartEdit(tag)}
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-lg transition dark:text-blue-400 dark:hover:bg-blue-900/30"
                            title="Edit tag name"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTag(tag.id, tag.name, tag.usage_count || 0)}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-lg transition dark:text-red-400 dark:hover:bg-red-900/30"
                            title="Delete tag"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredTags.length === 0 && (
              <div className="text-center py-12">
                <Tag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No tags found matching your search' : 'No tags found'}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total: {filteredTags.length} tags
          </p>
        </div>
      </div>
      {ConfirmModal}
    </div>
  );
});
