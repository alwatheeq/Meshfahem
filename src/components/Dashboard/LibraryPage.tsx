import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import { BookOpen, Search, Eye, Share2, Trash2, Users, CheckCircle2, AlertCircle, X, Tag, FileText, Calendar, Stethoscope, Filter, Globe, User, Heart, ScanLine } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { LikeButton } from './LikeButton';
import { TopicsTagsModal } from './TopicsTagsModal';
import { PREDEFINED_TOPICS } from '../../utils/config';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { PerformanceMonitor } from '../../utils/performanceMonitor';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { useConfirm } from '../../hooks/useConfirm';

// GlobalExam interface removed - moved to QuizPage

interface LibraryItem {
  id: string;
  title: string;
  summary_text: string;
  flashcards_json: Array<{ front: string; back: string }>;
  original_text_content?: string;
  original_file_name?: string;
  topics?: string[];
  created_at: string;
  last_viewed_at?: string;
  folder_id?: string;
  shareable_link?: string;
  is_public?: boolean;
  user_id: string;
  creator_email?: string;
  user_profiles?: { email: string };
  reaction_counts?: { like_count?: number; favorite_count?: number };
  comment_count?: number;
  notesCount?: number;
  hasNotes?: boolean;
}

interface _UserFolder {
  id: string;
  name: string;
  parent_folder_id?: string;
  created_at: string;
  is_shared?: boolean;
  is_public?: boolean;
  user_id: string;
  owner_email?: string;
}

interface UserTag {
  id: string;
  name: string;
  is_public?: boolean;
  user_id?: string;
}

interface SharedFolder {
  id: string;
  name: string;
  permission_level: 'read' | 'write' | 'admin';
  owner_id: string;
  owner_email?: string;
}

interface PendingInvitation {
  id: string;
  folder_id: string;
  folder_name: string;
  invited_by_email?: string;
  permission_level: 'read' | 'write' | 'admin';
}

