import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Filter, Download, DollarSign, TrendingUp, CreditCard, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { ErrorLogger } from '../../utils/errorLogger';

interface Transaction {
  id: string;
  user_id: string;
  subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  transaction_type: string;
  receipt_url: string | null;
  created_at: string;
  user_email?: string;
}

interface TransactionStats {
  total_revenue: number;
  successful_transactions: number;
  failed_transactions: number;
  pending_transactions: number;
  avg_transaction_amount: number;
}

export const TransactionsPage: React.FC = React.memo(() => {
  const { getThemeGradient } = useTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats>({
    total_revenue: 0,
    successful_transactions: 0,
    failed_transactions: 0,
    pending_transactions: 0,
    avg_transaction_amount: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30');

  useEffect(() => {
    fetchTransactions();
  }, [dateRange]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);

      // Calculate date filter
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      // Fetch transactions with user email
      const { data: transactionsData, error: transError } = await supabase
        .from('transactions')
        .select(`
          *,
          user_profiles!inner(email)
        `)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (transError) throw transError;

      const transactionsWithEmail = (transactionsData || []).map(t => ({
        ...t,
        user_email: t.user_profiles?.email || 'Unknown'
      }));

      setTransactions(transactionsWithEmail);

      // Calculate stats
      const successful = transactionsWithEmail.filter(t => t.status === 'succeeded');
      const failed = transactionsWithEmail.filter(t => t.status === 'failed');
      const pending = transactionsWithEmail.filter(t => t.status === 'pending');

      const totalRevenue = successful.reduce((sum, t) => sum + Number(t.amount), 0);
      const avgAmount = successful.length > 0 ? totalRevenue / successful.length : 0;

      setStats({
        total_revenue: totalRevenue,
        successful_transactions: successful.length,
        failed_transactions: failed.length,
        pending_transactions: pending.length,
        avg_transaction_amount: avgAmount
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'TransactionsPage', action: 'fetchTransactions' });
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() =>
    transactions.filter(trans => {
      const matchesSearch =
        trans.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trans.stripe_payment_intent_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trans.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || trans.status === statusFilter;

      return matchesSearch && matchesStatus;
    }),
    [transactions, searchTerm, statusFilter]
  );

  const getStatusBadge = (status: string) => {
    const styles = {
      succeeded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      canceled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'User Email', 'Amount', 'Currency', 'Status', 'Type', 'Payment Intent ID'];
    const rows = filteredTransactions.map(trans => [
      new Date(trans.created_at).toLocaleString(),
      trans.user_email || 'Unknown',
      trans.amount.toString(),
      trans.currency.toUpperCase(),
      trans.status,
      trans.transaction_type,
      trans.stripe_payment_intent_id || 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100); // Stripe amounts are in cents
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Transaction History</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Monitor payment transactions and revenue</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Total Revenue</p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(stats.total_revenue, 'usd')}
              </p>
            </div>
            <DollarSign className="h-8 w-8 opacity-80" />
          </div>
        </div>

        <div className={`${getThemeGradient('ui')} text-white rounded-xl p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Successful</p>
              <p className="text-2xl font-bold mt-1">{stats.successful_transactions}</p>
            </div>
            <CheckCircle className="h-8 w-8 opacity-80" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Failed</p>
              <p className="text-2xl font-bold mt-1">{stats.failed_transactions}</p>
            </div>
            <XCircle className="h-8 w-8 opacity-80" />
          </div>
        </div>

        <div className={`${getThemeGradient('ui')} text-white rounded-xl p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Avg Amount</p>
              <p className="text-2xl font-bold mt-1">
                {formatCurrency(stats.avg_transaction_amount, 'usd')}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 opacity-80" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white appearance-none"
            >
              <option value="all">All Statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white appearance-none"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Payment Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Receipt
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTransactions.map((trans) => (
                <tr key={trans.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {new Date(trans.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(trans.created_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {trans.user_email}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      ID: {trans.user_id.substring(0, 8)}...
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatCurrency(trans.amount, trans.currency)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {trans.transaction_type.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 inline-flex items-center space-x-1 text-xs leading-5 font-semibold rounded-full ${getStatusBadge(trans.status)}`}>
                      {getStatusIcon(trans.status)}
                      <span>{trans.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {trans.payment_method || 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {trans.receipt_url ? (
                      <a
                        href={trans.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                      >
                        View Receipt
                      </a>
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">N/A</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTransactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No transactions found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
