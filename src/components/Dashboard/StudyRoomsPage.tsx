import React, { useState, useEffect } from 'react';
import { Users, Plus, Video, X, Copy, Check, Clock, UserPlus, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { ZegoVideoRoom } from './ZegoVideoRoom';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { useConfirm } from '../../hooks/useConfirm';
import { LoadingSkeleton } from '../Common/LoadingSkeleton';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';

interface StudyRoom {
  id: string;
  creator_id: string;
  room_name: string;
  room_description: string;
  room_code: string;
  max_participants: number;
  is_active: boolean;
  created_at: string;
  expires_at: string;
  participant_count?: number;
}

interface RoomParticipant {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  is_host: boolean;
}

// ChatMessage interface removed - using ZegoCloud built-in chat

export const StudyRoomsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { getThemeGradient, getThemeBorder, getThemeText, getThemeFocusRing } = useTheme();
  const { error: showErrorToast, success: showSuccessToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('study-rooms');
  const [activeTab, setActiveTab] = useState<'browse' | 'my-rooms' | 'create'>('browse');
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [myRooms, setMyRooms] = useState<StudyRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<StudyRoom | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string>('');

  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [creating, setCreating] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [leavingRoom, setLeavingRoom] = useState(false);
  const { hasActiveSubscription } = useSubscription();

  useEffect(() => {
    if (user) {
      fetchRooms();
      fetchMyRooms();
      fetchUserDisplayName();
    }
  }, [user, activeTab]);

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial && !loading) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, loading, showTutorial]);

  const fetchUserDisplayName = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.display_name) {
        setUserDisplayName(profile.display_name);
      } else {
        // Fallback to email prefix
        const emailPrefix = user.email?.split('@')[0] || 'User';
        setUserDisplayName(emailPrefix);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'fetchUserDisplayName', userId: user?.id });
      setUserDisplayName(user.email?.split('@')[0] || 'Anonymous');
    }
  };

  useEffect(() => {
    if (selectedRoom) {
      fetchParticipants();

      // Real-time subscription for participant changes
      const participantsChannel = supabase
        .channel(`room-${selectedRoom.id}-participants`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'study_room_participants',
          filter: `room_id=eq.${selectedRoom.id}`
        }, async (payload) => {
          await fetchParticipants();
          
          // Check if room should be auto-ended (no active participants)
          if (selectedRoom) {
            const { count, error: countError } = await supabase
              .from('study_room_participants')
              .select('*', { count: 'exact', head: true })
              .eq('room_id', selectedRoom.id)
              .is('left_at', null);

            if (!countError && count === 0) {
              // Last participant left - end the room
              ErrorLogger.info('Last participant left - auto-ending room via real-time update', { component: 'StudyRoomsPage', action: 'participantSubscription', roomId: selectedRoom.id });
              const { error: endRoomError } = await supabase
                .from('study_rooms')
                .update({ is_active: false })
                .eq('id', selectedRoom.id);

              if (!endRoomError) {
                // Room ended - clear selection and refresh lists
                setSelectedRoom(null);
                setShowVideo(false);
                await Promise.all([fetchRooms(), fetchMyRooms()]);
                showSuccessToast('Room ended - all participants have left');
              }
            }
          }
        })
        .subscribe();

      return () => {
        participantsChannel.unsubscribe();
        supabase.removeChannel(participantsChannel);
      };
    }
  }, [selectedRoom?.id]);

  const fetchRooms = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('study_rooms')
        .select('*')
        .eq('is_active', true)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        const message = handleSupabaseError(error, { component: 'StudyRoomsPage', action: 'fetchRooms' });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'StudyRoomsPage', action: 'fetchRooms' });
        showErrorToast(message);
        setLoading(false);
        return;
      }

      if (data) {
        const roomsWithCounts = await Promise.all(
          data.map(async (room) => {
            try {
              const { count, error } = await supabase
                .from('study_room_participants')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .is('left_at', null);

              if (error) {
                ErrorLogger.warn('Failed to fetch participant count', { component: 'StudyRoomsPage', action: 'fetchRooms', roomId: room.id, error });
                return { ...room, participant_count: 0 };
              }

              return { ...room, participant_count: count || 0 };
            } catch (error) {
              ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'StudyRoomsPage', action: 'fetchRooms', roomId: room.id });
              return { ...room, participant_count: 0 };
            }
          })
        );
        setRooms(roomsWithCounts);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'fetchRooms' });
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRooms = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('study_rooms')
        .select('*')
        .eq('creator_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        const roomsWithCounts = await Promise.all(
          data.map(async (room) => {
            try {
              const { count, error: countError } = await supabase
                .from('study_room_participants')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', room.id)
                .is('left_at', null);

              if (countError) {
                ErrorLogger.warn('Failed to fetch participant count', { component: 'StudyRoomsPage', action: 'fetchMyRooms', roomId: room.id, error: countError });
                return { ...room, participant_count: 0 };
              }

              return { ...room, participant_count: count || 0 };
            } catch (error) {
              ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'StudyRoomsPage', action: 'fetchMyRooms', roomId: room.id });
              return { ...room, participant_count: 0 };
            }
          })
        );
        setMyRooms(roomsWithCounts);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'fetchMyRooms', userId: user?.id });
    }
  };

  const fetchParticipants = async () => {
    if (!selectedRoom) {
      ErrorLogger.debug('fetchParticipants: No room selected', { component: 'StudyRoomsPage', action: 'fetchParticipants' });
      return;
    }

    ErrorLogger.debug('Fetching participants for room', { component: 'StudyRoomsPage', action: 'fetchParticipants', roomId: selectedRoom.id });
    const startTime = Date.now();

    try {
      // Direct query to avoid RPC function errors
      const { data, error } = await supabase
        .from('study_room_participants')
        .select(`
          user_id,
          joined_at,
          is_host,
          left_at,
          user_profiles!inner (
            display_name,
            avatar_url
          )
        `)
        .eq('room_id', selectedRoom.id)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      const fetchTime = Date.now() - startTime;
      ErrorLogger.debug('Participants fetch completed', { component: 'StudyRoomsPage', action: 'fetchParticipants', roomId: selectedRoom.id, durationMs: fetchTime });

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'fetchParticipants', roomId: selectedRoom.id, errorCode: error.code });
        return;
      }

      if (data) {
        // Transform data to match expected format
        const participants = data.map(p => ({
          user_id: p.user_id,
          joined_at: p.joined_at,
          is_host: p.is_host,
          display_name: p.user_profiles.display_name,
          avatar_url: p.user_profiles.avatar_url
        }));

        ErrorLogger.debug('Participants loaded', { component: 'StudyRoomsPage', action: 'fetchParticipants', roomId: selectedRoom.id, participantCount: participants.length });
        setParticipants(participants);
      }
    } catch (error) {
      const message = handleApiError(error, { component: 'StudyRoomsPage', action: 'fetchParticipants', metadata: { roomId: selectedRoom?.id } });
      showErrorToast(message);
    }
  };

  // Chat functionality now handled by ZegoCloud built-in chat
  // Removed fetchChatMessages function - no longer needed

  const handleCreateRoom = async () => {
    if (!user || !roomName.trim()) {
      ErrorLogger.debug('Validation failed: missing user or room name', { component: 'StudyRoomsPage', action: 'handleCreateRoom' });
      return;
    }

    // Validate room name length
    if (roomName.trim().length > 100) {
      showErrorToast('Room name must be 100 characters or less');
      return;
    }

    // Validate room description length
    if (roomDescription.trim().length > 500) {
      showErrorToast('Room description must be 500 characters or less');
      return;
    }

    // Validate max participants range (minimum 1, maximum 20)
    if (maxParticipants < 1 || maxParticipants > 20) {
      showErrorToast('Room capacity must be between 1 and 20 participants');
      return;
    }

    ErrorLogger.debug('Starting Room Creation', { component: 'StudyRoomsPage', action: 'handleCreateRoom', userId: user.id, userEmail: user.email, roomName: roomName.trim(), maxParticipants });

    setCreating(true);
    try {
      // Step 1: Ensure user has profile (auto-create if missing)
      ErrorLogger.debug('Step 1: Ensuring user profile exists', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'profileEnsure' });
      const startProfileCheck = Date.now();

      const { data: profileEnsured, error: profileEnsureError } = await supabase
        .rpc('ensure_user_profile_for_room', { user_uuid: user.id });

      const profileCheckTime = Date.now() - startProfileCheck;
      ErrorLogger.debug('Profile ensure completed', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'profileEnsure', durationMs: profileCheckTime, profileEnsured, hasError: !!profileEnsureError });

      if (profileEnsureError) {
        const errorMessage = handleSupabaseError(profileEnsureError, { component: 'StudyRoomsPage', action: 'handleCreateRoom', metadata: { step: 'profileEnsure' } });
        ErrorLogger.error(profileEnsureError instanceof Error ? profileEnsureError : new Error(String(profileEnsureError)), { component: 'StudyRoomsPage', action: 'handleCreateRoom', metadata: { step: 'profileEnsure' } });
        throw new Error(errorMessage);
      }

      if (!profileEnsured) {
        const error = new Error('Could not verify user profile. Please contact support.');
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleCreateRoom', metadata: { step: 'profileEnsure' } });
        throw error;
      }

      ErrorLogger.info('User profile confirmed/created', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'profileEnsure' });

      // Step 2: Generate room code
      ErrorLogger.debug('Step 2: Generating room code', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode' });
      let roomCode: string;
      const startCodeGen = Date.now();

      try {
        ErrorLogger.debug('Calling generate_room_code RPC', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode' });
        const { data: roomCodeData, error: rpcError } = await supabase
          .rpc('generate_room_code');

        const codeGenTime = Date.now() - startCodeGen;
        ErrorLogger.debug('RPC completed', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', durationMs: codeGenTime, hasError: !!rpcError });

        if (rpcError) {
          ErrorLogger.warn('generate_room_code RPC failed', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', rpcError });
          throw rpcError;
        }

        roomCode = roomCodeData;
        ErrorLogger.info('Room code generated', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', roomCode });
      } catch (rpcError) {
        ErrorLogger.warn('RPC failed, using fallback generation', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', rpcError });

        // Fallback with collision check - generate exactly 8 characters
        let attempts = 0;
        const maxAttempts = 10;
        let codeGenerated = false;

        while (attempts < maxAttempts && !codeGenerated) {
          // Generate exactly 8 characters
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          roomCode = '';
          for (let i = 0; i < 8; i++) {
            roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
          }

          ErrorLogger.debug('Fallback code generated', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', roomCode, attempt: attempts + 1 });
          ErrorLogger.debug('Checking code uniqueness', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', roomCode });

          const { data: existing, error: checkError } = await supabase
            .from('study_rooms')
            .select('id')
            .eq('room_code', roomCode)
            .maybeSingle();

          ErrorLogger.debug('Uniqueness check result', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', roomCode, hasExisting: !!existing, hasError: !!checkError });

          if (checkError) {
            const error = new Error(`Code uniqueness check failed: ${checkError.message}`);
            ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleCreateRoom', checkError });
            throw error;
          }

          if (!existing) {
            codeGenerated = true;
            ErrorLogger.info('Fallback code is unique', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', roomCode });
          } else {
            attempts++;
            ErrorLogger.debug('Code collision detected, retrying', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', attempt: attempts });
          }
        }

        if (!codeGenerated) {
          const error = new Error('Failed to generate unique room code after multiple attempts');
          ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'generateCode', attempts: maxAttempts });
          throw error;
        }
      }

      // Step 3: Insert room
      ErrorLogger.debug('Step 3: Creating room in database', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'roomInsert' });
      const roomData = {
        creator_id: user.id,
        room_name: roomName.trim(),
        room_description: roomDescription.trim() || null,
        room_code: roomCode,
        max_participants: maxParticipants,
        is_active: true,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48 hours from now
      };
      ErrorLogger.debug('Room data prepared', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'roomInsert', roomName: roomData.room_name, roomCode: roomData.room_code, maxParticipants: roomData.max_participants });
      const startRoomInsert = Date.now();

      const { data: newRoom, error: roomError } = await supabase
        .from('study_rooms')
        .insert(roomData)
        .select()
        .single();

      const roomInsertTime = Date.now() - startRoomInsert;
      ErrorLogger.debug('Room insert completed', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'roomInsert', durationMs: roomInsertTime, hasError: !!roomError, roomId: newRoom?.id });

      if (roomError) {
        const errorMessage = handleSupabaseError(roomError, { component: 'StudyRoomsPage', action: 'handleCreateRoom', metadata: { step: 'roomInsert' } });
        ErrorLogger.error(roomError instanceof Error ? roomError : new Error(String(roomError)), { component: 'StudyRoomsPage', action: 'handleCreateRoom', metadata: { step: 'roomInsert' } });
        throw new Error(errorMessage);
      }

      if (!newRoom) {
        const error = new Error('Room created but no data returned');
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleCreateRoom', roomName, roomCode });
        throw error;
      }

      ErrorLogger.info('Room created successfully', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'roomInsert', roomId: newRoom.id });

      // Step 4: Join as host
      ErrorLogger.debug('Step 4: Joining room as host', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'joinAsHost', roomId: newRoom.id });
      const participantData = {
        room_id: newRoom.id,
        user_id: user.id,
        is_host: true
      };
      ErrorLogger.debug('Participant data prepared', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'joinAsHost', roomId: newRoom.id, userId: user.id });
      const startParticipantInsert = Date.now();

      const { error: participantError } = await supabase
        .from('study_room_participants')
        .insert(participantData);

      const participantInsertTime = Date.now() - startParticipantInsert;
      ErrorLogger.debug('Participant insert completed', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'joinAsHost', durationMs: participantInsertTime, hasError: !!participantError });

      if (participantError) {
        const error = new Error(`Failed to join room: ${participantError.message}`);
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleCreateRoom', roomId: newRoom.id, errorCode: participantError.code, details: participantError.details });
        throw error;
      }

      ErrorLogger.info('Successfully joined as host', { component: 'StudyRoomsPage', action: 'handleCreateRoom', step: 'joinAsHost', roomId: newRoom.id });

      // Success - Auto-join the room immediately
      ErrorLogger.info('Room Creation Successful', { component: 'StudyRoomsPage', action: 'handleCreateRoom', roomId: newRoom.id, roomCode: newRoom.room_code });

      // Clear form
      setRoomName('');
      setRoomDescription('');
      setMaxParticipants(10);

      // Auto-join: Set the newly created room as selected and open video
      ErrorLogger.debug('Auto-joining room as host', { component: 'StudyRoomsPage', action: 'handleCreateRoom', roomId: newRoom.id });
      setSelectedRoom(newRoom);
      setShowVideo(true); // Automatically start video for creator
      ErrorLogger.info('Opened room interface with video', { component: 'StudyRoomsPage', action: 'handleCreateRoom', roomId: newRoom.id });

      // Refresh room list in background
      ErrorLogger.debug('Fetching updated room list', { component: 'StudyRoomsPage', action: 'handleCreateRoom' });
      fetchMyRooms();

    } catch (error) {
      const errorMessage = handleApiError(error, { component: 'StudyRoomsPage', action: 'handleCreateRoom' });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'StudyRoomsPage', action: 'handleCreateRoom' });
      showErrorToast(errorMessage);
    } finally {
      setCreating(false);
      ErrorLogger.debug('Room creation process ended', { component: 'StudyRoomsPage', action: 'handleCreateRoom' });
    }
  };

  const handleJoinRoom = async (room: StudyRoom) => {
    if (!user || joiningRoom) {
      ErrorLogger.debug('Cannot join: user not authenticated or already joining', { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id });
      return;
    }

    // Check if room is expired
    if (new Date(room.expires_at) < new Date()) {
      showErrorToast('This room has expired. Please join another room.');
      return;
    }

    // Check if room is inactive
    if (!room.is_active) {
      showErrorToast('This room is no longer active. Please join another room.');
      return;
    }

    setJoiningRoom(true);
    ErrorLogger.debug('Joining Room', { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id, roomName: room.room_name, roomCode: room.room_code, userId: user.id });

    try {
      // Step 1: Ensure user has profile
      ErrorLogger.debug('Step 1: Ensuring user profile exists', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'profileEnsure', roomId: room.id });
      const { data: profileEnsured, error: profileError } = await supabase
        .rpc('ensure_user_profile_for_room', { user_uuid: user.id });

      if (profileError) {
        const error = new Error(`Profile verification failed: ${profileError.message}`);
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id, profileError });
        throw error;
      }

      if (!profileEnsured) {
        const error = new Error('Could not verify user profile. Please refresh and try again.');
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id });
        throw error;
      }
      ErrorLogger.info('Profile verified', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'profileEnsure', roomId: room.id });

      // Step 2: Check if already in room
      ErrorLogger.debug('Step 2: Checking if already in room', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkExisting', roomId: room.id });
      const { data: existingParticipant, error: checkError } = await supabase
        .from('study_room_participants')
        .select('*')
        .eq('room_id', room.id)
        .eq('user_id', user.id)
        .is('left_at', null)
        .maybeSingle();

      if (checkError) {
        const error = new Error(`Failed to check room status: ${checkError.message}`);
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id, checkError });
        throw error;
      }

      if (existingParticipant) {
        ErrorLogger.debug('Already in room, rejoining', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkExisting', roomId: room.id, participantId: existingParticipant.user_id });
        setSelectedRoom(room);
        setShowVideo(true);  // Auto-start video when rejoining
        ErrorLogger.info('Rejoined room successfully with video', { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id });
        return;
      }
      ErrorLogger.debug('Not in room, joining as new participant', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkExisting', roomId: room.id });

      // Step 3: Check if room is full
      ErrorLogger.debug('Step 3: Checking room capacity', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkCapacity', roomId: room.id });
      const { data: isFull, error: fullCheckError } = await supabase
        .rpc('is_room_full', { room_uuid: room.id });

      if (fullCheckError) {
        const error = new Error(`Failed to check room capacity: ${fullCheckError.message}`);
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id, fullCheckError });
        throw error;
      }

      ErrorLogger.debug('Room full check completed', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkCapacity', roomId: room.id, isFull });

      if (isFull) {
        ErrorLogger.warn('Room is at capacity', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkCapacity', roomId: room.id });
        showErrorToast(t('study_rooms.room_full'));
        return;
      }
      ErrorLogger.info('Room has space available', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'checkCapacity', roomId: room.id });

      // Step 4: Join room
      ErrorLogger.debug('Step 4: Joining as participant', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'joinParticipant', roomId: room.id });
      const { error: joinError } = await supabase
        .from('study_room_participants')
        .insert({
          room_id: room.id,
          user_id: user.id,
          is_host: false
        });

      if (joinError) {
        // Check if error is due to room being full or other constraints
        if (joinError.code === '23505' || joinError.message.includes('full') || joinError.message.includes('capacity') || joinError.message.includes('constraint')) {
          showErrorToast('This room is now full. Please try another room.');
          return;
        }
        const error = new Error(`Failed to join room: ${joinError.message}`);
        ErrorLogger.error(error, { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id, errorCode: joinError.code, details: joinError.details });
        throw error;
      }

      ErrorLogger.info('Successfully joined room', { component: 'StudyRoomsPage', action: 'handleJoinRoom', step: 'joinParticipant', roomId: room.id });
      ErrorLogger.debug('Opening room interface with video', { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id });
      setSelectedRoom(room);
      setShowVideo(true);  // Auto-start video immediately
      ErrorLogger.info('Join Complete', { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room.id });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'handleJoinRoom', roomId: room?.id });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // User-friendly error messages
      let userMessage = t('study_rooms.join_failed') || 'Failed to join room';

      if (errorMessage.includes('full')) {
        userMessage = 'This room is full. Please try another room.';
      } else if (errorMessage.includes('profile')) {
        userMessage = 'Please update your profile before joining rooms.';
      } else if (errorMessage.includes('expired') || errorMessage.includes('inactive')) {
        userMessage = 'This room is no longer available.';
      } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
        userMessage = 'You do not have permission to join this room.';
      }

      showErrorToast(`${userMessage}\n\nTechnical details: ${errorMessage}`);
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!user || !selectedRoom || leavingRoom) {
      ErrorLogger.debug('Cannot leave: missing user or room or already leaving', { component: 'StudyRoomsPage', action: 'handleLeaveRoom' });
      return;
    }

    setLeavingRoom(true);
    ErrorLogger.debug('Leaving Room', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id, roomName: selectedRoom.room_name, userId: user.id });

    try {
      // Close video first if open
      if (showVideo) {
        ErrorLogger.debug('Closing video', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });
        setShowVideo(false);
      }

      // Update database to mark as left
      ErrorLogger.debug('Updating participant record', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });
      const { error } = await supabase
        .from('study_room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', selectedRoom.id)
        .eq('user_id', user.id);

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });
        throw error;
      }

      ErrorLogger.info('Successfully left room', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });

      // Check if this was the last participant
      ErrorLogger.debug('Checking remaining participant count', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });
      const { count: remainingCount, error: countError } = await supabase
        .from('study_room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', selectedRoom.id)
        .is('left_at', null);

      if (countError) {
        ErrorLogger.warn('Failed to check participant count', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id, error: countError });
      } else {
        ErrorLogger.debug('Remaining participant count', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id, remainingCount });
        
        if (remainingCount === 0) {
          // Last participant left - end the room
          ErrorLogger.info('Last participant left - ending room', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });
          const { error: endRoomError } = await supabase
            .from('study_rooms')
            .update({ is_active: false })
            .eq('id', selectedRoom.id);

          if (endRoomError) {
            ErrorLogger.error(endRoomError instanceof Error ? endRoomError : new Error(String(endRoomError)), { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id, step: 'endRoom' });
          } else {
            ErrorLogger.info('Room ended successfully', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom.id });
          }
        }
      }

      // Clear selected room
      setSelectedRoom(null);

      // Refresh room lists
      ErrorLogger.debug('Refreshing room lists', { component: 'StudyRoomsPage', action: 'handleLeaveRoom' });
      await Promise.all([fetchRooms(), fetchMyRooms()]);

      ErrorLogger.info('Leave Complete', { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom?.id });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'handleLeaveRoom', roomId: selectedRoom?.id });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // User-friendly error message
      let userMessage = 'Unable to leave room properly.';

      if (errorMessage.includes('policy') || errorMessage.includes('permission')) {
        userMessage = 'Permission error when leaving room.';
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        userMessage = 'Network error. Please check your connection.';
      }

      showErrorToast(`${userMessage}\n\nTechnical details: ${errorMessage}\n\nThe page will refresh to ensure clean state.`);

      // Refresh to ensure clean state
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  // Chat functionality now handled by ZegoCloud built-in chat
  // Close room functionality removed per user request - delete is sufficient

  const handleDeleteRoom = async (roomId: string) => {
    if (!user) return;

    ErrorLogger.debug('Deleting Room', { component: 'StudyRoomsPage', action: 'handleDeleteRoom', roomId });

    const confirmed = await confirm(t('study_rooms.confirm_delete') || 'DELETE this room permanently? This cannot be undone!', {
      title: t('study_rooms.confirm_delete_title') || 'Delete Room',
      variant: 'destructive',
      confirmText: t('study_rooms.delete') || 'Delete',
    });
    if (!confirmed) {
      return;
    }

    try {
      const { error } = await supabase
        .from('study_rooms')
        .delete()
        .eq('id', roomId)
        .eq('creator_id', user.id);

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'handleDeleteRoom', roomId });
        throw error;
      }

      ErrorLogger.info('Room deleted successfully', { component: 'StudyRoomsPage', action: 'handleDeleteRoom', roomId });

      // If currently in this room, leave it
      if (selectedRoom?.id === roomId) {
        setSelectedRoom(null);
        setShowVideo(false);
      }

      // Refresh lists
      await Promise.all([fetchRooms(), fetchMyRooms()]);
      showSuccessToast(t('study_rooms.room_deleted') || 'Room deleted successfully');

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'StudyRoomsPage', action: 'handleDeleteRoom', roomId });
      showErrorToast(t('study_rooms.delete_failed') || 'Failed to delete room');
    }
  };

  const copyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatExpiry = (dateString: string) => {
    const now = new Date();
    const expiry = new Date(dateString);
    const hoursLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60));
    return `${hoursLeft}h left`;
  };

  if (selectedRoom) {
    return (
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Minimal header with room info and leave button */}
          <div className="mb-4 flex justify-between items-center bg-gray-800 rounded-lg p-4 shadow-lg">
            <div className="flex items-center space-x-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {selectedRoom.room_name}
                </h2>
                <div className="flex items-center space-x-3 mt-1 text-sm text-gray-400">
                  <span className="flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    {participants.length}/{selectedRoom.max_participants}
                  </span>
                  <button
                    onClick={() => copyRoomCode(selectedRoom.room_code)}
                    className="flex items-center space-x-1 hover:text-blue-400 transition-colors"
                  >
                    {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="font-mono">{selectedRoom.room_code}</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center space-x-2"
            >
              <X className="h-5 w-5" />
              <span>{t('study_rooms.leave_room') || 'Leave Room'}</span>
            </button>
          </div>

          {/* Full-screen ZegoCloud video interface */}
          <div className="bg-black rounded-xl overflow-hidden shadow-2xl" style={{ height: 'calc(100vh - 140px)' }}>
            <ZegoVideoRoom
              roomId={selectedRoom.room_code}
              roomName={selectedRoom.room_name}
              userName={userDisplayName || user?.email?.split('@')[0] || 'Anonymous'}
              onDisconnect={handleLeaveRoom}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} p-6`}>
      <div className="max-w-6xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center space-x-3 mb-6">
            <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{t('study_rooms.title')}</h1>
          </div>

          <div className={`flex space-x-2 border-b ${getThemeBorder()}`}>
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'browse'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t('study_rooms.browse')}
            </button>
            <button
              onClick={() => setActiveTab('my-rooms')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'my-rooms'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t('study_rooms.my_rooms')} ({myRooms.length})
            </button>
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'create'
                  ? `border-b-2 ${getThemeBorder()} ${getThemeText()}`
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t('study_rooms.create')}
            </button>
          </div>
        </div>

        {activeTab === 'create' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">{t('study_rooms.create_new')}</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('study_rooms.room_name')}
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={t('study_rooms.room_name_placeholder')}
                  maxLength={100}
                  className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('study_rooms.description')}
                </label>
                <textarea
                  value={roomDescription}
                  onChange={(e) => setRoomDescription(e.target.value)}
                  placeholder={t('study_rooms.description_placeholder')}
                  maxLength={500}
                  rows={3}
                  className={`w-full px-4 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-100`}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('study_rooms.max_participants')}
                </label>
                <input
                  type="range"
                  min="2"
                  max="20"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-center mt-2">
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{maxParticipants}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">{t('study_rooms.participants')}</span>
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={creating || !roomName.trim()}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2"
              >
                {creating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>{t('study_rooms.creating')}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    <span>{t('study_rooms.create_room')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {(activeTab === 'browse' || activeTab === 'my-rooms') && (
          <div className="space-y-4">
            {loading ? (
              <LoadingSkeleton type="card" count={3} />
            ) : (activeTab === 'browse' ? rooms : myRooms).length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
                <Users className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  {activeTab === 'browse' ? t('study_rooms.no_active_rooms') : t('study_rooms.no_rooms_yet')}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  {activeTab === 'browse' ? t('study_rooms.create_to_start') : t('study_rooms.create_first_room')}
                </p>
              </div>
            ) : (
              (activeTab === 'browse' ? rooms : myRooms).map((room) => (
                <div key={room.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        {room.room_name}
                      </h3>
                      {room.room_description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {room.room_description}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <span className="flex items-center">
                          <Users className="h-4 w-4 mr-1" />
                          {room.participant_count || 0}/{room.max_participants}
                        </span>
                        <span className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {formatExpiry(room.expires_at)}
                        </span>
                        <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {room.room_code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleJoinRoom(room)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>{t('study_rooms.join')}</span>
                      </button>
                      {activeTab === 'my-rooms' && room.creator_id === user?.id && (
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
                          title={t('study_rooms.delete_room') || 'Delete Room'}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>{t('study_rooms.delete') || 'Delete'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {ConfirmModal}

      {/* Study Rooms Tutorial */}
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
  );
};
