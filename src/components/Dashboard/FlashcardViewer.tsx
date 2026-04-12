import React, { useState, useEffect, useContext, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Eye, EyeOff, Download, Shuffle, BookOpen, CheckCircle, BarChart, CreditCard as Edit3, List, FileText, HelpCircle, Stethoscope, MessageCircleQuestion } from 'lucide-react';
import { useI18n, I18nContext } from '../../contexts/I18nContext';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { recordFlashcardStudy, recordFlashcardRating } from '../../utils/studyTracking';
import { ReadAloudButton } from './ReadAloud/ReadAloudButton';
import { supabase } from '../../lib/supabase';

interface Flashcard {
  front: string;
  back: string;
}

interface FlashcardViewerProps {
  flashcards: Flashcard[];
  medicalMode?: boolean;
  itemId?: string;
  /** Study material context for the chat-assistant (optional; derived from flashcards if omitted). */
  contextSummary?: string;
}

type StudyMode = 'flip' | 'type_answer' | 'multiple_choice' | 'fill_in_blanks' | 'true_false';
type MedicalStudyMode = 'clinical_cases' | 'pathophysiology' | 'pharmacology' | 'differential_diagnosis';

// Internal component that uses hooks
const FlashcardViewerContent: React.FC<FlashcardViewerProps> = ({ flashcards, medicalMode = false, itemId, contextSummary }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { getThemeGradient, getThemeCardBg, getThemeCardBorder, getThemeTextPrimary, getThemeTextSecondary, getThemeTextMuted, getThemeSubtle } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<Date>(new Date());
  const [cardsStudiedInSession, setCardsStudiedInSession] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [currentStudyMode, setCurrentStudyMode] = useState<StudyMode>('flip');
  const [medicalStudyMode, setMedicalStudyMode] = useState<MedicalStudyMode>('clinical_cases');
  
  // Study session states
  const [studyCards, setStudyCards] = useState<Flashcard[]>([]);
  const [studiedCards, setStudiedCards] = useState<Set<number>>(new Set());
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);
  const [studyProgress, setStudyProgress] = useState({ easy: 0, good: 0, hard: 0, learned: 0 });
  
  // Notification states
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  // New study mode states
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState<string[]>([]);
  const [blankedText, setBlankedText] = useState('');
  const [blankWord, setBlankWord] = useState('');
  const [trueFalseStatement, setTrueFalseStatement] = useState('');
  const [isStatementTrue, setIsStatementTrue] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const [explanation, setExplanation] = useState('');
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const assistantSummaryText = React.useMemo(() => {
    const fromProp = contextSummary?.trim();
    if (fromProp && fromProp.length >= 10) return fromProp.slice(0, 12000);
    const derived = flashcards.map((f) => `${f.front}\n${f.back}`).join('\n\n').trim();
    if (derived.length >= 10) return derived.slice(0, 12000);
    return 'Flashcard study context for explanations.';
  }, [contextSummary, flashcards]);

  const fetchExplanation = useCallback(async (question: string, answer: string) => {
    setLoadingExplanation(true);
    setExplanation('');
    try {
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: `Explain why the correct answer to "${question}" is "${answer}" in 2-3 sentences.`,
          summary_text: assistantSummaryText,
          one_shot: true,
          topics: [],
          medical_mode: medicalMode,
        },
      });
      if (error) throw error;
      const msg =
        data && typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message?: unknown }).message ?? '')
          : typeof data === 'string'
            ? data
            : '';
      setExplanation(msg || t('flashcard_explain.error'));
    } catch {
      setExplanation(t('flashcard_explain.error'));
    } finally {
      setLoadingExplanation(false);
    }
  }, [t, assistantSummaryText, medicalMode]);

  // Initialize study session when component mounts or flashcards change
  useEffect(() => {
    if (flashcards.length > 0) {
      initializeStudySession();
      setSessionStartTime(new Date());
    }
  }, [flashcards]);

  // Record study session when user leaves or finishes studying
  useEffect(() => {
    return () => {
      // Component unmounting - record the study session
      if (user && cardsStudiedInSession > 0) {
        recordFlashcardStudy(user.id, cardsStudiedInSession, itemId, sessionStartTime, currentStudyMode);
      }
    };
  }, [user, cardsStudiedInSession, sessionStartTime, itemId, currentStudyMode]);

  const initializeStudySession = () => {
    const shuffledCards = [...flashcards].sort(() => Math.random() - 0.5);
    setStudyCards(shuffledCards);
    setCurrentStudyIndex(0);
    setStudiedCards(new Set());
    setStudyProgress({ easy: 0, good: 0, hard: 0, learned: 0 });
    setShowNotification(false);
    setNotificationMessage('');
    resetCardState();
  };

  const nextCard = () => {
    // Track that a card was studied
    setCardsStudiedInSession(prev => prev + 1);

    if (currentStudyMode === 'flip') {
      if (studyCards.length > 0) {
        setCurrentStudyIndex((prev) => (prev + 1) % studyCards.length);
      }
    } else {
      setCurrentIndex((prev) => (prev + 1) % flashcards.length);
    }
    resetCardState();
  };

  const prevCard = () => {
    if (currentStudyMode === 'flip') {
      if (studyCards.length > 0) {
        setCurrentStudyIndex((prev) => (prev - 1 + studyCards.length) % studyCards.length);
      }
    } else {
      setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }
    resetCardState();
  };

  const resetCardState = () => {
    setFlipped(false);
    setTypedAnswer('');
    setSelectedOption('');
    setFeedbackMessage('');
    setIsCorrect(null);
    setShowAnswer(false);
    
    // Generate new content for the current card based on study mode
    const card = getCurrentCard();
    if (card) {
      generateStudyContent(card);
    }
  };

  const getCurrentCard = (): Flashcard | null => {
    if (currentStudyMode === 'flip') {
      return studyCards[currentStudyIndex] || null;
    }
    return flashcards[currentIndex] || null;
  };

  const generateStudyContent = (card: Flashcard) => {
    switch (currentStudyMode) {
      case 'multiple_choice':
        generateMultipleChoiceOptions(card);
        break;
      case 'fill_in_blanks':
        generateFillInBlanks(card);
        break;
      case 'true_false':
        generateTrueFalseStatement(card);
        break;
    }
  };

  const generateMultipleChoiceOptions = (card: Flashcard) => {
    const correctAnswer = card.back;
    const incorrectOptions: string[] = [];
    
    // Get incorrect options from other flashcards
    const otherCards = flashcards.filter(c => c.back !== correctAnswer);
    const shuffledOthers = [...otherCards].sort(() => Math.random() - 0.5);
    
    // Take up to 3 incorrect options
    for (let i = 0; i < Math.min(3, shuffledOthers.length); i++) {
      incorrectOptions.push(shuffledOthers[i].back);
    }
    
    // If we don't have enough options, generate some variations
    while (incorrectOptions.length < 3) {
      const variation = generateAnswerVariation(correctAnswer);
      if (variation && !incorrectOptions.includes(variation)) {
        incorrectOptions.push(variation);
      } else {
        incorrectOptions.push(`Option ${incorrectOptions.length + 1}`);
      }
    }
    
    // Combine and shuffle all options
    const allOptions = [correctAnswer, ...incorrectOptions];
    setMultipleChoiceOptions(allOptions.sort(() => Math.random() - 0.5));
  };

  const generateAnswerVariation = (answer: string): string => {
    const words = answer.split(' ');
    if (words.length > 1) {
      // Replace a random word with "incorrect"
      const randomIndex = Math.floor(Math.random() * words.length);
      words[randomIndex] = 'incorrect';
      return words.join(' ');
    }
    return `Not ${answer}`;
  };

  const generateFillInBlanks = (card: Flashcard) => {
    const answer = card.back;
    // Split by non-alphanumeric characters to get actual words, then filter for length
    // This helps in correctly identifying words even if they have punctuation attached
    const rawWords = answer.split(/[^a-zA-Z0-9]+/).filter(word => word.length > 3);
    
    let chosenWord = '';
    let blankedAnswer = answer;

    if (rawWords.length > 0) {
      // Prioritize longer words for blanking to make the question more meaningful
      const candidateWords = rawWords.filter(word => word.length >= 5);
      if (candidateWords.length > 0) {
        chosenWord = candidateWords[Math.floor(Math.random() * candidateWords.length)];
      } else {
        // Fallback to any word longer than 3 characters if no longer words are found
        chosenWord = rawWords[Math.floor(Math.random() * rawWords.length)];
      }

      // Replace the chosen word in the original answer string
      // Use a regex that matches the whole word, case-insensitive, and only replaces the first occurrence
      const regex = new RegExp(`\\b${chosenWord}\\b`, 'gi'); // 'g' for global, 'i' for case-insensitive
      
      let replacedCount = 0;
      blankedAnswer = answer.replace(regex, (match) => {
        if (replacedCount === 0) { // Only replace the first instance found
          replacedCount++;
          return '______'; // The blank placeholder
        }
        return match; // Don't replace other occurrences of the same word
      });

      // If no replacement occurred (e.g., the chosen word was not found as a whole word,
      // or the regex failed for some reason), try another word if available.
      if (blankedAnswer === answer && rawWords.length > 1) {
        const otherWords = rawWords.filter(w => w !== chosenWord);
        if (otherWords.length > 0) {
          chosenWord = otherWords[Math.floor(Math.random() * otherWords.length)];
          const newRegex = new RegExp(`\\b${chosenWord}\\b`, 'gi');
          replacedCount = 0; // Reset count for new replacement attempt
          blankedAnswer = answer.replace(newRegex, (match) => {
            if (replacedCount === 0) {
              replacedCount++;
              return '______';
            }
            return match;
          });
        }
      }
    }

    // Final check: if no blank could be generated after attempts,
    // display the full answer and clear the blank word.
    if (blankedAnswer === answer || chosenWord === '') {
      setBlankedText(answer); // Display full answer as a fallback
      setBlankWord(''); // No specific word to fill in
      ErrorLogger.warn('Could not generate a suitable blank for this card. Displaying full answer', { component: 'FlashcardViewer', action: 'generateBlank', answerLength: answer.length });
    } else {
      setBlankedText(blankedAnswer);
      setBlankWord(chosenWord);
    }
  };

  const generateTrueFalseStatement = (card: Flashcard) => {
    const isTrue = Math.random() > 0.5;
    let statementText = '';
    let actualTruth = isTrue;

    if (isTrue) {
      // Construct a true statement asserting the Q&A pair
      statementText = `The answer to "${card.front}" is "${card.back}".`;
    } else {
      // Construct a false statement
      const otherAnswers = flashcards
        .filter(c => c.back !== card.back) // Find other answers to use as incorrect options
        .map(c => c.back);
      
      let incorrectAnswer = '';
      if (otherAnswers.length > 0) {
        // Pick a random incorrect answer from other flashcards
        incorrectAnswer = otherAnswers[Math.floor(Math.random() * otherAnswers.length)];
      } else {
        // Fallback if no other answers are available: state that the answer is different
        incorrectAnswer = `a different answer than "${card.back}"`;
      }
      statementText = `The answer to "${card.front}" is "${incorrectAnswer}".`;
      actualTruth = false; // The statement constructed is false
    }
    
    setTrueFalseStatement(`${t('flashcards.true')} ${t('common.or')} ${t('flashcards.false')}: ${statementText}`);
    setIsStatementTrue(actualTruth);
  };

  const handleStudyModeChange = (mode: StudyMode) => {
    setCurrentStudyMode(mode);
    
    if (mode === 'flip') {
      initializeStudySession();
    } else {
      resetCardState();
    }
  };

  const checkTypeAnswer = () => {
    const card = getCurrentCard();
    if (!card) return;
    
    const userAnswer = typedAnswer.trim().toLowerCase();
    const correctAnswer = card.back.trim().toLowerCase();
    const correct = userAnswer === correctAnswer;
    
    setIsCorrect(correct);
    setFeedbackMessage(
      correct 
        ? t('flashcards.correct_well_done')
        : t('flashcards.incorrect_answer', { answer: card.back })
    );
    setShowAnswer(true);
  };

  const checkMultipleChoice = () => {
    const card = getCurrentCard();
    if (!card || !selectedOption) return;
    
    const correct = selectedOption === card.back;
    setIsCorrect(correct);
    setFeedbackMessage(
      correct 
        ? t('flashcards.correct_well_done')
        : t('flashcards.incorrect_answer', { answer: card.back })
    );
    setShowAnswer(true);
  };

  const checkFillInBlanks = () => {
    if (!blankWord) return;
    
    const userAnswer = typedAnswer.trim().toLowerCase();
    const correctAnswer = blankWord.toLowerCase();
    const correct = userAnswer === correctAnswer;
    
    setIsCorrect(correct);
    setFeedbackMessage(
      correct 
        ? t('flashcards.correct_well_done')
        : t('flashcards.incorrect_missing_word', { word: blankWord })
    );
    setShowAnswer(true);
  };

  const checkTrueFalse = (userAnswer: boolean) => {
    const correct = userAnswer === isStatementTrue;
    setIsCorrect(correct);
    setFeedbackMessage(
      correct 
        ? t('flashcards.correct_well_done')
        : t('flashcards.statement_was', { value: isStatementTrue ? t('flashcards.true') : t('flashcards.false') })
    );
    setShowAnswer(true);
  };

  const handleStudyResponse = (difficulty: 'easy' | 'good' | 'hard' | 'learned') => {
    const currentStudyCard = studyCards[currentStudyIndex];
    if (!currentStudyCard) return;
    
    const cardId = flashcards.findIndex(card => card.front === currentStudyCard.front && card.back === currentStudyCard.back);
    const rating = difficulty === 'learned' ? 'easy' : difficulty;
    
    // Track reviewed cards and update progress
    const newStudiedCards = new Set([...studiedCards, cardId]);
    setStudiedCards(newStudiedCards);
    setStudyProgress(prev => ({ ...prev, [difficulty]: prev[difficulty] + 1 }));
    setCardsStudiedInSession(prev => prev + 1);

    if (user && cardId >= 0 && (rating === 'easy' || rating === 'good' || rating === 'hard')) {
      recordFlashcardRating(user.id, {
        itemId,
        flashcardIndex: cardId,
        flashcardFront: currentStudyCard.front,
        userRating: rating,
        studyMode: currentStudyMode,
        timeSpentSeconds: 0
      });
    }

    // Check if all cards have been reviewed for the first time
    if (newStudiedCards.size === flashcards.length && !showNotification) {
      setShowNotification(true);
      setNotificationMessage(t('flashcards.notification_all_cards_rated'));
      
      // Auto-hide notification after 4 seconds
      setTimeout(() => {
        setShowNotification(false);
        setNotificationMessage('');
      }, 4000);
    }

    // Advance to next card (loop back to beginning if at end)
    const nextIndex = (currentStudyIndex + 1) % studyCards.length;
    setCurrentStudyIndex(nextIndex);

    resetCardState();
  };

  const exportAsCSV = () => {
    const csvContent = [`${t('common.question')},${t('common.answer')}`, ...flashcards.map(card => `"${card.front.replace(/"/g, '""')}","${card.back.replace(/"/g, '""')}"`)].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcards-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsTxt = () => {
    const content = `${t('common.flashcards').toUpperCase()}\n${'='.repeat(50)}\n\n${flashcards.map((card, index) => `${t('flashcards.card')} ${index + 1}:\nQ: ${card.front}\nA: ${card.back}`).join('\n\n')}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcards-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shuffleCards = () => {
    if (currentStudyMode === 'flip') {
      initializeStudySession();
    }
  };

  const currentCard = getCurrentCard();
  const totalCards = currentStudyMode === 'flip' ? studyCards.length : flashcards.length;
  const currentCardIndex = currentStudyMode === 'flip' ? currentStudyIndex : currentIndex;

  // Initialize content when component mounts or mode changes
  React.useEffect(() => {
    if (currentCard) {
      generateStudyContent(currentCard);
    }
  }, [currentStudyMode, currentIndex, currentStudyIndex]);

  const studySessionComplete = false;

  const getStudyModeIcon = (mode: StudyMode) => {
    switch (mode) {
      case 'flip': return RotateCcw;
      case 'type_answer': return Edit3;
      case 'multiple_choice': return List;
      case 'fill_in_blanks': return FileText;
      case 'true_false': return HelpCircle;
      default: return BookOpen;
    }
  };

  const getStudyModeLabel = (mode: StudyMode) => {
    switch (mode) {
      case 'flip': return t('flashcards.flip_cards');
      case 'type_answer': return t('flashcards.type_answer');
      case 'multiple_choice': return t('flashcards.multiple_choice');
      case 'fill_in_blanks': return t('flashcards.fill_blanks');
      case 'true_false': return t('flashcards.true_false');
      default: return t('flashcards.flip_cards');
    }
  };

  if (showAll) {
    return (
      <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm`}>
        <div className={`p-6 border-b ${getThemeCardBorder()}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${
                medicalMode
                  ? 'bg-red-50 dark:bg-red-900/20 dark:from-red-600 dark:to-pink-700'
                  : getThemeGradient('ui')
              }`}>
                {medicalMode ? (
                  <Stethoscope className="h-5 w-5 text-white" />
                ) : (
                  <Eye className="h-5 w-5 text-white" />
                )}
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                  {medicalMode ? '🏥 All Medical Flashcards' : t('flashcards.all_flashcards')}
                </h3>
                <p className={`text-sm ${getThemeTextMuted()}`}>
                  {flashcards.length} {medicalMode ? 'clinical cards total' : t('flashcards.cards_total')}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowAll(false)}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm text-purple-600 hover:text-purple-800 transition duration-150"
            >
              <EyeOff className="h-4 w-4" />
              <span>{t('flashcards.card_view')}</span>
            </button>
          </div>
        </div>

        <div className="p-6 max-h-96 overflow-y-auto">
          <div className="space-y-4">
            {flashcards.map((card, index) => (
              <div key={index} className={`border ${getThemeCardBorder()} rounded-lg p-4`}>
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-sm font-medium ${getThemeTextMuted()}`}>{t('flashcards.card')} {index + 1}</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className={`text-sm font-medium ${getThemeTextSecondary()}`}>Q: </span>
                    <span className={getThemeTextPrimary()}>{card.front}</span>
                  </div>
                  <div>
                    <span className={`text-sm font-medium ${getThemeTextSecondary()}`}>A: </span>
                    <span className={getThemeTextPrimary()}>{card.back}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${getThemeCardBg()} rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] ${getThemeCardBorder()} dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm dark:shadow-none`}>
      <div className={`p-6 border-b ${getThemeCardBorder()}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              medicalMode
                ? 'bg-red-50 dark:bg-red-900/20 dark:from-red-600 dark:to-pink-700'
                : getThemeGradient('ui')
            }`}>
              {medicalMode ? (
                <Stethoscope className="h-5 w-5 text-white" />
              ) : (
                React.createElement(getStudyModeIcon(currentStudyMode), { className: "h-5 w-5 text-white" })
              )}
            </div>
            <div> {/* Apply dark mode classes to header text */}
              <h3 className={`text-lg font-semibold ${getThemeTextPrimary()}`}>
                {medicalMode ? `🩺 Medical ${getStudyModeLabel(currentStudyMode)}` : getStudyModeLabel(currentStudyMode)}
              </h3>
              <p className={`text-sm ${getThemeTextMuted()}`}>
                {currentStudyMode === 'flip' 
                  ? medicalMode
                    ? `${totalCards} clinical cards remaining • ${studiedCards.size} reviewed`
                    : `${totalCards} ${t('flashcards.cards_remaining')} • ${studiedCards.size} ${t('flashcards.reviewed')}`
                  : medicalMode
                    ? `Clinical Card ${currentCardIndex + 1} of ${totalCards}`
                    : t('flashcards.card_of', { current: currentCardIndex + 1, total: totalCards })
                }
              </p>
              {/* Medical Mode Study Mode Selection */}
              {medicalMode && currentStudyMode === 'flip' && (
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`text-xs font-medium ${getThemeTextMuted()}`}>Focus:</span>
                  <select
                    value={medicalStudyMode}
                    onChange={(e) => setMedicalStudyMode(e.target.value as MedicalStudyMode)}
                    className="text-xs px-2 py-1 border border-red-300 rounded bg-red-50 text-red-800 focus:outline-none dark:border-red-600 dark:bg-red-900 dark:text-red-200"
                  >
                    <option value="clinical_cases">🏥 Clinical Cases</option>
                    <option value="pathophysiology">🧬 Pathophysiology</option>
                    <option value="pharmacology">💊 Pharmacology</option>
                    <option value="differential_diagnosis">🔍 Differential Diagnosis</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Study Mode Selector — pill tabs */}
            <div className={`flex items-center gap-0.5 ${getThemeSubtle('bg')} rounded-full p-1`}>
              {(['flip', 'type_answer', 'multiple_choice', 'fill_in_blanks', 'true_false'] as StudyMode[]).map((mode) => {
                const Icon = getStudyModeIcon(mode);
                const isActive = currentStudyMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => handleStudyModeChange(mode)}
                    className={`p-1.5 rounded-full transition-colors ${
                      isActive
                        ? `${getThemeCardBg()} shadow-sm text-blue-600 dark:text-blue-400`
                        : `${getThemeTextMuted()} hover:bg-black/5 dark:hover:bg-white/5`
                    }`}
                    title={getStudyModeLabel(mode)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Export Dropdown */}
            <div className="relative group">
              <button className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-full transition-colors ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5`}>
                <Download className="h-3.5 w-3.5" />
                <span>{t('flashcards.export')}</span>
              </button>

              <div className={`absolute right-0 mt-1 w-40 ${getThemeCardBg()} border ${getThemeCardBorder()} rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-10`}>
                <div className="p-1">
                  <button
                    onClick={exportAsCSV}
                    className={`w-full text-left px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                  >
                    {medicalMode ? 'Export for Anki' : t('flashcards.export_csv')}
                  </button>
                  <button
                    onClick={exportAsTxt}
                    className={`w-full text-left px-3 py-2 text-sm ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors`}
                  >
                    {medicalMode ? 'Export Study Guide' : t('flashcards.export_txt')}
                  </button>
                </div>
              </div>
            </div>

            {currentStudyMode === 'flip' ? (
              <button
                onClick={shuffleCards}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-full transition-colors ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5`}
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>{t('flashcards.restart')}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowAll(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-full transition-colors ${getThemeCardBorder()} ${getThemeTextSecondary()} hover:bg-black/5 dark:hover:bg-white/5`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{t('flashcards.view_all')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        {studySessionComplete ? (
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4 dark:text-green-400" />
            <h3 className={`text-xl font-semibold ${getThemeTextPrimary()} mb-2`}>{t('flashcards.session_complete')}</h3>
            <p className={`${getThemeTextSecondary()} mb-4`}>
              {studiedCards.size === 1 ? t('flashcards.reviewed_cards', { count: studiedCards.size }) : t('flashcards.reviewed_cards_plural', { count: studiedCards.size })}
            </p>
            
            <div className="flex justify-center space-x-6 mb-6 text-sm">
              <div className="text-green-600 dark:text-green-400">
                <BarChart className="h-4 w-4 inline mr-1" />
                {studyProgress.easy} {t('flashcards.easy')}
              </div>
              <div className="text-blue-600 dark:text-blue-400">
                <BarChart className="h-4 w-4 inline mr-1" />
                {studyProgress.good} {t('flashcards.good')}
              </div>
              <div className="text-red-600 dark:text-red-400">
                <BarChart className="h-4 w-4 inline mr-1" />
                {studyProgress.hard} {t('flashcards.hard')}
              </div>
              <div className="text-purple-600 dark:text-purple-400">
                <BarChart className="h-4 w-4 inline mr-1" />
                {studyProgress.learned} {t('flashcards.learned')}
              </div>
            </div>
            
            <button
              onClick={() => setCurrentStudyMode('flip')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {t('flashcards.return_flashcards')}
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Flip Mode */}
            {currentStudyMode === 'flip' && !studySessionComplete && (
              <div
                className={`relative w-full h-72 cursor-pointer transition-transform duration-500 transform-style-preserve-3d ${
                  flipped ? 'rotate-y-180' : ''
                }`}
                onClick={() => setFlipped(!flipped)}
              >
                {/* Front face */}
                <div className={`absolute inset-0 w-full h-full backface-hidden rounded-2xl overflow-hidden flex flex-col ${getThemeCardBg()} border-2 ${
                  medicalMode ? 'border-red-100 dark:border-red-900' : 'border-blue-100 dark:border-blue-900/50'
                }`}>
                  {/* Accent bar */}
                  <div className={`h-1 w-full flex-shrink-0 ${
                    medicalMode
                      ? 'bg-gradient-to-r from-red-400 to-pink-500'
                      : 'bg-gradient-to-r from-blue-400 to-indigo-500'
                  }`} />
                  <div className="flex-1 flex items-center justify-center p-6 relative">
                    <div
                      className="absolute top-2 right-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ReadAloudButton
                        text={currentCard?.front ?? ''}
                      />
                    </div>
                    <div className="text-center">
                      <p className={`text-xs font-medium uppercase tracking-widest mb-3 opacity-40 ${getThemeTextPrimary()}`}>
                        {medicalMode ? 'Clinical Question' : t('flashcards.question') || 'Question'}
                      </p>
                      <p className={`text-base font-medium leading-relaxed ${getThemeTextPrimary()}`}>{currentCard?.front}</p>
                      <p className={`text-xs mt-4 opacity-40 ${getThemeTextMuted()}`}>
                        {medicalMode ? 'Tap to reveal clinical answer' : t('flashcards.click_reveal')}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Back face */}
                <div className={`absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-2xl overflow-hidden flex flex-col ${getThemeCardBg()} border-2 ${
                  medicalMode ? 'border-emerald-100 dark:border-emerald-900' : 'border-emerald-100 dark:border-emerald-900/50'
                }`}>
                  {/* Accent bar */}
                  <div className="h-1 w-full flex-shrink-0 bg-gradient-to-r from-emerald-400 to-teal-500" />
                  <div className="flex-1 flex items-center justify-center p-6 relative">
                    <div
                      className="absolute top-2 right-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ReadAloudButton
                        text={currentCard?.back ?? ''}
                      />
                    </div>
                    <div className="text-center">
                      <p className={`text-xs font-medium uppercase tracking-widest mb-3 opacity-40 ${getThemeTextPrimary()}`}>
                        {medicalMode ? 'Clinical Answer' : t('flashcards.answer') || 'Answer'}
                      </p>
                      <p className={`text-base font-medium leading-relaxed ${getThemeTextPrimary()}`}>{currentCard?.back}</p>
                      <p className={`text-xs mt-4 opacity-40 ${getThemeTextMuted()}`}>
                        {medicalMode ? 'Rate your clinical understanding' : t('flashcards.rate_understanding')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rating buttons for Flip Cards mode */}
            {currentStudyMode === 'flip' && flipped && !studySessionComplete && (
              <div className="mt-5 flex justify-center gap-2 flex-wrap">
                <button
                  onClick={() => handleStudyResponse('hard')}
                  className="px-4 py-1.5 rounded-full text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                >
                  {medicalMode ? 'Need Review' : t('flashcards.hard')}
                </button>
                <button
                  onClick={() => handleStudyResponse('good')}
                  className="px-4 py-1.5 rounded-full text-sm font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
                >
                  {medicalMode ? 'Understand' : t('flashcards.good')}
                </button>
                <button
                  onClick={() => handleStudyResponse('easy')}
                  className="px-4 py-1.5 rounded-full text-sm font-medium border border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30 transition-colors"
                >
                  {medicalMode ? 'Know Well' : t('flashcards.easy')}
                </button>
                <button
                  onClick={() => handleStudyResponse('learned')}
                  className="px-4 py-1.5 rounded-full text-sm font-medium border border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/30 transition-colors"
                >
                  {medicalMode ? 'Mastered' : t('flashcards.learned')}
                </button>
              </div>
            )}

            {/* Type Answer Mode */}
            {currentStudyMode === 'type_answer' && (
              <div className="space-y-6">
                <div className={`rounded-md p-6 text-white ${
                  medicalMode
                    ? 'bg-gradient-to-br from-red-600 to-pink-700 dark:from-red-700 dark:to-pink-800'
                    : 'bg-gradient-to-br from-purple-500 to-indigo-600 dark:from-purple-700 dark:to-indigo-800'
                }`}>
                  <h4 className="text-lg font-medium mb-2">
                    {medicalMode ? '🩺 Clinical Question:' : t('flashcards.question')}
                  </h4>
                  <p className={medicalMode ? 'text-red-100' : 'text-purple-100'}>
                    {currentCard?.front}
                  </p>
                </div>
                
                <div className="space-y-4">
                  <textarea
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder={medicalMode ? 'Type your clinical answer...' : t('flashcards.type_answer_here')}
                    className={`w-full h-24 px-4 py-3 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                    disabled={showAnswer}
                  />
                  
                  {!showAnswer ? (
                    <button
                      onClick={checkTypeAnswer}
                      disabled={!typedAnswer.trim()}
                      className={`w-full py-3 px-4 text-white rounded-lg focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ${
                        medicalMode
                          ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800'
                          : 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500 dark:bg-purple-700 dark:hover:bg-purple-800'
                      }`}
                    >
                      {medicalMode ? '🔍 Check Clinical Answer' : t('flashcards.check_answer')}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200 dark:bg-green-900 dark:border-green-700' : 'bg-red-50 border border-red-200 dark:bg-red-900 dark:border-red-700'}`}>
                        <p className={`font-medium ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                          {feedbackMessage}
                        </p>
                      </div>
                      {!isCorrect && currentCard && (
                        <div>
                          {!explanation && !loadingExplanation && (
                            <button
                              onClick={() => fetchExplanation(currentCard.front, currentCard.back)}
                              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              <MessageCircleQuestion className="h-4 w-4" />
                              {t('flashcard_explain.why')}
                            </button>
                          )}
                          {loadingExplanation && <p className="text-sm text-gray-500">{t('flashcard_explain.loading')}</p>}
                          {explanation && (
                            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/50 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200">
                              {explanation}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => { nextCard(); setExplanation(''); }}
                        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {t('flashcards.next_card')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Multiple Choice Mode */}
            {currentStudyMode === 'multiple_choice' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-md p-6 text-white dark:from-green-700 dark:to-emerald-800">
                  <h4 className="text-lg font-medium mb-2">{t('flashcards.question')}</h4>
                  <p className="text-green-100">{currentCard?.front}</p>
                </div>
                
                <div className="space-y-4">
                  <div className="grid gap-3">
                    {multipleChoiceOptions.map((option, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedOption(option)}
                        disabled={showAnswer}
                        className={`p-4 text-left border rounded-lg transition duration-150 ${
                          selectedOption === option
                            ? 'border-green-500 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900 dark:text-green-300'
                            : `${getThemeCardBorder()} hover:opacity-60 ${getThemeCardBg()} ${getThemeTextPrimary()}`
                        } ${
                          showAnswer && option === currentCard?.back
                            ? 'border-green-500 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-900 dark:text-green-300'
                            : showAnswer && selectedOption === option && option !== currentCard?.back // Incorrect selected answer
                            ? 'border-red-500 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900 dark:text-red-300'
                            : ''
                        }`}
                      >
                        <span className="font-medium mr-3">{String.fromCharCode(65 + index)}.</span>
                        {option}
                      </button>
                    ))}
                  </div>
                  
                  {!showAnswer ? (
                    <button
                      onClick={checkMultipleChoice}
                      disabled={!selectedOption}
                      className="w-full py-3 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 dark:bg-green-700 dark:hover:bg-green-800"
                    >
                      {t('flashcards.submit_answer')}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200 dark:bg-green-900 dark:border-green-700' : 'bg-red-50 border border-red-200 dark:bg-red-900 dark:border-red-700'}`}>
                        <p className={`font-medium ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                          {feedbackMessage}
                        </p>
                      </div>
                      {!isCorrect && currentCard && (
                        <div>
                          {!explanation && !loadingExplanation && (
                            <button onClick={() => fetchExplanation(currentCard.front, currentCard.back)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                              <MessageCircleQuestion className="h-4 w-4" />{t('flashcard_explain.why')}
                            </button>
                          )}
                          {loadingExplanation && <p className="text-sm text-gray-500">{t('flashcard_explain.loading')}</p>}
                          {explanation && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/50 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200">{explanation}</div>}
                        </div>
                      )}
                      <button
                        onClick={() => { nextCard(); setExplanation(''); }}
                        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {t('flashcards.next_card')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fill in Blanks Mode */}
            {currentStudyMode === 'fill_in_blanks' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-md p-6 text-white dark:from-orange-700 dark:to-red-800">
                  <h4 className="text-lg font-medium mb-2">{t('flashcards.question')}</h4>
                  <p className="text-orange-100">{currentCard?.front}</p>
                </div>
                
                <div className="space-y-4">
                  <div className={`${getThemeSubtle('bg')} rounded-lg p-4`}>
                    <h4 className={`text-sm font-medium ${getThemeTextSecondary()} mb-2`}>{t('flashcards.fill_blank')}</h4>
                    <p className={`text-lg ${getThemeTextPrimary()}`}>{blankedText}</p>
                  </div>
                  
                  <input
                    type="text"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder={t('flashcards.enter_missing_word')}
                    className={`w-full px-4 py-3 ${getThemeCardBorder()} rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${getThemeCardBg()} ${getThemeTextPrimary()}`}
                    disabled={showAnswer}
                  />
                  
                  {!showAnswer ? (
                    <button
                      onClick={checkFillInBlanks}
                      disabled={!typedAnswer.trim()}
                      className="w-full py-3 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 dark:bg-orange-700 dark:hover:bg-orange-800"
                    >
                      {t('flashcards.check_answer')}
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200 dark:bg-green-900 dark:border-green-700' : 'bg-red-50 border border-red-200 dark:bg-red-900 dark:border-red-700'}`}>
                        <p className={`font-medium ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                          {feedbackMessage}
                        </p>
                      </div>
                      {!isCorrect && currentCard && (
                        <div>
                          {!explanation && !loadingExplanation && (
                            <button onClick={() => fetchExplanation(currentCard.front, currentCard.back)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                              <MessageCircleQuestion className="h-4 w-4" />{t('flashcard_explain.why')}
                            </button>
                          )}
                          {loadingExplanation && <p className="text-sm text-gray-500">{t('flashcard_explain.loading')}</p>}
                          {explanation && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/50 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200">{explanation}</div>}
                        </div>
                      )}
                      <button
                        onClick={() => { nextCard(); setExplanation(''); }}
                        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {t('flashcards.next_card')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* True/False Mode */}
            {currentStudyMode === 'true_false' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-md p-6 text-white dark:from-indigo-700 dark:to-purple-800">
                  <h4 className="text-lg font-medium mb-4">{t('flashcards.statement')}:</h4>
                  <p className="text-indigo-100 text-lg">{trueFalseStatement}</p>
                </div>
                
                <div className="space-y-4">
                  {!showAnswer ? (
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => checkTrueFalse(true)}
                        className="py-4 px-6 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-150 font-medium dark:bg-green-700 dark:hover:bg-green-800"
                      >
                        {t('flashcards.true')}
                      </button>
                      <button
                        onClick={() => checkTrueFalse(false)}
                        className="py-4 px-6 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-150 font-medium dark:bg-red-700 dark:hover:bg-red-800"
                      >
                        {t('flashcards.false')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200 dark:bg-green-900 dark:border-green-700' : 'bg-red-50 border border-red-200 dark:bg-red-900 dark:border-red-700'}`}>
                        <p className={`font-medium ${isCorrect ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                          {feedbackMessage}
                        </p>
                      </div>
                      {!isCorrect && currentCard && (
                        <div>
                          {!explanation && !loadingExplanation && (
                            <button onClick={() => fetchExplanation(currentCard.front, currentCard.back)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                              <MessageCircleQuestion className="h-4 w-4" />{t('flashcard_explain.why')}
                            </button>
                          )}
                          {loadingExplanation && <p className="text-sm text-gray-500">{t('flashcard_explain.loading')}</p>}
                          {explanation && <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/50 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200">{explanation}</div>}
                        </div>
                      )}
                      <button
                        onClick={() => { nextCard(); setExplanation(''); }}
                        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        {t('flashcards.next_card')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation buttons for non-flip modes */}
            {currentStudyMode !== 'flip' && (
              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={prevCard}
                  disabled={flashcards.length <= 1}
                  className={`flex items-center space-x-2 px-4 py-2 ${getThemeTextSecondary()} hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150`}
                >
                  <ChevronLeft className="h-5 w-5" />
                  <span>{t('flashcards.previous')}</span>
                </button>

                <div className="flex space-x-2">
                  {flashcards.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentIndex(index);
                        resetCardState();
                      }}
                      className={`w-2 h-2 rounded-full transition duration-150 ${ // Apply dark mode classes to pagination dots
                        index === currentIndex ? 'bg-cyan-500 dark:bg-cyan-400' : `${getThemeTextMuted()} hover:opacity-60`
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={nextCard}
                  disabled={flashcards.length <= 1}
                  className={`flex items-center space-x-2 px-4 py-2 ${getThemeTextSecondary()} hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150`}
                >
                  <span>{t('flashcards.next')}</span>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notification */}
      {showNotification && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow flex items-center space-x-3 animate-pulse dark:bg-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">{notificationMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Wrapper component that checks context availability
export const FlashcardViewer: React.FC<FlashcardViewerProps> = (props) => {
  // Check if context is available before rendering
  const i18nContext = useContext(I18nContext);
  
  // If context is not available, don't render (this should never happen in normal flow)
  if (!i18nContext) {
    console.warn('FlashcardViewer: I18nContext not available, skipping render');
    return null;
  }
  
  // Context is available, render the component
  return <FlashcardViewerContent {...props} />;
};