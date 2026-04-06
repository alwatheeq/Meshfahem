import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps {
  onClick: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  onClick,
  loading = false,
  disabled = false,
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  icon
}) => {
  const baseStyles = 'btn-base focus:ring-2 focus:ring-offset-2';

  const variantStyles = {
    primary: 'btn-primary focus:ring-blue-500',
    secondary: 'btn-secondary focus:ring-gray-500',
    danger: 'btn-danger focus:ring-red-500',
    success: 'btn-success focus:ring-green-500',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white focus:ring-yellow-500 dark:bg-yellow-400 dark:hover:bg-yellow-500 box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3)'
  };

  const sizeStyles = {
    sm: 'btn-sm space-x-1',
    md: 'btn-md space-x-2',
    lg: 'btn-lg space-x-3'
  };

  const combinedStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  const handleClick = async () => {
    if (loading || disabled) return;
    await onClick();
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      className={combinedStyles}
    >
      {loading ? (
        <>
          <Loader2 className={`animate-spin ${size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'}`} />
          <span>Processing...</span>
        </>
      ) : (
        <>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span>{children}</span>
        </>
      )}
    </button>
  );
};
