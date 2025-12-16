import React, { useState, useEffect } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { BookOpen, Folder, Plus, Search, ChevronDown, MoreVertical, Eye, Share2, Trash2, CreditCard as Edit3, Move, Users, CheckCircle2, XCircle, AlertCircle, X, Tag, FileText, Calendar, Stethoscope, Globe, Lock, Filter, FileQuestion, Clock, Play } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../contexts/I18nContext';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { SummaryDisplay } from './SummaryDisplay';
import { FlashcardViewer } from './FlashcardViewer';
import { LikeButton } from './LikeButton';
import { FavoriteButton } from './FavoriteButton';
import { CommentSection } from './CommentSection';
import { TopicsTagsModal } from './TopicsTagsModal';
import { GlobalExamDetailModal } from './GlobalExamDetailModal';
import { useChatContext } from '../../contexts/ChatContext';
import { PREDEFINED_TOPICS } from '../../utils/config.js';
import { usePersistentModal, getFeatureConfig } from '../../contexts/PersistentModalContext';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { PersistentSubscriptionModal } from '../Subscription/PersistentSubscriptionModal';
import { useSubscription } from '../../hooks/useSubscription';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { PerformanceMonitor } from '../../utils/performanceMonitor';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { useConfirm } from '../../hooks/useConfirm';

interface GlobalExam {
  id: string;
  exam_name: string;
  exam_code: string;
  description: string;
  country: string;
  region?: string;
  exam_type: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  total_questions: number;
  time_limit_minutes: number;
  subject?: string;
  passing_score?: number;
  is_active: boolean;
}

interface LibraryItem {
  id: string;
  title: string;
  summary_text: string;
  flashcards_json: Array<{ front: string; back: string }>;
  original_text_content?: string;
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
}

