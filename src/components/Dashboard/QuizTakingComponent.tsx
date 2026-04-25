import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, ArrowRight, ArrowLeft, Flag, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../contexts/I18nContext';
import { useToast } from '../Toast/Toast';
import { handleApiError, handleSupabaseError } from '../../utils/errorHandler';
import { ErrorLogger } from '../../utils/errorLogger';
import { ReadAloudButton } from './ReadAloud/ReadAloudButton';

type QuestionKind = 'multiple_choice' | 'true_false' | 'fill_in_blank' | 'open_ended';

interface Question {
  index: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  type?: QuestionKind;
}

function getQuestionKind(q: Question): QuestionKind {
  const x = q.type;
  if (x === 'true_false' || x === 'fill_in_blank' || x === 'open_ended' || x === 'multiple_choice') return x;
  return 'multiple_choice';
}

function validateQuestionShape(q: Question, i: number): string | null {
  if (!q.question?.trim()) return `Question ${i + 1} is missing text.`;
  const kind = getQuestionKind(q);
  if (!q.correct_answer?.trim()) return `Question ${i + 1} is missing an expected answer.`;
  if (kind === 'open_ended' || kind === 'fill_in_blank') {
    if (!Array.isArray(q.options)) return `Question ${i + 1} has invalid options.`;
    return null;
  }
  if (!Array.isArray(q.options) || q.options.length < 2) {
    return `Question ${i + 1} needs at least two answer choices.`;
  }
  return null;
}

function normalizeAnswerStatic(answer: string): string {
  return answer
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"()-]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function openEndedLooseMatch(userRaw: string, rubricRaw: string): boolean {
  const u = normalizeAnswerStatic(userRaw);
  const r = normalizeAnswerStatic(rubricRaw);
  if (!u || u.length < 2) return false;
  if (u === r) return true;
  if (r.includes(u) || u.includes(r)) return true;
  const words = r.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return u.length >= 8;
  const hits = words.filter((w) => u.includes(w)).length;
  return hits >= Math.min(2, Math.max(1, Math.ceil(words.length * 0.35)));
}

function isUserAnswerCorrect(q: Question, userAnswer: string | undefined): boolean {
  if (!userAnswer?.trim()) return false;
  const kind = getQuestionKind(q);
  const u = normalizeAnswerStatic(userAnswer);
  const c = normalizeAnswerStatic(q.correct_answer);
  if (kind === 'open_ended') return openEndedLooseMatch(userAnswer, q.correct_answer);
  if (kind === 'fill_in_blank') return u === c || u.includes(c) || c.includes(u);
  return u === c;
}

interface QuizTakingProps {
  quizId: string;
  onComplete: () => void;
  onExit: () => void;
}

