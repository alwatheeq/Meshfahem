import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, LogIn, Hash, MessageSquare, Loader2, X, Copy, Check } from 'lucide-react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { ErrorLogger } from '../../../utils/errorLogger';
import { GroupChat } from './GroupChat';

interface StudyGroup {
  id: string;
  name: string;
  description: string | null;
  group_code: string;
  created_by: string;
  created_at: string;
  member_count: number;
  last_message_preview: string | null;
}

export const StudyGroupsPage: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeGradient,
    getThemeSubtle,
  } = useTheme();
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<StudyGroup | null>(null);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Join modal state
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Get groups where user is a member
      const { data: memberRows, error: memErr } = await supabase
        .from('study_group_members')
        .select('group_id')
        .eq('user_id', user.id);

      if (memErr) throw memErr;

      if (!memberRows || memberRows.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const groupIds = memberRows.map(r => r.group_id);

      const { data: groupData, error: grpErr } = await supabase
        .from('study_groups')
        .select('id, name, description, group_code, created_by, created_at')
        .in('id', groupIds);

      if (grpErr) throw grpErr;

      // Get member counts for each group
      const groupsWithCounts: StudyGroup[] = await Promise.all(
        (groupData || []).map(async (g) => {
          const { count } = await supabase
            .from('study_group_members')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', g.id);

          // Get last message preview
          const { data: lastMsg } = await supabase
            .from('study_group_messages')
            .select('content')
            .eq('group_id', g.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...g,
            member_count: count || 0,
            last_message_preview: lastMsg?.content || null,
          };
        })
      );

      setGroups(groupsWithCounts);
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'StudyGroupsPage', action: 'fetchGroups' });
      showErrorToast(t('social.groups_load_error') || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [user?.id, showErrorToast, t]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const generateGroupCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreate = async () => {
    if (!user?.id || !createName.trim() || creating) return;
    setCreating(true);
    try {
      const groupCode = generateGroupCode();

      const { data: newGroup, error: createErr } = await supabase
        .from('study_groups')
        .insert({
          name: createName.trim(),
          description: createDesc.trim() || null,
          group_code: groupCode,
          created_by: user.id,
        })
        .select()
        .single();

      if (createErr) throw createErr;

      // Add creator as admin member
      const { error: memberErr } = await supabase
        .from('study_group_members')
        .insert({
          group_id: newGroup.id,
          user_id: user.id,
          role: 'admin',
        });

      if (memberErr) throw memberErr;

      showSuccessToast(t('social.group_created') || 'Group created!');
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      fetchGroups();
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'StudyGroupsPage', action: 'createGroup' });
      showErrorToast(t('social.create_group_error') || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!user?.id || !joinCode.trim() || joining) return;
    setJoining(true);
    try {
      const { data: group, error: findErr } = await supabase
        .from('study_groups')
        .select('id, name')
        .eq('group_code', joinCode.trim().toUpperCase())
        .maybeSingle();

      if (findErr) throw findErr;

      if (!group) {
        showErrorToast(t('social.invalid_group_code') || 'Invalid group code');
        setJoining(false);
        return;
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('study_group_members')
        .select('id')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        showErrorToast(t('social.already_member') || 'You are already a member of this group');
        setJoining(false);
        return;
      }

      const { error: joinErr } = await supabase
        .from('study_group_members')
        .insert({
          group_id: group.id,
          user_id: user.id,
          role: 'member',
        });

      if (joinErr) throw joinErr;

      showSuccessToast(`${t('social.joined_group') || 'Joined'} "${group.name}"!`);
      setShowJoin(false);
      setJoinCode('');
      fetchGroups();
    } catch (err) {
      ErrorLogger.log(err as Error, { component: 'StudyGroupsPage', action: 'joinGroup' });
      showErrorToast(t('social.join_error') || 'Failed to join group');
    } finally {
      setJoining(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setShowCreate(false);
      setShowJoin(false);
    }
  };

  // If a group is active, show GroupChat
  if (activeGroup) {
    return (
      <GroupChat
        groupId={activeGroup.id}
        groupName={activeGroup.name}
        onBack={() => {
          setActiveGroup(null);
          fetchGroups();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 rounded-xl transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('social.create_group') || 'Create Group'}
        </button>
        <button
          onClick={() => setShowJoin(true)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
        >
          <LogIn className="w-4 h-4" />
          {t('social.join_group') || 'Join Group'}
        </button>
      </div>

      {/* Groups Grid */}
      {groups.length === 0 ? (
        <div className={`text-center py-16 rounded-xl border border-dashed ${getThemeCardBorder()} ${getThemeSubtle()}`}>
          <Users className={`w-14 h-14 mx-auto mb-3 ${getThemeTextMuted()} opacity-40`} />
          <p className={`text-sm font-medium ${getThemeTextSecondary()}`}>
            {t('social.no_groups') || 'No study groups yet'}
          </p>
          <p className={`text-xs mt-1 ${getThemeTextMuted()}`}>
            {t('social.create_or_join') || 'Create a new group or join one with a code'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setActiveGroup(group)}
              className={`text-left p-4 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} shadow-sm hover:shadow-md transition-all group`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getThemeGradient()} flex items-center justify-center`}>
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono ${getThemeSubtle()} ${getThemeTextMuted()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyCode(group.group_code);
                  }}
                  title={t('social.copy_code') || 'Copy code'}
                >
                  <Hash className="w-3 h-3" />
                  {group.group_code}
                  {copiedCode === group.group_code ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>

              <h4 className={`text-sm font-semibold mb-1 truncate ${getThemeTextPrimary()}`}>
                {group.name}
              </h4>

              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs flex items-center gap-1 ${getThemeTextMuted()}`}>
                  <Users className="w-3 h-3" />
                  {group.member_count} {t('social.members') || 'members'}
                </span>
              </div>

              {group.last_message_preview && (
                <p className={`text-xs truncate ${getThemeTextMuted()} flex items-center gap-1`}>
                  <MessageSquare className="w-3 h-3 flex-shrink-0" />
                  {group.last_message_preview}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn"
          onClick={handleBackdropClick}
        >
          <div className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm" />
          <div className={`relative ${getThemeCardBg()} rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-scaleIn border ${getThemeCardBorder()}`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                  {t('social.create_group') || 'Create Group'}
                </h3>
                <button
                  onClick={() => setShowCreate(false)}
                  className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${getThemeTextMuted()}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${getThemeTextSecondary()}`}>
                    {t('social.group_name') || 'Group Name'}
                  </label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    maxLength={50}
                    placeholder={t('social.group_name_placeholder') || 'e.g., Biology Study Crew'}
                    className={`w-full px-3 py-2.5 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm`}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${getThemeTextSecondary()}`}>
                    {t('social.description') || 'Description'} <span className={getThemeTextMuted()}>({t('common.optional') || 'optional'})</span>
                  </label>
                  <textarea
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    maxLength={200}
                    rows={3}
                    placeholder={t('social.description_placeholder') || 'What will this group study?'}
                    className={`w-full px-3 py-2.5 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm resize-none`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreate(false)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl border ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
                >
                  {t('common.cancel') || 'Cancel'}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!createName.trim() || creating}
                  className="px-5 py-2 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('common.creating') || 'Creating...'}
                    </span>
                  ) : (
                    t('social.create') || 'Create'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {showJoin && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fadeIn"
          onClick={handleBackdropClick}
        >
          <div className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm" />
          <div className={`relative ${getThemeCardBg()} rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-scaleIn border ${getThemeCardBorder()}`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                  {t('social.join_group') || 'Join Group'}
                </h3>
                <button
                  onClick={() => setShowJoin(false)}
                  className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${getThemeTextMuted()}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1.5 ${getThemeTextSecondary()}`}>
                  {t('social.group_code') || 'Group Code'}
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="ABC123"
                  className={`w-full px-3 py-2.5 rounded-xl border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()} placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm font-mono text-center tracking-widest text-lg`}
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowJoin(false)}
                  className={`px-4 py-2 text-sm font-medium rounded-xl border ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
                >
                  {t('common.cancel') || 'Cancel'}
                </button>
                <button
                  onClick={handleJoin}
                  disabled={joinCode.trim().length < 4 || joining}
                  className="px-5 py-2 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {joining ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('social.joining') || 'Joining...'}
                    </span>
                  ) : (
                    t('social.join') || 'Join'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
