import React, { useState } from 'react';
import { Check, Zap, Crown, Star, ArrowRight, X, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PRICING, formatCurrency, isStripeEnabled } from '../../utils/subscriptionHelpers';

export const PricingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getThemeGradient } = useTheme();
  const [promoCode, setPromoCode] = useState('');
  const [showPromoInput, setShowPromoInput] = useState(false);

  const handleSelectPlan = (tier: string) => {
    if (!user) {
      navigate('/');
      return;
    }

    navigate(`/checkout?plan=${tier}${promoCode ? `&promo=${promoCode}` : ''}`);
  };

  const plans = [
    {
      id: 'trial',
      name: '1-Day Free Trial',
      price: 0,
      period: 'one time',
      description: 'Try before you commit',
      icon: Zap,
      gradient: 'from-gray-500 to-gray-600',
      features: [
        'One use of summary generation',
        'One use of flashcard creation',
        'One use of quiz generation',
        'One use of video processing',
        'Basic features access',
        'No credit card required'
      ],
      limitations: [
        'Limited to one use per feature',
        'No library saving',
        'No collaborative study rooms'
      ],
      cta: 'Start Free Trial',
      popular: false
    },
    {
      id: 'monthly',
      name: 'Monthly Plan',
      price: PRICING.monthly,
      period: 'month',
      description: 'Perfect for continuous learners',
      icon: Crown,
      gradient: 'from-green-500 to-emerald-600',
      features: [
        '7-Day Free Trial',
        'Unlimited summaries & flashcards',
        'Unlimited quiz generation',
        'Unlimited video processing',
        'Save to library',
        'Study rooms access',
        'Goal tracking',
        'Achievements & gamification',
        'Multi-language support',
        'Medical content processing',
        'Priority support'
      ],
      limitations: [],
      cta: 'Start 7-Day Trial',
      popular: true
    },
    {
      id: 'quarterly',
      name: 'Quarterly Plan',
      price: PRICING.quarterly,
      period: '3 months',
      description: 'Save 10% with quarterly billing',
      icon: Star,
      gradient: 'from-cyan-500 to-blue-600',
      savings: ((PRICING.monthly * 3 - PRICING.quarterly) / (PRICING.monthly * 3) * 100).toFixed(0),
      features: [
        '7-Day Free Trial',
        'Everything in Monthly Plan',
        'Save 10% on total cost',
        'Quarterly billing',
        'Priority feature requests',
        'Extended support hours'
      ],
      limitations: [],
      cta: 'Start 7-Day Trial',
      popular: false
    },
    {
      id: 'biannual',
      name: 'Biannual Plan',
      price: PRICING.biannual,
      period: '6 months',
      description: 'Best value - Save 16%',
      icon: Crown,
      gradient: 'from-yellow-500 to-orange-600',
      savings: ((PRICING.monthly * 6 - PRICING.biannual) / (PRICING.monthly * 6) * 100).toFixed(0),
      features: [
        '7-Day Free Trial',
        'Everything in Monthly Plan',
        'Save 16% on total cost',
        'Biannual billing',
        'VIP priority support',
        'Early access to new features',
        'Custom feature requests'
      ],
      limitations: [],
      cta: 'Start 7-Day Trial',
      popular: false,
      bestValue: true
    }
  ];

  return (
    <div className={`min-h-screen ${getThemeGradient('bg')} py-12 px-4 relative`}>
      {/* Navigation Controls */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-center max-w-7xl mx-auto">
        {user && (
          <button
            onClick={() => navigate('/')}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-md hover:shadow-lg"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-medium">Back to Dashboard</span>
          </button>
        )}
        <div className="flex-1"></div>
        <button
          onClick={() => navigate(user ? '/' : '/')}
          className="flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 w-10 h-10 rounded-full shadow-md hover:shadow-lg transition-all"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="max-w-7xl mx-auto mt-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Choose Your Perfect Plan
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
            {!isStripeEnabled()
              ? 'All plans are currently FREE - No payment required!'
              : 'Start with a free trial, then choose the plan that works for you'
            }
          </p>

          {/* Promo Code Toggle */}
          <button
            onClick={() => setShowPromoInput(!showPromoInput)}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm"
          >
            Have a promo code?
          </button>

          {showPromoInput && (
            <div className="mt-4 max-w-md mx-auto">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Enter promo code"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                />
                <button
                  onClick={() => setShowPromoInput(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.id}
                className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden transition-transform hover:scale-105 ${
                  plan.popular ? 'ring-4 ring-blue-500 dark:ring-blue-400' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 text-sm font-bold rounded-bl-lg">
                    POPULAR
                  </div>
                )}

                {plan.bestValue && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-1 text-sm font-bold rounded-bl-lg">
                    BEST VALUE
                  </div>
                )}

                <div className={`bg-gradient-to-r ${plan.gradient} p-6 text-white`}>
                  <Icon className="h-12 w-12 mb-4" />
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-sm opacity-90">{plan.description}</p>
                </div>

                <div className="p-6">
                  <div className="mb-6">
                    <div className="flex items-baseline">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">
                        {!isStripeEnabled() || plan.price === 0 ? 'Free' : formatCurrency(plan.price)}
                      </span>
                      {isStripeEnabled() && plan.price > 0 && (
                        <span className="text-gray-500 dark:text-gray-400 ml-2">/ {plan.period}</span>
                      )}
                    </div>
                    {isStripeEnabled() && plan.savings && (
                      <div className="mt-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full inline-block text-sm font-semibold">
                        Save {plan.savings}%
                      </div>
                    )}
                    {!isStripeEnabled() && (
                      <div className="mt-2 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full inline-block text-sm font-semibold">
                        Free Access
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`w-full bg-gradient-to-r ${plan.gradient} hover:opacity-90 text-white font-bold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center space-x-2 mb-6`}
                  >
                    <span>{plan.cta}</span>
                    <ArrowRight className="h-5 w-5" />
                  </button>

                  <div className="space-y-3 mb-4">
                    <p className="font-semibold text-gray-900 dark:text-white">Includes:</p>
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {plan.limitations.length > 0 && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Limitations:</p>
                      {plan.limitations.map((limitation, index) => (
                        <div key={index} className="text-xs text-gray-500 dark:text-gray-500 mb-1">
                          • {limitation}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {isStripeEnabled() && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">How does the 7-day trial work?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  When you subscribe to Monthly, Quarterly, or Biannual plans, you get 7 days of full access completely free. If you cancel before the trial ends, you won't be charged.
                </p>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">What's included in the 1-Day Trial?</h3>
              <p className="text-gray-600 dark:text-gray-400">
                The 1-Day Trial gives you one use of each major feature (summary generation, flashcards, quizzes, and video processing). It's perfect to test the platform before committing to a paid plan.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">Can I cancel anytime?</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Yes! You can cancel your subscription at any time. Your cancellation will take effect at the end of your current billing period, and you'll continue to have access until then.
              </p>
            </div>

            {isStripeEnabled() && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">What payment methods do you accept?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  We accept all major credit cards through Stripe, our secure payment processor. Additional payment methods will be added soon.
                </p>
              </div>
            )}

            {isStripeEnabled() && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Is there a refund policy?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  We don't offer automatic refunds, but if you have a special circumstance, please contact our support team and we'll do our best to help.
                </p>
              </div>
            )}

            {!isStripeEnabled() && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Why is everything free?</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  We're currently in beta and offering free access to all features. This allows us to gather feedback and improve the platform. Enjoy unlimited access to all features!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <div className={`${getThemeGradient('ui')} rounded-2xl p-12 text-white`}>
            <h2 className="text-3xl font-bold mb-4">Ready to supercharge your learning?</h2>
            <p className="text-xl mb-8 opacity-90">
              Join thousands of students and professionals using our platform
            </p>
            <button
              onClick={() => handleSelectPlan('monthly')}
              className="bg-white text-blue-600 font-bold py-4 px-8 rounded-lg hover:bg-gray-100 transition duration-200 text-lg"
            >
              Start Your Free Trial Today
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
