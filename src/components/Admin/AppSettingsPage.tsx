import React, { useState, useEffect, useCallback } from 'react';
import { Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast/Toast';
import { ErrorLogger } from '../../utils/errorLogger';

interface AppSetting {
  key: string;
  value: boolean;
  label: string;
  description: string;
}

const SETTINGS_CONFIG: Record<string, { label: string; description: string }> = {
  upsell_modal_enabled: {
    label: 'Subscription Upsell Modal',
    description:
      'Show the "Upgrade to Premium" popup to users who do not have an active subscription. Disable to hide the modal across the entire app.',
  },
};

export const AppSettingsPage: React.FC = React.memo(() => {
  const toast = useToast();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');

      if (error) {
        ErrorLogger.error(error, { component: 'AppSettingsPage', action: 'fetchSettings' });
        toast.error('Failed to load app settings.');
        return;
      }

      const loaded: AppSetting[] = Object.entries(SETTINGS_CONFIG).map(([key, cfg]) => {
        const row = data?.find((r) => r.key === key);
        const rawValue = row?.value;
        const value = rawValue === true || rawValue === 'true';
        return { key, value, ...cfg };
      });

      setSettings(loaded);
    } catch (err) {
      ErrorLogger.error(err instanceof Error ? err : new Error(String(err)), {
        component: 'AppSettingsPage',
        action: 'fetchSettings',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async (key: string, newValue: boolean) => {
    setSaving(key);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value: newValue, updated_at: new Date().toISOString() }, { onConflict: 'key' });

      if (error) {
        ErrorLogger.error(error, { component: 'AppSettingsPage', action: 'handleToggle', metadata: { key } });
        toast.error('Failed to save setting.');
        return;
      }

      setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value: newValue } : s)));
      toast.success(`Setting updated: ${newValue ? 'Enabled' : 'Disabled'}`);
    } catch (err) {
      ErrorLogger.error(err instanceof Error ? err : new Error(String(err)), {
        component: 'AppSettingsPage',
        action: 'handleToggle',
        metadata: { key },
      });
      toast.error('Unexpected error saving setting.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Settings className="h-7 w-7 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">App Settings</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Manage global application settings and feature toggles.
          </p>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">Feature Toggles</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Enable or disable features for all users instantly.
          </p>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-700 rounded w-2/3" />
                </div>
                <div className="h-8 w-14 bg-gray-700 rounded-full ml-4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {settings.map((setting) => (
              <div key={setting.key} className="flex items-center justify-between p-5">
                <div className="flex-1 pr-6">
                  <p className="font-medium text-gray-100">{setting.label}</p>
                  <p className="text-sm text-gray-400 mt-0.5">{setting.description}</p>
                </div>
                <button
                  onClick={() => void handleToggle(setting.key, !setting.value)}
                  disabled={saving === setting.key}
                  className="flex items-center space-x-2 disabled:opacity-50 transition-opacity"
                  aria-label={`Toggle ${setting.label}`}
                >
                  {setting.value ? (
                    <>
                      <ToggleRight className="h-8 w-8 text-green-400" />
                      <span className="text-sm text-green-400 font-medium">Enabled</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-8 w-8 text-gray-500" />
                      <span className="text-sm text-gray-500 font-medium">Disabled</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

AppSettingsPage.displayName = 'AppSettingsPage';
