import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ErrorLogger } from '../../utils/errorLogger';
import {
  TrendingUp, Users, DollarSign, Activity, Calendar, BarChart3, ArrowUp, ArrowDown
} from 'lucide-react';

interface UserGrowth {
  date: string;
  total_users: number;
  new_users: number;
}

interface RevenueData {
  date: string;
  revenue: number;
  transactions: number;
}

interface SubscriptionStats {
  tier: string;
  count: number;
  revenue: number;
}

interface TokenUsageStats {
  date: string;
  total_tokens: number;
  avg_per_user: number;
}

export const AnalyticsPage: React.FC = React.memo(() => {
  const [userGrowth, setUserGrowth] = useState<UserGrowth[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats[]>([]);
  const [tokenUsageStats, setTokenUsageStats] = useState<TokenUsageStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30');

  const [totalUsers, setTotalUsers] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const [totalTokenUsage, setTotalTokenUsage] = useState(0);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));
      const startDateStr = startDate.toISOString();

      // Fetch total users
      const { count: usersCount } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });

      setTotalUsers(usersCount || 0);

      // Fetch user growth data
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('created_at')
        .gte('created_at', startDateStr)
        .order('created_at');

      // Group by date
      const growthMap = new Map<string, number>();
      profiles?.forEach(profile => {
        const date = new Date(profile.created_at).toISOString().split('T')[0];
        growthMap.set(date, (growthMap.get(date) || 0) + 1);
      });

      const growthData: UserGrowth[] = [];
      let cumulativeTotal = usersCount || 0;
      Array.from(growthMap.entries()).forEach(([date, newUsers]) => {
        growthData.push({
          date,
          total_users: cumulativeTotal,
          new_users: newUsers
        });
      });

      setUserGrowth(growthData);

      // Fetch revenue data
      const { data: transactions } = await supabase
        .from('transactions')
        .select('created_at, amount, status')
        .eq('status', 'succeeded')
        .gte('created_at', startDateStr)
        .order('created_at');

      const revenueMap = new Map<string, { revenue: number; count: number }>();
      let totalRev = 0;

      transactions?.forEach(trans => {
        const date = new Date(trans.created_at).toISOString().split('T')[0];
        const existing = revenueMap.get(date) || { revenue: 0, count: 0 };
        existing.revenue += Number(trans.amount);
        existing.count += 1;
        revenueMap.set(date, existing);
        totalRev += Number(trans.amount);
      });

      setTotalRevenue(totalRev);

      const revData: RevenueData[] = Array.from(revenueMap.entries()).map(([date, data]) => ({
        date,
        revenue: data.revenue,
        transactions: data.count
      }));

      setRevenueData(revData);

      // Fetch subscription stats
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('subscription_tier, status')
        .eq('status', 'active');

      const subsMap = new Map<string, number>();
      subscriptions?.forEach(sub => {
        subsMap.set(sub.subscription_tier, (subsMap.get(sub.subscription_tier) || 0) + 1);
      });

      setActiveSubscriptions(subscriptions?.length || 0);

      const subsStats: SubscriptionStats[] = Array.from(subsMap.entries()).map(([tier, count]) => ({
        tier,
        count,
        revenue: 0 // Can calculate based on tier pricing
      }));

      setSubscriptionStats(subsStats);

      // Fetch token usage stats using the RPC function
      const { data: tokenData } = await supabase.rpc('admin_get_users_with_usage');

      if (tokenData) {
        const totalTokens = tokenData.reduce((sum: number, user: { tokens_used: number }) => sum + user.tokens_used, 0);
        const avgTokens = tokenData.length > 0 ? totalTokens / tokenData.length : 0;

        setTotalTokenUsage(totalTokens);

        setTokenUsageStats([{
          date: new Date().toISOString().split('T')[0],
          total_tokens: totalTokens,
          avg_per_user: avgTokens
        }]);
      }

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      ErrorLogger.error(error, { component: 'AnalyticsPage', action: 'fetchAnalytics' });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount / 100);
  };

  const getTierDisplayName = (tier: string) => {
    const names: Record<string, string> = {
      trial_1day: '1-Day Trial',
      trial_7day: '7-Day Trial',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      biannual: 'Biannual'
    };
    return names[tier] || tier;
  };

  const calculateGrowthRate = () => {
    if (userGrowth.length < 2) return 0;
    const first = userGrowth[0]?.new_users || 0;
    const last = userGrowth[userGrowth.length - 1]?.new_users || 0;
    if (first === 0) return 0;
    return ((last - first) / first) * 100;
  };

  const calculateRevenueGrowth = () => {
    if (revenueData.length < 2) return 0;
    const first = revenueData[0]?.revenue || 0;
    const last = revenueData[revenueData.length - 1]?.revenue || 0;
    if (first === 0) return 0;
    return ((last - first) / first) * 100;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const growthRate = calculateGrowthRate();
  const revenueGrowth = calculateRevenueGrowth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Track platform performance and growth metrics</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as '7' | '30' | '90' | '365')}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className={`${getThemeGradient('ui')} text-white rounded-xl p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Total Users</p>
              <p className="text-3xl font-bold mt-1">{totalUsers.toLocaleString()}</p>
              <div className="flex items-center space-x-1 mt-2">
                {growthRate >= 0 ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
                <span className="text-sm opacity-80">
                  {Math.abs(growthRate).toFixed(1)}% growth
                </span>
              </div>
            </div>
            <Users className="h-12 w-12 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Total Revenue</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(totalRevenue)}</p>
              <div className="flex items-center space-x-1 mt-2">
                {revenueGrowth >= 0 ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
                <span className="text-sm opacity-80">
                  {Math.abs(revenueGrowth).toFixed(1)}% growth
                </span>
              </div>
            </div>
            <DollarSign className="h-12 w-12 opacity-80" />
          </div>
        </div>

        <div className={`${getThemeGradient('ui')} text-white rounded-xl p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Active Subscriptions</p>
              <p className="text-3xl font-bold mt-1">{activeSubscriptions.toLocaleString()}</p>
              <p className="text-xs opacity-70 mt-2">
                {totalUsers > 0 ? ((activeSubscriptions / totalUsers) * 100).toFixed(1) : 0}% conversion
              </p>
            </div>
            <TrendingUp className="h-12 w-12 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Token Usage</p>
              <p className="text-3xl font-bold mt-1">{(totalTokenUsage / 1000000).toFixed(2)}M</p>
              <p className="text-xs opacity-70 mt-2">
                {tokenUsageStats.length > 0 ? (tokenUsageStats[0].avg_per_user / 1000).toFixed(1) : 0}K avg/user
              </p>
            </div>
            <Activity className="h-12 w-12 opacity-80" />
          </div>
        </div>
      </div>

      {/* User Growth Chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
          User Growth
        </h3>

        {userGrowth.length > 0 ? (
          <div className="space-y-3">
            {userGrowth.slice(-10).map((data, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(data.date).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      +{data.new_users} new
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {data.total_users} total
                    </div>
                  </div>
                  <div className="w-32 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${Math.min((data.new_users / 10) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">No user growth data available</p>
        )}
      </div>

      {/* Revenue and Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Breakdown */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
            Revenue Trend
          </h3>

          {revenueData.length > 0 ? (
            <div className="space-y-3">
              {revenueData.slice(-7).map((data, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(data.date).toLocaleDateString()}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(data.revenue)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {data.transactions} transactions
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No revenue data available</p>
          )}
        </div>

        {/* Subscription Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-purple-600 dark:text-purple-400" />
            Subscription Distribution
          </h3>

          {subscriptionStats.length > 0 ? (
            <div className="space-y-3">
              {subscriptionStats.map((stat, index) => {
                const percentage = activeSubscriptions > 0 ? (stat.count / activeSubscriptions) * 100 : 0;
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {getTierDisplayName(stat.tier)}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {stat.count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className={`${getThemeGradient('ui')} h-2 rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No subscription data available</p>
          )}
        </div>
      </div>
    </div>
  );
});
