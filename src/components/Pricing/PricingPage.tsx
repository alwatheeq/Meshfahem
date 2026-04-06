import React, { useState } from 'react';
import { Check, ArrowRight, X, ArrowLeft, Plus, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useI18n } from '../../contexts/I18nContext';
import {
  PRICING,
  formatCurrency,
  isStripeEnabled,
  STANDARD_BASE_USD_BY_MONTHS,
  normalizeStandardBillingMonths,
} from '../../utils/subscriptionHelpers';

const STANDARD_FEATURES = [
  '1,500 credits for tools & services (1.5M tokens)',
  '500 credits for AI Chat included (500k tokens)',
  '600 credits for Study Room included (10 hours)',
  'Summaries, flashcards & quiz generation',
  'Save to library with goal tracking',
  'Multi-language support',
];

const MAX_ZEGO_HOURS = 100;
const MAX_CHAT_BLOCKS = 100;
const MIN_AI_BLOCKS = 5; // minimum extra block when adding more AI chat (5 × 100k = 500k tokens)

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const {
    getThemeGradient,
    getThemeCardBg,
    getThemeCardBorder,
    getThemeTextPrimary,
    getThemeTextSecondary,
    getThemeSubtle,
  } = useTheme();
  const [promoCode, setPromoCode] = useState('');
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [zegoHours, setZegoHours] = useState(0);
  const [chatBlocks, setChatBlocks] = useState(0);
  const [billingMonths, setBillingMonths] = useState<1 | 3 | 6>(1);

  const basePrice = STANDARD_BASE_USD_BY_MONTHS[billingMonths];
  const zegoTotal = zegoHours * PRICING.zegoPerHour;
  const chatTotal = chatBlocks * PRICING.chatPer100kTokens;
  const addonsTotal = zegoTotal + chatTotal;
  const totalPrice = basePrice + addonsTotal;

  const handleSubscribe = () => {
    if (!user) {
      navigate('/');
      return;
    }
    const params = new URLSearchParams({
      plan: 'standard',
      zego_hours: String(zegoHours),
      chat_blocks: String(chatBlocks),
      billing_months: String(billingMonths),
    });
    if (promoCode) params.set('promo', promoCode);
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} py-12 px-4 relative`}>
      {/* Navigation */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center max-w-3xl mx-auto">
        {user && (
          <button
            onClick={() => navigate('/')}
            className={`flex items-center space-x-2 ${getThemeTextSecondary()} hover:opacity-90 transition-opacity ${getThemeCardBg()} ${getThemeCardBorder()} border rounded-lg px-4 py-2 shadow-sm`}
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-medium">{t('pricing.back_to_dashboard')}</span>
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => navigate(user ? '/' : '/')}
          className={`flex items-center justify-center ${getThemeCardBg()} ${getThemeCardBorder()} border rounded-full w-10 h-10 shadow-sm hover:opacity-90 transition-opacity ${getThemeTextPrimary()}`}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-w-2xl mx-auto mt-20">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className={`text-4xl font-bold ${getThemeTextPrimary()} mb-3`}>
            {t('pricing.standard_title')}
          </h1>
          <p className={`text-lg ${getThemeTextSecondary()}`}>
            {t('pricing.standard_description')}
            {!isStripeEnabled() && (
              <span className="block mt-1 text-base"> {t('pricing.no_payment_required')}</span>
            )}
          </p>
          {showPromoInput && (
            <div className="mt-4 max-w-sm mx-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder={t('pricing.promo_placeholder')}
                  className={`flex-1 px-4 py-2 rounded-lg border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                />
                <button
                  onClick={() => setShowPromoInput(false)}
                  className={`px-4 py-2 rounded-lg ${getThemeGradient('ui')} text-white font-medium`}
                >
                  {t('pricing.apply')}
                </button>
              </div>
            </div>
          )}
          {!showPromoInput && (
            <button
              onClick={() => setShowPromoInput(true)}
              className={`mt-2 text-sm font-medium ${getThemeTextSecondary()} hover:underline`}
            >
              {t('pricing.have_promo')}
            </button>
          )}
        </div>

        {/* Standard plan card */}
        <div
          className={`rounded-2xl ${getThemeCardBg()} ${getThemeCardBorder()} border shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm overflow-hidden mb-8`}
        >
          <div className={`p-6 ${getThemeSubtle('ui')} rounded-t-2xl`}>
            <label htmlFor="billing-months" className={`block text-sm font-medium ${getThemeTextSecondary()} mb-2`}>
              {t('pricing.billing_term_label')}
            </label>
            <select
              id="billing-months"
              value={billingMonths}
              onChange={(e) => setBillingMonths(normalizeStandardBillingMonths(parseInt(e.target.value, 10)))}
              className={`w-full max-w-md mb-4 px-3 py-2 rounded-lg border ${getThemeCardBorder()} ${getThemeCardBg()} ${getThemeTextPrimary()}`}
            >
              <option value={1}>{t('pricing.billing_every_1')}</option>
              <option value={3}>{t('pricing.billing_every_3')}</option>
              <option value={6}>{t('pricing.billing_every_6')}</option>
            </select>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-3xl font-bold ${getThemeTextPrimary()}`}>
                {formatCurrency(basePrice)}
              </span>
              <span className={getThemeTextSecondary()}>
                {billingMonths === 1 ? t('pricing.per_month') : t('pricing.per_billing_period')}
              </span>
            </div>
            <p className={`mt-1 text-sm ${getThemeTextSecondary()}`}>
              {t('pricing.core_features_hint')}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <ul className="space-y-2">
              {STANDARD_FEATURES.map((feature, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className={`text-sm ${getThemeTextPrimary()}`}>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Add-ons */}
        <div className="space-y-4 mb-8">
          <h2 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
            {t('pricing.optional_addons')}
          </h2>

          {/* Extra Zegocloud hours */}
          <div
            className={`rounded-xl ${getThemeCardBg()} ${getThemeCardBorder()} border p-5 shadow-sm`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className={`font-semibold ${getThemeTextPrimary()}`}>
                  {t('pricing.zegocloud_addon_label')}
                </h3>
                <p className={`text-sm mt-0.5 ${getThemeTextSecondary()}`}>
                  {t('pricing.zegocloud_addon_description')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setZegoHours((h) => Math.max(0, h - 1))}
                  className={`rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle('ui')} p-2 ${getThemeTextPrimary()} hover:opacity-80 transition-opacity disabled:opacity-50`}
                  disabled={zegoHours === 0}
                  aria-label="Decrease hours"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className={`min-w-[3rem] text-center font-semibold ${getThemeTextPrimary()}`}>
                  {zegoHours} {t('pricing.hours_unit')}
                </span>
                <button
                  type="button"
                  onClick={() => setZegoHours((h) => Math.min(MAX_ZEGO_HOURS, h + 1))}
                  className={`rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle('ui')} p-2 ${getThemeTextPrimary()} hover:opacity-80 transition-opacity disabled:opacity-50`}
                  disabled={zegoHours >= MAX_ZEGO_HOURS}
                  aria-label="Increase hours"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
            {zegoHours > 0 && (
              <p className={`mt-2 text-sm ${getThemeTextSecondary()}`}>
                +{formatCurrency(zegoTotal)} {t('pricing.per_month')}
              </p>
            )}
          </div>

          {/* Extra AI Chat tokens */}
          <div
            className={`rounded-xl ${getThemeCardBg()} ${getThemeCardBorder()} border p-5 shadow-sm`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className={`font-semibold ${getThemeTextPrimary()}`}>
                  {t('pricing.ai_chat_addon_label')}
                </h3>
                <p className={`text-sm mt-0.5 ${getThemeTextSecondary()}`}>
                  {t('pricing.ai_chat_addon_description')}
                </p>
                <p className={`text-xs mt-1 ${getThemeTextSecondary()}`}>
                  {t('pricing.ai_min_hint')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setChatBlocks((b) => (b === MIN_AI_BLOCKS ? 0 : Math.max(MIN_AI_BLOCKS, b - 1)))}
                  className={`rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle('ui')} p-2 ${getThemeTextPrimary()} hover:opacity-80 transition-opacity disabled:opacity-50`}
                  disabled={chatBlocks === 0}
                  aria-label="Decrease token blocks"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span className={`min-w-[3rem] text-center font-semibold ${getThemeTextPrimary()}`}>
                  {chatBlocks} {t('pricing.tokens_unit')}
                </span>
                <button
                  type="button"
                  onClick={() => setChatBlocks((b) => (b === 0 ? MIN_AI_BLOCKS : Math.min(MAX_CHAT_BLOCKS, b + 1)))}
                  className={`rounded-lg border ${getThemeCardBorder()} ${getThemeSubtle('ui')} p-2 ${getThemeTextPrimary()} hover:opacity-80 transition-opacity disabled:opacity-50`}
                  disabled={chatBlocks >= MAX_CHAT_BLOCKS}
                  aria-label="Increase token blocks"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
            {chatBlocks > 0 && (
              <p className={`mt-2 text-sm ${getThemeTextSecondary()}`}>
                +{formatCurrency(chatTotal)} {t('pricing.per_month')}
              </p>
            )}
          </div>
        </div>

        {/* Summary + CTA */}
        <div
          className={`rounded-2xl ${getThemeCardBg()} ${getThemeCardBorder()} border p-6 shadow-sm`}
        >
            <div className="space-y-2 mb-6">
            <div className="flex justify-between text-sm">
              <span className={getThemeTextSecondary()}>{t('pricing.base_price_label')}</span>
              <span className={getThemeTextPrimary()}>
                {formatCurrency(basePrice)}
              </span>
            </div>
            {addonsTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className={getThemeTextSecondary()}>{t('pricing.addons_label')}</span>
                <span className={getThemeTextPrimary()}>{formatCurrency(addonsTotal)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className={getThemeTextPrimary()}>{t('pricing.total_per_billing_period')}</span>
              <span className={getThemeTextPrimary()}>
                {formatCurrency(totalPrice)}
                {!isStripeEnabled() && (
                  <span className="ml-1 text-sm font-normal"> ({t('pricing.no_payment_required')})</span>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={handleSubscribe}
            className={`w-full ${getThemeGradient('ui')} hover:opacity-90 text-white font-bold py-3 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2`}
          >
            <span>{isStripeEnabled() ? t('pricing.subscribe') : t('pricing.continue')}</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
