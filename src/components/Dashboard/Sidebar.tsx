import React from 'react';
import { Home, History, BookOpen, Menu, ChevronLeft, Info, MessageSquare, User, FileQuestion, Target, Award, Users, Gamepad2, Pin, PinOff } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useMouseProximity } from '../../hooks/useMouseProximity';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { useTheme } from '../../contexts/ThemeContext';

interface SidebarProps {
  currentView: 'main' | 'history' | 'library' | 'informational' | 'feedback' | 'profile' | 'quiz' | 'eduplay' | 'goals-achievements' | 'study-rooms';
  onNavigate: (view: 'main' | 'history' | 'library' | 'informational' | 'feedback' | 'profile' | 'quiz' | 'eduplay' | 'goals-achievements' | 'study-rooms') => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isSidebarOpen,
  toggleSidebar,
}) => {
  const { t } = useI18n();
  const { preferences, loading: preferencesLoading } = useUserPreferences();
  const { getThemeGradient } = useTheme();
  const [isHovered, setIsHovered] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  const [isPinned, setIsPinned] = React.useState(() => {
    const saved = localStorage.getItem('sidebar-pinned');
    return saved ? JSON.parse(saved) : false;
  });

  const sidebarMode = preferences?.sidebar_mode || 'collapsible';
  const isPinnableMode = sidebarMode === 'pinnable';

  const { isNearEdge } = useMouseProximity({
    threshold: 50,
    delay: 100,
    enabled: !isMobile && !isPinnableMode,
  });

  React.useEffect(() => {
    if (isPinnableMode) {
      localStorage.setItem('sidebar-pinned', JSON.stringify(isPinned));
    }
  }, [isPinned, isPinnableMode]);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const shouldBeOpen = isMobile
    ? isSidebarOpen
    : isPinnableMode
    ? isPinned
    : (isHovered || isNearEdge);

  const togglePin = () => {
    setIsPinned(!isPinned);
  };

  const navigationItems = [
    {
      id: 'main' as const,
      label: t('sidebar.dashboard'),
      icon: Home,
      description: t('sidebar.dashboard_desc'),
      disabled: false
    },
    {
      id: 'library' as const,
      label: t('sidebar.my_library'),
      icon: BookOpen,
      description: t('sidebar.library_desc'),
      disabled: false
    },
    {
      id: 'quiz' as const,
      label: t('sidebar.quiz'),
      icon: FileQuestion,
      description: t('sidebar.quiz_desc'),
      disabled: false
    },
    {
      id: 'eduplay' as const,
      label: t('sidebar.eduplay'),
      icon: Gamepad2,
      description: t('sidebar.eduplay_desc'),
      disabled: false
    },
    {
      id: 'study-rooms' as const,
      label: t('sidebar.study_rooms'),
      icon: Users,
      description: t('sidebar.study_rooms_desc'),
      disabled: false
    },
    {
      id: 'goals-achievements' as const,
      label: t('sidebar.goals_achievements'),
      icon: Target,
      description: t('sidebar.goals_achievements_desc'),
      disabled: true
    },
    {
      id: 'history' as const,
      label: t('sidebar.history'),
      icon: History,
      description: t('sidebar.history_desc'),
      disabled: false
    },
    {
      id: 'informational' as const,
      label: t('sidebar.informational'),
      icon: Info,
      description: t('sidebar.info_desc'),
      disabled: false
    },
    {
      id: 'feedback' as const,
      label: t('sidebar.feedback'),
      icon: MessageSquare,
      description: t('sidebar.feedback_desc'),
      disabled: false
    }
  ];

  return (
    <div
      className={`fixed top-0 left-0 bottom-0 bg-white border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out z-20 dark:bg-gray-900 dark:border-gray-800 dark:shadow-none ${
        isMobile && !isSidebarOpen ? '-translate-x-full' : ''
      } ${shouldBeOpen ? 'w-64' : 'w-16'}`}
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
    >
      <div className="flex flex-col h-full">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            {shouldBeOpen && (
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('sidebar.navigation')}</h2>
            )}
            {isMobile ? (
              <button
                onClick={toggleSidebar}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition duration-150 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
                title={isSidebarOpen ? t('sidebar.collapse_sidebar') : t('sidebar.expand_sidebar')}
              >
                {isSidebarOpen ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            ) : isPinnableMode ? (
              <button
                onClick={togglePin}
                className={`p-2 rounded-lg transition duration-150 ${
                  shouldBeOpen
                    ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 mx-auto block'
                }`}
                title={isPinned ? t('sidebar.unpin_sidebar') : t('sidebar.pin_sidebar')}
              >
                {isPinned ? (
                  <Pin className="h-5 w-5" />
                ) : (
                  <PinOff className="h-5 w-5" />
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = currentView === item.id;
              const isDisabled = item.disabled;

              return (
                <li key={item.id} className={`${!isSidebarOpen ? 'flex justify-center' : ''}`}>
                  <button
                    onClick={() => !isDisabled && onNavigate(item.id)}
                    disabled={isDisabled}
                    className={`
                      flex items-center transition duration-150 text-left
                      ${shouldBeOpen
                        ? 'w-full space-x-3 px-3 py-3 rounded-lg'
                        : 'rounded-lg'
                      }
                      ${isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                      }
                      ${isActive && !isDisabled
                        ? shouldBeOpen
                          ? `${getThemeGradient('ui')} text-white shadow-md`
                          : 'w-8 h-8 bg-blue-100 text-blue-600 justify-center dark:bg-blue-900 dark:text-blue-300'
                        : shouldBeOpen
                          ? 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                          : 'w-8 h-8 text-gray-700 hover:bg-gray-100 hover:text-gray-900 justify-center dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                      }
                      ${isDisabled ? 'hover:bg-transparent dark:hover:bg-transparent' : ''}
                    `}
                    title={!shouldBeOpen ? item.label : undefined}
                  >
                    <IconComponent
                      className={`h-5 w-5 flex-shrink-0 ${
                        isActive && !isDisabled
                          ? shouldBeOpen
                            ? 'text-white'
                            : 'text-blue-600'
                          : 'text-gray-500'
                      }`}
                    />
                    {shouldBeOpen && (
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium flex items-center gap-2 ${isActive && !isDisabled ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                          {item.label}
                          {isDisabled && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                              {t('sidebar.coming_soon')}
                            </span>
                          )}
                        </div>
                        <div className={`text-sm ${isActive && !isDisabled ? 'text-blue-100 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                          {item.description}
                        </div>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer */}
        {shouldBeOpen && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="text-xs text-gray-500 text-center dark:text-gray-400">
              <p>© 2025 {t('app_name')}</p>
              <p>{t('app_tagline')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};