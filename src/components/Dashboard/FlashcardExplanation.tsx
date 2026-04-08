import React, { useState } from 'react';
import { HelpCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { ErrorLogger } from '../../utils/errorLogger';

interface FlashcardExplanationProps {
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  medicalMode?: boolean;
}

export const FlashcardExplanation: React.FC<FlashcardExplanationProps> = ({
  question,
  correctAnswer,
  userAnswer,
  medicalMode = false,
}) => {
  const { t } = useI18n();
  const { getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchExplanation = async () => {
    if (explanation) {
      setExpanded(!expanded);
      return;
    }

    setExpanded(true);
    setLoading(true);

    try {
      const prompt = `The student was asked: "${question}"
${userAnswer ? `They answered: "${userAnswer}"` : 'They got it wrong.'}
The correct answer is: "${correctAnswer}"

Explain briefly (2-3 sentences) why the correct answer is right${userAnswer ? ' and why their answer was wrong' : ''}. ${medicalMode ? 'Use medical/clinical context.' : ''}`;

      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: prompt,
          context: `Flashcard explanation for: ${question}`,
          mode: 'explanation',
        },
      });

      if (error) {
        ErrorLogger.error(error, { component: 'FlashcardExplanation', action: 'fetchExplanation' });
        setExplanation(t('flashcard_explanation.error') || 'Could not generate explanation. The correct answer is: ' + correctAnswer);
      } else {
        setExplanation(data?.response || data?.message || correctAnswer);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, { component: 'FlashcardExplanation', action: 'fetchExplanation' });
      setExplanation(t('flashcard_explanation.fallback') || `The correct answer is: "${correctAnswer}"`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        onClick={fetchExplanation}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          expanded
            ? `${getThemeCardBg()} ${getThemeCardBorder()} border`
            : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
        }`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <HelpCircle className="h-4 w-4" />
        )}
        <span>{t('flashcard_explanation.why') || 'Why?'}</span>
        {explanation && (expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>

      {expanded && (
        <div className={`mt-2 p-3 rounded-lg ${getThemeCardBg()} ${getThemeCardBorder()} border`}>
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className={`text-sm ${getThemeTextSecondary()}`}>
                {t('flashcard_explanation.loading') || 'Generating explanation...'}
              </span>
            </div>
          ) : (
            <p className={`text-sm leading-relaxed ${getThemeTextPrimary()}`}>
              {explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
