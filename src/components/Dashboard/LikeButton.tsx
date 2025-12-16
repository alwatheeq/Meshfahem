import React, { useState, useEffect } from 'react';
import { ThumbsUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ErrorLogger } from '../../utils/errorLogger';

interface LikeButtonProps {
  itemId: string;
  initialCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

export const LikeButton: React.FC<LikeButtonProps> = ({
  itemId,
  initialCount = 0,
  size = 'md',
  showCount = true
}) => {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialCount);
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
      checkIfLiked();
    }
  }, [user, itemId]);

  const checkIfLiked = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('item_reactions')
        .select('id')
        .eq('item_id', itemId)
        .eq('user_id', user.id)
        .eq('reaction_type', 'like')
        .maybeSingle();

      if (!error && data) {
        setIsLiked(true);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LikeButton', action: 'checkLikeStatus', itemId, userId: user?.id });
    }
  };

  const toggleLike = async () => {
    if (!user || isLoading) return;

    setIsLoading(true);
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);

    try {
      if (isLiked) {
        const { error } = await supabase
          .from('item_reactions')
          .delete()
          .eq('item_id', itemId)
          .eq('user_id', user.id)
          .eq('reaction_type', 'like');

        if (!error) {
          setIsLiked(false);
          setLikeCount(prev => Math.max(0, prev - 1));
        }
      } else {
        const { error } = await supabase
          .from('item_reactions')
          .insert({
            item_id: itemId,
            user_id: user.id,
            reaction_type: 'like'
          });

        if (!error) {
          setIsLiked(true);
          setLikeCount(prev => prev + 1);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      ErrorLogger.error(err, { component: 'LikeButton', action: 'toggleLike', itemId, userId: user?.id, isLiked });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <button
      onClick={toggleLike}
      disabled={isLoading}
      className={`
        ${buttonSizeClasses[size]}
        flex items-center space-x-1 rounded-lg transition-all duration-200
        ${isLiked
          ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        }
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${isAnimating ? 'scale-110' : 'scale-100'}
      `}
      title={isLiked ? 'Unlike' : 'Like'}
    >
      <ThumbsUp
        className={`${sizeClasses[size]} ${isLiked ? 'fill-current' : ''}`}
      />
      {showCount && (
        <span className="font-medium">{likeCount}</span>
      )}
    </button>
  );
};
