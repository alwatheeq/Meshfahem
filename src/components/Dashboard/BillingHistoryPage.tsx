import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Download, Receipt, Calendar, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import html2pdf from 'html2pdf.js';
import { formatCurrency } from '../../utils/subscriptionHelpers';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError, isOffline, handleOfflineError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';

interface Transaction {
  id: string;
  subscription_id: string;
  stripe_payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  transaction_type: string;
  receipt_url: string | null;
  created_at: string;
}

export const BillingHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    getBackgroundGradient,
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeSubtle,
  } = useTheme();
  const { error: showErrorToast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    if (!user) return;

    if (isOffline()) {
      handleOfflineError(showErrorToast);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // RLS: users can SELECT own rows where user_id = auth.uid() (see DB policies).
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        const message = handleSupabaseError(error, { component: 'BillingHistoryPage', action: 'fetchTransactions' });
        showErrorToast(message);
        ErrorLogger.error(error, { component: 'BillingHistoryPage', action: 'fetchTransactions' });
        return;
      }

      setTransactions(data || []);
    } catch (err) {
      const message = handleApiError(err, { component: 'BillingHistoryPage', action: 'fetchTransactions' });
      showErrorToast(message);
      ErrorLogger.error(err, { component: 'BillingHistoryPage', action: 'fetchTransactions' });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      succeeded: {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-800 dark:text-green-300',
        label: 'Succeeded'
      },
      failed: {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-800 dark:text-red-300',
        label: 'Failed'
      },
      pending: {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-800 dark:text-yellow-300',
        label: 'Pending'
      },
      refunded: {
        bg: 'bg-gray-100 dark:bg-gray-700',
        text: 'text-gray-800 dark:text-gray-300',
        label: 'Refunded'
      }
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <span className={`${config.bg} ${config.text} px-3 py-1 rounded-full text-sm font-semibold`}>
        {config.label}
      </span>
    );
  };

  const downloadReceipt = async (transaction: Transaction) => {
    setDownloadingReceipt(transaction.id);

    try {
      const receiptContent = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; background: white;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #1e40af; margin-bottom: 10px;">Payment Receipt</h1>
            <p style="color: #6b7280; font-size: 14px;">Thank you for your payment</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; color: #6b7280;">Receipt Number:</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold;">${transaction.id.slice(0, 8).toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6b7280;">Date:</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold;">${new Date(transaction.created_at).toLocaleDateString()}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6b7280;">Payment Method:</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold;">${transaction.payment_method === 'card' ? 'Credit Card' : transaction.payment_method}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #6b7280;">Status:</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #10b981;">${transaction.status.toUpperCase()}</td>
              </tr>
            </table>
          </div>

          <div style="margin-bottom: 30px;">
            <h2 style="color: #374151; font-size: 18px; margin-bottom: 15px;">Payment Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 14px;">Description</th>
                  <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 15px 12px;">Subscription Payment</td>
                  <td style="padding: 15px 12px; text-align: right; font-weight: bold;">${formatCurrency(transaction.amount, transaction.currency.toUpperCase())}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr style="background: #f9fafb;">
                  <td style="padding: 15px 12px; font-weight: bold; font-size: 16px;">Total Paid</td>
                  <td style="padding: 15px 12px; text-align: right; font-weight: bold; font-size: 18px; color: #1e40af;">${formatCurrency(transaction.amount, transaction.currency.toUpperCase())}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <p style="color: #1e40af; margin: 0; font-size: 14px;">
              <strong>Note:</strong> This receipt is for your records. For any questions about your subscription, please contact our support team.
            </p>
          </div>

          <div style="text-align: center; color: #9ca3af; font-size: 12px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
            <p>© ${new Date().getFullYear()} Your Company Name. All rights reserved.</p>
            <p style="margin-top: 10px;">Transaction ID: ${transaction.stripe_payment_intent_id || transaction.id}</p>
          </div>
        </div>
      `;

      const opt = {
        margin: 10,
        filename: `receipt-${transaction.id.slice(0, 8)}-${new Date(transaction.created_at).toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const element = document.createElement('div');
      element.innerHTML = receiptContent;

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      const message = handleApiError(err, { component: 'BillingHistoryPage', action: 'downloadReceipt', transactionId: transaction.id });
      showErrorToast(message);
      ErrorLogger.error(err, { component: 'BillingHistoryPage', action: 'downloadReceipt', transactionId: transaction.id });
    } finally {
      setDownloadingReceipt(null);
    }
  };

  if (loading) {
    return (
      <div className={`w-full min-h-0 ${getBackgroundGradient()} p-6`}>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto dark:border-sky-400" />
            <p className={`mt-4 ${getThemeTextSecondary()}`}>Loading billing history...</p>
          </div>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className={`w-full min-h-0 ${getBackgroundGradient()} p-6`}>
        <div className="max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`flex items-center gap-2 ${getThemeTextSecondary()} hover:opacity-80 transition mb-6`}
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Go back</span>
          </button>
          <div
            className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} border p-8`}
          >
            <div className="text-center">
              <div className={`${getThemeSubtle('ui')} p-6 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center`}>
                <Receipt className={`h-12 w-12 ${getThemeTextSecondary()}`} />
              </div>

              <h2 className={`text-2xl font-bold ${getThemeTextPrimary()} mb-4`}>No Transactions Yet</h2>

              <p className={`${getThemeTextSecondary()} mb-8`}>
                You haven&apos;t made any payments yet. Your transaction history will appear here after a successful
                checkout (Stripe webhook inserts rows).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full min-h-0 ${getBackgroundGradient()} p-6`}>
      <div className="max-w-6xl mx-auto">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className={`flex items-center gap-2 ${getThemeTextSecondary()} hover:opacity-80 transition mb-6`}
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Go back</span>
      </button>
      <div className="mb-8">
        <h1 className={`text-3xl font-bold ${getThemeTextPrimary()} mb-2`}>Billing History</h1>
        <p className={getThemeTextSecondary()}>
          View and download receipts for all your transactions
        </p>
      </div>

      <div
        className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} border overflow-hidden`}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={getThemeSubtle('ui')}>
              <tr>
                <th className={`px-6 py-4 text-left text-xs font-medium ${getThemeTextSecondary()} uppercase tracking-wider`}>
                  Date
                </th>
                <th className={`px-6 py-4 text-left text-xs font-medium ${getThemeTextSecondary()} uppercase tracking-wider`}>
                  Description
                </th>
                <th className={`px-6 py-4 text-left text-xs font-medium ${getThemeTextSecondary()} uppercase tracking-wider`}>
                  Amount
                </th>
                <th className={`px-6 py-4 text-left text-xs font-medium ${getThemeTextSecondary()} uppercase tracking-wider`}>
                  Status
                </th>
                <th className={`px-6 py-4 text-left text-xs font-medium ${getThemeTextSecondary()} uppercase tracking-wider`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${getThemeCardBorder()}`}>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:opacity-90 transition-opacity">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <Calendar className={`h-4 w-4 ${getThemeTextSecondary()}`} />
                      <span className={`text-sm ${getThemeTextPrimary()}`}>
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {transaction.transaction_type === 'subscription_payment'
                          ? 'Subscription Payment'
                          : transaction.transaction_type === 'trial_conversion'
                          ? 'Trial Conversion'
                          : 'Payment'}
                      </p>
                      <p className={`text-xs ${getThemeTextSecondary()}`}>
                        {transaction.payment_method === 'card' ? 'Credit Card' : transaction.payment_method}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-semibold ${getThemeTextPrimary()}`}>
                      {formatCurrency(transaction.amount, transaction.currency.toUpperCase())}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(transaction.status)}
                      {getStatusBadge(transaction.status)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {transaction.status === 'succeeded' && (
                      <button
                        onClick={() => downloadReceipt(transaction)}
                        disabled={downloadingReceipt === transaction.id}
                        className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-sm disabled:opacity-50"
                      >
                        {downloadingReceipt === transaction.id ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            <span>Download Receipt</span>
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`mt-6 ${getThemeSubtle('ui')} rounded-lg p-4 ${getThemeCardBorder()} border`}>
        <p className={`text-sm ${getThemeTextSecondary()}`}>
          <strong className={getThemeTextPrimary()}>Note:</strong> Receipts are generated on demand. Successful Stripe
          payments are recorded here for your account.
        </p>
      </div>
      </div>
    </div>
  );
};
