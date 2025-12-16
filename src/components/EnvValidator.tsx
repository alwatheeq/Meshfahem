import React from 'react';
import { AlertCircle } from 'lucide-react';

export const EnvValidator: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-red-100 p-3 rounded-full">
              <AlertCircle className="h-12 w-12 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">
            Configuration Error
          </h1>

          <p className="text-gray-600 text-center mb-6">
            The application is missing required environment variables.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-gray-900 mb-2">Missing Variables:</h2>
            <ul className="space-y-1 text-sm text-gray-600">
              {!supabaseUrl && <li>• VITE_SUPABASE_URL</li>}
              {!supabaseAnonKey && <li>• VITE_SUPABASE_ANON_KEY</li>}
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">To fix this:</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Create a .env file in the project root</li>
              <li>Add the required environment variables</li>
              <li>Restart the development server</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
