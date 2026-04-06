import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';

interface FavoriteButtonProps {
  itemId: string;
  initialCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  itemId,
  initialCount = 0,
  size = 'md',
  showCount = true
}) => {
  const { user } = useAuth();
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  };

  const buttonSizeClasses = {
    sm: 'p-1 text-xs',
    md: 'p-2 text-sm',
    lg: 'p-3 text-base'
  };

  useEffect(() => {
    if (user) {
      checkIfFavorited();
    }
  }, [user, itemId]);

  const checkIfFavorited = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('item_reactions')
        .select('id')
        .eq('item_id', itemId)
        .eq('user_id', user.id)
        .eq('reaction_type', 'favorite')
        .maybeSingle();

      if (!error && data) {
        setIsFavorited(true);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'FavoriteButton', action: 'checkFavoriteStatus', itemId, userId: user?.id });
    }
  };

  const toggleFavorite = async () => {
    if (!user || isLoading) return;

    setIsLoading(true);
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    try {
      if (isFavorited) {
        const { error } = await supabase
          .from('item_reactions')
          .delete()
          .eq('item_id', itemId)
          .eq('user_id', user.id)
          .eq('reaction_type', 'favorite');

        if (!error) {
          setIsFavorited(false);
          setFavoriteCount(prev => Math.max(0, prev - 1));
        }
      } else {
        const { error } = await supabase
          .from('item_reactions')
          .insert({
            item_id: itemId,
            user_id: user.id,
            reaction_type: 'favorite'
          });

        if (!error) {
          setIsFavorited(true);
          setFavoriteCount(prev => prev + 1);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'FavoriteButton', action: 'toggleFavorite', itemId, userId: user?.id, isFavorited });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <button
      onClick={toggleFavorite}
      disabled={isLoading}
      className={`
        ${buttonSizeClasses[size]}
        flex items-center space-x-1 rounded-lg transition-colors duration-150
        ${isFavorited
          ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        }
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${isAnimating ? 'scale-110' : 'scale-100'}
      `}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart
        className={`${sizeClasses[size]} ${isFavorited ? 'fill-current' : ''}`}
      />
      {showCount && (
        <span className="font-medium">{favoriteCount}</span>
      )}
    </button>
  );
};
