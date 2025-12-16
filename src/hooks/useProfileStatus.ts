import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { handleSupabaseError, isOffline } from '../utils/errorHandler';
import { ErrorLogger } from '../utils/errorLogger';

interface ProfileValidation {
  exists: boolean;
  complete: boolean;
  missing_fields: string[];
  optional_fields: string[];
  user_id: string;
}

interface SchemaVersion {
  schema_version: string;
  features: {
    base_profile: boolean;
    email_column: boolean;
    user_role_column: boolean;
    credits_remaining: boolean;
    credits_total: boolean;
    monthly_usage: boolean;
    last_reset: boolean;
  };
  checked_at: string;
}

export interface ProfileStatus {
  isComplete: boolean;
  missingFields: string[];
  availableFeatures: SchemaVersion['features'] | null;
  isLoading: boolean;
  error: string | null;
}

export function useProfileStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ProfileStatus>({
    isComplete: true,
    missingFields: [],
    availableFeatures: null,
    isLoading: true,
    error: null,
  });

  const checkProfileStatus = useCallback(async () => {
    if (!user || user.role === 'admin') {
      setStatus({
        isComplete: true,
        missingFields: [],
        availableFeatures: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useProfileStatus', action: 'checkProfileStatus', userId: user.id });
      setStatus(prev => ({ ...prev, isLoading: false }));
      return;
    }

    setStatus(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check profile completeness
      const { data: validation, error: validationError } = await supabase
        .rpc('validate_profile_completeness', { p_user_id: user.id });

      if (validationError) {
        handleSupabaseError(validationError, { component: 'useProfileStatus', action: 'checkProfileStatus', step: 'validate', userId: user.id });
        ErrorLogger.error(validationError, { component: 'useProfileStatus', action: 'checkProfileStatus', step: 'validate', userId: user.id });
        setStatus(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to validate profile',
        }));
        return;
      }

      const profileValidation = validation as ProfileValidation;

      // Get schema version and feature availability
      const { data: schemaData, error: schemaError } = await supabase
        .rpc('get_schema_version');

      if (schemaError) {
        handleSupabaseError(schemaError, { component: 'useProfileStatus', action: 'checkProfileStatus', step: 'getSchema', userId: user.id });
        ErrorLogger.error(schemaError, { component: 'useProfileStatus', action: 'checkProfileStatus', step: 'getSchema', userId: user.id });
      }

      const schemaVersion = schemaData as SchemaVersion;

      setStatus({
        isComplete: profileValidation?.complete ?? true,
        missingFields: profileValidation?.missing_fields ?? [],
        availableFeatures: schemaVersion?.features ?? null,
        isLoading: false,
        error: null,
      });

      if (!profileValidation?.complete) {
        ErrorLogger.warn('Profile incomplete', { component: 'useProfileStatus', action: 'validateProfile', userId: user.id, missingFields: profileValidation?.missing_fields });
      }

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'useProfileStatus', action: 'checkProfileStatus', userId: user.id });
      ErrorLogger.error(err, { component: 'useProfileStatus', action: 'checkProfileStatus', userId: user.id });
      setStatus(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [user]);

  const repairProfile = useCallback(async (): Promise<boolean> => {
    if (!user || user.role === 'admin') {
      return true;
    }

    if (isOffline()) {
      ErrorLogger.warn('Offline detected', { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });
      return false;
    }

    ErrorLogger.debug('Attempting to repair profile', { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });

    try {
      const { data, error } = await supabase
        .rpc('repair_user_profile', { p_user_id: user.id });

      if (error) {
        handleSupabaseError(error, { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });
        ErrorLogger.error(error, { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });
        return false;
      }

      const result = data as { success: boolean };

      if (result?.success) {
        ErrorLogger.info('Profile repair successful', { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });
        // Recheck status after repair
        await checkProfileStatus();
        return true;
      }

      return false;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      handleSupabaseError(err, { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });
      ErrorLogger.error(err, { component: 'useProfileStatus', action: 'repairProfile', userId: user.id });
      return false;
    }
  }, [user, checkProfileStatus]);

  // Check profile status on mount and when user changes
  useEffect(() => {
    checkProfileStatus();
  }, [checkProfileStatus]);

  return {
    ...status,
    checkProfileStatus,
    repairProfile,
  };
}