export const LibraryPage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const { getThemeGradient, getThemeText, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle, getThemeBorder, getThemeFocusRing } = useTheme();
  const { confirm, ConfirmModal } = useConfirm();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('library');
  const { preferences: _preferences } = useUserPreferences();
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [tags, setTags] = useState<UserTag[]>([]);
  const [_sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [_pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<string>('created_at_desc');
  const [viewFilter, setViewFilter] = useState<'all' | 'mine' | 'community' | 'liked'>(() => {
    const saved = localStorage.getItem('library_view_filter');
    if (saved === 'community' || saved === 'liked' || saved === 'mine') {
      return saved;
    }
    return 'mine';
  });
  const [selectMultipleMode, setSelectMultipleMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [_showManageSharing, _setShowManageSharing] = useState<string | null>(null);
  const [showTopicsTagsModal, setShowTopicsTagsModal] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });
  const [libraryViewMode, setLibraryViewMode] = useState<'library' | 'notebook'>(() => {
    const saved = localStorage.getItem('library_view_mode');
    return (saved as 'library' | 'notebook') || 'library';
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Debounce search query to avoid excessive database queries
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ show: true, message, type });
  };

  // Persist view filter to localStorage
  useEffect(() => {
    localStorage.setItem('library_view_filter', viewFilter);
    ErrorLogger.debug('View filter changed', { component: 'LibraryPage', action: 'setViewFilter', viewFilter });
  }, [viewFilter]);

  // Listen for library publish events
  useEffect(() => {
    const handleLibraryPublish = (event: Event) => {
      const customEvent = event as CustomEvent;
      ErrorLogger.debug('Received libraryItemPublished event', { component: 'LibraryPage', action: 'handleLibraryItemPublished', itemId: customEvent.detail?.id });
      ErrorLogger.debug('Triggering library refresh', { component: 'LibraryPage', action: 'handleLibraryItemPublished' });
      setRefreshTrigger(prev => prev + 1);
      showNotification('Item published successfully!', 'success');
    };

    window.addEventListener('libraryItemPublished', handleLibraryPublish);
    return () => window.removeEventListener('libraryItemPublished', handleLibraryPublish);
  }, []);

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial && !initialLoading) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, initialLoading, showTutorial]);

  useEffect(() => {
    if (user) {
      ErrorLogger.debug('Fetching library data', { component: 'LibraryPage', action: 'fetchLibraryData', refreshTrigger, viewFilter });
      const isInitialLoad = libraryItems.length === 0;
      fetchLibraryData(isInitialLoad);
    }
  }, [user, debouncedSearchQuery, selectedTags, selectedTopics, sortOption, viewFilter, libraryViewMode, refreshTrigger]);

  const fetchLibraryData = async (isInitialLoad = false) => {
    if (!user) return;

    return PerformanceMonitor.measureAsync('LibraryPage.fetchLibraryData', async () => {
      try {
        // Set appropriate loading state based on context
        if (isInitialLoad) {
          setInitialLoading(true);
        } else {
          setSearchLoading(true);
        }
        setError(null);

        // Fetch tags, library items, shared folders, and pending invitations
        await Promise.all([
          fetchTags(),
          fetchLibraryItems(),
          fetchSharedFolders(),
          fetchPendingInvitations()
        ]);
      } catch (err) {
        const message = handleApiError(err, { component: 'LibraryPage', action: 'fetchLibraryData' });
        ErrorLogger.error(err instanceof Error ? err : new Error(String(err)), { component: 'LibraryPage', action: 'fetchLibraryData' });
        setError(message);
      } finally {
        if (isInitialLoad) {
          setInitialLoading(false);
        } else {
          setSearchLoading(false);
        }
      }
    });
  };


  const fetchTags = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .or(`user_id.eq.${user.id},is_public.eq.true`)
        .order('is_public', { ascending: false })
        .order('name');

      if (error) {
        const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'fetchTags' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'fetchTags' });
        showNotification(message, 'error');
        return;
      }

      setTags(data || []);
    } catch (error) {
      const message = handleApiError(error, { component: 'LibraryPage', action: 'fetchTags' });
      showNotification(message, 'error');
    }
  };

  const fetchLibraryItems = async () => {
    if (!user) return;

    ErrorLogger.debug('Starting fetch with filters', { component: 'LibraryPage', action: 'fetchLibraryItems', viewFilter, searchQuery: debouncedSearchQuery, libraryViewMode, userId: user.id });

    let query = supabase
      .from('user_library_items')
      .select('*');

    // Apply view filter (all, mine, community, or liked)
    if (viewFilter === 'mine') {
      ErrorLogger.debug('Filtering for MY items only', { component: 'LibraryPage', action: 'fetchLibraryItems', userId: user.id });
      query = query.eq('user_id', user.id);
    } else if (viewFilter === 'community') {
      ErrorLogger.debug('Filtering for COMMUNITY items only', { component: 'LibraryPage', action: 'fetchLibraryItems', userId: user.id });
      query = query.neq('user_id', user.id);
    } else if (viewFilter === 'liked') {
      ErrorLogger.debug('Filtering for LIKED items only', { component: 'LibraryPage', action: 'fetchLibraryItems', userId: user.id });
      // For liked items, we'll filter after fetching by checking item_reactions
      // This is because Supabase doesn't support direct joins in the client
    } else {
      ErrorLogger.debug('Showing ALL items (no user filter)', { component: 'LibraryPage', action: 'fetchLibraryItems' });
    }
    // If 'all', don't add user_id filter


    // Apply search filter (using debounced value)
    if (debouncedSearchQuery) {
      // Escape special characters and use PostgREST ilike syntax with * wildcards
      const escapedQuery = debouncedSearchQuery.replace(/[%_*]/g, '\\$&');
      query = query.or(`title.ilike.*${escapedQuery}*,summary_text.ilike.*${escapedQuery}*`);
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      // This is a simplified approach; you might need a more complex query for tag filtering
      // For now, we'll filter on the frontend after fetching
    }

    // Apply sorting
    if (sortOption === 'created_at_desc') {
      query = query.order('created_at', { ascending: false });
    } else if (sortOption === 'created_at_asc') {
      query = query.order('created_at', { ascending: true });
    } else if (sortOption === 'last_viewed_desc') {
      query = query.order('last_viewed_at', { ascending: false, nullsLast: true });
    } else if (sortOption === 'last_viewed_asc') {
      query = query.order('last_viewed_at', { ascending: true, nullsLast: true });
    } else if (sortOption === 'title_asc') {
      query = query.order('title', { ascending: true });
    } else if (sortOption === 'title_desc') {
      query = query.order('title', { ascending: false });
    } else if (sortOption === 'like_count_desc') {
      // Note: JSONB sorting not directly supported in Supabase client
      // Will sort on frontend after fetching
      query = query.order('created_at', { ascending: false }); // Default sort, will override
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'fetchLibraryItems' });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'fetchLibraryItems' });
      setError(message);
      return;
    }

    ErrorLogger.info('Successfully fetched library items', { component: 'LibraryPage', action: 'fetchLibraryItems', itemCount: (data || []).length });

    // Fetch creator emails from both user_profiles and admin_users
    const userIds = [...new Set((data || []).map(item => item.user_id))];

    const [userProfilesResult, adminUsersResult] = await Promise.all([
      supabase.from('user_profiles').select('id, email').in('id', userIds),
      supabase.from('admin_users').select('id, email').in('id', userIds)
    ]);

    // Create a map of user_id to email
    const emailMap = new Map();
    userProfilesResult.data?.forEach(profile => emailMap.set(profile.id, profile.email));
    adminUsersResult.data?.forEach(admin => emailMap.set(admin.id, admin.email));

    let filteredData = (data || []).map(item => ({
      ...item,
      creator_email: emailMap.get(item.user_id) || 'Unknown User'
    }));

    // Filter by tags if selected (frontend filtering for simplicity)
    if (selectedTags.length > 0) {
      const { data: itemTags } = await supabase
        .from('item_tags')
        .select('item_id, tag_id')
        .in('tag_id', selectedTags);

      if (itemTags) {
        const itemIdsWithTags = itemTags.map(it => it.item_id);
        filteredData = filteredData.filter(item => itemIdsWithTags.includes(item.id));
      }
    }

    // Filter by topics if selected (frontend filtering)
    if (selectedTopics.length > 0) {
      filteredData = filteredData.filter(item => {
        if (!item.topics || item.topics.length === 0) return false;
        // Check if item has at least one matching topic (OR logic within topics)
        return item.topics.some(topic => selectedTopics.includes(topic));
      });
    }

    // Filter by liked items if viewFilter is 'liked'
    if (viewFilter === 'liked') {
      const { data: likedItems } = await supabase
        .from('item_reactions')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('reaction_type', 'like');

      if (likedItems) {
        const likedItemIds = new Set(likedItems.map(li => li.item_id));
        filteredData = filteredData.filter(item => likedItemIds.has(item.id));
      } else {
        filteredData = []; // No liked items
      }
    }

    // All items and tags are now public by default, no need for additional filtering

    // Apply frontend sorting for like_count (JSONB sorting not supported in Supabase client)
    if (sortOption === 'like_count_desc') {
      filteredData.sort((a, b) => {
        const aLikes = a.reaction_counts?.like_count || 0;
        const bLikes = b.reaction_counts?.like_count || 0;
        return bLikes - aLikes; // Descending order (most liked first)
      });
    }

    // Apply locale-aware client-side sort for title so items matching the current
    // script (e.g., Arabic when the UI is in Arabic) sort naturally to the top.
    if (sortOption === 'title_asc' || sortOption === 'title_desc') {
      filteredData.sort((a, b) =>
        a.title.localeCompare(b.title, language, { sensitivity: 'base' })
      );
      if (sortOption === 'title_desc') filteredData.reverse();
    }

    // Fetch notes count for each item (for notebook filtering and badge display)
    if (filteredData.length > 0) {
      const itemIds = filteredData.map(item => item.id);
      const { data: notesData } = await supabase
        .from('summary_notes')
        .select('summary_id')
        .eq('user_id', user.id)
        .in('summary_id', itemIds);

      // Count notes per item
      const notesCountMap = new Map<string, number>();
      notesData?.forEach(note => {
        const count = notesCountMap.get(note.summary_id) || 0;
        notesCountMap.set(note.summary_id, count + 1);
      });

      // Add notes count to items
      filteredData = filteredData.map(item => ({
        ...item,
        notesCount: notesCountMap.get(item.id) || 0,
        hasNotes: (notesCountMap.get(item.id) || 0) > 0
      }));

      // Filter by notebook mode (show only items with notes)
      if (libraryViewMode === 'notebook') {
        filteredData = filteredData.filter(item => item.hasNotes);
      }
    }

    ErrorLogger.debug('Fetched items', { component: 'LibraryPage', action: 'fetchLibraryItems', itemCount: filteredData.length, libraryViewMode, sampleItems: filteredData.slice(0, 3).map(item => ({
      id: item.id,
      title: item.title,
      user_id: item.user_id,
      created_at: item.created_at,
      notesCount: item.notesCount || 0
    })) });

    setLibraryItems(filteredData);
  };

  const fetchSharedFolders = async () => {
    // Placeholder for shared folders functionality
    setSharedFolders([]);
  };

  const fetchPendingInvitations = async () => {
    // Placeholder for pending invitations functionality
    setPendingInvitations([]);
  };

  // fetchGlobalExams removed - moved to QuizPage

  const _handleAcceptInvitation = async (folderId: string) => {
    try {
      const { data: _data, error } = await supabase.functions.invoke('accept-folder-invitation', {
        body: { folder_id: folderId }
      });

      if (error) {
        showNotification(t('library.alert_failed_accept_invitation'), 'error');
        return;
      }

      await fetchLibraryData();
      showNotification('Invitation accepted successfully', 'success');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LibraryPage', action: 'handleAcceptInvitation', metadata: { folderId } });
      showNotification(t('library.alert_failed_accept_invitation'), 'error');
    }
  };


  const handleDeleteItems = async () => {
    if (selectedItems.size === 0) return;

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      const itemIds = Array.from(selectedItems);
      const failedItems: string[] = [];
      
      for (const itemId of itemIds) {
        const { error } = await supabase
          .from('user_library_items')
          .delete()
          .eq('id', itemId)
          .eq('user_id', user!.id);

        if (error) {
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
            component: 'LibraryPage', 
            action: 'handleDeleteItems', 
            metadata: { itemId },
            userId: user!.id
          });
          failedItems.push(itemId);
        }
      }

      await fetchLibraryItems();
      setSelectedItems(new Set());
      setSelectMultipleMode(false);
      setShowDeleteModal(false);
      
      if (failedItems.length > 0) {
        const successCount = itemIds.length - failedItems.length;
        if (successCount > 0) {
          showNotification(
            t('library.alert_items_deleted_partial', { 
              successCount,
              failedCount: failedItems.length
            }) || `${successCount} items deleted, ${failedItems.length} failed`, 
            'error'
          );
        } else {
          const message = handleApiError(new Error('Failed to delete items'), { component: 'LibraryPage', action: 'handleDeleteItems' });
          showNotification(message, 'error');
        }
      } else {
        showNotification(t('library.alert_items_deleted', { count: itemIds.length }), 'success');
      }
    } catch (error) {
      const message = handleApiError(error, { component: 'LibraryPage', action: 'handleDeleteItems' });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleDeleteItems' });
      showNotification(message, 'error');
    }
  };

  const handleShareItem = async (itemId: string) => {
    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('generate-share-link', {
        body: { item_id: itemId, action: 'generate' }
      });

      if (error) {
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
          component: 'LibraryPage', 
          action: 'handleShareItem', 
          itemId,
          userId: user?.id
        });
        showNotification(t('library.alert_failed_generate_share_link'), 'error');
        return;
      }

      if (data?.public_url) {
        try {
          await navigator.clipboard.writeText(data.public_url);
          showNotification(t('library.alert_share_link_generated'), 'success');
        } catch (clipboardError) {
          // Clipboard might fail, but link was generated - show success with note
          ErrorLogger.warn(clipboardError instanceof Error ? clipboardError : new Error(String(clipboardError)), { 
            component: 'LibraryPage', 
            action: 'handleShareItem', 
            step: 'clipboard',
            itemId
          });
          showNotification(t('library.alert_share_link_generated') + ' (Link copied to clipboard)', 'success');
        }
        await fetchLibraryItems(); // Refresh to show updated sharing status
      } else {
        ErrorLogger.warn(new Error('No public_url in response'), { 
          component: 'LibraryPage', 
          action: 'handleShareItem', 
          itemId,
          responseData: data
        });
        showNotification(t('library.alert_failed_generate_share_link'), 'error');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LibraryPage', action: 'handleShareItem', itemId, userId: user?.id });
      showNotification(t('library.alert_failed_generate_share_link'), 'error');
    }
  };

  const handleUnshareItem = async (itemId: string) => {
    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      const { data: _dataRevoke, error } = await supabase.functions.invoke('generate-share-link', {
        body: { item_id: itemId, action: 'revoke' }
      });

      if (error) {
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
          component: 'LibraryPage', 
          action: 'handleUnshareItem', 
          itemId,
          userId: user?.id
        });
        showNotification(t('library.alert_failed_revoke_share_link'), 'error');
        return;
      }

      showNotification(t('library.alert_share_link_revoked'), 'success');
      await fetchLibraryItems(); // Refresh to show updated sharing status
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LibraryPage', action: 'handleUnshareItem', itemId, userId: user?.id });
      showNotification(t('library.alert_failed_revoke_share_link'), 'error');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const confirmDelete = await confirm(t('library.confirm_delete_item'), {
      title: t('library.confirm_delete_item_title') || 'Delete Item',
      variant: 'destructive',
      confirmText: t('library.delete') || 'Delete',
    });
    if (!confirmDelete) return;

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      const { error } = await supabase
        .from('user_library_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', user!.id);

      if (error) {
        const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'handleDeleteItem', metadata: { itemId } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleDeleteItem', metadata: { itemId } });
        showNotification(message, 'error');
        return;
      }

      await fetchLibraryItems();
      showNotification(t('library.alert_item_deleted'), 'success');
    } catch (error) {
      const message = handleApiError(error, { component: 'LibraryPage', action: 'handleDeleteItem', metadata: { itemId } });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleDeleteItem', metadata: { itemId }, userId: user!.id });
      showNotification(message, 'error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };


  const getActiveFiltersCount = () => {
    let count = 0;
    if (searchQuery) count++;
    if (selectedTags.length > 0) count += selectedTags.length;
    if (selectedTopics.length > 0) count += selectedTopics.length;
    return count;
  };

  const _clearAllFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedTopics([]);
  };

  const handleApplyTopicsTagsFilters = (tags: string[], topics: string[]) => {
    setSelectedTags(tags);
    setSelectedTopics(topics);
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === libraryItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(libraryItems.map(item => item.id)));
    }
  };

  if (initialLoading) {
    return (
      <div className="w-full">
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] p-8 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm ${getThemeCardBorder()}`}>
          <LoadingSkeleton type="page" count={5} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] p-8 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm ${getThemeCardBorder()}`}>
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>{t('common.error_loading_library')}</h3>
            <p className={`${getThemeTextSecondary()} mb-4`}>{error}</p>
            <button
              onClick={fetchLibraryData}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 mx-auto"
            >
              <span>{t('common.try_again')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="w-full">
      {/* Notification */}
      {notification.show && (
        <div className={`mb-6 p-4 rounded-lg flex items-center space-x-3 ${
          notification.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200'
            : 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium flex-1">{notification.message}</span>
          <button
            onClick={() => setNotification(prev => ({ ...prev, show: false }))}
            className={`${
              notification.type === 'success' 
                ? 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200'
                : 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200'
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={`mb-8 ${libraryViewMode === 'notebook' ? '' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {libraryViewMode === 'notebook' ? (
              <div>
                <h2 className={`text-3xl font-bold mb-2 ${getThemeTextPrimary()}`}>
                  {t('notebook.title') || 'My Notebook'}
                </h2>
                <p className={`text-lg ${getThemeTextSecondary()}`}>
                  {t('notebook.subtitle') || 'Your personal notes and annotations'}
                </p>
              </div>
            ) : (
              <div>
                <h2 className={`text-3xl font-bold mb-2 ${getThemeTextPrimary()}`}>
                  {t('library.my_library_title')}
                </h2>
                <p className={`text-lg ${getThemeTextSecondary()}`}>
                  {t('library.my_library_desc')}
                </p>
              </div>
            )}
          </div>

          {/* Toggle Switch */}
          <div className={`flex items-center space-x-3 rounded-lg p-1 ${getThemeSubtle('ui')}`}>
            <button
              onClick={() => {
                setLibraryViewMode('library');
                localStorage.setItem('library_view_mode', 'library');
              }}
              className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                libraryViewMode === 'library'
                  ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <BookOpen className="h-5 w-5 inline mr-2" />
              {t('library.my_library_title') || 'My Library'}
            </button>
            <button
              onClick={() => {
                setLibraryViewMode('notebook');
                localStorage.setItem('library_view_mode', 'notebook');
              }}
              className={`px-4 py-2 rounded-md transition-colors duration-150 font-medium ${
                libraryViewMode === 'notebook'
                  ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow`
                  : `${getThemeTextSecondary()} hover:opacity-80`
              }`}
            >
              <FileText className="h-5 w-5 inline mr-2" />
              {t('notebook.title') || 'Notebook'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-1 ml-4 mr-4 lg:ml-6 lg:mr-6">
          <div className={`rounded-lg shadow-sm ${getThemeCardBorder()} ${
            libraryViewMode === 'notebook' 
              ? `${getThemeCardBg()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-none` 
              : `${getThemeCardBg()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-none`
          }`}>
            {/* Controls Header */}
            <div className={`p-5 border-b ${getThemeCardBorder()}`}>
              <div className="flex flex-col space-y-3">
                <div className="flex flex-col gap-3 w-full min-w-0">
                  {/* Expanded search: full-width row so it does not collide with filters */}
                  {isSearchExpanded && (
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <div className="relative flex-1 min-w-0">
                        <Search className={`h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none ${getThemeTextMuted()}`} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onBlur={() => {
                            if (!searchQuery) {
                              setIsSearchExpanded(false);
                            }
                          }}
                          placeholder={t('library.search_library_placeholder')}
                          className={`w-full pl-10 pr-10 py-2 border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 ${getThemeFocusRing()} focus:border-transparent ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                          autoFocus
                        />
                        {searchLoading && (
                          <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setIsSearchExpanded(false);
                        }}
                        className={`shrink-0 p-2 rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle('ui')} hover:opacity-80 transition-colors`}
                        aria-label={t('library.search_close_aria')}
                      >
                        <X className={`h-4 w-4 ${getThemeTextMuted()}`} />
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 w-full min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-stretch gap-3 flex-1 min-w-0">
                      {!isSearchExpanded && (
                        <button
                          type="button"
                          onClick={() => setIsSearchExpanded(true)}
                          className={`shrink-0 flex items-center justify-center p-2 rounded-lg ${getThemeCardBorder()} ${getThemeSubtle('ui')} hover:opacity-80 transition-colors`}
                          aria-label={t('library.search_library_placeholder')}
                        >
                          <Search className={`h-5 w-5 ${getThemeTextMuted()}`} />
                        </button>
                      )}

                      <select
                        value={viewFilter}
                        onChange={(e) => setViewFilter(e.target.value as 'all' | 'mine' | 'community' | 'liked')}
                        className={`md:hidden w-full min-w-0 px-3 py-2 border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 ${getThemeFocusRing()} focus:border-transparent ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                        aria-label={t('library.view_filter_aria')}
                      >
                        <option value="all">{t('library.all_items')}</option>
                        <option value="mine">{t('library.view_mine')}</option>
                        <option value="community">{t('library.view_community')}</option>
                        <option value="liked">{t('library.view_liked')}</option>
                      </select>
                      <div
                        className={`hidden md:flex flex-nowrap overflow-x-auto items-center gap-1 rounded-lg p-1 -mx-1 px-1 min-w-0 max-w-full ${getThemeSubtle('ui')} border ${getThemeCardBorder()}`}
                        role="group"
                        aria-label={t('library.view_filter_aria')}
                      >
                        {(
                          [
                            { value: 'all' as const, icon: Globe, label: t('library.all_items') },
                            { value: 'mine' as const, icon: User, label: t('library.view_mine') },
                            { value: 'community' as const, icon: Users, label: t('library.view_community') },
                            { value: 'liked' as const, icon: Heart, label: t('library.view_liked') },
                          ] as const
                        ).map(({ value, icon: Icon, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setViewFilter(value)}
                            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                              viewFilter === value
                                ? `${getThemeCardBg()} ${getThemeTextPrimary()} shadow-sm border ${getThemeCardBorder()}`
                                : `${getThemeTextSecondary()} hover:opacity-80`
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sort + Topics on one row from sm+; stacks on very small screens */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto lg:shrink-0 lg:min-w-0">
                      <select
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value)}
                        className={`w-full sm:min-w-[12rem] sm:max-w-[min(100%,20rem)] px-3 py-2 border ${getThemeBorder()} rounded-lg focus:outline-none focus:ring-2 ${getThemeFocusRing()} focus:border-transparent ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                        aria-label={t('library.sort_by')}
                      >
                        <option value="created_at_desc">{t('library.sort_created_newest')}</option>
                        <option value="created_at_asc">{t('library.sort_created_oldest')}</option>
                        <option value="last_viewed_desc">{t('library.sort_last_viewed')}</option>
                        <option value="title_asc">{t('library.sort_title_az')}</option>
                        <option value="title_desc">{t('library.sort_title_za')}</option>
                        <option value="like_count_desc">{t('library.sort_most_liked')}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowTopicsTagsModal(true)}
                        className={`flex items-center justify-center sm:justify-start space-x-2 px-3 py-2 text-sm rounded-md transition-colors duration-150 whitespace-nowrap w-full sm:w-auto shrink-0 ${getThemeGradient('ui')} text-white hover:opacity-90`}
                      >
                        <Filter className="h-4 w-4 shrink-0" aria-hidden />
                        <span>{t('library.topics_tags_heading')}</span>
                        {(selectedTags.length > 0 || selectedTopics.length > 0) && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getThemeSubtle('ui')} ${getThemeTextPrimary()}`}>
                            {selectedTags.length + selectedTopics.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full justify-end">
                    {selectMultipleMode && selectedItems.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteModal(true)}
                        className="w-full sm:w-auto px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50 transition duration-150 whitespace-nowrap dark:border-red-600 dark:hover:bg-red-900 dark:text-red-400 dark:hover:text-red-200"
                      >
                        {t('library.delete_button', { count: selectedItems.size })}
                      </button>
                    )}
                  </div>
                </div>

                {/* Active Filters */}
                {getActiveFiltersCount() > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${getThemeTextMuted()}`}>{t('library.active_filters')}:</span>
                    {searchQuery && (
                      <span className={`px-2 py-1 text-xs rounded-full ${getThemeSubtle('bg')} ${getThemeTextPrimary()}`}>
                        Search: {searchQuery}
                      </span>
                    )}
                    {selectedTags.map(tagId => {
                      const tag = tags.find(t => t.id === tagId);
                      return tag ? (
                        <span key={tagId} className={`px-2 py-1 text-xs rounded-full ${getThemeSubtle('bg')} ${getThemeTextPrimary()}`}>
                          <Tag className="h-3 w-3 inline mr-1" />
                          {tag.name}
                        </span>
                      ) : null;
                    })}
                    {selectedTopics.map(topic => (
                      <span key={topic} className={`px-2 py-1 text-xs rounded-full ${getThemeSubtle('bg')} ${getThemeTextPrimary()}`}>
                        <BookOpen className="h-3 w-3 inline mr-1" />
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                {/* Multi-select header */}
                {selectMultipleMode && (
                  <div className={`flex items-center justify-between p-3 ${getThemeSubtle('bg')} rounded-lg`}>
                    <span className={`text-sm font-medium ${getThemeTextSecondary()}`}>
                      {selectedItems.size > 0
                        ? t('library.items_selected', { count: selectedItems.size })
                        : t('library.select_multiple')
                      }
                    </span>
                    <div className="flex items-center gap-3">
                      {selectedItems.size > 0 && (
                        <button
                          onClick={() => setSelectedItems(new Set())}
                          className="text-sm text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-200"
                        >
                          {t('library.clear_selection')}
                        </button>
                      )}
                      <button
                        onClick={handleSelectAll}
                        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                      >
                        {selectedItems.size === libraryItems.length ? t('library.deselect_all') : t('library.select_all')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section Title & Content */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className={`text-xl font-bold ${
                    libraryViewMode === 'notebook'
                      ? `${getThemeText()}`
                      : `${getThemeText()}`
                  }`}>
                    {libraryViewMode === 'notebook'
                      ? (t('notebook.items_with_notes') || 'My Notes')
                      : t('library.all_items')}
                  </h3>
                  <p className={`text-sm mt-1 opacity-70 ${
                    libraryViewMode === 'notebook'
                      ? `${getThemeText()}`
                      : `${getThemeText()}`
                  }`}>
                    {libraryViewMode === 'notebook'
                      ? (t('notebook.items_with_notes_count', { count: libraryItems.length }) || `${libraryItems.length} ${libraryItems.length === 1 ? 'item' : 'items'} with notes`)
                      : t('library.items_total', { count: libraryItems.length })}
                  </p>
                </div>
              </div>

              {libraryItems.length === 0 ? (
                <div className="text-center py-12">
                  {libraryViewMode === 'notebook' ? (
                    <>
                      <FileText className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-4`} />
                      <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>
                        {t('notebook.no_items_with_notes') || 'No Notes Yet'}
                      </h3>
                      <p className={getThemeTextSecondary()}>
                        {t('notebook.add_notes_to_items') || 'Start adding notes to your library items. They will appear here for easy access.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <BookOpen className={`h-12 w-12 ${getThemeTextMuted()} mx-auto mb-4`} />
                      <h3 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-2`}>
                        {searchQuery || selectedTags.length > 0 
                          ? t('library.no_items_match_search') 
                          : t('library.no_library_items_yet')}
                      </h3>
                      <p className={getThemeTextSecondary()}>
                        {searchQuery || selectedTags.length > 0 
                          ? t('library.adjust_search_filter') 
                          : t('library.process_to_build_library')}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {libraryItems.map((item) => (
                    <div key={item.id} className={`${getThemeCardBorder()} rounded-md p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.1),0_1px_3px_0_rgba(0,0,0,0.08)] transition-all duration-150 dark:shadow-sm dark:hover:shadow ${getThemeCardBg()}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          {selectMultipleMode && (
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              onChange={() => handleSelectItem(item.id)}
                              className={`mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 ${getThemeCardBorder()} rounded`}
                            />
                          )}

                          <div className={`${getThemeSubtle('ui')} p-2 rounded-md flex-shrink-0 ${getThemeCardBorder()}`}>
                            {/\.(jpg|jpeg|png|webp|gif|bmp|tiff?)$/i.test(item.original_file_name ?? '') || item.topics?.includes('ocr')
                              ? <ScanLine className={`h-4 w-4 ${getThemeTextPrimary()}`} />
                              : <BookOpen className={`h-4 w-4 ${getThemeTextPrimary()}`} />
                            }
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{item.title}</h4>
                              {item.hasNotes && item.notesCount && item.notesCount > 0 && (
                                <span className={`px-2 py-0.5 text-xs rounded-full flex items-center space-x-1 ${getThemeSubtle('ui')} ${getThemeTextSecondary()}`} title={t('notebook.notes_count', { count: item.notesCount }) || `${item.notesCount} notes`}>
                                  <FileText className="h-3 w-3" />
                                  <span>{item.notesCount}</span>
                                </span>
                              )}
                              {item.user_id !== user?.id && (
                                <span className={`px-2 py-0.5 text-xs rounded-full ${getThemeSubtle('ui')} ${getThemeTextSecondary()}`}>
                                  Community
                                </span>
                              )}
                            </div>

                            {/* Creator Info for Community Items */}
                            {item.user_id !== user?.id && (
                              <div className={`flex items-center space-x-1 text-sm ${getThemeTextSecondary()} mb-2`}>
                                <Users className="h-3 w-3" />
                                <span>Created by {item.creator_email}</span>
                              </div>
                            )}

                            {/* Medical Mode Indicator */}
                            {(item.title.toLowerCase().includes('medical') ||
                              item.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology'].some(med => topic.toLowerCase().includes(med)))) && (
                              <div className="flex items-center space-x-2 mb-2">
                                <div className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 dark:bg-red-900 dark:text-red-300">
                                  <Stethoscope className="h-3 w-3" />
                                  <span>Medical Content</span>
                                </div>
                              </div>
                            )}

                            <div className={`flex items-center space-x-4 text-sm ${getThemeTextMuted()} mb-2`}>
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                {formatDate(item.created_at)}
                              </div>
                              {item.last_viewed_at && (
                                <div className="flex items-center">
                                  <Eye className="h-4 w-4 mr-1" />
                                  {t('library.viewed', { date: formatDate(item.last_viewed_at) })}
                                </div>
                              )}
                              <span>{item.flashcards_json.length} {item.flashcards_json.length === 1 ? t('common.flashcard') : t('common.flashcards')}</span>
                            </div>

                            {/* Topics */}
                            {item.topics && item.topics.length > 0 && (
                              <div className="flex items-center space-x-2 mb-3">
                                <div className="flex flex-wrap gap-1">
                                  {item.topics.map((topic, index) => (
                                    <span
                                      key={index}
                                      className={`px-2 py-1 text-xs rounded-full ${
                                        ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology', 'pharmacology'].some(med => topic.toLowerCase().includes(med))
                                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                          : `${getThemeSubtle('bg')} ${getThemeTextPrimary()}`
                                      }`}
                                    >
                                      {topic}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <p className={`${getThemeTextSecondary()} text-sm mb-3`}>
                              {item.summary_text.length > 150
                                ? item.summary_text.substring(0, 150) + '...'
                                : item.summary_text
                              }
                            </p>

                            {/* Like Button */}
                            <div className="flex items-center space-x-2">
                              <LikeButton
                                itemId={item.id}
                                initialCount={item.reaction_counts?.like_count || 0}
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Item Actions */}
                        {!selectMultipleMode && (
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => navigate(`/view/library/${item.id}`)}
                              className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition duration-150 dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900"
                            >
                              <Eye className="h-4 w-4" />
                            </button>

                            {item.is_public && item.shareable_link ? (
                              <button
                                onClick={() => handleUnshareItem(item.id)}
                                className="p-2 text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg transition duration-150 dark:text-orange-400 dark:hover:text-orange-200 dark:hover:bg-orange-900"
                                title={t('library.unshare')}
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleShareItem(item.id)}
                                className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition duration-150 dark:text-green-400 dark:hover:text-green-200 dark:hover:bg-green-900"
                                title={t('library.share')}
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            )}

                            {item.user_id === user?.id && (
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition duration-150 dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Items Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] max-w-md w-full dark:shadow ${getThemeCardBorder()}`}>
            <div className={`p-6 border-b ${getThemeCardBorder()}`}>
              <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>{t('library.delete_items_title')}</h3>
              <p className="text-sm text-red-600 mt-1 dark:text-red-400">{t('library.action_cannot_be_undone')}</p>
            </div>
            
            <div className="p-6">
              <p className={getThemeTextSecondary()}>
                {t('library.confirm_bulk_delete', { count: selectedItems.size })}
              </p>
            </div>
            
            <div className={`p-6 border-t ${getThemeCardBorder()} flex justify-end space-x-3`}>
              <button
                onClick={() => setShowDeleteModal(false)}
                className={`px-4 py-2 text-sm ${getThemeTextSecondary()} hover:opacity-80 ${getThemeCardBorder()} rounded-lg ${getThemeSubtle('ui')} transition duration-150`}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDeleteItems}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition duration-150 dark:bg-red-700 dark:hover:bg-red-800"
              >
                {t('library.delete_items_button')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topics & Tags Modal */}
      <TopicsTagsModal
        isOpen={showTopicsTagsModal}
        onClose={() => setShowTopicsTagsModal(false)}
        tags={tags}
        predefinedTopics={PREDEFINED_TOPICS}
        selectedTags={selectedTags}
        selectedTopics={selectedTopics}
        onApply={handleApplyTopicsTagsFilters}
      />

      {/* Global Exam Detail Modal */}
      {/* GlobalExamDetailModal removed - moved to QuizPage */}

      {/* Confirmation Modal */}
      {ConfirmModal}

      {/* Library Tutorial */}
      {tutorialConfig && (
        <PageTutorial
          config={tutorialConfig}
          isOpen={isTutorialOpen}
          onClose={() => {}}
          onComplete={completeTutorial}
          onSkip={skipTutorial}
        />
      )}
    </div>
    </>
  );
});