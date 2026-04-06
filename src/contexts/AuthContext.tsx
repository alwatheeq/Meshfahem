import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  monthlyUsage: number;
  lastReset: string;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUsage: (slidesUsed: number) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (supabaseUser: SupabaseUser) => {
    ErrorLogger.debug('Loading user profile', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });
      // Set fallback user to prevent app from breaking
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
        avatar_url: supabaseUser.user_metadata?.avatar_url,
        monthlyUsage: 0,
        lastReset: new Date().toISOString(),
        role: 'user',
      });
      return;
    }

    try {
      // Check if user is an admin
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('id, is_active')
        .eq('id', supabaseUser.id)
        .eq('is_active', true)
        .maybeSingle();

      if (adminError) {
        handleSupabaseError(adminError, { component: 'AuthContext', action: 'loadUserProfile', metadata: { step: 'checkAdmin', userId: supabaseUser.id } });
        ErrorLogger.error(adminError, { 
          component: 'AuthContext', 
          action: 'loadUserProfile', 
          userId: supabaseUser.id,
          metadata: { step: 'checkAdmin' } 
        });
      }

      // Handle admin users
      if (adminData) {
        ErrorLogger.debug('Admin user detected', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });

        // Update last login
        const { error: updateLoginError } = await supabase
          .from('admin_users')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', supabaseUser.id);

        if (updateLoginError) {
          handleSupabaseError(updateLoginError, { component: 'AuthContext', action: 'loadUserProfile', metadata: { step: 'updateAdminLogin', userId: supabaseUser.id } });
          ErrorLogger.error(updateLoginError, { 
            component: 'AuthContext', 
            action: 'loadUserProfile', 
            userId: supabaseUser.id,
            metadata: { step: 'updateAdminLogin' } 
          });
        }

        setUser({
          id: supabaseUser.id,
          email: supabaseUser.email!,
          name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
          avatar_url: supabaseUser.user_metadata?.avatar_url,
          monthlyUsage: 0,
          lastReset: new Date().toISOString(),
          role: 'admin' as const,
        });
        return;
      }

      // =====================================================================
      // REGULAR USER - Defensive Profile Loading
      // =====================================================================
      ErrorLogger.debug('Regular user - loading profile', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });

      // Try to fetch profile (trigger should have created it)
      let { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, monthly_usage, last_reset, user_role, email, is_blocked, block_reason, block_expires_at')
        .eq('id', supabaseUser.id)
        .maybeSingle();

      if (profileError) {
        const error = profileError instanceof Error ? profileError : new Error(String(profileError));
        handleSupabaseError(profileError, { component: 'AuthContext', action: 'loadUserProfile', metadata: { step: 'fetchProfile', userId: supabaseUser.id } });
        ErrorLogger.warn('Failed to fetch user profile', { 
          component: 'AuthContext', 
          action: 'loadUserProfile', 
          userId: supabaseUser.id,
          metadata: { step: 'fetchProfile', error: error.message } 
        });
      }

      // If profile doesn't exist, try to create it manually
      if (!profile) {
        ErrorLogger.debug('Profile missing - attempting manual creation', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });

        try {
          const { error: createError } = await supabase
            .rpc('create_missing_profile', {
              p_user_id: supabaseUser.id,
              p_email: supabaseUser.email
            });

          if (createError) {
            handleSupabaseError(createError, { component: 'AuthContext', action: 'loadUserProfile', metadata: { step: 'createProfile', userId: supabaseUser.id } });
            ErrorLogger.error(createError, { 
              component: 'AuthContext', 
              action: 'loadUserProfile', 
              userId: supabaseUser.id,
              metadata: { step: 'createProfile' } 
            });
          } else {
            ErrorLogger.info('Successfully created missing profile', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });
          }

          // Try fetching again after creation
          const { data: retryProfile } = await supabase
            .from('user_profiles')
            .select('id, monthly_usage, last_reset, user_role, email, is_blocked, block_reason, block_expires_at')
            .eq('id', supabaseUser.id)
            .maybeSingle();

          if (retryProfile) {
            ErrorLogger.debug('Profile fetched after manual creation', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });
            profile = retryProfile;  // FIX: Assign to profile variable
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          handleSupabaseError(error, { component: 'AuthContext', action: 'loadUserProfile', metadata: { step: 'manualProfileCreation', userId: supabaseUser.id } });
          ErrorLogger.error(error, { 
            component: 'AuthContext', 
            action: 'loadUserProfile', 
            userId: supabaseUser.id,
            metadata: { step: 'manualProfileCreation' } 
          });
        }
      }

      // Check for subscription and create trial if needed
      // Use orderBy and limit to ensure we get the most recent active subscription
      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('id, status, end_date')
        .eq('user_id', supabaseUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError) {
        handleSupabaseError(subscriptionError, { component: 'AuthContext', action: 'loadUserProfile', metadata: { step: 'checkSubscription', userId: supabaseUser.id } });
        ErrorLogger.error(subscriptionError, { 
          component: 'AuthContext', 
          action: 'loadUserProfile', 
          userId: supabaseUser.id,
          metadata: { step: 'checkSubscription' } 
        });
      }

      if (!subscription) {
        ErrorLogger.debug('No active subscription row for user (no auto trial)', {
          component: 'AuthContext',
          action: 'loadUserProfile',
          userId: supabaseUser.id,
        });
      }

      // Set user with defensive defaults
      // Use profile data if available, otherwise use safe defaults
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
        avatar_url: supabaseUser.user_metadata?.avatar_url,
        monthlyUsage: profile?.monthly_usage ?? 0,
        lastReset: profile?.last_reset ?? new Date().toISOString(),
        role: (profile?.user_role as 'user' | 'admin') ?? 'user',
      });

      ErrorLogger.info('User profile loaded successfully', { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });
      ErrorLogger.error(err, { component: 'AuthContext', action: 'loadUserProfile', userId: supabaseUser.id });

      // Always set a fallback user to prevent app from breaking
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
        avatar_url: supabaseUser.user_metadata?.avatar_url,
        monthlyUsage: 0,
        lastReset: new Date().toISOString(),
        role: 'user',
      });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const updateUsage = async (tokensUsed: number) => {
    if (!user || user.role === 'admin') {
      ErrorLogger.debug('Skipping usage update for admin or null user', { component: 'AuthContext', action: 'updateUsage' });
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'AuthContext', action: 'updateUsage', userId: user.id });
      // Fallback: update local state only
      setUser({ ...user, monthlyUsage: user.monthlyUsage + tokensUsed });
      return;
    }

    ErrorLogger.debug(`Updating token usage: adding ${tokensUsed} tokens`, { 
      component: 'AuthContext', 
      action: 'updateUsage', 
      userId: user.id,
      metadata: { tokensUsed } 
    });

    try {
      // Call the database function to update token usage with billing cycle management
      const { data, error } = await supabase.rpc('update_token_usage', {
        p_user_id: user.id,
        p_tokens_used: tokensUsed
      });

      if (error) {
        handleSupabaseError(error, { component: 'AuthContext', action: 'updateUsage', metadata: { userId: user.id, tokensUsed } });
        ErrorLogger.error(error, { 
          component: 'AuthContext', 
          action: 'updateUsage', 
          userId: user.id,
          metadata: { tokensUsed } 
        });
        // Fallback: update local state only
        setUser({ ...user, monthlyUsage: user.monthlyUsage + tokensUsed });
        return;
      }

      if (data && data.success) {
        ErrorLogger.info('Token usage updated successfully', {
          component: 'AuthContext',
          action: 'updateUsage',
          userId: user.id,
          metadata: {
            tokensUsed: data.tokens_used,
            tokenLimit: data.token_limit,
            tokensRemaining: data.tokens_remaining,
            usagePercentage: data.usage_percentage,
            billingCycleEnd: data.billing_cycle_end
          }
        });

        // Update local state with current usage
        setUser({
          ...user,
          monthlyUsage: data.tokens_used
        });
      } else {
        ErrorLogger.warn('Token usage update returned non-success', { 
          component: 'AuthContext', 
          action: 'updateTokenUsage', 
          userId: user.id,
          metadata: { tokensUsed, responseData: data } 
        });
        // Fallback: update local state only
        setUser({ ...user, monthlyUsage: user.monthlyUsage + tokensUsed });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'AuthContext', action: 'updateUsage', metadata: { userId: user.id, tokensUsed } });
      ErrorLogger.error(err, { 
        component: 'AuthContext', 
        action: 'updateUsage', 
        userId: user.id,
        metadata: { tokensUsed } 
      });
      // Fallback to local state update
      setUser({ ...user, monthlyUsage: user.monthlyUsage + tokensUsed });
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithGoogle, signOut, updateUsage }}>
      {children}
    </AuthContext.Provider>
  );
};