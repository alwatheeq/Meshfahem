import React from 'react';
import { Gauge } from 'lucide-react';
import { useCredits } from '../../contexts/CreditContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useTheme } from '../../contexts/ThemeContext';

export const CreditBalanceWidget: React.FC = () => {
  const { balance, loading } = useCredits();
  const { subscription } = useSubscription();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextSecondary, getThemeSubtle } = useTheme();

  if (loading || !balance) {
    return null;
  }

  const toolsTotal = balance.credits_total ?? 1500;
  const toolsRemaining = balance.credits_remaining ?? 0;
  const studyTotal = balance.zego_credits_total ?? 0;
  const studyRemaining = balance.zego_credits_remaining ?? 0;
  const showStudyRoom = studyTotal > 0;

  const hasAiAddon = !!subscription && (
    (subscription.subscription_tier === 'standard' && (subscription.chat_blocks_per_cycle ?? 0) > 0) ||
    (subscription.token_limit ?? 0) > 520000
  );
  const aiChatTotal = hasAiAddon && subscription
    ? (subscription.token_limit && subscription.token_limit > 520000
        ? Math.round((subscription.token_limit - 520000) / 1000)
        : (subscription.chat_blocks_per_cycle ?? 0) * 100)
    : 0;
  const aiChatUsed = hasAiAddon && subscription ? Math.round((subscription.tokens_used_current_cycle ?? 0) / 1000) : 0;
  const aiChatRemaining = Math.max(0, aiChatTotal - aiChatUsed);

  const combinedTotal = toolsTotal + (showStudyRoom ? studyTotal : 0) + (hasAiAddon ? aiChatTotal : 0);
  const combinedRemaining = toolsRemaining + (showStudyRoom ? studyRemaining : 0) + (hasAiAddon ? aiChatRemaining : 0);

  const percentage = combinedTotal > 0
    ? (combinedRemaining / combinedTotal) * 100
    : 0;

  const getColor = () => {
    if (percentage > 30) return 'text-green-600 dark:text-green-400';
    if (percentage > 10) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getBarColor = () => {
    if (percentage > 30) return 'bg-green-500';
    if (percentage > 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const parts: string[] = [`Tools: ${toolsRemaining.toLocaleString()} / ${toolsTotal.toLocaleString()}`];
  if (showStudyRoom) parts.push(`Study room: ${studyRemaining.toLocaleString()} / ${studyTotal.toLocaleString()}`);
  if (hasAiAddon) parts.push(`AI Chat: ${aiChatRemaining.toLocaleString()} / ${aiChatTotal.toLocaleString()}`);

  return (
    <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className={`text-sm ${getThemeTextSecondary()}`}>Credit Balance</p>
          <p className={`text-xl font-bold ${getColor()}`}>
            {combinedRemaining.toLocaleString()} / {combinedTotal.toLocaleString()}
          </p>
          <p className={`text-xs ${getThemeTextSecondary()}`}>
            {parts.join(' · ')}
          </p>
        </div>
        <div className={`text-2xl ${getColor()}`}>
          <Gauge className="h-7 w-7" />
        </div>
      </div>

      <div className={`w-full ${getThemeSubtle('ui')} rounded-full h-2 mb-2`}>
        <div
          className={`${getBarColor()} h-2 rounded-full transition-colors duration-150`}
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
        />
      </div>

      <p className={`text-xs ${getThemeTextSecondary()}`}>
        {percentage.toFixed(0)}% remaining
        {balance.cycle_end && (
          <span className="ml-1">
            · Resets {new Date(balance.cycle_end).toLocaleDateString()}
          </span>
        )}
      </p>
    </div>
  );
};
