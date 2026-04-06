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
  useTheme();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 s shadow-[0_2px_8px_rgba(0,0,0,0.08)]hadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-6">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-md hover:bg-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-colors"
            >
              <Menu className="h-6 w-6 text-gray-300" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="bg-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-2 rounded-md border border-gray-700">
                <Shield className="h-6 w-6 text-gray-100" />
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

          <div className="flex items-center space-x-6">
            <div className="hidden sm:flex items-center space-x-3 px-5 py-2.5 bg-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-md border border-gray-700">
              <User className="h-4 w-4 text-gray-300" />
              <div className="text-sm">
                <p className="font-medium text-gray-100">{user?.email}</p>
                <p className="text-xs text-gray-400">Administrator</p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-5 py-2.5 bg-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-gray-300 rounded-md hover:bg-gray-700 transition-colors border border-gray-700"
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
