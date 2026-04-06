import React, { useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ErrorLogger } from '../../utils/errorLogger';
import { useTheme } from '../../contexts/ThemeContext';

interface Question {
  question: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
}

interface AIQuestionGeneratorProps {
  onQuestionsGenerated: (questions: Question[]) => void;
  onCancel: () => void;
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export const AIQuestionGenerator: React.FC<AIQuestionGeneratorProps> = ({
  onQuestionsGenerated,
  onCancel,
  questionCount,
  difficulty
}) => {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [generating, setGenerating] = useState(false);
  const { getThemeGradient } = useTheme();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const subjects = [
    'General Knowledge',
    'Science',
    'Mathematics',
    'History',
    'Geography',
    'Literature',
    'Arts',
    'Technology',
    'Sports',
    'Entertainment',
    'Business',
    'Health'
  ];

  const handleGenerate = async () => {
    if (!topic.trim() || topic.trim().length < 3) {
      setError('Please enter a topic (at least 3 characters)');
      return;
    }

    setGenerating(true);
    setProgress(10);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to generate questions');
      }

      setProgress(30);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-brain-rush-questions`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topic.trim(),
          questionCount,
          difficulty,
          subject: subject || undefined
        })
      });

      setProgress(70);

      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(errorData.error || 'Failed to generate questions');
        ErrorLogger.error(error, { component: 'AIQuestionGenerator', action: 'handleGenerate', metadata: { questionCount, difficulty } });
        throw error;
      }

      const result = await response.json();

      ErrorLogger.debug('Backend response received', {
        component: 'AIQuestionGenerator',
        action: 'handleGenerateQuestions',
        metadata: {
          hasSuccess: 'success' in result,
          successValue: result.success,
          hasQuestions: 'questions' in result,
          questionCount: result.questions?.length,
          hasQuestionCount: 'questionCount' in result,
        },
      });

      if (!result.success) {
        const errorMsg = result.error || 'Question generation was not successful';
        const error = new Error(errorMsg);
        ErrorLogger.error(error, {
          component: 'AIQuestionGenerator',
          action: 'generateQuestions',
          metadata: { topic, subject, questionCount, difficulty },
        });
        throw error;
      }

      if (!result.questions || !Array.isArray(result.questions)) {
        const error = new Error('Invalid response: questions array is missing or malformed');
        ErrorLogger.error(error, {
          component: 'AIQuestionGenerator',
          action: 'generateQuestions',
          metadata: { topic, subject, result },
        });
        throw error;
      }

      if (result.questions.length === 0) {
        const error = new Error('No questions were generated. Please try again.');
        ErrorLogger.error(error, {
          component: 'AIQuestionGenerator',
          action: 'generateQuestions',
          metadata: { topic, subject, questionCount },
        });
        throw error;
      }

      ErrorLogger.info('Validation passed. Questions generated', {
        component: 'AIQuestionGenerator',
        action: 'handleGenerateQuestions',
        metadata: {
          questionCount: result.questions.length,
          firstQuestion: result.questions[0],
        },
      });

      setProgress(100);

      setTimeout(() => {
        ErrorLogger.debug('Passing questions to parent component', {
          component: 'AIQuestionGenerator',
          action: 'handleGenerateQuestions',
          metadata: { questionCount: result.questions.length },
        });
        onQuestionsGenerated(result.questions);
      }, 500);

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      ErrorLogger.error(error, {
        component: 'AIQuestionGenerator',
        action: 'generateQuestions',
        metadata: { topic, subject, questionCount, difficulty },
      });
      let errorMessage = 'Failed to generate questions';
      if (err instanceof Error) {
        errorMessage = err.message;
        // Check for specific error types
        if (err.message.includes('token limit')) {
          errorMessage = err.message; // Keep the detailed token limit message
        } else if (err.message.includes('ANTHROPIC_API_KEY')) {
          errorMessage = 'AI service configuration error. Please contact support.';
        } else if (err.message.includes('NetworkError') || err.message.includes('Failed to fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
      }
      setError(errorMessage);
      setGenerating(false);
      setProgress(0);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">AI Question Generator</h2>
        <p className="text-gray-600 dark:text-gray-400">Let AI create questions about any topic</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-8">
        {!generating ? (
          <div className="space-y-6">
            {/* Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Topic *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Ancient Rome, Photosynthesis, World War II..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Be specific for better questions
              </p>
            </div>

            {/* Subject Category (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Subject Category (Optional)
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              >
                <option value="">Any Subject</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Settings Display */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Generation Settings</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Questions:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">{questionCount}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Difficulty:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-gray-100 capitalize">{difficulty}</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-900 dark:text-red-200">Generation Failed</h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!topic.trim() || topic.trim().length < 3}
                className={`flex-1 px-6 py-3 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2`}
              >
                <Sparkles className="h-5 w-5" />
                <span>Generate Questions</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="relative inline-block mb-6">
              <Loader2 className="h-16 w-16 text-purple-600 dark:text-purple-400 animate-spin" />
              <Sparkles className="h-8 w-8 text-pink-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Generating Questions...
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              AI is creating {questionCount} questions about "{topic}"
            </p>

            {/* Progress Bar */}
            <div className="max-w-md mx-auto mb-4">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getThemeGradient('ui')} transition-colors duration-150 ease-out`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              This may take a few moments...
            </p>
          </div>
        )}
      </div>

      {/* Tips Section */}
      {!generating && (
        <div className={`mt-6 ${getThemeGradient('bg')} rounded-md p-6`}>
          <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <span>Tips for Better Questions</span>
          </h4>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start space-x-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
              <span>Be specific: "Causes of World War I" is better than just "History"</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
              <span>Choose the right difficulty: Easy = basic facts, Hard = complex analysis</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
              <span>Add a subject category to get more focused questions</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
