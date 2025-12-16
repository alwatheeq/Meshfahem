import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Folder, Search, Edit2, Trash2, User, Calendar, X, Save } from 'lucide-react';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';
import { useDebounce } from '../../hooks/useDebounce';
import { useAuth } from '../../hooks/useAuth';
import { useConfirm } from '../../hooks/useConfirm';

interface FolderData {
  id: string;
  name: string;
  user_id: string;
  parent_folder_id?: string;
  created_at: string;
  is_public?: boolean;
  user_email?: string;
  item_count?: number;
}

export const FoldersManagementPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { error: showErrorToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetchFolders();
  }, []);

  const fetchFolders = async () => {
    setLoading(true);
    try {
      const { data: foldersData, error: foldersError } = await supabase
        .from('user_folders')
        .select(`
          *,
          user_profiles!inner(email)
        `)
        .order('created_at', { ascending: false });

      if (foldersError) throw foldersError;

      const foldersWithCounts = await Promise.all(
        (foldersData || []).map(async (folder) => {
          const { count } = await supabase
            .from('user_library_items')
            .select('id', { count: 'exact', head: true })
            .eq('folder_id', folder.id);

          return {
            ...folder,
            user_email: folder.user_profiles?.email || 'Unknown',
            item_count: count || 0,
          };
        })
      );

      setFolders(foldersWithCounts);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'FoldersManagementPage', action: 'fetchFolders' });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (folder: FolderData) => {
    setEditingFolder(folder.id);
    setEditingName(folder.name);
  };

  const handleCancelEdit = () => {
    setEditingFolder(null);
    setEditingName('');
  };

  const handleSaveEdit = async (folderId: string) => {
    if (!editingName.trim()) return;

    try {
      const { error } = await supabase
        .from('user_folders')
        .update({ name: editingName.trim() })
        .eq('id', folderId);

      if (error) throw error;

      // Log audit action
      if (user?.id) {
        const oldFolder = folders.find(f => f.id === folderId);
        await supabase.rpc('log_admin_action', {
          p_action_type: 'UPDATE',
          p_table_name: 'user_folders',
          p_record_id: folderId,
          p_old_values: { name: oldFolder?.name },
          p_new_values: { name: editingName.trim() },
          p_description: `Updated folder name from "${oldFolder?.name}" to "${editingName.trim()}"`
        }).catch(err => ErrorLogger.warn('Failed to log admin action', { component: 'FoldersManagementPage', action: 'handleSaveEdit', folderId, error: err instanceof Error ? err : new Error(String(err)) }));
      }

      await fetchFolders();
      setEditingFolder(null);
      setEditingName('');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'FoldersManagementPage', action: 'handleSaveEdit', folderId });
      showErrorToast('Failed to update folder');
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string, itemCount: number) => {
    const confirmMsg = itemCount > 0
      ? `This folder "${folderName}" contains ${itemCount} items. Items will be moved to uncategorized. Continue?`
      : `Delete folder "${folderName}"?`;

    const confirmed = await confirm(confirmMsg, {
      title: 'Delete Folder',
      variant: 'destructive',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    try {
      await supabase
        .from('user_library_items')
        .update({ folder_id: null })
        .eq('folder_id', folderId);

      const { error } = await supabase
        .from('user_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;

      // Log audit action
      if (user?.id) {
        await supabase.rpc('log_admin_action', {
          p_action_type: 'DELETE',
          p_table_name: 'user_folders',
          p_record_id: folderId,
          p_old_values: { name: folderName, item_count: itemCount },
          p_description: `Deleted folder "${folderName}"${itemCount > 0 ? ` (${itemCount} items moved to uncategorized)` : ''}`
        }).catch(err => ErrorLogger.warn('Failed to log admin action', { component: 'FoldersManagementPage', action: 'handleDeleteFolder', folderId, error: err instanceof Error ? err : new Error(String(err)) }));
      }

      await fetchFolders();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'FoldersManagementPage', action: 'handleDeleteFolder', folderId });
      showErrorToast('Failed to delete folder');
    }
  };

  const filteredFolders = useMemo(() =>
    folders.filter(folder =>
      folder.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      folder.user_email?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    ),
    [folders, debouncedSearchQuery]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Folder Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View, edit, and manage all user folders</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search folders by name or user email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
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
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Folder Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredFolders.map((folder) => (
                  <tr key={folder.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4">
                      {editingFolder === folder.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(folder.id)}
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
                          <Folder className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {folder.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {folder.user_email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs font-semibold">
                        {folder.item_count} items
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(folder.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingFolder !== folder.id && (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleStartEdit(folder)}
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition dark:text-blue-400 dark:hover:bg-blue-900/30"
                            title="Edit folder name"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id, folder.name, folder.item_count || 0)}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition dark:text-red-400 dark:hover:bg-red-900/30"
                            title="Delete folder"
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

            {filteredFolders.length === 0 && (
              <div className="text-center py-12">
                <Folder className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'No folders found matching your search' : 'No folders found'}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Total: {filteredFolders.length} folders
          </p>
        </div>
      </div>
    </div>
  );
});
