import { supabase } from '../lib/supabase';
import { handleSupabaseError } from './errorHandler';
import { ErrorLogger } from './errorLogger';

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
}

export interface AdminCheckResult {
  isAdmin: boolean;
  isActive: boolean;
  adminSince: string | null;
  lastLogin: string | null;
}

export const adminHelpers = {
  async isUserAdmin(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, is_active')
        .eq('id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'isUserAdmin', userId });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'isUserAdmin', userId });
        return false;
      }

      return !!data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'isUserAdmin', userId });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'isUserAdmin', userId });
      return false;
    }
  },

  async getAdminInfo(userId: string): Promise<AdminCheckResult> {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('id, is_active, created_at, last_login_at')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        return {
          isAdmin: false,
          isActive: false,
          adminSince: null,
          lastLogin: null,
        };
      }

      return {
        isAdmin: true,
        isActive: data.is_active,
        adminSince: data.created_at,
        lastLogin: data.last_login_at,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'getAdminInfo', userId });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'getAdminInfo', userId });
      return {
        isAdmin: false,
        isActive: false,
        adminSince: null,
        lastLogin: null,
      };
    }
  },

  async getAllAdmins(): Promise<AdminUser[]> {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'getAllAdmins' });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'getAllAdmins' });
        return [];
      }

      return data || [];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'getAllAdmins' });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'getAllAdmins' });
      return [];
    }
  },

  async getActiveAdmins(): Promise<AdminUser[]> {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'getActiveAdmins' });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'getActiveAdmins' });
        return [];
      }

      return data || [];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'getActiveAdmins' });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'getActiveAdmins' });
      return [];
    }
  },

  async addAdminByEmail(email: string, notes?: string): Promise<{ success: boolean; error?: string; userId?: string }> {
    try {
      const { data: userData, error: userError } = await supabase
        .from('auth.users')
        .select('id, email')
        .eq('email', email)
        .maybeSingle();

      if (userError || !userData) {
        return {
          success: false,
          error: `User with email ${email} does not exist`,
        };
      }

      const existingAdmin = await this.isUserAdmin(userData.id);
      if (existingAdmin) {
        return {
          success: false,
          error: `User ${email} is already an admin`,
        };
      }

      const currentUser = await supabase.auth.getUser();
      const createdBy = currentUser.data.user?.id || null;

      const { error: insertError } = await supabase
        .from('admin_users')
        .insert({
          id: userData.id,
          email: email,
          created_by: createdBy,
          notes: notes || `Added via admin panel on ${new Date().toISOString()}`,
          is_active: true,
        });

      if (insertError) {
        handleSupabaseError(insertError, { component: 'adminHelpers', action: 'addAdminByEmail', email });
        ErrorLogger.error(insertError, { component: 'adminHelpers', action: 'addAdminByEmail', email });
        return {
          success: false,
          error: insertError.message,
        };
      }

      return {
        success: true,
        userId: userData.id,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'addAdminByEmail', email });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'addAdminByEmail', email });
      return {
        success: false,
        error: err.message,
      };
    }
  },

  async deactivateAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const currentUser = await supabase.auth.getUser();
      if (currentUser.data.user?.id === userId) {
        return {
          success: false,
          error: 'Cannot deactivate your own admin account',
        };
      }

      const { error } = await supabase
        .from('admin_users')
        .update({
          is_active: false,
          notes: supabase.rpc('concat_notes', {
            existing: 'notes',
            new_note: ` | Deactivated on ${new Date().toISOString()}`,
          }),
        })
        .eq('id', userId);

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'deactivateAdmin', userId });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'deactivateAdmin', userId });
        return {
          success: false,
          error: error.message,
        };
      }

      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'deactivateAdmin', userId });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'deactivateAdmin', userId });
      return {
        success: false,
        error: err.message,
      };
    }
  },

  async reactivateAdmin(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({
          is_active: true,
        })
        .eq('id', userId);

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'reactivateAdmin', userId });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'reactivateAdmin', userId });
        return {
          success: false,
          error: error.message,
        };
      }

      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'reactivateAdmin', userId });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'reactivateAdmin', userId });
      return {
        success: false,
        error: err.message,
      };
    }
  },

  async updateLastLogin(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'updateLastLogin', userId });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'updateLastLogin', userId });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'updateLastLogin', userId });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'updateLastLogin', userId });
    }
  },

  async getAdminLoginAttempts(limit: number = 100): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('admin_login_attempts')
        .select('*')
        .order('attempted_at', { ascending: false })
        .limit(limit);

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'getAdminLoginAttempts' });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'getAdminLoginAttempts' });
        return [];
      }

      return data || [];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'getAdminLoginAttempts' });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'getAdminLoginAttempts' });
      return [];
    }
  },

  async logLoginAttempt(
    email: string,
    success: boolean,
    userId?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const { error } = await supabase.from('admin_login_attempts').insert({
        email,
        success,
        user_id: userId || null,
        error_message: errorMessage || null,
        attempted_at: new Date().toISOString(),
      });

      if (error) {
        handleSupabaseError(error, { component: 'adminHelpers', action: 'logLoginAttempt', email, userId });
        ErrorLogger.error(error, { component: 'adminHelpers', action: 'logLoginAttempt', email, userId });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'logLoginAttempt', email, userId });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'logLoginAttempt', email, userId });
    }
  },

  async getAdminStatistics(): Promise<{
    total: number;
    active: number;
    inactive: number;
    recentLogins: number;
  }> {
    try {
      const allAdmins = await this.getAllAdmins();
      const activeAdmins = allAdmins.filter((admin) => admin.is_active);
      const inactiveAdmins = allAdmins.filter((admin) => !admin.is_active);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentLogins = activeAdmins.filter(
        (admin) =>
          admin.last_login_at &&
          new Date(admin.last_login_at) > sevenDaysAgo
      ).length;

      return {
        total: allAdmins.length,
        active: activeAdmins.length,
        inactive: inactiveAdmins.length,
        recentLogins,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'getAdminStatistics' });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'getAdminStatistics' });
      return {
        total: 0,
        active: 0,
        inactive: 0,
        recentLogins: 0,
      };
    }
  },

  async searchAdminByEmail(email: string): Promise<AdminUser | null> {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .ilike('email', `%${email}%`)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'adminHelpers', action: 'searchAdminByEmail', email });
      ErrorLogger.error(err, { component: 'adminHelpers', action: 'searchAdminByEmail', email });
      return null;
    }
  },
};

export default adminHelpers;
