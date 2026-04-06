import React, { useLayoutEffect, useRef } from 'react';
import { Home, History, BookOpen, Menu, ChevronLeft, Info, MessageSquare, FileQuestion, Target, Users, Gamepad2, Pin, PinOff } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useMouseProximity } from '../../hooks/useMouseProximity';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTTS } from '../../hooks/useTTS';

interface SidebarProps {
  currentView: 'main' | 'history' | 'library' | 'informational' | 'feedback' | 'profile' | 'quiz' | 'eduplay' | 'academics' | 'study-rooms';
  onNavigate: (view: 'main' | 'history' | 'library' | 'informational' | 'feedback' | 'profile' | 'quiz' | 'eduplay' | 'academics' | 'study-rooms') => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isSidebarOpen,
  toggleSidebar,
}) => {
  const { t, dir, language } = useI18n();
  const isRtl = dir === 'rtl';
  const { preferences, loading: _preferencesLoading } = useUserPreferences();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { speak, stop } = useTTS({ lang: language || 'en-US' });
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

  const navRef = useRef<HTMLElement>(null);
  const prevShouldBeOpenRef = useRef(shouldBeOpen);
  const prevCurrentViewRef = useRef(currentView);

  useLayoutEffect(() => {
    const becameOpen = shouldBeOpen && !prevShouldBeOpenRef.current;
    const viewChangedWhileOpen =
      shouldBeOpen && prevShouldBeOpenRef.current && prevCurrentViewRef.current !== currentView;
    prevShouldBeOpenRef.current = shouldBeOpen;
    prevCurrentViewRef.current = currentView;
    if (!shouldBeOpen) return;
    if (!becameOpen && !viewChangedWhileOpen) return;
    const el = navRef.current?.querySelector<HTMLElement>(`[data-sidebar-item="${currentView}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [shouldBeOpen, currentView]);

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
      id: 'academics' as const,
      label: t('sidebar.academics'),
      icon: Target,
      description: t('sidebar.academics_desc'),
      disabled: false
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
      className={`fixed top-0 bottom-0 ${isRtl ? 'right-0' : 'left-0'} ${getThemeCardBg()} ${isRtl ? 'border-l' : 'border-r'} ${getThemeCardBorder()} shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm transition-all duration-300 ease-in-out z-20 ${
        isMobile && !isSidebarOpen ? (isRtl ? 'translate-x-full' : '-translate-x-full') : ''
      } ${shouldBeOpen ? 'w-64' : 'w-16'}`}
      onMouseEnter={() => !isMobile && setIsHovered(true)}
      onMouseLeave={() => !isMobile && setIsHovered(false)}
    >
      <div className="flex flex-col h-full">
        {/* Sidebar Header */}
        <div className={`p-4 border-b ${getThemeCardBorder()}`}>
          <div className="flex items-center justify-between">
            {shouldBeOpen && (
              <h2 className={`text-lg font-semibold ${getThemeTextPrimary()} transition-opacity duration-300 ease-in-out`}>{t('sidebar.navigation')}</h2>
            )}
            {isMobile ? (
              <button
                onClick={toggleSidebar}
                className={`p-2 ${getThemeTextMuted()} hover:opacity-80 hover:opacity-60 rounded-md transition-colors duration-150`}
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
                className={`p-2 rounded-md transition-colors duration-150 ${
                  shouldBeOpen
                    ? `${getThemeTextMuted()} hover:opacity-80 hover:opacity-60`
                    : `${getThemeTextMuted()} hover:opacity-80 hover:opacity-60 mx-auto block`
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
        <nav ref={navRef} className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-2">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = currentView === item.id;
              const isDisabled = item.disabled;

              return (
                <li key={item.id} className={`${!isSidebarOpen ? 'flex justify-center' : ''}`}>
                  <button
                    type="button"
                    data-sidebar-item={item.id}
                    onClick={() => !isDisabled && onNavigate(item.id)}
                    onMouseEnter={() => preferences?.tts_hover_enabled === true && speak(item.label)}
                    onMouseLeave={() => stop()}
                    disabled={isDisabled}
                    className={`
                      flex items-center transition-colors duration-150 text-left
                      ${shouldBeOpen
                        ? 'w-full space-x-3 rtl:space-x-reverse px-3 py-3 rounded-md'
                        : 'rounded-md'
                      }
                      ${isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                      }
                      ${isActive && !isDisabled
                        ? shouldBeOpen
                          ? `${getThemeSubtle('ui')} ${getThemeTextPrimary()} ${getThemeCardBorder()}`
                          : `w-8 h-8 ${getThemeSubtle('ui')} ${getThemeTextPrimary()} justify-center`
                        : shouldBeOpen
                          ? `${getThemeTextSecondary()} hover:opacity-80`
                          : `w-8 h-8 ${getThemeTextSecondary()} hover:opacity-80 justify-center`
                      }
                      ${isDisabled ? 'hover:bg-transparent dark:hover:bg-transparent' : ''}
                    `}
                    title={!shouldBeOpen ? item.label : undefined}
                  >
                    <IconComponent
                      className={`h-5 w-5 flex-shrink-0 ${
                        isActive && !isDisabled
                          ? shouldBeOpen
                            ? getThemeTextPrimary()
                            : getThemeTextPrimary()
                          : getThemeTextMuted()
                      }`}
                    />
                    {shouldBeOpen && (
                      <div className="flex-1 min-w-0 transition-opacity duration-300 ease-in-out">
                        <div className={`font-medium flex items-center gap-2 ${getThemeTextPrimary()}`}>
                          {item.label}
                          {isDisabled && (
                            <span className={`text-xs px-2 py-0.5 ${getThemeSubtle('ui')} ${getThemeTextSecondary()} rounded-full`}>
                              {t('sidebar.coming_soon')}
                            </span>
                          )}
                        </div>
                        <div className={`text-sm ${isActive && !isDisabled ? getThemeTextSecondary() : getThemeTextMuted()}`}>
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
          <div className={`p-4 border-t ${getThemeCardBorder()}`}>
            <div className={`text-xs ${getThemeTextMuted()} text-center`}>
              <p>© 2025 {t('app_name')}</p>
              <p>{t('app_tagline')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};