import React, { useEffect } from 'react';
import { Info, FileText, Upload, Brain, BookOpen, History, Share2, Globe, Tag, Folder, Eye, Download, RotateCcw, CreditCard as Edit3, List, HelpCircle, User, BarChart3, Stethoscope } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { AVAILABLE_LANGUAGES } from '../../utils/translation';
import { useTheme } from '../../contexts/ThemeContext';
import { usePageTutorial } from '../../hooks/usePageTutorial';
import { PageTutorial } from '../Onboarding/PageTutorial';

export const InformationalPage: React.FC = React.memo(() => {
  const { t } = useI18n();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const { shouldShowTutorial, showTutorial, isTutorialOpen, completeTutorial, skipTutorial, config: tutorialConfig } = usePageTutorial('informational');

  // Show tutorial on first visit
  useEffect(() => {
    if (shouldShowTutorial) {
      const timer = setTimeout(() => {
        showTutorial();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, showTutorial]);
  
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className={`text-3xl font-bold ${getThemeTextPrimary()} mb-2`}>{t('informational.how_to_use')}</h2>
        <p className={`text-lg ${getThemeTextSecondary()}`}>
          {t('informational.complete_guide')}
        </p>
      </div>

      <div className="space-y-8">
        {/* Overview Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <Info className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.overview')}</h3>
          </div>
          
          <div className="prose prose-lg max-w-none dark:prose-invert">
            <p className={`${getThemeTextSecondary()} leading-relaxed mb-4`}>
              {t('informational.overview_text')}
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 mt-6">
              <div className="bg-blue-50 rounded-lg p-4 dark:bg-blue-900">
                <FileText className="h-8 w-8 text-blue-600 mb-2 dark:text-blue-300" />
                <h4 className={`font-semibold ${getThemeTextPrimary()} mb-2`}>{t('informational.smart_summaries')}</h4>
                <p className={`text-sm ${getThemeTextSecondary()}`}>{t('informational.smart_summaries_desc')}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 dark:bg-green-900">
                <Brain className="h-8 w-8 text-green-600 mb-2 dark:text-green-300" />
                <h4 className={`font-semibold ${getThemeTextPrimary()} mb-2`}>{t('informational.interactive_flashcards')}</h4>
                <p className={`text-sm ${getThemeTextSecondary()}`}>{t('informational.interactive_flashcards_desc')}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 dark:bg-purple-900">
                <Globe className="h-8 w-8 text-purple-600 mb-2 dark:text-purple-300" />
                <h4 className={`font-semibold ${getThemeTextPrimary()} mb-2`}>{t('informational.multi_language')}</h4>
                <p className={`text-sm ${getThemeTextSecondary()}`}>{t('informational.multi_language_desc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* What&apos;s new */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-4">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.whats_new_title')}</h3>
          </div>
          <p className={`text-sm ${getThemeTextMuted()} mb-4`}>{t('informational.last_updated')}</p>
          <ul className={`list-disc pl-5 space-y-2 ${getThemeTextSecondary()}`}>
            <li>{t('informational.whats_new_book_mode')}</li>
            <li>{t('informational.whats_new_academics')}</li>
            <li>{t('informational.whats_new_study_rooms')}</li>
            <li>{t('informational.whats_new_chat')}</li>
            <li>{t('informational.whats_new_library')}</li>
            <li>{t('informational.whats_new_themes')}</li>
            <li>{t('informational.whats_new_standard')}</li>
          </ul>
        </div>

        {/* Getting Started Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-2 rounded-lg dark:from-green-600 dark:to-emerald-700">
              <Upload className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.getting_started')}</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>1. {t('informational.upload_content')}</h4>
              <div className={`${getThemeSubtle('bg')} rounded-lg p-4 mb-4`}>
                <p className={`${getThemeTextSecondary()} mb-3`}>{t('informational.upload_methods_intro')}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className={`${getThemeCardBorder()} rounded-lg p-4`}>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>📁 {t('informational.file_upload_title')}</h5>
                    <ul className={`text-sm ${getThemeTextSecondary()} space-y-1`}>
                      <li>• <strong>{t('informational.file_upload_formats')}</strong></li>
                      <li>• <strong>{t('informational.file_upload_max_size')}</strong></li>
                      <li>• <strong>{t('informational.file_upload_page_limit')}</strong></li>
                      <li>• {t('informational.file_upload_drag_drop')}</li>
                    </ul>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-700">
                    <h5 className="font-medium text-gray-900 mb-2 dark:text-gray-100">📝 {t('informational.text_input_title')}</h5>
                    <ul className="text-sm text-gray-600 space-y-1 dark:text-gray-300">
                      <li>• <strong>{t('informational.text_input_min')}</strong></li>
                      <li>• <strong>{t('informational.text_input_max')}</strong></li>
                      <li>• {t('informational.text_input_perfect_for')}</li>
                      <li>• {t('informational.text_input_char_counter')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>2. {t('informational.configure_settings')}</h4>
              <div className="bg-blue-50 rounded-lg p-4 dark:bg-blue-900">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.flashcard_count_title')}</h5>
                    <p className={`text-sm ${getThemeTextSecondary()} mb-2`}>{t('informational.flashcard_count_desc')}</p>
                    <p className={`text-xs ${getThemeTextMuted()}`}>{t('informational.flashcard_count_tip')}</p>
                  </div>
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.generation_source_title')}</h5>
                    <ul className={`text-sm ${getThemeTextSecondary()} space-y-1`}>
                      <li>• <strong>{t('informational.generation_source_full')}</strong></li>
                      <li>• <strong>{t('informational.generation_source_summary')}</strong></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>3. {t('informational.processing_modes_title')}</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-green-200 bg-green-50 rounded-lg p-4 dark:border-green-700 dark:bg-green-900">
                  <h5 className="font-medium text-green-800 mb-2 dark:text-green-300">⚡ {t('informational.fast_mode_title')}</h5>
                  <p className="text-sm text-green-700 dark:text-green-200">{t('informational.fast_mode_desc')}</p>
                </div>
                <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 dark:border-orange-700 dark:bg-orange-900">
                  <h5 className="font-medium text-orange-800 mb-2 dark:text-orange-300">🧠 {t('informational.staged_mode_title')}</h5>
                  <p className="text-sm text-orange-700 dark:text-orange-200">{t('informational.staged_mode_desc')}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>{t('informational.medical_student_step_title')}</h4>
              <div className={`${getThemeCardBg()} rounded-lg p-4 ${getThemeCardBorder()}`}>
                <div className="flex items-center space-x-2 mb-3">
                  <Stethoscope className={`h-5 w-5 ${getThemeTextSecondary()}`} />
                  <h5 className={`font-medium ${getThemeTextPrimary()}`}>🏥 {t('informational.medical_student_card_heading')}</h5>
                </div>
                <p className={`text-sm mb-3 ${getThemeTextSecondary()}`}>
                  {t('informational.medical_student_intro')}
                </p>
                <ul className={`text-sm space-y-1 ${getThemeTextSecondary()}`}>
                  <li>• {t('informational.medical_student_bullet_1')}</li>
                  <li>• {t('informational.medical_student_bullet_2')}</li>
                  <li>• {t('informational.medical_student_bullet_3')}</li>
                  <li>• {t('informational.medical_student_bullet_4')}</li>
                  <li>• {t('informational.medical_student_bullet_5')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Understanding Results Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <Brain className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.understanding_results')}</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>📄 {t('informational.summary_display_title')}</h4>
              <div className={`${getThemeSubtle('bg')} rounded-lg p-4`}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.summary_features')}</h5>
                    <ul className={`text-sm ${getThemeTextSecondary()} space-y-1`}>
                      <li>• {t('informational.summary_copy_all')}</li>
                      <li>• {t('informational.summary_dual_mode')}</li>
                      <li>• {t('informational.summary_export')}</li>
                      <li>• {t('informational.summary_topics')}</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2 dark:text-gray-100">{t('informational.summary_actions')}</h5>
                    <ul className="text-sm text-gray-600 space-y-1 dark:text-gray-300">
                      <li>• {t('informational.summary_publish')}</li>
                      <li>• {t('informational.summary_new_doc')}</li>
                      <li>• {t('informational.summary_translation')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>🎯 {t('informational.flashcard_viewer_title')}</h4>
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 dark:bg-blue-900">
                  <h5 className="font-medium text-blue-900 mb-3 dark:text-blue-300">{t('informational.study_modes')}</h5>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className={`${getThemeCardBg()} rounded p-3`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <RotateCcw className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                        <span className={`font-medium text-sm ${getThemeTextPrimary()}`}>{t('informational.flip_cards_mode')}</span>
                      </div>
                      <p className={`text-xs ${getThemeTextSecondary()}`}>{t('informational.flip_cards_desc')}</p>
                    </div>
                    <div className={`${getThemeCardBg()} rounded p-3`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <Edit3 className="h-4 w-4 text-purple-600 dark:text-purple-300" />
                        <span className={`font-medium text-sm ${getThemeTextPrimary()}`}>{t('informational.type_answer_mode')}</span>
                      </div>
                      <p className={`text-xs ${getThemeTextSecondary()}`}>{t('informational.type_answer_desc')}</p>
                    </div>
                    <div className={`${getThemeCardBg()} rounded p-3`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <List className="h-4 w-4 text-green-600 dark:text-green-300" />
                        <span className="font-medium text-sm dark:text-gray-100">{t('informational.multiple_choice_mode')}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{t('informational.multiple_choice_desc')}</p>
                    </div>
                    <div className={`${getThemeCardBg()} rounded p-3`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <FileText className="h-4 w-4 text-orange-600 dark:text-orange-300" />
                        <span className="font-medium text-sm dark:text-gray-100">{t('informational.fill_blanks_mode')}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{t('informational.fill_blanks_desc')}</p>
                    </div>
                    <div className={`${getThemeCardBg()} rounded p-3`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <HelpCircle className="h-4 w-4 text-red-600 dark:text-red-300" />
                        <span className="font-medium text-sm dark:text-gray-100">{t('informational.true_false_mode')}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{t('informational.true_false_desc')}</p>
                    </div>
                    <div className={`${getThemeCardBg()} rounded p-3`}>
                      <div className="flex items-center space-x-2 mb-1">
                        <Eye className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        <span className="font-medium text-sm dark:text-gray-100">{t('informational.view_all_mode')}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">{t('informational.view_all_desc')}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 dark:bg-green-900">
                  <h5 className="font-medium text-green-900 mb-2 dark:text-green-300">{t('informational.export_options')}</h5>
                  <ul className="text-sm text-green-700 space-y-1 dark:text-green-200">
                    <li>• {t('informational.export_csv_desc')}</li>
                    <li>• {t('informational.export_txt_desc')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Smart Features Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <Brain className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>Smart Features & Performance</h3>
          </div>

          <div className="space-y-4">
            <div className="bg-green-50 rounded-lg p-4 dark:bg-green-900">
              <h4 className="font-medium text-green-900 mb-2 dark:text-green-300">⚡ Intelligent Content Deduplication</h4>
              <p className="text-sm text-green-700 mb-3 dark:text-green-200">
                Our system automatically detects when you're uploading duplicate or similar content and retrieves results instantly from cache instead of reprocessing.
              </p>
              <ul className="text-sm text-green-700 space-y-1 dark:text-green-200">
                <li>• <strong>Instant Results:</strong> Previously processed content loads in seconds</li>
                <li>• <strong>Save Resources:</strong> Reduces AI processing time and usage limits</li>
                <li>• <strong>Smart Matching:</strong> Uses content fingerprinting to detect duplicates</li>
                <li>• <strong>Automatic:</strong> Works transparently in the background</li>
              </ul>
            </div>

            <div className={`${getThemeSubtle('bg')} rounded-lg p-4 ${getThemeCardBorder()}`}>
              <h4 className={`font-medium ${getThemeTextPrimary()} mb-2`}>🌙 Dark Mode Support</h4>
              <p className={`text-sm ${getThemeTextSecondary()} mb-2`}>
                The application automatically detects your system's theme preference and applies dark mode for comfortable studying at night.
              </p>
              <ul className={`text-sm ${getThemeTextMuted()} space-y-1`}>
                <li>• Reduces eye strain during extended study sessions</li>
                <li>• Follows your device's system preferences</li>
                <li>• Applies consistently across all pages and components</li>
              </ul>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 dark:bg-yellow-900 dark:border-yellow-700">
              <h4 className="font-medium text-yellow-900 mb-2 dark:text-yellow-300">📅 365-Day History Retention</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-200">
                All your processed content is automatically saved to your history for one full year, giving you long-term access to your study materials without taking up space in your library.
              </p>
            </div>
          </div>
        </div>

        {/* Language & Translation Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <Globe className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.language_translation')}</h3>
          </div>
          
          <div className="space-y-4">
            <div className="bg-purple-50 rounded-lg p-4 dark:bg-purple-900">
              <h4 className="font-medium text-purple-900 mb-2 dark:text-purple-300">{t('informational.available_languages')}</h4>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                {AVAILABLE_LANGUAGES.map((language) => (
                  <div key={language.code} className={`${getThemeCardBg()} rounded p-3 text-center`}>
                    <span className={`text-2xl mb-1 block ${getThemeTextPrimary()}`}>{language.flag}</span>
                    <span className={`font-medium text-sm ${getThemeTextPrimary()}`}>{language.name}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 dark:bg-blue-900">
              <h4 className="font-medium text-blue-900 mb-2 dark:text-blue-300">{t('informational.how_translation_works')}</h4>
              <ul className="text-sm text-blue-700 space-y-1 dark:text-blue-200">
                <li>• {t('informational.translation_tip_1')}</li>
                <li>• {t('informational.translation_tip_2')}</li>
                <li>• {t('informational.translation_tip_3')}</li>
                <li>• {t('informational.translation_tip_4')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Managing Content Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-gradient-to-r from-orange-500 to-red-600 p-2 rounded-lg dark:from-orange-600 dark:to-red-700">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.managing_content')}</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>📚 {t('informational.my_library_title')}</h4>
              <div className="bg-orange-50 rounded-lg p-4 mb-4 dark:bg-orange-900">
                <p className="text-orange-800 mb-3 dark:text-orange-300">{t('informational.my_library_desc')}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.library_org_features')}</h5>
                    <ul className={`text-sm ${getThemeTextSecondary()} space-y-1`}>
                      <li>• <Folder className="h-3 w-3 inline mr-1" />{t('informational.library_org_1')}</li>
                      <li>• <Tag className="h-3 w-3 inline mr-1" />{t('informational.library_org_2')}</li>
                      <li>• <Eye className="h-3 w-3 inline mr-1" />{t('informational.library_org_3')}</li>
                      <li>• <Download className="h-3 w-3 inline mr-1" />{t('informational.library_org_4')}</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2 dark:text-gray-100">{t('informational.library_share_features')}</h5>
                    <ul className="text-sm text-gray-600 space-y-1 dark:text-gray-300">
                      <li>• <Share2 className="h-3 w-3 inline mr-1" />{t('informational.library_share_1')}</li>
                      <li>• {t('informational.library_share_2')}</li>
                      <li>• {t('informational.library_share_3')}</li>
                      <li>• {t('informational.library_share_4')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Public Library Feature */}
              <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200 dark:bg-blue-900 dark:border-blue-700">
                <div className="flex items-center space-x-2 mb-3">
                  <Globe className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                  <h5 className="font-medium text-blue-900 dark:text-blue-300">🌍 Public Library - Learn from the Community</h5>
                </div>
                <p className="text-sm text-blue-800 mb-3 dark:text-blue-200">
                  Access a wealth of knowledge created by other users! The public library allows you to discover, explore, and learn from study materials shared by the community.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h6 className={`font-medium ${getThemeTextPrimary()} text-sm mb-2`}>View Options:</h6>
                    <ul className="text-sm text-blue-700 space-y-1 dark:text-blue-200">
                      <li>• <strong>All Items:</strong> See both your content and community contributions</li>
                      <li>• <strong>My Items:</strong> View only your personal study materials</li>
                      <li>• <strong>Community Items:</strong> Browse content created by other users</li>
                    </ul>
                  </div>
                  <div>
                    <h6 className="font-medium text-gray-900 text-sm mb-2 dark:text-gray-100">Community Features:</h6>
                    <ul className="text-sm text-blue-700 space-y-1 dark:text-blue-200">
                      <li>• See creator email on community items</li>
                      <li>• Items are clearly labeled with "Community" badge</li>
                      <li>• Search and filter across all public content</li>
                      <li>• Discover materials on topics you're studying</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>📜 {t('informational.history_title')}</h4>
              <div className="bg-blue-50 rounded-lg p-4 dark:bg-blue-900">
                <p className="text-blue-800 mb-3 dark:text-blue-300">{t('informational.history_desc_long')}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.history_stored_what')}</h5>
                    <ul className={`text-sm ${getThemeTextSecondary()} space-y-1`}>
                      <li>• {t('informational.history_stored_1')}</li>
                      <li>• {t('informational.history_stored_2')}</li>
                      <li>• {t('informational.history_stored_3')}</li>
                      <li>• {t('informational.history_stored_4')}</li>
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2 dark:text-gray-100">{t('informational.history_data_retention')}</h5>
                    <ul className="text-sm text-gray-600 space-y-1 dark:text-gray-300">
                      <li>• <strong>{t('informational.history_retention_1')}</strong></li>
                      <li>• {t('informational.history_retention_2')}</li>
                      <li>• {t('informational.history_retention_3')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation & Account Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <User className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.navigation_account')}</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>🧭 {t('informational.sidebar_nav_title')}</h4>
              <div className="bg-teal-50 rounded-lg p-4 dark:bg-teal-900">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className={`flex items-center space-x-3 p-2 ${getThemeCardBg()} rounded`}>
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                      <div>
                        <span className={`font-medium text-sm ${getThemeTextPrimary()}`}>{t('sidebar.dashboard')}</span>
                        <p className={`text-xs ${getThemeTextMuted()}`}>{t('sidebar.dashboard_desc')}</p>
                      </div>
                    </div>
                    <div className={`flex items-center space-x-3 p-2 ${getThemeCardBg()} rounded`}>
                      <BookOpen className="h-5 w-5 text-green-600 dark:text-green-300" />
                      <div>
                        <span className={`font-medium text-sm ${getThemeTextPrimary()}`}>{t('sidebar.my_library')}</span>
                        <p className={`text-xs ${getThemeTextMuted()}`}>{t('sidebar.library_desc')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className={`flex items-center space-x-3 p-2 ${getThemeCardBg()} rounded`}>
                      <History className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                      <div>
                        <span className="font-medium text-sm dark:text-gray-100">{t('sidebar.history')}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('sidebar.history_desc')}</p>
                      </div>
                    </div>
                    <div className={`flex items-center space-x-3 p-2 ${getThemeCardBg()} rounded`}>
                      <Info className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                      <div>
                        <span className="font-medium text-sm dark:text-gray-100">{t('sidebar.informational')}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('sidebar.info_desc')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className={`text-lg font-semibold ${getThemeTextPrimary()} mb-3`}>📊 {t('informational.header_info_title')}</h4>
              <div className={`${getThemeSubtle('bg')} rounded-lg p-4`}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.usage_tracking')}</h5>
                    <div className="flex items-center space-x-2 mb-2">
                      <BarChart3 className={`h-4 w-4 ${getThemeTextMuted()}`} />
                      <span className={`text-sm ${getThemeTextSecondary()}`}>{t('informational.usage_limit')}</span>
                    </div>
                    <p className={`text-xs ${getThemeTextMuted()}`}>{t('informational.usage_reset')}</p>
                  </div>
                  <div>
                    <h5 className={`font-medium ${getThemeTextPrimary()} mb-2`}>{t('informational.account_info')}</h5>
                    <ul className={`text-sm ${getThemeTextSecondary()} space-y-1`}>
                      <li>• {t('informational.account_info_1')}</li>
                      <li>• {t('informational.account_info_2')}</li>
                      <li>• {t('informational.account_info_3')}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tips & Best Practices */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-sm p-8 dark:shadow-none`}>
          <div className="flex items-center space-x-3 mb-6">
            <div className={`${getThemeGradient('ui')} p-2 rounded-lg`}>
              <Brain className="h-6 w-6 text-white" />
            </div>
            <h3 className={`text-2xl font-semibold ${getThemeTextPrimary()}`}>{t('informational.tips_practices')}</h3>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className={`${getThemeSubtle('bg')} rounded-lg p-4 ${getThemeCardBorder()}`}>
              <h4 className={`font-semibold mb-3 ${getThemeTextPrimary()}`}>📝 {t('informational.better_summaries_title')}</h4>
              <ul className={`space-y-2 text-sm ${getThemeTextSecondary()}`}>
                <li>• {t('informational.better_summaries_1')}</li>
                <li>• {t('informational.better_summaries_2')}</li>
                <li>• {t('informational.better_summaries_3')}</li>
                <li>• {t('informational.better_summaries_4')}</li>
              </ul>
            </div>
            <div className={`${getThemeSubtle('bg')} rounded-lg p-4 ${getThemeCardBorder()}`}>
              <h4 className={`font-semibold mb-3 ${getThemeTextPrimary()}`}>🎯 {t('informational.effective_study_title')}</h4>
              <ul className={`space-y-2 text-sm ${getThemeTextSecondary()}`}>
                <li>• {t('informational.effective_study_1')}</li>
                <li>• {t('informational.effective_study_2')}</li>
                <li>• {t('informational.effective_study_3')}</li>
                <li>• {t('informational.effective_study_4')}</li>
              </ul>
            </div>
            <div className={`${getThemeSubtle('bg')} rounded-lg p-4 ${getThemeCardBorder()}`}>
              <h4 className={`font-semibold mb-3 ${getThemeTextPrimary()}`}>🏥 {t('informational.tips_medical_title')}</h4>
              <ul className={`space-y-2 text-sm ${getThemeTextSecondary()}`}>
                <li>• {t('informational.tips_medical_1')}</li>
                <li>• {t('informational.tips_medical_2')}</li>
                <li>• {t('informational.tips_medical_3')}</li>
                <li>• {t('informational.tips_medical_4')}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Support Section */}
        <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8 border-2 ${getThemeCardBorder()} dark:shadow-none`}>
          <div className="text-center">
            <h3 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-4`}>{t('informational.need_help')}</h3>
            <p className={`${getThemeTextSecondary()} mb-6`}>
              {t('informational.contact_support')}
            </p>
            <div className="flex justify-center space-x-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center dark:bg-blue-900">
                <h4 className="font-medium text-blue-900 mb-1 dark:text-blue-300">{t('informational.quick_start')}</h4>
                <p className="text-sm text-blue-700 dark:text-blue-200">{t('informational.quick_start_desc')}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center dark:bg-green-900">
                <h4 className="font-medium text-green-900 mb-1 dark:text-green-300">{t('informational.experiment')}</h4>
                <p className="text-sm text-green-700 dark:text-green-200">{t('informational.experiment_desc')}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center dark:bg-purple-900">
                <h4 className="font-medium text-purple-900 mb-1 dark:text-purple-300">{t('informational.organize')}</h4>
                <p className="text-sm text-purple-700 dark:text-purple-200">{t('informational.organize_desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Informational Tutorial */}
      {tutorialConfig && (
        <PageTutorial
          config={tutorialConfig}
          isOpen={isTutorialOpen}
          onClose={() => {}}
          onComplete={completeTutorial}
          onSkip={skipTutorial}
        />
      )}
    </div>
  );
});