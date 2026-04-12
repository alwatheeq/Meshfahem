import React, { useState, useEffect } from 'react';
import { User, Award, Flame, BookOpen, FileQuestion, Clock, TrendingUp, Edit2, Save, X, CreditCard, Crown, Gift, Settings, ChevronDown, Copy, Check, AtSign, Hash } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { useCredits } from '../../contexts/CreditContext';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { useTheme, themeDefinitions, VALID_COLOR_THEMES } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../contexts/I18nContext';
import { useToast } from '../Toast/Toast';
import { UsernameSetupModal } from './UsernameSetupModal';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { getToolsCreditsPlanCap } from '../../utils/subscriptionHelpers';

interface UserStats {
  level: number;
  experience_points: number;
  study_streak_current: number;
  study_streak_longest: number;
  items_published_count: number;
  total_flashcards_studied: number;
  total_quizzes_completed: number;
  total_study_time_minutes: number;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
}

interface Achievement {
  id: string;
  achievement_key: string;
  title: string;
  description: string;
  icon_name: string;
  badge_tier: string;
  xp_reward: number;
  category: string;
  earned_at?: string;
}

export const ProfilePage: React.FC = React.memo(() => {
  const { user } = useAuth();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { updateColorTheme } = useUserPreferences();
  const { t, dir } = useI18n();
  const isRtl = dir === 'rtl';
  const navigate = useNavigate();
  const { balance: creditBalance, refreshBalance } = useCredits();
  const { preferences, updateSidebarMode, updateTtsHoverEnabled } = useUserPreferences();
  const { currentTheme, setTheme, getThemeGradient, getThemeBorder, getThemeFocusRing, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { theme: darkMode } = useI18n();
  const {
    subscription,
    hasActiveSubscription,
    isTrialUser,
    isPaidUser,
    getDaysRemaining,
    getTierDisplayName
  } = useSubscription();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedBio, setEditedBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [claimingCredits, setClaimingCredits] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [creditsDetailOpen, setCreditsDetailOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [publicUserId, setPublicUserId] = useState<string | null>(null);
  const [_usernameChangedAt, setUsernameChangedAt] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('profile');

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial && !loading) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, loading, showTutorial]);

  useEffect(() => {
    if (user) {
      supabase.from('user_profiles').select('username, public_user_id, username_changed_at').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setUsername(data.username);
          setPublicUserId(data.public_user_id);
          setUsernameChangedAt(data.username_changed_at);
        }
      });
    }
  }, [user]);

  const handleCopyField = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleClaimFreeCredits = async () => {
    if (!user || claimingCredits) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setClaimingCredits(true);
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session?.access_token) {
        showErrorToast('Authentication required. Please log in again.');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-free-credits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (result.success) {
        showSuccessToast('Successfully claimed 300 free credits!');
        await refreshBalance();
      } else {
        const message = handleApiError(new Error(result.error || 'Failed to claim credits'), { 
          component: 'ProfilePage', 
          action: 'handleClaimFreeCredits'
        });
        showErrorToast(message);
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'ProfilePage', 
        action: 'handleClaimFreeCredits',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'ProfilePage', 
        action: 'handleClaimFreeCredits',
        userId: user.id
      });
      showErrorToast(message);
    } finally {
      setClaimingCredits(false);
    }
  };

  const fetchUserData = async () => {
    if (!user) {
      ErrorLogger.warn('fetchUserData called without user', { component: 'ProfilePage', action: 'fetchUserData' });
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected, cannot fetch profile', { component: 'ProfilePage', action: 'fetchUserData', userId: user.id });
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      ErrorLogger.debug('Starting profile fetch', { component: 'ProfilePage', action: 'fetchUserData', userId: user.id, userEmail: user.email });

      // Verify user is authenticated before making query
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        ErrorLogger.error(new Error('No active session found'), { 
          component: 'ProfilePage', 
          action: 'fetchUserData',
          step: 'authCheck',
          userId: user.id
        });
        showErrorToast('You are not authenticated. Please log in again.');
        setLoading(false);
        return;
      }

      ErrorLogger.debug('Session verified', { 
        component: 'ProfilePage', 
        action: 'fetchUserData',
        step: 'authCheck',
        userId: user.id,
        hasSession: !!session,
        sessionUserId: session.user?.id
      });

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      ErrorLogger.debug('Profile fetch completed', { 
        component: 'ProfilePage', 
        action: 'fetchUserData', 
        step: 'initialFetch',
        userId: user.id,
        hasData: !!profileData,
        hasError: !!profileError,
        errorCode: profileError?.code,
        errorMessage: profileError?.message,
        errorDetails: profileError?.details,
        errorHint: profileError?.hint
      });

      // Check if it's a "not found" error - .maybeSingle() shouldn't return error for missing rows
      // but handle it just in case
      if (profileError) {
        // Check if it's a permission/403 error
        if (profileError.code === '42501' || profileError.message?.includes('permission') || profileError.message?.includes('policy') || profileError.message?.includes('Forbidden')) {
          ErrorLogger.error(profileError, { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            step: 'fetchProfile',
            userId: user.id,
            errorCode: profileError.code,
            errorMessage: profileError.message,
            errorDetails: profileError.details,
            errorHint: profileError.hint,
            sessionUserId: session.user?.id,
            userAuthId: user.id
          });
          showErrorToast('Permission denied: Unable to access profile. Please try logging out and back in, or contact support.');
          setLoading(false);
          return;
        }
        
        // Check if it's a "not found" error - if so, treat as missing profile
        if (profileError.code === 'PGRST116' || profileError.message?.includes('No rows') || profileError.message?.includes('not found')) {
          ErrorLogger.debug('Profile not found (expected) - will create', { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            userId: user.id
          });
          // Set profileData to null to trigger creation logic
          // Continue to profile creation logic below
        } else {
          // Real error - show message and return
          ErrorLogger.error(profileError, { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            step: 'fetchProfile',
            userId: user.id,
            errorCode: profileError.code,
            errorMessage: profileError.message,
            errorDetails: profileError.details,
            errorHint: profileError.hint
          });
          const message = handleSupabaseError(profileError, { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            step: 'fetchProfile'
          });
          showErrorToast(message);
          setLoading(false);
          return;
        }
      }

      // If profile doesn't exist, try to create it
      if (!profileData || (profileError && (profileError.code === 'PGRST116' || profileError.message?.includes('No rows')))) {
        ErrorLogger.debug('Profile missing - attempting creation', { 
          component: 'ProfilePage', 
          action: 'fetchUserData',
          userId: user.id 
        });

        let profileCreated = false;
        let createdProfile: any = null;

        // Method 1: Try direct INSERT first (simpler, faster if RLS allows)
        try {
          ErrorLogger.debug('Attempting direct INSERT for profile', { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            step: 'directInsert',
            userId: user.id 
          });

          const profileDataToInsert: any = {
            id: user.id,
            email: user.email || null,
            level: 1,
            experience_points: 0,
            study_streak_current: 0,
            study_streak_longest: 0,
            items_published_count: 0,
            total_flashcards_studied: 0,
            total_quizzes_completed: 0,
            total_study_time_minutes: 0,
          };

          // Only add credits fields if they exist in the schema
          // (Some older databases might not have these columns)
          const { data: insertData, error: insertError } = await supabase
            .from('user_profiles')
            .insert(profileDataToInsert)
            .select()
            .single();

          if (!insertError && insertData) {
            ErrorLogger.info('Profile created via direct INSERT', { 
              component: 'ProfilePage', 
              action: 'fetchUserData',
              userId: user.id
            });
            profileCreated = true;
            createdProfile = insertData;
          } else if (insertError) {
            // Check if it's a permission error or duplicate
            if (insertError.code === '42501' || insertError.message?.includes('permission') || insertError.message?.includes('policy')) {
              ErrorLogger.debug('Direct INSERT blocked by RLS, trying RPC', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'directInsert',
                userId: user.id,
                error: insertError.message
              });
              // Fall through to RPC method
            } else if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
              // Profile already exists, fetch it
              ErrorLogger.debug('Profile already exists (duplicate key), fetching', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                userId: user.id
              });
              const { data: existingProfile } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
              if (existingProfile) {
                profileCreated = true;
                createdProfile = existingProfile;
              }
            } else {
              ErrorLogger.warn('Direct INSERT failed with unexpected error', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'directInsert',
                userId: user.id,
                error: insertError
              });
              // Fall through to RPC method
            }
          }
        } catch (insertErr) {
          ErrorLogger.debug('Direct INSERT exception, trying RPC', { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            step: 'directInsert',
            userId: user.id,
            error: insertErr
          });
          // Fall through to RPC method
        }

        // Method 2: Try RPC function if direct INSERT didn't work
        if (!profileCreated) {
          try {
            ErrorLogger.debug('Attempting RPC create_missing_profile', { 
              component: 'ProfilePage', 
              action: 'fetchUserData',
              step: 'rpcCreate',
              userId: user.id 
            });

            ErrorLogger.debug('Calling RPC create_missing_profile', { 
              component: 'ProfilePage', 
              action: 'fetchUserData',
              step: 'rpcCall',
              userId: user.id,
              userEmail: user.email
            });

            const { data: createResult, error: createError } = await supabase
              .rpc('create_missing_profile', {
                p_user_id: user.id,
                p_email: user.email || null
              });

            ErrorLogger.debug('RPC create_missing_profile response received', { 
              component: 'ProfilePage', 
              action: 'fetchUserData',
              step: 'rpcResponse',
              userId: user.id,
              hasError: !!createError,
              hasResult: !!createResult,
              resultType: typeof createResult,
              errorCode: createError?.code,
              errorMessage: createError?.message,
              resultKeys: createResult && typeof createResult === 'object' ? Object.keys(createResult) : null
            });

            if (createError) {
              ErrorLogger.error(createError, { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'rpcCreate',
                userId: user.id,
                errorCode: createError.code,
                errorMessage: createError.message,
                errorDetails: createError.details,
                errorHint: createError.hint
              });
              
              // Check if it's a permission error
              if (createError.code === '42501' || createError.message?.includes('permission') || createError.message?.includes('policy')) {
                const errorMsg = 'Permission denied: Unable to create profile. This may be a temporary issue. Please try logging out and back in, or contact support if the problem persists.';
                ErrorLogger.warn('RLS policy blocked profile creation', { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'rpcCreate',
                  userId: user.id,
                  errorCode: createError.code
                });
                showErrorToast(errorMsg);
              } else if (createError.code === 'PGRST301' || createError.message?.includes('function') || createError.message?.includes('not found')) {
                const errorMsg = 'Profile creation service is unavailable. Please contact support.';
                ErrorLogger.error('RPC function not found or unavailable', { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'rpcCreate',
                  userId: user.id,
                  errorCode: createError.code
                });
                showErrorToast(errorMsg);
              } else {
                const errorMsg = `Failed to create profile: ${createError.message || 'Unknown error'}. Please try again or contact support.`;
                showErrorToast(errorMsg);
              }
              setLoading(false);
              return;
            }

            // Parse RPC response - handle different return structures
            let rpcSuccess = false;
            let rpcError: string | null = null;
            
            if (createResult === null || createResult === undefined) {
              ErrorLogger.warn('RPC returned null/undefined', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'rpcParse',
                userId: user.id
              });
              // Treat as failure
            } else if (typeof createResult === 'boolean') {
              rpcSuccess = createResult;
              ErrorLogger.debug('RPC returned boolean', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'rpcParse',
                userId: user.id,
                success: rpcSuccess
              });
            } else if (typeof createResult === 'object') {
              // Handle jsonb object response
              if ('success' in createResult) {
                rpcSuccess = Boolean(createResult.success);
                if ('error' in createResult && createResult.error) {
                  rpcError = String(createResult.error);
                }
                ErrorLogger.debug('RPC returned object with success field', { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'rpcParse',
                  userId: user.id,
                  success: rpcSuccess,
                  error: rpcError,
                  resultKeys: Object.keys(createResult)
                });
              } else {
                // No 'success' field - assume success if no error field
                rpcSuccess = !('error' in createResult && createResult.error);
                if ('error' in createResult) {
                  rpcError = String(createResult.error);
                }
                ErrorLogger.debug('RPC returned object without success field', { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'rpcParse',
                  userId: user.id,
                  assumedSuccess: rpcSuccess,
                  error: rpcError,
                  resultKeys: Object.keys(createResult)
                });
              }
            } else {
              // Unexpected type
              ErrorLogger.warn('RPC returned unexpected type', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'rpcParse',
                userId: user.id,
                resultType: typeof createResult,
                resultValue: String(createResult)
              });
            }

            if (!rpcSuccess) {
              const errorMsg = rpcError || 'Profile creation failed';
              ErrorLogger.error(new Error(errorMsg), { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'rpcCreate',
                userId: user.id,
                rpcResult: createResult,
                parsedError: rpcError
              });
              
              if (rpcError?.includes('already exists')) {
                // Profile exists, fetch it
                ErrorLogger.debug('Profile already exists according to RPC, fetching', { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'fetchExistingAfterRpc',
                  userId: user.id
                });
                const { data: existingProfile } = await supabase
                  .from('user_profiles')
                  .select('*')
                  .eq('id', user.id)
                  .maybeSingle();
                if (existingProfile) {
                  profileCreated = true;
                  createdProfile = existingProfile;
                  ErrorLogger.info('Found existing profile after RPC "already exists" error', { 
                    component: 'ProfilePage', 
                    action: 'fetchUserData',
                    userId: user.id
                  });
                }
              } else {
                showErrorToast(`Failed to create profile: ${errorMsg}. Please contact support.`);
                setLoading(false);
                return;
              }
            } else {
              // RPC succeeded, retry profile fetch with exponential backoff
              ErrorLogger.info('RPC profile creation succeeded, fetching profile with retry logic', { 
                component: 'ProfilePage', 
                action: 'fetchUserData',
                step: 'retryFetchAfterRpc',
                userId: user.id
              });

              let retryProfile = null;
              let retryError = null;
              const maxRetries = 3;
              const baseDelay = 500; // 500ms base delay

              for (let attempt = 0; attempt < maxRetries; attempt++) {
                const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 500ms, 1000ms, 2000ms
                
                if (attempt > 0) {
                  ErrorLogger.debug(`Retrying profile fetch (attempt ${attempt + 1}/${maxRetries})`, { 
                    component: 'ProfilePage', 
                    action: 'fetchUserData',
                    step: 'retryFetchAfterRpc',
                    userId: user.id,
                    attempt,
                    delay
                  });
                  await new Promise(resolve => setTimeout(resolve, delay));
                }

                const { data: fetchedProfile, error: fetchErr } = await supabase
                  .from('user_profiles')
                  .select('*')
                  .eq('id', user.id)
                  .maybeSingle();

                ErrorLogger.debug(`Profile fetch attempt ${attempt + 1} completed`, { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'retryFetchAfterRpc',
                  userId: user.id,
                  attempt: attempt + 1,
                  hasData: !!fetchedProfile,
                  hasError: !!fetchErr,
                  errorCode: fetchErr?.code
                });

                if (fetchErr) {
                  retryError = fetchErr;
                  if (attempt < maxRetries - 1) {
                    // Continue to next retry
                    continue;
                  }
                } else if (fetchedProfile) {
                  retryProfile = fetchedProfile;
                  retryError = null;
                  break; // Success, exit retry loop
                }
              }

              if (retryError) {
                ErrorLogger.error(retryError, { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'retryFetchAfterRpc',
                  userId: user.id,
                  attempts: maxRetries,
                  finalErrorCode: retryError.code,
                  finalErrorMessage: retryError.message
                });
                showErrorToast('Profile was created but could not be loaded. Please refresh the page or try again in a moment.');
                setLoading(false);
                return;
              }

              if (retryProfile) {
                profileCreated = true;
                createdProfile = retryProfile;
                ErrorLogger.info('Profile successfully fetched after RPC creation', { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  userId: user.id,
                  attempts: retryProfile ? 'success' : 'failed'
                });
              } else {
                ErrorLogger.error(new Error('Profile fetch failed after all retries'), { 
                  component: 'ProfilePage', 
                  action: 'fetchUserData',
                  step: 'retryFetchAfterRpc',
                  userId: user.id,
                  attempts: maxRetries
                });
                showErrorToast('Profile was created but could not be loaded. Please refresh the page.');
                setLoading(false);
                return;
              }
            }
          } catch (rpcErr) {
            const err = rpcErr instanceof Error ? rpcErr : new Error(String(rpcErr));
            ErrorLogger.error(err, { 
              component: 'ProfilePage', 
              action: 'fetchUserData',
              step: 'rpcCreate',
              userId: user.id
            });
            showErrorToast('Unexpected error creating profile. Please contact support.');
            setLoading(false);
            return;
          }
        }

        // Use the created profile
        if (profileCreated && createdProfile) {
          ErrorLogger.info('Profile created and loaded successfully', { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            userId: user.id
          });
          
          // Ensure all required fields exist with defaults
          const profileStats: UserStats = {
            level: createdProfile.level ?? 1,
            experience_points: createdProfile.experience_points ?? 0,
            study_streak_current: createdProfile.study_streak_current ?? 0,
            study_streak_longest: createdProfile.study_streak_longest ?? 0,
            items_published_count: createdProfile.items_published_count ?? 0,
            total_flashcards_studied: createdProfile.total_flashcards_studied ?? 0,
            total_quizzes_completed: createdProfile.total_quizzes_completed ?? 0,
            total_study_time_minutes: createdProfile.total_study_time_minutes ?? 0,
            display_name: createdProfile.display_name,
            bio: createdProfile.bio,
            avatar_url: createdProfile.avatar_url,
          };
          
          setStats(profileStats);
          setEditedName(createdProfile.display_name || '');
          setEditedBio(createdProfile.bio || '');
        } else {
          ErrorLogger.error(new Error('Failed to create profile - both direct INSERT and RPC methods failed'), { 
            component: 'ProfilePage', 
            action: 'fetchUserData',
            userId: user.id,
            attemptedMethods: ['directInsert', 'rpcCreate']
          });
          showErrorToast('Unable to create your profile. This may be a temporary issue. Please try logging out and back in, or contact support if the problem persists.');
          setLoading(false);
          return;
        }
      } else {
        // Profile exists, use it normally - ensure it matches UserStats interface
        const profileStats: UserStats = {
          level: profileData.level ?? 1,
          experience_points: profileData.experience_points ?? 0,
          study_streak_current: profileData.study_streak_current ?? 0,
          study_streak_longest: profileData.study_streak_longest ?? 0,
          items_published_count: profileData.items_published_count ?? 0,
          total_flashcards_studied: profileData.total_flashcards_studied ?? 0,
          total_quizzes_completed: profileData.total_quizzes_completed ?? 0,
          total_study_time_minutes: profileData.total_study_time_minutes ?? 0,
          display_name: profileData.display_name,
          bio: profileData.bio,
          avatar_url: profileData.avatar_url,
        };
        
        setStats(profileStats);
        setEditedName(profileData.display_name || '');
        setEditedBio(profileData.bio || '');
      }

      const { data: achievementsData, error: achievementsError } = await supabase
        .from('user_achievements')
        .select(`
          earned_at,
          achievements_definitions (
            id,
            achievement_key,
            title,
            description,
            icon_name,
            badge_tier,
            xp_reward,
            category
          )
        `)
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false })
        .limit(20);

      if (achievementsError) {
        ErrorLogger.error(achievementsError, { 
          component: 'ProfilePage', 
          action: 'fetchUserData',
          step: 'fetchAchievements',
          userId: user.id
        });
        // Non-blocking: achievements are optional
      } else if (achievementsData) {
        const formattedAchievements = achievementsData
          .filter(a => a.achievements_definitions)
          .map(a => ({
            ...(a.achievements_definitions as Achievement),
            earned_at: a.earned_at
          }));
        setAchievements(formattedAchievements);
      }
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'ProfilePage', 
        action: 'fetchUserData',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'ProfilePage', 
        action: 'fetchUserData',
        userId: user.id
      });
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || saving) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: editedName.trim() || null,
          bio: editedBio.trim() || null
        })
        .eq('id', user.id);

      if (error) {
        const message = handleSupabaseError(error, { 
          component: 'ProfilePage', 
          action: 'handleSaveProfile',
          userId: user.id
        });
        ErrorLogger.error(error, { 
          component: 'ProfilePage', 
          action: 'handleSaveProfile',
          userId: user.id
        });
        showErrorToast(message);
        return;
      }

      setIsEditing(false);
      showSuccessToast('Profile updated successfully');
      await fetchUserData();
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'ProfilePage', 
        action: 'handleSaveProfile',
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'ProfilePage', 
        action: 'handleSaveProfile',
        userId: user.id
      });
      showErrorToast(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSidebarModeChange = async (mode: 'collapsible' | 'pinnable') => {
    if (!user || savingSettings) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      return;
    }

    setSavingSettings(true);
    setSettingsMessage(null);

    try {
      await updateSidebarMode(mode);
      setSettingsMessage('Settings saved successfully!');
      showSuccessToast('Settings saved successfully!');
      setTimeout(() => setSettingsMessage(null), 3000);
    } catch (error) {
      const message = handleApiError(error, { 
        component: 'ProfilePage', 
        action: 'handleSidebarModeChange',
        mode,
        userId: user.id
      });
      ErrorLogger.error(error, { 
        component: 'ProfilePage', 
        action: 'handleSidebarModeChange',
        mode,
        userId: user.id
      });
      setSettingsMessage('Failed to save settings. Please try again.');
      showErrorToast(message);
      setTimeout(() => setSettingsMessage(null), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  const calculateLevelProgress = (xp: number) => {
    const currentLevel = Math.floor(Math.sqrt(xp / 100)) + 1;
    const xpForCurrentLevel = Math.pow(currentLevel - 1, 2) * 100;
    const xpForNextLevel = Math.pow(currentLevel, 2) * 100;
    const progress = ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;
    return { currentLevel, progress, xpForNextLevel };
  };

  const formatStudyTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getBadgeColor = (tier: string) => {
    const colors = {
      bronze: 'from-gray-600 to-gray-800',
      silver: 'from-gray-400 to-gray-600',
      gold: 'from-gray-600 to-gray-800',
      platinum: 'from-gray-500 to-gray-700',
      diamond: 'from-gray-700 to-gray-900'
    };
    return colors[tier as keyof typeof colors] || 'from-gray-400 to-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 ${getThemeBorder()} mx-auto"></div>
          <p className={`mt-4 ${getThemeTextSecondary()}`}>{t('profile.loading')}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mb-4">
            <User className={`h-16 w-16 ${getThemeTextMuted()} mx-auto mb-4`} />
            <h2 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-2`}>
              {t('profile.load_error') || 'Unable to Load Profile'}
            </h2>
            <p className={`${getThemeTextSecondary()} mb-4`}>
              We couldn't load your profile data. This might be a temporary issue.
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => {
                if (user) {
                  ErrorLogger.info('User clicked retry button', { component: 'ProfilePage', action: 'retry', userId: user.id });
                  setLoading(true);
                  fetchUserData();
                }
              }}
              disabled={loading}
              className={`px-6 py-3 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium`}
            >
              {loading ? 'Loading...' : 'Retry'}
            </button>
            <p className={`text-sm ${getThemeTextMuted()} mt-4`}>
              If this problem persists, please try logging out and back in, or contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { currentLevel, progress, xpForNextLevel } = calculateLevelProgress(stats.experience_points);

  const toolPlanCap = getToolsCreditsPlanCap(subscription);
  const toolRem = creditBalance?.credits_remaining ?? 0;
  const zegoRem = creditBalance?.zego_credits_remaining ?? 0;
  const zegoTot = creditBalance?.zego_credits_total ?? 0;
  const hasAiAddonProfile =
    !!subscription &&
    ((subscription.subscription_tier === 'standard' && (subscription.chat_blocks_per_cycle ?? 0) > 0) ||
      (subscription.token_limit ?? 0) > 520000);
  const aiChatCreditsTotalProfile =
    hasAiAddonProfile && subscription
      ? subscription.token_limit && subscription.token_limit > 520000
        ? Math.round((subscription.token_limit - 520000) / 1000)
        : (subscription.chat_blocks_per_cycle ?? 0) * 100
      : 0;
  const aiChatCreditsUsedProfile = hasAiAddonProfile && subscription ? Math.round((subscription.tokens_used_current_cycle ?? 0) / 1000) : 0;
  const aiChatCreditsRemainingProfile = Math.max(0, aiChatCreditsTotalProfile - aiChatCreditsUsedProfile);
  const toolBarPct =
    toolPlanCap > 0 ? Math.min(100, (toolRem / toolPlanCap) * 100) : 0;

  return (
    <div className="w-full min-h-0 p-4 sm:p-6">
      <div className="w-full space-y-6">
        {/* Subscription Status Card */}
        <div className={`${getThemeGradient('ui')} rounded-lg shadow p-6 text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white bg-opacity-20 dark:bg-gray-900 dark:bg-opacity-20 p-3 rounded-lg">
                <Crown className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{t('profile.subscription_status')}</h2>
                {hasActiveSubscription() ? (
                  <>
                    <p className="text-white dark:text-gray-900 text-opacity-90 dark:text-opacity-90 mt-1">
                      {t('profile.current_plan')}: <span className="font-semibold">{getTierDisplayName()}</span>
                    </p>
                    {isTrialUser() && (
                      <p className="text-white dark:text-gray-900 text-sm mt-1">
                        {t('profile.trial_expires', { days: getDaysRemaining() })}
                      </p>
                    )}
                    {isPaidUser() && subscription && (
                      <p className="text-white dark:text-gray-900 text-opacity-80 dark:text-opacity-80 text-sm mt-1">
                        {subscription.auto_renew ? t('profile.renews_on') : t('profile.expires_on')} {new Date(subscription.end_date).toLocaleDateString()}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-white dark:text-gray-900 text-opacity-90 dark:text-opacity-90 mt-1">
                    {t('profile.no_subscription')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {hasActiveSubscription() && !isTrialUser() ? (
                <button
                  onClick={() => navigate('/profile/subscription')}
                  className={`px-6 py-3 ${getThemeCardBg()} ${getThemeTextPrimary()} rounded-lg hover:opacity-80 font-semibold transition flex items-center space-x-2`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span>{t('profile.manage_subscription')}</span>
                </button>
              ) : (
                <button
                  onClick={() => navigate('/pricing')}
                  className={`px-6 py-3 ${getThemeCardBg()} ${getThemeTextPrimary()} rounded-lg hover:opacity-80 font-semibold transition flex items-center space-x-2`}
                >
                  <Crown className="h-5 w-5" />
                  <span>{isTrialUser() ? t('profile.upgrade_plan') : t('profile.subscribe_now')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Credits: summary + expandable breakdown (matches header dropdown) */}
        {creditBalance && (
          <div
            className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 ${getThemeCardBorder()}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setCreditsDetailOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 text-left rounded-lg -m-2 p-2 hover:opacity-90 transition-opacity"
                  aria-expanded={creditsDetailOpen}
                >
                  <div>
                    <h2 className={`text-2xl font-bold ${getThemeTextPrimary()} mb-1`}>
                      {t('profile.credits_summary_title')}
                    </h2>
                    <p className={`text-sm ${getThemeTextSecondary()}`}>{t('profile.credits_summary_subtitle')}</p>
                  </div>
                  <ChevronDown
                    className={`h-6 w-6 shrink-0 ${getThemeTextSecondary()} transition-transform ${creditsDetailOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>

                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mt-4 mb-2">
                  <span className={`text-4xl font-bold ${getThemeTextPrimary()}`}>{toolRem.toLocaleString()}</span>
                  <span className={`text-xl ${getThemeTextMuted()}`}>
                    / {toolPlanCap.toLocaleString()}
                  </span>
                  <span className={`text-sm ${getThemeTextMuted()}`}>{t('profile.credits_tools_label')}</span>
                </div>

                <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-3 mb-2`}>
                  <div
                    className={`h-3 rounded-full transition-colors duration-150 bg-emerald-500 dark:bg-emerald-600`}
                    style={{ width: `${toolBarPct}%` }}
                  />
                </div>

                {creditBalance.cycle_end && (
                  <p className={`text-sm ${getThemeTextSecondary()}`}>
                    {t('profile.credits_refresh_on', { date: new Date(creditBalance.cycle_end).toLocaleDateString() })}
                  </p>
                )}
              </div>

              {!creditBalance.free_credits_claimed && (
                <button
                  onClick={handleClaimFreeCredits}
                  disabled={claimingCredits}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 font-semibold transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <Gift className="h-5 w-5" />
                  <span>{claimingCredits ? t('profile.claiming') : t('profile.claim_free_credits')}</span>
                </button>
              )}
            </div>

            {creditsDetailOpen && (
              <div className={`mt-6 pt-6 border-t ${getThemeCardBorder()} space-y-5`}>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${getThemeTextPrimary()}`}>
                    {t('header.credits_tools_services')}
                  </p>
                  <p className={`text-sm ${getThemeTextSecondary()}`}>
                    {toolRem.toLocaleString()} / {toolPlanCap.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${getThemeTextPrimary()}`}>
                    {t('header.credits_study_room')}
                  </p>
                  <p className={`text-sm ${getThemeTextSecondary()}`}>
                    {zegoTot > 0 ? `${zegoRem.toLocaleString()} / ${zegoTot.toLocaleString()}` : '0'}
                  </p>
                  {zegoTot > 0 && (
                    <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-2 mt-2 max-w-xs`}>
                      <div
                        className="h-2 rounded-full bg-sky-500 dark:bg-sky-600"
                        style={{
                          width: `${Math.min(100, (zegoRem / zegoTot) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wide ${getThemeTextPrimary()}`}>
                    {t('header.credits_ai_assistant')}
                  </p>
                  <p className={`text-sm ${getThemeTextSecondary()}`}>
                    {hasAiAddonProfile && aiChatCreditsTotalProfile > 0
                      ? `${aiChatCreditsRemainingProfile.toLocaleString()} / ${aiChatCreditsTotalProfile.toLocaleString()}`
                      : '0'}
                  </p>
                  {!hasAiAddonProfile && (
                    <p className={`text-xs mt-1 ${getThemeTextMuted()}`}>{t('header.credits_ai_addon_hint')}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow p-6`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeSubtle('ui')} p-3 rounded-lg`}>
              <Settings className={`h-6 w-6 ${getThemeTextSecondary()}`} />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${getThemeTextPrimary()}`}>Settings</h2>
              <p className={`text-sm ${getThemeTextSecondary()}`}>
                Customize your application preferences
              </p>
            </div>
          </div>

          {settingsMessage && (
            <div className={`mb-4 p-3 rounded-lg ${
              settingsMessage.includes('success')
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}>
              {settingsMessage}
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Sidebar Behavior
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose how you want the sidebar to behave on desktop
              </p>

              <div className="space-y-3">
                <label className={`flex items-start space-x-3 p-4 border-2 rounded-lg cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  preferences?.sidebar_mode === 'collapsible'
                    ? '${getThemeBorder()} bg-opacity-10 dark:bg-opacity-20'
                    : '${getThemeBorder()} opacity-50'
                }`}>
                  <input
                    type="radio"
                    name="sidebar_mode"
                    value="collapsible"
                    checked={preferences?.sidebar_mode === 'collapsible'}
                    onChange={() => handleSidebarModeChange('collapsible')}
                    disabled={savingSettings}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Auto-collapse Sidebar (Default)
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      The sidebar automatically shows when you move your mouse near the left edge and hides when you move away. Perfect for maximizing screen space.
                    </div>
                  </div>
                </label>

                <label className={`flex items-start space-x-3 p-4 border-2 rounded-lg cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  preferences?.sidebar_mode === 'pinnable'
                    ? '${getThemeBorder()} bg-opacity-10 dark:bg-opacity-20'
                    : '${getThemeBorder()} opacity-50'
                }`}>
                  <input
                    type="radio"
                    name="sidebar_mode"
                    value="pinnable"
                    checked={preferences?.sidebar_mode === 'pinnable'}
                    onChange={() => handleSidebarModeChange('pinnable')}
                    disabled={savingSettings}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      Pin/Unpin Sidebar
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Manually control the sidebar with a pin button. Click to pin it open or unpin to collapse it. The sidebar stays in your chosen state.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Navigation Voice (TTS hover) */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {t('profile.tts_hover_label')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('profile.tts_hover_desc')}
              </p>
              <label className="flex items-center space-x-3 rtl:space-x-reverse cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={preferences?.tts_hover_enabled !== false}
                    onChange={(e) => updateTtsHoverEnabled(e.target.checked)}
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${preferences?.tts_hover_enabled !== false ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${preferences?.tts_hover_enabled !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {preferences?.tts_hover_enabled !== false ? t('subscription_management.enabled') : t('subscription_management.disabled')}
                </span>
              </label>
            </div>

            {/* Color Theme Selector */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                {t('profile.theme_picker_title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t('profile.theme_picker_desc')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {VALID_COLOR_THEMES.map((theme) => {
                  const isSelected = currentTheme === theme;
                  const themeDef = themeDefinitions[theme];
                  const bgGradient = darkMode === 'dark' ? themeDef.background.dark.gradient : themeDef.background.light.gradient;
                  const uiGradient = darkMode === 'dark' ? themeDef.ui.dark.gradient : themeDef.ui.light.gradient;
                  
                  return (
                    <button
                      key={theme}
                      onClick={async () => {
                        if (savingSettings || isSelected) return;
                        setSavingSettings(true);
                        setSettingsMessage(null);
                        try {
                          await setTheme(theme, async () => {
                            await updateColorTheme(theme);
                          });
                          setSettingsMessage('Theme updated successfully!');
                          showSuccessToast('Theme updated successfully!');
                          setTimeout(() => setSettingsMessage(null), 3000);
                        } catch (error) {
                          const errorMessage = error instanceof Error ? error.message : String(error);
                          
                          // Check if it's a cooldown error
                          if (errorMessage.includes('Please wait')) {
                            setSettingsMessage(errorMessage);
                            showErrorToast(errorMessage);
                            setTimeout(() => setSettingsMessage(null), 5000);
                          } else {
                            handleApiError(error, { 
                              component: 'ProfilePage', 
                              action: 'handleThemeChange',
                              theme,
                              userId: user?.id
                            });
                            ErrorLogger.error(error, { 
                              component: 'ProfilePage', 
                              action: 'handleThemeChange',
                              theme,
                              userId: user?.id
                            });
                            setSettingsMessage('Failed to update theme. Please try again.');
                            setTimeout(() => setSettingsMessage(null), 3000);
                          }
                        } finally {
                          setSavingSettings(false);
                        }
                      }}
                      disabled={savingSettings}
                      className={`relative p-4 border-2 rounded-lg transition-all cursor-pointer hover:shadow ${
                        isSelected
                          ? `${getThemeBorder()} bg-opacity-10 dark:bg-opacity-20 shadow-md`
                          : `${getThemeBorder()} opacity-50 hover:border-gray-300 dark:hover:border-gray-600`
                      } ${savingSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className="bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900 rounded-full p-1">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                      <div className="space-y-3">
                        {/* Background Preview */}
                        <div className={`h-12 rounded-lg bg-gradient-to-br ${bgGradient} flex items-center justify-center border ${getThemeBorder()} opacity-50`}>
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Background</span>
                        </div>
                        {/* UI Elements Preview */}
                        <div className={`h-12 rounded-lg bg-gradient-to-r ${uiGradient} flex items-center justify-center border ${getThemeBorder()} opacity-50`}>
                          <span className="text-xs text-white font-medium">UI Elements</span>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {t(`profile.theme_${theme.replace(/-/g, '_')}`)}
                          </div>
                          {theme === 'sky-blue' && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('profile.theme_default_badge')}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Profile Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6">
          <div className={`flex items-start justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className={`flex items-center space-x-6 rtl:space-x-reverse ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className="relative">
                <div className={`h-24 w-24 rounded-full ${getThemeGradient('ui')} flex items-center justify-center text-white dark:text-gray-900 text-3xl font-bold`}>
                  {(stats.display_name || user?.email)?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-gray-600 to-gray-800 text-white px-3 py-1 rounded-full text-sm font-bold shadow">
                  Lv {currentLevel}
                </div>
              </div>

              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder={t('profile.display_name')}
                      maxLength={50}
                      className={`w-full px-3 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                    />
                    <textarea
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      placeholder={t('profile.bio_placeholder')}
                      maxLength={500}
                      rows={3}
                      className={`w-full px-3 py-2 border ${getThemeBorder()} rounded-lg ${getThemeFocusRing()} focus:ring-2 dark:bg-gray-700 dark:text-gray-100`}
                    />
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {stats.display_name || user?.email}
                    </h1>
                    {stats.bio && (
                      <p className="text-gray-600 dark:text-gray-400 mt-1">{stats.bio}</p>
                    )}
                  </>
                )}

                {/* Username & Public ID Section */}
                {(username || publicUserId) && (
                  <div className="mt-3 space-y-2">
                    {username && (
                      <div className="flex items-center gap-2">
                        <AtSign className={`h-4 w-4 ${getThemeTextMuted()}`} />
                        <span className={`font-medium ${getThemeTextPrimary()}`}>@{username}</span>
                        <button
                          onClick={() => handleCopyField(`@${username}`, 'username')}
                          className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 ${getThemeTextMuted()}`}
                        >
                          {copiedField === 'username' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                    {publicUserId && (
                      <div className="flex items-center gap-2">
                        <Hash className={`h-4 w-4 ${getThemeTextMuted()}`} />
                        <span className={`text-sm ${getThemeTextMuted()}`}>{publicUserId}</span>
                        <span className={`text-xs ${getThemeTextMuted()}`}>({t('social.your_id')})</span>
                        <button
                          onClick={() => handleCopyField(publicUserId, 'user-id')}
                          className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 ${getThemeTextMuted()}`}
                        >
                          {copiedField === 'user-id' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                    {username && (
                      <button
                        onClick={() => setShowUsernameModal(true)}
                        className={`text-sm ${getThemeTextSecondary()} hover:underline`}
                      >
                        {t('social.change_username')}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  <div className={`flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <span>{t('profile.level')} {currentLevel}</span>
                    <span>{stats.experience_points} / {xpForNextLevel} {t('profile.xp')}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`${getThemeGradient('ui')} h-3 rounded-full transition-colors duration-150`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="p-2 bg-gray-700 dark:bg-gray-200 text-white dark:text-gray-900 rounded-lg hover:bg-gray-600 dark:hover:bg-gray-300 disabled:opacity-50"
                    title="Save"
                  >
                    <Save className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditedName(stats.display_name || '');
                      setEditedBio(stats.bio || '');
                    }}
                    className="p-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200"
                    title="Cancel"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  title="Edit Profile"
                >
                  <Edit2 className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-md shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 border border-gray-100 dark:border-gray-700">
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.current_streak')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {stats.study_streak_current}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {t('profile.best')}: {stats.study_streak_longest} {t('profile.days')}
                </p>
              </div>
              <div className="bg-orange-100 dark:bg-orange-900 p-3 rounded-lg">
                <Flame className="h-8 w-8 text-orange-600 dark:text-orange-300" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-md shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 border border-gray-100 dark:border-gray-700">
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.items_published')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {stats.items_published_count}
                </p>
              </div>
              <div className="bg-green-100 dark:bg-green-900 p-3 rounded-lg">
                <BookOpen className="h-8 w-8 text-green-600 dark:text-green-300" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-md shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 border border-gray-100 dark:border-gray-700">
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.flashcards_studied')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {stats.total_flashcards_studied}
                </p>
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                <TrendingUp className="h-8 w-8 text-gray-900 dark:text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-md shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 border border-gray-100 dark:border-gray-700">
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.quizzes_completed')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {stats.total_quizzes_completed}
                </p>
              </div>
              <div className="bg-purple-100 dark:bg-purple-900 p-3 rounded-lg">
                <FileQuestion className="h-8 w-8 text-purple-600 dark:text-purple-300" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-md shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 border border-gray-100 dark:border-gray-700">
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.total_study_time')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatStudyTime(stats.total_study_time_minutes)}
                </p>
              </div>
              <div className="bg-indigo-100 dark:bg-indigo-900 p-3 rounded-lg">
                <Clock className="h-8 w-8 text-indigo-600 dark:text-indigo-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Achievements Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6">
          <div className={`flex items-center space-x-3 rtl:space-x-reverse mb-6 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <Award className="h-6 w-6 text-gray-900 dark:text-white" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {t('profile.recent_achievements')} ({achievements.length})
            </h2>
          </div>

          {achievements.length === 0 ? (
            <div className="text-center py-12">
              <Award className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">{t('profile.no_achievements')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                {t('profile.start_studying')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`border ${getThemeBorder()} opacity-50 rounded-lg p-4 hover:shadow-md transition-shadow`}
                >
                  <div className={`flex items-start space-x-3 rtl:space-x-reverse ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className={`bg-gradient-to-br ${getBadgeColor(achievement.badge_tier)} p-2 rounded-lg flex-shrink-0`}>
                      <Award className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        {achievement.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {achievement.description}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          achievement.badge_tier === 'bronze' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white' :
                          achievement.badge_tier === 'silver' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                          achievement.badge_tier === 'gold' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white' :
                          achievement.badge_tier === 'platinum' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {achievement.badge_tier.toUpperCase()}
                        </span>
                        {achievement.earned_at && (
                          <span className="text-xs text-gray-500 dark:text-gray-500">
                            {formatDate(achievement.earned_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Profile Tutorial */}
      {tutorialConfig && (
        <PageTutorial
          config={tutorialConfig}
          isOpen={isTutorialOpen}
          onClose={() => {}}
          onComplete={completeTutorial}
          onSkip={skipTutorial}
        />
      )}

      <UsernameSetupModal
        isOpen={showUsernameModal}
        onClose={() => setShowUsernameModal(false)}
        onComplete={(newUsername) => {
          setUsername(newUsername);
          setUsernameChangedAt(new Date().toISOString());
          setShowUsernameModal(false);
        }}
      />
    </div>
  );
});
