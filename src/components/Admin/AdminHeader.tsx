import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Shield, Menu, LogOut, User } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface AdminHeaderProps {
  toggleSidebar: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ toggleSidebar }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { getThemeGradient } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-40 shadow-lg">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-slate-700 transition"
            >
              <Menu className="h-6 w-6 text-gray-300" />
            </button>

            <div className="flex items-center space-x-3">
              <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Admin Portal
                </h1>
                <p className="text-xs text-gray-400">
                  System Administration
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-3 px-4 py-2 bg-blue-900/30 rounded-lg border border-blue-800">
              <User className="h-4 w-4 text-blue-400" />
              <div className="text-sm">
                <p className="font-medium text-blue-100">{user?.email}</p>
                <p className="text-xs text-blue-400">Administrator</p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-4 py-2 bg-red-900/30 text-red-300 rounded-lg hover:bg-red-900/50 transition border border-red-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
