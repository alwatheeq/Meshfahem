import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Hash, Users, Crown, Trash2, Copy, Check, MessageSquare } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../../../contexts/I18nContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../Toast/Toast';
import { supabase } from '../../../lib/supabase';
import { toErrorMessage } from '../../../utils/errorHandler';

interface GroupMember {
  id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  username: string | null;
  display_name: string | null;
}

interface StudyGroup {
  id: string;
  name: string;
  group_code: string;
  created_by: string;
  created_at: string;
  member_count: number;
  my_role: 'admin' | 'member';
}

interface GroupsPanelProps {
  onOpenGroupChat: (groupId: string, groupName: string) => void;
}

export const GroupsPanel: React.FC<GroupsPanelProps> = ({ onOpenGroupChat }) => {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const { error: showError, success: showSuccess } = useToast();
  const {
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeTextMuted,
    getThemeSubtle,
    getThemeGradient,
    getThemeAccent,
  } = useTheme();

  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  const loadGroups = useCallback(
    async (gen: number) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const { data: memberships, error: memErr } = await supabase
          .from('study_group_members')
          .select('group_id, role')
          .eq('user_id', user.id);

        if (gen !== loadGenRef.current) return;

        if (memErr) throw memErr;
        if (!memberships || memberships.length === 0) {
          setGroups([]);
          return;
        }

        const groupIds = memberships.map((m) => m.group_id);
        const roleMap = Object.fromEntries(memberships.map((m) => [m.group_id, m.role]));

        const { data: groupData, error: grpErr } = await supabase
          .from('study_groups')
          .select('id, name, group_code, created_by, created_at')
          .in('id', groupIds);

        if (gen !== loadGenRef.current) return;

        if (grpErr) throw grpErr;

        const { data: counts, error: cntErr } = await supabase
          .from('study_group_members')
          .select('group_id')
          .in('group_id', groupIds);

        if (gen !== loadGenRef.current) return;

        if (cntErr) throw cntErr;

        const countMap: Record<string, number> = {};
        (counts || []).forEach((c) => {
          countMap[c.group_id] = (countMap[c.group_id] || 0) + 1;
        });

        const mapped: StudyGroup[] = (groupData || []).map((g) => ({
          ...g,
          member_count: countMap[g.id] || 0,
          my_role: roleMap[g.id] as 'admin' | 'member',
        }));

        if (gen !== loadGenRef.current) return;

        setGroups(mapped);
      } catch (err) {
        if (gen === loadGenRef.current) {
          showError(toErrorMessage(err));
        }
      } finally {
        if (gen === loadGenRef.current) {
          setLoading(false);
        }
      }
    },
    [user, showError]
  );

  const reloadGroups = useCallback(async () => {
    const gen = ++loadGenRef.current;
    await loadGroups(gen);
  }, [loadGroups]);

  useEffect(() => {
    const gen = ++loadGenRef.current;
    void loadGroups(gen);
    return () => {
      loadGenRef.current += 1;
    };
  }, [loadGroups]);

  const handleCreate = async () => {
    if (!user) return;
    const name = newGroupName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('study_groups')
        .insert({ name, created_by: user.id })
        .select('id')
        .single();

      if (error) throw error;

      const { error: memberErr } = await supabase
        .from('study_group_members')
        .insert({ group_id: data.id, user_id: user.id, role: 'admin' });

      if (memberErr) throw memberErr;

      setNewGroupName('');
      await reloadGroups();
      showSuccess(t('social.create_group') + ' ✓');
    } catch (err) {
      showError(toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!user) return;
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length !== 6) return;

    setJoining(true);
    try {
      const { data: group, error: findErr } = await supabase
        .from('study_groups')
        .select('id')
        .eq('group_code', code)
        .single();

      if (findErr || !group) {
        showError(t('social.group_code') + ' — not found');
        return;
      }

      const { error: joinErr } = await supabase
        .from('study_group_members')
        .insert({ group_id: group.id, user_id: user.id, role: 'member' });

      if (joinErr) throw joinErr;

      setJoinCode('');
      await reloadGroups();
      showSuccess(t('social.join_group') + ' ✓');
    } catch (err) {
      showError(toErrorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  const loadMembers = async (groupId: string) => {
    setLoadingMembers(groupId);
    try {
      const { data, error } = await supabase
        .from('study_group_members')
        .select('id, user_id, role, joined_at')
        .eq('group_id', groupId);

      if (error) throw error;

      const userIds = (data || []).map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name')
        .in('id', userIds);

      const profileMap = Object.fromEntries(
        (profiles || []).map((p) => [p.id, p])
      );

      const enriched: GroupMember[] = (data || []).map((m) => ({
        ...m,
        username: profileMap[m.user_id]?.username ?? null,
        display_name: profileMap[m.user_id]?.display_name ?? null,
      }));

      setMembers((prev) => ({ ...prev, [groupId]: enriched }));
    } catch (err) {
      showError(toErrorMessage(err));
    } finally {
      setLoadingMembers(null);
    }
  };

  const toggleExpand = (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
    } else {
      setExpandedGroupId(groupId);
      if (!members[groupId]) loadMembers(groupId);
    }
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    try {
      const { error } = await supabase
        .from('study_group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      await loadMembers(groupId);
      await reloadGroups();
    } catch (err) {
      showError(toErrorMessage(err));
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('study_groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;
      setExpandedGroupId(null);
      await reloadGroups();
      showSuccess(t('social.delete_group') + ' ✓');
    } catch (err) {
      showError(toErrorMessage(err));
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div dir={dir} className="space-y-6">
      {/* Create group */}
      <div className={`rounded-xl p-4 border ${getThemeCardBg()} ${getThemeCardBorder()}`}>
        <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${getThemeTextPrimary()}`}>
          <Plus className="w-4 h-4" />
          {t('social.create_group')}
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder={t('social.group_name')}
            maxLength={100}
            className={`flex-1 rounded-lg px-3 py-2 text-sm border outline-none transition-colors ${getThemeSubtle()} ${getThemeCardBorder()} ${getThemeTextPrimary()}`}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newGroupName.trim()}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40 ${getThemeAccent()}`}
          >
            {creating ? '...' : t('social.create_group')}
          </button>
        </div>
      </div>

      {/* Join group */}
      <div className={`rounded-xl p-4 border ${getThemeCardBg()} ${getThemeCardBorder()}`}>
        <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${getThemeTextPrimary()}`}>
          <Hash className="w-4 h-4" />
          {t('social.join_group')}
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder={t('social.group_code')}
            maxLength={6}
            className={`flex-1 rounded-lg px-3 py-2 text-sm border outline-none font-mono tracking-widest uppercase transition-colors ${getThemeSubtle()} ${getThemeCardBorder()} ${getThemeTextPrimary()}`}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={joining || joinCode.trim().length !== 6}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40 ${getThemeAccent()}`}
          >
            {joining ? '...' : t('social.join_group')}
          </button>
        </div>
      </div>

      {/* My groups */}
      <div>
        <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${getThemeTextPrimary()}`}>
          <Users className="w-4 h-4" />
          {t('social.my_groups')}
        </h3>

        {loading ? (
          <div className={`text-sm ${getThemeTextMuted()} text-center py-8`}>...</div>
        ) : groups.length === 0 ? (
          <div className={`text-sm ${getThemeTextMuted()} text-center py-8`}>
            {t('social.no_groups')}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`rounded-xl border overflow-hidden transition-all ${getThemeCardBg()} ${getThemeCardBorder()}`}
              >
                {/* Group header */}
                <button
                  onClick={() => toggleExpand(group.id)}
                  className={`w-full p-4 text-left transition-colors hover:opacity-80`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm truncate ${getThemeTextPrimary()}`}>
                        {group.name}
                      </div>
                      <div className={`text-xs mt-1 flex items-center gap-3 ${getThemeTextMuted()}`}>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {group.member_count}
                        </span>
                        <span className="flex items-center gap-1">
                          {group.my_role === 'admin' ? (
                            <Crown className="w-3 h-3" />
                          ) : null}
                          {group.my_role === 'admin' ? t('social.admin') : t('social.member')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenGroupChat(group.id, group.name);
                        }}
                        className={`p-2 rounded-lg transition-colors ${getThemeSubtle('ui')}`}
                        title={t('social.open_chat')}
                      >
                        <MessageSquare className={`w-4 h-4 ${getThemeTextSecondary()}`} />
                      </button>
                    </div>
                  </div>
                </button>

                {/* Expanded content */}
                {expandedGroupId === group.id && (
                  <div className={`border-t px-4 pb-4 pt-3 space-y-4 ${getThemeCardBorder()}`}>
                    {/* Group code + QR */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`text-xs mb-1 ${getThemeTextMuted()}`}>
                          {t('social.group_code')}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-lg font-bold tracking-widest ${getThemeTextPrimary()}`}>
                            {group.group_code}
                          </span>
                          <button
                            onClick={() => copyCode(group.group_code)}
                            className={`p-1.5 rounded-md transition-colors ${getThemeSubtle('ui')}`}
                            title={t('social.copy_code')}
                          >
                            {copiedCode === group.group_code ? (
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <Copy className={`w-3.5 h-3.5 ${getThemeTextMuted()}`} />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg">
                        <QRCodeSVG value={group.group_code} size={64} />
                      </div>
                    </div>

                    {/* Members list */}
                    <div>
                      <div className={`text-xs font-medium mb-2 ${getThemeTextSecondary()}`}>
                        {t('social.members')} ({group.member_count})
                      </div>
                      {loadingMembers === group.id ? (
                        <div className={`text-xs py-2 ${getThemeTextMuted()}`}>...</div>
                      ) : (
                        <div className="space-y-1.5">
                          {(members[group.id] || []).map((m) => (
                            <div
                              key={m.id}
                              className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-xs ${getThemeSubtle()}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${getThemeGradient()}`}
                                >
                                  {(m.username || m.display_name || '?')[0].toUpperCase()}
                                </div>
                                <span className={`truncate ${getThemeTextPrimary()}`}>
                                  {m.username || m.display_name || m.user_id.slice(0, 8)}
                                </span>
                                {m.role === 'admin' && (
                                  <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                                )}
                              </div>
                              {group.my_role === 'admin' && m.role !== 'admin' && (
                                <button
                                  onClick={() => handleRemoveMember(group.id, m.id)}
                                  className="text-red-400 hover:text-red-500 p-1 transition-colors"
                                  title={t('social.remove_member')}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Admin actions */}
                    {group.my_role === 'admin' && (
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-500 transition-colors mt-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('social.delete_group')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