interface UserFolder {
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
  const { t } = useI18n();
  const { hasActiveSubscription } = useSubscription();
  const { getThemeGradient } = useTheme();
  const { setChatContext, clearChatContext } = useChatContext();
  const { showModal, dismissModal, isModalOpen, currentFeature, isDismissed } = usePersistentModal();
  const { confirm, ConfirmModal } = useConfirm();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('library');
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<UserFolder[]>([]);
  const [tags, setTags] = useState<UserTag[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemForView, setSelectedItemForView] = useState<LibraryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<string>('created_at_desc');
  const [viewFilter, setViewFilter] = useState<'all' | 'mine' | 'community'>(() => {
    const saved = localStorage.getItem('library_view_filter');
    return (saved as 'all' | 'mine' | 'community') || 'mine';
  });
  const [selectMultipleMode, setSelectMultipleMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showManageSharing, setShowManageSharing] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showTopicsTagsModal, setShowTopicsTagsModal] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  });
  const [libraryViewMode, setLibraryViewMode] = useState<'my-library' | 'global-exams'>('my-library');
  const [globalExams, setGlobalExams] = useState<GlobalExam[]>([]);
  const [selectedExam, setSelectedExam] = useState<GlobalExam | null>(null);
  const [examCountry, setExamCountry] = useState<string>('all');
  const [examType, setExamType] = useState<string>('all');
  const [hasCheckedModal, setHasCheckedModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Debounce search query to avoid excessive database queries
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Check and show modal after page load
  useEffect(() => {
    const checkModal = async () => {
      if (user && !hasActiveSubscription() && !hasCheckedModal) {
        const dismissed = await isDismissed('library');
        if (!dismissed) {
          setTimeout(() => {
            showModal('library');
          }, 500);
        }
        setHasCheckedModal(true);
      }
    };

    if (!initialLoading) {
      checkModal();
    }
  }, [user, initialLoading, hasActiveSubscription, hasCheckedModal]);

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
      const isInitialLoad = libraryItems.length === 0 && globalExams.length === 0;
      if (libraryViewMode === 'my-library') {
        fetchLibraryData(isInitialLoad);
      } else {
        fetchGlobalExams(isInitialLoad);
      }
    }
  }, [user, selectedFolder, debouncedSearchQuery, selectedTags, selectedTopics, sortOption, viewFilter, libraryViewMode, examCountry, examType, refreshTrigger]);

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

        // Fetch folders, tags, library items, shared folders, and pending invitations
        await Promise.all([
          fetchFolders(),
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

  const fetchFolders = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    // Fetch own folders and public folders from other users (without join)
    const { data: ownFolders, error: ownError } = await supabase
      .from('user_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    const { data: publicFolders, error: publicError } = await supabase
      .from('user_folders')
      .select('*')
      .eq('is_public', true)
      .neq('user_id', user.id)
      .order('name');

    if (ownError || publicError) {
      const error = ownError || publicError;
      const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'fetchFolders' });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'fetchFolders' });
      showNotification(message, 'error');
      return;
    }

    // Fetch emails for folder owners
    const folderUserIds = [...new Set([
      ...(ownFolders || []).map(f => f.user_id),
      ...(publicFolders || []).map(f => f.user_id)
    ])];

    const [userProfilesResult, adminUsersResult] = await Promise.all([
      supabase.from('user_profiles').select('id, email').in('id', folderUserIds),
      supabase.from('admin_users').select('id, email').in('id', folderUserIds)
    ]);

    const emailMap = new Map();
    userProfilesResult.data?.forEach(profile => emailMap.set(profile.id, profile.email));
    adminUsersResult.data?.forEach(admin => emailMap.set(admin.id, admin.email));

    const allFolders = [
      ...(ownFolders || []).map(f => ({ ...f, owner_email: emailMap.get(f.user_id) || 'Unknown' })),
      ...(publicFolders || []).map(f => ({ ...f, owner_email: emailMap.get(f.user_id) || 'Unknown' }))
    ];

    ErrorLogger.info('Fetched folders', { component: 'LibraryPage', action: 'fetchFolders', folderCount: allFolders.length });
    setFolders(allFolders);
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

    ErrorLogger.debug('Starting fetch with filters', { component: 'LibraryPage', action: 'fetchLibraryItems', viewFilter, selectedFolder, searchQuery: debouncedSearchQuery, userId: user.id });

    let query = supabase
      .from('user_library_items')
      .select('*');

    // Apply view filter (all, mine, or community)
    if (viewFilter === 'mine') {
      ErrorLogger.debug('Filtering for MY items only', { component: 'LibraryPage', action: 'fetchLibraryItems', userId: user.id });
      query = query.eq('user_id', user.id);
    } else if (viewFilter === 'community') {
      ErrorLogger.debug('Filtering for COMMUNITY items only', { component: 'LibraryPage', action: 'fetchLibraryItems', userId: user.id });
      query = query.neq('user_id', user.id);
    } else {
      ErrorLogger.debug('Showing ALL items (no user filter)', { component: 'LibraryPage', action: 'fetchLibraryItems' });
    }
    // If 'all', don't add user_id filter

    // Apply folder filter
    if (selectedFolder === 'uncategorized') {
      query = query.is('folder_id', null);
    } else if (selectedFolder !== 'all') {
      query = query.eq('folder_id', selectedFolder);
    }

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

    // All items and tags are now public by default, no need for additional filtering

    // Apply frontend sorting for like_count (JSONB sorting not supported in Supabase client)
    if (sortOption === 'like_count_desc') {
      filteredData.sort((a, b) => {
        const aLikes = a.reaction_counts?.like_count || 0;
        const bLikes = b.reaction_counts?.like_count || 0;
        return bLikes - aLikes; // Descending order (most liked first)
      });
    }

    ErrorLogger.debug('Fetched items', { component: 'LibraryPage', action: 'fetchLibraryItems', itemCount: filteredData.length, sampleItems: filteredData.slice(0, 3).map(item => ({
      id: item.id,
      title: item.title,
      user_id: item.user_id,
      created_at: item.created_at
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

  const fetchGlobalExams = async (isInitialLoad = false) => {
    if (!user) return;

    return PerformanceMonitor.measureAsync('LibraryPage.fetchGlobalExams', async () => {
      try {
        if (isInitialLoad) {
          setInitialLoading(true);
        } else {
          setSearchLoading(true);
        }
        setError(null);

        let query = supabase
          .from('global_exams')
          .select('*')
          .eq('is_active', true);

        // Apply country filter
        if (examCountry !== 'all') {
          query = query.eq('country', examCountry);
        }

        // Apply exam type filter
        if (examType !== 'all') {
          query = query.eq('exam_type', examType);
        }

      // Apply search filter (using debounced value)
      if (debouncedSearchQuery) {
        // Escape special characters and use PostgREST ilike syntax with * wildcards
        const escapedQuery = debouncedSearchQuery.replace(/[%_*]/g, '\\$&');
        query = query.or(`exam_name.ilike.*${escapedQuery}*,exam_code.ilike.*${escapedQuery}*,description.ilike.*${escapedQuery}*`);
      }

        query = query.order('exam_name');

        const { data, error } = await query;

        if (error) {
          const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'fetchGlobalExams' });
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'fetchGlobalExams' });
          setError(message);
          return;
        }

        setGlobalExams(data || []);
      } catch (err) {
        const message = handleApiError(err, { component: 'LibraryPage', action: 'fetchGlobalExams' });
        ErrorLogger.error(err instanceof Error ? err : new Error(String(err)), { component: 'LibraryPage', action: 'fetchGlobalExams' });
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

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      setCreatingFolder(true);
      const { data, error } = await supabase
        .from('user_folders')
        .insert({
          user_id: user.id,
          name: newFolderName.trim(),
          is_public: true
        })
        .select()
        .single();

      if (error) {
        const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'handleCreateFolder' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleCreateFolder' });
        showNotification(message, 'error');
        return;
      }

      await fetchFolders();
      setNewFolderName('');
      setShowCreateFolder(false);
      showNotification(`Folder "${data.name}" created successfully`, 'success');
    } catch (error) {
      const message = handleApiError(error, { component: 'LibraryPage', action: 'handleCreateFolder' });
      showNotification(message, 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleUpdateFolder = async (folderId: string, newName: string) => {
    if (!user) return;

    // Validate folder name
    if (!newName || !newName.trim()) {
      showNotification('Folder name cannot be empty', 'error');
      return;
    }

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      const trimmedName = newName.trim();
      const { error } = await supabase
        .from('user_folders')
        .update({ name: trimmedName })
        .eq('id', folderId)
        .eq('user_id', user.id);

      if (error) {
        const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'handleUpdateFolder', metadata: { folderId } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleUpdateFolder', metadata: { folderId } });
        showNotification(message, 'error');
        return;
      }

      await fetchFolders();
      showNotification(`Folder updated successfully`, 'success');
    } catch (error) {
      const message = handleApiError(error, { component: 'LibraryPage', action: 'handleUpdateFolder', metadata: { folderId } });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleUpdateFolder', metadata: { folderId } });
      showNotification(message, 'error');
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!user) return;

    const confirmDelete = await confirm(t('library.confirm_delete_folder', { folderName }), {
      title: t('library.confirm_delete_folder_title', { folderName }) || 'Delete Folder',
      variant: 'destructive',
      confirmText: t('library.delete') || 'Delete',
    });
    if (!confirmDelete) return;

    if (isOffline()) {
      handleOfflineError(showNotification);
      return;
    }

    try {
      // Move items from this folder to root level (uncategorized)
      const { error: moveError } = await supabase
        .from('user_library_items')
        .update({ folder_id: null })
        .eq('folder_id', folderId)
        .eq('user_id', user.id);

      if (moveError) {
        ErrorLogger.error(moveError instanceof Error ? moveError : new Error(String(moveError)), { 
          component: 'LibraryPage', 
          action: 'handleDeleteFolder', 
          step: 'moveItems',
          metadata: { folderId, folderName },
          userId: user.id
        });
        // Continue with deletion even if move fails - items will be orphaned but folder will be deleted
      }

      // Delete the folder
      const { error } = await supabase
        .from('user_folders')
        .delete()
        .eq('id', folderId)
        .eq('user_id', user.id);

      if (error) {
        const message = handleSupabaseError(error, { component: 'LibraryPage', action: 'handleDeleteFolder', metadata: { folderId, folderName } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'LibraryPage', action: 'handleDeleteFolder', metadata: { folderId, folderName } });
        showNotification(message, 'error');
        return;
      }

      await fetchLibraryData();
      // Reset folder filter if deleted folder was selected
      if (selectedFolder === folderId) {
        setSelectedFolder('all');
      }
      showNotification(`Folder "${folderName}" deleted successfully`, 'success');
    } catch (error) {
      const message = handleApiError(error, { component: 'LibraryPage', action: 'handleDeleteFolder', metadata: { folderId, folderName } });
      showNotification(message, 'error');
    }
  };

  const handleAcceptInvitation = async (folderId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('accept-folder-invitation', {
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
      ErrorLogger.error(err, { component: 'LibraryPage', action: 'handleAcceptInvitation', invitationId });
      showNotification(t('library.alert_failed_accept_invitation'), 'error');
    }
  };

  const handleMoveItems = async (targetFolderId: string | null) => {
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
          .update({ folder_id: targetFolderId })
          .eq('id', itemId)
          .eq('user_id', user!.id);

        if (error) {
          ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { 
            component: 'LibraryPage', 
            action: 'handleMoveItems', 
            itemId,
            targetFolderId,
            userId: user!.id
          });
          failedItems.push(itemId);
        }
      }

      const targetFolderName = targetFolderId 
        ? folders.find(f => f.id === targetFolderId)?.name || t('library.unknown_folder')
        : t('library.uncategorized');

      await fetchLibraryItems();
      setSelectedItems(new Set());
      setSelectMultipleMode(false);
      setShowMoveModal(false);
      
      if (failedItems.length > 0) {
        const successCount = itemIds.length - failedItems.length;
        if (successCount > 0) {
          showNotification(t('library.alert_items_moved_partial', { 
            successCount,
            failedCount: failedItems.length,
            folderName: targetFolderName 
          }) || `${successCount} items moved, ${failedItems.length} failed`, 'error');
        } else {
          showNotification(t('library.alert_failed_move_items_retry'), 'error');
        }
      } else {
        showNotification(t('library.alert_items_moved', { 
          count: itemIds.length, 
          folderName: targetFolderName 
        }), 'success');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LibraryPage', action: 'handleMoveItems', itemIds: selectedItems.size, targetFolderId });
      showNotification(t('library.alert_error_moving_items'), 'error');
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
      const { data, error } = await supabase.functions.invoke('generate-share-link', {
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

  const handleViewItem = async (item: LibraryItem) => {
    // Update last_viewed_at (non-blocking - don't fail if this errors)
    try {
      await supabase
        .from('user_library_items')
        .update({ last_viewed_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('user_id', user!.id);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LibraryPage', action: 'updateLastViewed', itemId: item.id, userId: user!.id });
      // Don't block viewing if update fails
    }

    setSelectedItemForView(item);
    // Set chat context when viewing library item
    if (item) {
      const isMedical = item.title.toLowerCase().includes('medical') ||
        item.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology'].some(med => topic.toLowerCase().includes(med)));
      setChatContext({
        summaryText: item.summary_text || '',
        originalText: item.original_text_content || '',
        topics: item.topics || [],
        medicalMode: isMedical,
        contextType: 'library_item',
        contextId: item.id,
      });
    }
  };

  const closeDetailView = () => {
    setSelectedItemForView(null);
    // Clear chat context when modal closes
    clearChatContext();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getFolderName = (folderId?: string) => {
    if (!folderId) return t('library.uncategorized');
    const folder = folders.find(f => f.id === folderId);
    return folder?.name || t('library.unknown_folder');
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (selectedFolder !== 'all') count++;
    if (searchQuery) count++;
    if (selectedTags.length > 0) count += selectedTags.length;
    if (selectedTopics.length > 0) count += selectedTopics.length;
    return count;
  };

  const clearAllFilters = () => {
    setSelectedFolder('all');
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

  const featureConfig = getFeatureConfig('library');

  if (initialLoading) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
          <LoadingSkeleton type="page" count={5} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 dark:bg-gray-800 dark:shadow-none">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">{t('common.error_loading_library')}</h3>
            <p className="text-gray-600 mb-4 dark:text-gray-300">{error}</p>
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
    <PersistentSubscriptionModal
      isOpen={isModalOpen && currentFeature === 'library'}
      onDismiss={dismissModal}
      featureName="library"
      featureTitle={featureConfig.title}
      benefits={featureConfig.benefits}
    />
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

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-gray-100">
              {libraryViewMode === 'my-library' ? t('library.my_library_title') : 'Global Exams'}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              {libraryViewMode === 'my-library' ? t('library.my_library_desc') : 'Practice with standardized exams from around the world'}
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => {
                setLibraryViewMode('my-library');
                // Reset exam-specific filters when switching to library
                setExamCountry('all');
                setExamType('all');
              }}
              className={`px-4 py-2 rounded-md transition-all duration-200 font-medium ${
                libraryViewMode === 'my-library'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <BookOpen className="h-5 w-5 inline mr-2" />
              My Library
            </button>
            <button
              onClick={() => {
                setLibraryViewMode('global-exams');
                // Reset library-specific filters when switching to exams
                setSelectedFolder('all');
                setSelectedTags([]);
                setSelectedTopics([]);
                setViewFilter('all');
              }}
              className={`px-4 py-2 rounded-md transition-all duration-200 font-medium ${
                libraryViewMode === 'global-exams'
                  ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Globe className="h-5 w-5 inline mr-2" />
              Global Exams
            </button>
          </div>
        </div>
      </div>

      {libraryViewMode === 'my-library' ? (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="space-y-6">
            {/* Folders */}
            <div className="bg-white rounded-2xl shadow-xl p-6 dark:bg-gray-800 dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('library.folders_heading')}</h3>
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  title={t('library.create_new_folder_tooltip')}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {showCreateFolder && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg dark:bg-blue-900">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder={t('library.folder_name_placeholder')}
                        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                      />
                      <button
                        onClick={handleCreateFolder}
                        disabled={creatingFolder}
                        className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50 dark:text-green-400 dark:hover:text-green-200"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateFolder(false);
                          setNewFolderName('');
                        }}
                        className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={() => setSelectedFolder('all')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition duration-150 ${
                    selectedFolder === 'all'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('library.all_items')}
                </button>
                <button
                  onClick={() => setSelectedFolder('uncategorized')}
                  className={`w-full text-left px-3 py-2 rounded-lg transition duration-150 ${
                    selectedFolder === 'uncategorized'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('library.uncategorized')}
                </button>
                
                {folders.map((folder) => {
                  const isOwnFolder = folder.user_id === user?.id;
                  const isPublicFolder = folder.is_public;

                  return (
                    <div key={folder.id} className="group flex items-center">
                      <button
                        onClick={() => setSelectedFolder(folder.id)}
                        className={`flex-1 text-left px-3 py-2 rounded-lg transition duration-150 ${
                          selectedFolder === folder.id
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Folder className="h-4 w-4" />
                          <span className="flex-1">{folder.name}</span>
                          {isPublicFolder ? (
                            <Globe className="h-3 w-3 text-green-600 dark:text-green-400" title="Public Folder" />
                          ) : (
                            <Lock className="h-3 w-3 text-gray-400 dark:text-gray-600" title="Private Folder" />
                          )}
                        </div>
                        {!isOwnFolder && (
                          <div className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                            by {folder.owner_email}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-xl dark:bg-gray-800 dark:shadow-none">
            {/* Controls Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                    {/* Search - Collapsible */}
                    {isSearchExpanded ? (
                      <div className="relative flex-1 sm:max-w-xs transition-all duration-300">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
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
                          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-400"
                          autoFocus
                        />
                        {searchLoading && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsSearchExpanded(true)}
                        className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        aria-label={t('library.search_library_placeholder')}
                      >
                        <Search className="h-4 w-4 text-gray-400" />
                      </button>
                    )}

                    {/* View Filter */}
                    <select
                      value={viewFilter}
                      onChange={(e) => setViewFilter(e.target.value as 'all' | 'mine' | 'community')}
                      className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 font-medium ${
                        viewFilter === 'mine'
                          ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : viewFilter === 'community'
                          ? 'border-purple-500 bg-purple-50 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
                          : 'border-gray-300 bg-white text-gray-800'
                      }`}
                    >
                      <option value="all">🌐 All Items</option>
                      <option value="mine">👤 My Items</option>
                      <option value="community">👥 Community Items</option>
                    </select>

                    {/* Sort Options */}
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="created_at_desc">Created (Newest First)</option>
                      <option value="created_at_asc">Created (Oldest First)</option>
                      <option value="last_viewed_desc">Last Viewed (Recent)</option>
                      <option value="title_asc">Title (A-Z)</option>
                      <option value="title_desc">Title (Z-A)</option>
                      <option value="like_count_desc">Most Liked</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Topics & Tags Filter Button */}
                    <button
                      onClick={() => setShowTopicsTagsModal(true)}
                      className={`flex items-center space-x-2 px-3 py-2 text-sm rounded-lg transition duration-150 whitespace-nowrap ${getThemeGradient('ui')} text-white shadow-md hover:opacity-90`}
                    >
                      <Filter className="h-4 w-4" />
                      <span>Topics & Tags</span>
                      {(selectedTags.length > 0 || selectedTopics.length > 0) && (
                        <span className="px-2 py-0.5 bg-white text-blue-600 rounded-full text-xs font-semibold dark:bg-gray-900 dark:text-blue-300">
                          {selectedTags.length + selectedTopics.length}
                        </span>
                      )}
                    </button>

                    {/* Bulk Actions */}
                    {selectMultipleMode && selectedItems.size > 0 && (
                      <>
                        <button
                          onClick={() => setShowMoveModal(true)}
                          className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-lg hover:bg-blue-50 transition duration-150 whitespace-nowrap dark:border-blue-600 dark:hover:bg-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                        >
                          {t('library.move_to_folder_button', { count: selectedItems.size })}
                        </button>
                        <button
                          onClick={() => setShowDeleteModal(true)}
                          className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50 transition duration-150 whitespace-nowrap dark:border-red-600 dark:hover:bg-red-900 dark:text-red-400 dark:hover:text-red-200"
                        >
                          {t('library.delete_button', { count: selectedItems.size })}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Active Filters */}
                {getActiveFiltersCount() > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{t('library.active_filters')}:</span>
                    {selectedFolder !== 'all' && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full dark:bg-blue-900 dark:text-blue-300">
                        {selectedFolder === 'uncategorized' ? t('library.uncategorized') : getFolderName(selectedFolder)}
                      </span>
                    )}
                    {searchQuery && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full dark:bg-green-900 dark:text-green-300">
                        Search: {searchQuery}
                      </span>
                    )}
                    {selectedTags.map(tagId => {
                      const tag = tags.find(t => t.id === tagId);
                      return tag ? (
                        <span key={tagId} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full dark:bg-blue-900 dark:text-blue-300">
                          <Tag className="h-3 w-3 inline mr-1" />
                          {tag.name}
                        </span>
                      ) : null;
                    })}
                    {selectedTopics.map(topic => (
                      <span key={topic} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full dark:bg-green-900 dark:text-green-300">
                        <BookOpen className="h-3 w-3 inline mr-1" />
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                {/* Multi-select header */}
                {selectMultipleMode && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg dark:bg-gray-900">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
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
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {selectedFolder === 'all' ? t('library.all_items') :
                     selectedFolder === 'uncategorized' ? t('library.uncategorized') :
                     getFolderName(selectedFolder)}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('library.items_total', { count: libraryItems.length })}
                  </p>
                </div>
              </div>

              {libraryItems.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">
                    {searchQuery || selectedTags.length > 0 ? t('library.no_items_match_search') : t('library.no_library_items_yet')}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {searchQuery || selectedTags.length > 0 ? t('library.adjust_search_filter') : t('library.process_to_build_library')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {libraryItems.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition duration-150 dark:border-gray-700 dark:hover:shadow-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          {selectMultipleMode && (
                            <input
                              type="checkbox"
                              checked={selectedItems.has(item.id)}
                              onChange={() => handleSelectItem(item.id)}
                              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          )}

                          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-2 rounded-lg flex-shrink-0 dark:from-emerald-600 dark:to-teal-700">
                            <FileText className="h-4 w-4 text-white" />
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.title}</h4>
                              {item.user_id !== user?.id && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full dark:bg-blue-900 dark:text-blue-300">
                                  Community
                                </span>
                              )}
                            </div>

                            {/* Creator Info for Community Items */}
                            {item.user_id !== user?.id && (
                              <div className="flex items-center space-x-1 text-sm text-gray-600 mb-2 dark:text-gray-400">
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

                            <div className="flex items-center space-x-4 text-sm text-gray-500 mb-2 dark:text-gray-400">
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
                                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                      }`}
                                    >
                                      {topic}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <p className="text-gray-600 text-sm mb-3 dark:text-gray-300">
                              {item.summary_text.length > 150
                                ? item.summary_text.substring(0, 150) + '...'
                                : item.summary_text
                              }
                            </p>

                            {/* Like and Favorite Buttons */}
                            <div className="flex items-center space-x-2">
                              <LikeButton
                                itemId={item.id}
                                initialCount={item.reaction_counts?.like_count || 0}
                                size="sm"
                              />
                              <FavoriteButton
                                itemId={item.id}
                                initialCount={item.reaction_counts?.favorite_count || 0}
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Item Actions */}
                        {!selectMultipleMode && (
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => handleViewItem(item)}
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

                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition duration-150 dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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
      ) : (
        /* Global Exams View */
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Country/Region</label>
                <select
                  value={examCountry}
                  onChange={(e) => setExamCountry(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="all">All Countries</option>
                  <option value="USA">USA</option>
                  <option value="UK">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Germany">Germany</option>
                  <option value="France">France</option>
                  <option value="Turkey">Turkey</option>
                  <option value="UAE">UAE</option>
                  <option value="Saudi Arabia">Saudi Arabia</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Exam Type</label>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="all">All Types</option>
                  <option value="standardized">Standardized Tests</option>
                  <option value="entrance">Entrance Exams</option>
                  <option value="proficiency">Language Proficiency</option>
                  <option value="certification">Professional Certification</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search exams..."
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Exams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {globalExams.length === 0 ? (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
                <Globe className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2 dark:text-gray-100">No exams found</h3>
                <p className="text-gray-600 dark:text-gray-400">Try adjusting your filters</p>
              </div>
            ) : (
              globalExams.map((exam) => (
                <div key={exam.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer border-2 border-transparent hover:border-blue-500">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{exam.exam_name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{exam.exam_code}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      exam.difficulty_level === 'beginner' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                      exam.difficulty_level === 'intermediate' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    }`}>
                      {exam.difficulty_level}
                    </span>
                  </div>

                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">{exam.description}</p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Globe className="h-4 w-4 mr-2" />
                      <span>{exam.country}</span>
                      {exam.region && <span className="ml-2">• {exam.region}</span>}
                    </div>
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <FileQuestion className="h-4 w-4 mr-2" />
                      <span>{exam.total_questions} questions</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                      <Clock className="h-4 w-4 mr-2" />
                      <span>{exam.time_limit_minutes} minutes</span>
                    </div>
                    {exam.subject && (
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <BookOpen className="h-4 w-4 mr-2" />
                        <span>{exam.subject}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedExam(exam)}
                    className={`w-full px-4 py-2 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition-all flex items-center justify-center space-x-2`}
                  >
                    <Play className="h-4 w-4" />
                    <span>Start Practice</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Move Items Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full dark:bg-gray-800 dark:shadow-none">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('library.move_items_to_folder_title')}</h3>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                {t('library.move_items_to_folder_desc', { count: selectedItems.size })}
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                onChange={(e) => {
                  const targetFolderId = e.target.value || null;
                  handleMoveItems(targetFolderId);
                }}
                defaultValue=""
              >
                <option value="">Select folder...</option>
                <option value="">{t('library.uncategorized')}</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                    {folder.is_shared && <span> ({t('library.shared_folder_label')})</span>}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3 dark:border-gray-700">
              <button
                onClick={() => setShowMoveModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition duration-150 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Items Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full dark:bg-gray-800 dark:shadow-none">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('library.delete_items_title')}</h3>
              <p className="text-sm text-red-600 mt-1 dark:text-red-400">{t('library.action_cannot_be_undone')}</p>
            </div>
            
            <div className="p-6">
              <p className="text-gray-700 dark:text-gray-200">
                {t('library.confirm_bulk_delete', { count: selectedItems.size })}
              </p>
            </div>
            
            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3 dark:border-gray-700">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition duration-150 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
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

      {/* Detail View Modal */}
      {selectedItemForView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col dark:bg-gray-800 dark:shadow-none">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-2 rounded-lg dark:from-emerald-600 dark:to-teal-700">
                  <BookOpen className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {selectedItemForView.title}
                  </h2>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(selectedItemForView.created_at)}
                    </div>
                    <span>
                      {selectedItemForView.flashcards_json.length} {selectedItemForView.flashcards_json.length === 1 ? t('common.flashcard') : t('common.flashcards')}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={closeDetailView}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition duration-150 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <SummaryDisplay 
                summaryChunks={[selectedItemForView.summary_text]}
                flashcards={selectedItemForView.flashcards_json}
                originalText={selectedItemForView.original_text_content || ''}
                topics={selectedItemForView.topics || []}
                medicalMode={selectedItemForView.title.toLowerCase().includes('medical') ||
                  selectedItemForView.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology'].some(med => topic.toLowerCase().includes(med)))}
                onPublishToLibrary={() => Promise.resolve(true)}
                onReset={closeDetailView}
              />
              
              {selectedItemForView.flashcards_json.length > 0 && (
                <FlashcardViewer
                  flashcards={selectedItemForView.flashcards_json}
                  medicalMode={selectedItemForView.title.toLowerCase().includes('medical') ||
                    selectedItemForView.topics?.some(topic => ['cardiology', 'neurology', 'medicine', 'clinical', 'pathology', 'anatomy', 'physiology'].some(med => topic.toLowerCase().includes(med)))}
                />
              )}
              

              <CommentSection
                itemId={selectedItemForView.id}
                initialCount={selectedItemForView.comment_count || 0}
              />
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
      <GlobalExamDetailModal
        exam={selectedExam}
        isOpen={!!selectedExam}
        onClose={() => setSelectedExam(null)}
      />

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