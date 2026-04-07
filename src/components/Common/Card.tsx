import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  hoverable?: boolean;
}

const paddingClasses: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  onClick,
  hoverable = false,
}) => {
  const { getThemeCardBg, getThemeCardBorder } = useTheme();

  return (
    <div
      className={`${getThemeCardBg()} ${getThemeCardBorder()} border rounded-xl shadow-sm ${paddingClasses[padding]} ${
        hoverable ? 'hover:shadow-md transition-shadow cursor-pointer' : ''
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};