export const QuizTakingComponent: React.FC<QuizTakingProps> = ({ quizId, onComplete, onExit }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const { error: showErrorToast, info: showInfoToast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [startTime] = useState<Date>(new Date());
  const [isSubmitted, setIsSubmitted] = useState(false);
  interface QuizResults {
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    scorePercentage: number;
    timeTaken: number;
  }

  const [results, setResults] = useState<QuizResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizTitle, setQuizTitle] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['en']);
  const [translatedQuestions, setTranslatedQuestions] = useState<Record<string, Question[]>>({});

  useEffect(() => {
    fetchQuizData();
  }, [quizId]);

  useEffect(() => {
    if (timeLimit && timeRemaining !== null && timeRemaining > 0 && !isSubmitted) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [timeLimit, timeRemaining, isSubmitted]);

  const fetchQuizData = async () => {
    if (!user) return;

    try {
      ErrorLogger.debug('Fetching quiz data', { component: 'QuizTakingComponent', action: 'fetchQuizData', metadata: { quizId } });
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('quiz_title, time_limit_minutes, questions_json, quiz_language, available_languages, translated_questions_json')
        .eq('id', quizId)
        .single();

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        ErrorLogger.error(err, { component: 'QuizTakingComponent', action: 'loadQuiz', metadata: { quizId } });
        throw error;
      }

      if (!data) {
        throw new Error('Quiz not found');
      }

      ErrorLogger.debug('Quiz data loaded', { component: 'QuizTakingComponent', action: 'fetchQuizData', metadata: { quizId, quizTitle: data.quiz_title } });

      if (!data.questions_json || !Array.isArray(data.questions_json) || data.questions_json.length === 0) {
        const error = new Error(t('quiz.no_questions_error'));
        ErrorLogger.error(error, { component: 'QuizTakingComponent', action: 'loadQuiz', metadata: { quizId } });
        throw error;
      }

      const questions = data.questions_json as Question[];

      setCurrentLanguage(data.quiz_language || 'en');
      setAvailableLanguages(data.available_languages || ['en']);
      setTranslatedQuestions(data.translated_questions_json || {});
      ErrorLogger.debug('Questions loaded', { component: 'QuizTakingComponent', action: 'fetchQuizData', metadata: { questionCount: questions.length } });

      for (let i = 0; i < questions.length; i++) {
        const errMsg = validateQuestionShape(questions[i], i);
        if (errMsg) {
          const error = new Error(errMsg);
          ErrorLogger.error(error, { component: 'QuizTakingComponent', action: 'loadQuiz', metadata: { quizId, questionIndex: i } });
          throw error;
        }
      }

      setQuestions(questions);
      setQuizTitle(data.quiz_title);
      if (data.time_limit_minutes) {
        const totalSeconds = data.time_limit_minutes * 60;
        setTimeLimit(totalSeconds);
        setTimeRemaining(totalSeconds);
      }
      ErrorLogger.info('Quiz initialized successfully', { component: 'QuizTakingComponent', action: 'fetchQuizData', metadata: { quizId, questionCount: questions.length } });
    } catch (error) {
      const errorMessage = handleApiError(error, { component: 'QuizTakingComponent', action: 'fetchQuizData', metadata: { quizId } });
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizTakingComponent', action: 'fetchQuizData', metadata: { quizId } });
      showErrorToast(errorMessage);
      onExit();
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    setAnswers({
      ...answers,
      [currentQuestionIndex]: answer
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const ensureUserProfile = async () => {
    if (!user) return false;

    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizTakingComponent', action: 'ensureUserProfile' });
        return false;
      }

      if (!profile) {
        ErrorLogger.debug('User profile not found, creating one', { component: 'QuizTakingComponent', action: 'ensureUserProfile', userId: user.id });
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            total_quizzes_completed: 0,
            experience_points: 0,
            level: 1
          });

        if (insertError) {
          ErrorLogger.error(insertError instanceof Error ? insertError : new Error(String(insertError)), { component: 'QuizTakingComponent', action: 'ensureUserProfile', metadata: { step: 'createProfile' } });
          return false;
        }
        ErrorLogger.info('User profile created successfully', { component: 'QuizTakingComponent', action: 'ensureUserProfile', userId: user.id });
      }

      return true;
    } catch (error) {
      ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizTakingComponent', action: 'ensureUserProfile' });
      return false;
    }
  };

  const normalizeAnswer = (answer: string): string => {
    return answer
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:'"()-]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
  };

  const handleSubmit = async () => {
    if (!user) return;

    const endTime = new Date();
    const timeTaken = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    questions.forEach((question, index) => {
      const userAnswer = answers[index];
      if (!userAnswer) {
        unansweredCount++;
      } else if (normalizeAnswer(userAnswer) === normalizeAnswer(question.correct_answer)) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    });

    const scorePercentage = (correctCount / questions.length) * 100;

    try {
      ErrorLogger.debug('Ensuring user profile exists', { component: 'QuizTakingComponent', action: 'handleSubmit', userId: user.id, metadata: { quizId } });
      const profileReady = await ensureUserProfile();
      if (!profileReady) {
        ErrorLogger.warn('Could not verify user profile, but continuing with quiz submission', { component: 'QuizTakingComponent', action: 'handleSubmit', userId: user.id, metadata: { quizId } });
      }

      ErrorLogger.debug('Submitting quiz attempt', { component: 'QuizTakingComponent', action: 'handleSubmit', userId: user.id, metadata: { quizId, answersCount: Object.keys(answers).length, scorePercentage, correctCount, incorrectCount, unansweredCount, timeTaken } });

      const { data, error } = await supabase
        .from('quiz_attempts')
        .insert({
          quiz_session_id: quizId,
          user_id: user.id,
          answers_json: answers,
          score_percentage: scorePercentage,
          correct_count: correctCount,
          incorrect_count: incorrectCount,
          unanswered_count: unansweredCount,
          time_taken_seconds: timeTaken,
          started_at: startTime.toISOString()
        })
        .select()
        .single();

      if (error) {
        const errorMessage = handleSupabaseError(error, { component: 'QuizTakingComponent', action: 'handleSubmit', metadata: { quizId } });
        ErrorLogger.error(error instanceof Error ? error : new Error(String(error)), { component: 'QuizTakingComponent', action: 'handleSubmit', metadata: { quizId } });
        throw new Error(errorMessage);
      }

      ErrorLogger.info('Quiz attempt saved successfully', { component: 'QuizTakingComponent', action: 'handleSubmit', metadata: { quizId, attemptId: data.id } });

      setResults({
        correctCount,
        incorrectCount,
        unansweredCount,
        scorePercentage,
        timeTaken
      });
      setIsSubmitted(true);
    } catch (error) {
      const errorMessage = handleApiError(error, { component: 'QuizTakingComponent', action: 'handleSubmit', metadata: { quizId } });
      showErrorToast(errorMessage);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 dark:text-green-400';
    if (percentage >= 70) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const handleLanguageSwitch = async (newLanguage: string) => {
    if (newLanguage === currentLanguage) return;

    if (!availableLanguages.includes(newLanguage)) {
      showInfoToast(t('quiz.translating_please_wait'));
      return;
    }

    if (translatedQuestions[newLanguage]) {
      setQuestions(translatedQuestions[newLanguage]);
      setCurrentLanguage(newLanguage);
    } else {
      setCurrentLanguage(newLanguage);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('quiz.loading')}</p>
        </div>
      </div>
    );
  }

  if (isSubmitted && results) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-8">
            <div className="text-center mb-8">
              <div className={`text-6xl font-bold mb-4 ${getScoreColor(results.scorePercentage)}`}>
                {Math.round(results.scorePercentage)}%
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                {t('quiz.complete')}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">{quizTitle}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4 text-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-300 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-600 dark:text-green-300">{results.correctCount}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('quiz.correct')}</p>
              </div>

              <div className="bg-red-50 dark:bg-red-900 rounded-lg p-4 text-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-300 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-600 dark:text-red-300">{results.incorrectCount}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('quiz.incorrect')}</p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <AlertCircle className="h-8 w-8 text-gray-600 dark:text-gray-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">{results.unansweredCount}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('quiz.unanswered')}</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-8">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t('quiz.time_taken')}:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatTime(results.timeTaken)}
                </span>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('quiz.review_answers')}</h3>
              {questions.map((question, index) => {
                const userAnswer = answers[index];
                const isCorrect = userAnswer ? isUserAnswerCorrect(question, userAnswer) : false;
                const wasAnswered = !!userAnswer;

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-lg p-4 ${
                      !wasAnswered
                        ? 'border-gray-300 dark:border-gray-600'
                        : isCorrect
                        ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                        : 'border-red-500 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {index + 1}. {question.question}
                      </p>
                      {wasAnswered && (
                        isCorrect ? (
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 ml-2" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 ml-2" />
                        )
                      )}
                    </div>

                    <div className="space-y-1 text-sm">
                      {userAnswer && (
                        <p className={`${isCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                          {t('quiz.your_answer')}: {userAnswer}
                        </p>
                      )}
                      {!isCorrect && (
                        <p className="text-green-700 dark:text-green-300">
                          {t('quiz.correct_answer')}: {question.correct_answer}
                        </p>
                      )}
                      {question.explanation && (
                        <p className="text-gray-600 dark:text-gray-400 mt-2 italic">
                          {question.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex space-x-4">
              <button
                onClick={onComplete}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                {t('quiz.back_to_quizzes')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{quizTitle}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('quiz.question_progress', { current: currentQuestionIndex + 1, total: questions.length })}
              </p>
            </div>
            {availableLanguages.length > 1 && (
              <select
                value={currentLanguage}
                onChange={(e) => handleLanguageSwitch(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              >
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {t(`quiz.language_${lang}`)}
                  </option>
                ))}
              </select>
            )}
            {timeRemaining !== null && (
              <div className={`flex items-center space-x-2 ${timeRemaining < 60 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                <Clock className="h-5 w-5" />
                <span className="text-lg font-bold">{formatTime(timeRemaining)}</span>
              </div>
            )}
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-colors duration-150"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {t('quiz.answered')}: {answeredCount} / {questions.length}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-8">
          <div className="flex items-start gap-2 mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex-1">
              {currentQuestion.question}
            </h3>
            <ReadAloudButton text={currentQuestion.question} />
          </div>

          <div className="space-y-3 mb-8">
            {getQuestionKind(currentQuestion) === 'open_ended' || getQuestionKind(currentQuestion) === 'fill_in_blank' ? (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
                  {getQuestionKind(currentQuestion) === 'fill_in_blank'
                    ? t('quiz.your_answer_fill_blank')
                    : t('quiz.your_answer_open')}
                </label>
                <textarea
                  value={answers[currentQuestionIndex] || ''}
                  onChange={(e) => handleAnswerSelect(e.target.value)}
                  rows={getQuestionKind(currentQuestion) === 'open_ended' ? 5 : 2}
                  className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
                  placeholder={t('quiz.type_your_answer')}
                />
              </div>
            ) : (
              currentQuestion.options.map((option, index) => (
                <div
                  key={index}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleAnswerSelect(option)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnswerSelect(option)}
                  className={`w-full p-4 text-left rounded-lg border-2 transition-all cursor-pointer ${
                    answers[currentQuestionIndex] === option
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900 dark:text-gray-100 flex-1">{option}</span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <ReadAloudButton text={option} className="ml-2 flex-shrink-0" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t('quiz.previous')}</span>
            </button>

            <div className="flex space-x-2">
              <button
                onClick={onExit}
                className="px-6 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                {t('quiz.exit_quiz')}
              </button>

              {currentQuestionIndex === questions.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                >
                  <Flag className="h-4 w-4" />
                  <span>{t('quiz.submit')}</span>
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <span>{t('quiz.next')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('quiz.question_progress_label')}</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentQuestionIndex(index)}
                className={`h-10 w-10 rounded-lg font-medium transition-all ${
                  index === currentQuestionIndex
                    ? 'bg-blue-600 text-white'
                    : answers[index]
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
