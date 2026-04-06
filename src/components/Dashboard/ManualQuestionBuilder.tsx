import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Save } from 'lucide-react';
import { useToast } from '../Toast/Toast';
import { useTheme } from '../../contexts/ThemeContext';

interface Question {
  question: string;
  options: [string, string, string, string];
  correct_answer: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface ManualQuestionBuilderProps {
  onSaveQuestions: (questions: Question[], setName?: string) => void;
  onCancel: () => void;
  initialQuestions?: Question[];
}

export const ManualQuestionBuilder: React.FC<ManualQuestionBuilderProps> = ({
  onSaveQuestions,
  onCancel,
  initialQuestions = []
}) => {
  const { error: showErrorToast } = useToast();
  const { getThemeGradient } = useTheme();
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentOptions, setCurrentOptions] = useState<[string, string, string, string]>(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState<number>(0);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saveSetName, setSaveSetName] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const validateCurrentQuestion = (): boolean => {
    if (!currentQuestion.trim()) return false;
    if (currentOptions.some(opt => !opt.trim())) return false;
    return true;
  };

  const handleAddQuestion = () => {
    if (!validateCurrentQuestion()) {
      showErrorToast('Please fill in the question and all 4 options');
      return;
    }

    const newQuestion: Question = {
      question: currentQuestion.trim(),
      options: currentOptions.map(opt => opt.trim()) as [string, string, string, string],
      correct_answer: correctAnswer,
      difficulty
    };

    if (editingIndex !== null) {
      const updatedQuestions = [...questions];
      updatedQuestions[editingIndex] = newQuestion;
      setQuestions(updatedQuestions);
      setEditingIndex(null);
    } else {
      setQuestions([...questions, newQuestion]);
    }

    resetForm();
  };

  const resetForm = () => {
    setCurrentQuestion('');
    setCurrentOptions(['', '', '', '']);
    setCorrectAnswer(0);
    setDifficulty('medium');
  };

  const handleEditQuestion = (index: number) => {
    const q = questions[index];
    setCurrentQuestion(q.question);
    setCurrentOptions([...q.options] as [string, string, string, string]);
    setCorrectAnswer(q.correct_answer);
    setDifficulty(q.difficulty);
    setEditingIndex(index);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    resetForm();
  };

  const handleFinish = () => {
    if (questions.length === 0) {
      showErrorToast('Please add at least one question');
      return;
    }
    setShowSaveDialog(true);
  };

  const handleSaveAndFinish = (shouldSave: boolean) => {
    if (shouldSave && !saveSetName.trim()) {
      showErrorToast('Please enter a name for your question set');
      return;
    }

    onSaveQuestions(questions, shouldSave ? saveSetName.trim() : undefined);
    setShowSaveDialog(false);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Build Your Questions</h2>
        <p className="text-gray-600 dark:text-gray-400">Create custom questions for your Brain Rush game ({questions.length} questions)</p>
      </div>

      {/* Question Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          {editingIndex !== null ? 'Edit Question' : 'Add New Question'}
        </h3>

        <div className="space-y-4">
          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Question
            </label>
            <textarea
              value={currentQuestion}
              onChange={(e) => setCurrentQuestion(e.target.value)}
              placeholder="Enter your question here..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>

          {/* Answer Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Option {idx + 1}
                  {correctAnswer === idx && (
                    <span className="ml-2 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">Correct</span>
                  )}
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={currentOptions[idx]}
                    onChange={(e) => {
                      const newOptions = [...currentOptions] as [string, string, string, string];
                      newOptions[idx] = e.target.value;
                      setCurrentOptions(newOptions);
                    }}
                    placeholder={`Enter option ${idx + 1}...`}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setCorrectAnswer(idx)}
                    className={`px-4 py-2 rounded-lg transition ${
                      correctAnswer === idx
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    <Check className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Difficulty
            </label>
            <div className="flex space-x-3">
              {(['easy', 'medium', 'hard'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setDifficulty(level)}
                  className={`px-6 py-2 rounded-lg font-medium transition ${
                    difficulty === level
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            {editingIndex !== null && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <X className="h-5 w-5" />
                <span>Cancel Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAddQuestion}
              disabled={!validateCurrentQuestion()}
              className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {editingIndex !== null ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              <span>{editingIndex !== null ? 'Update Question' : 'Add Question'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {questions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] dark:shadow-sm p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Questions ({questions.length})
          </h3>
          <div className="space-y-3">
            {questions.map((q, index) => (
              <div
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-purple-300 dark:hover:border-purple-600 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-sm font-bold px-2 py-1 rounded">
                        Q{index + 1}
                      </span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded">
                        {q.difficulty}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">{q.question}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {q.options.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className={`px-3 py-2 rounded ${
                            optIdx === q.correct_answer
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 font-medium'
                              : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2 ml-4">
                    <button
                      onClick={() => handleEditQuestion(index)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded transition"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(index)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="flex justify-between space-x-4">
        <button
          onClick={onCancel}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleFinish}
          disabled={questions.length === 0}
          className={`px-8 py-3 ${getThemeGradient('ui')} text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2`}
        >
          <Save className="h-5 w-5" />
          <span>Finish & Create Game</span>
        </button>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-[0_1px_3px_0_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.06)] border border-gray-100 dark:shadow-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Save Question Set?</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Would you like to save these questions for future use?
            </p>
            <input
              type="text"
              value={saveSetName}
              onChange={(e) => setSaveSetName(e.target.value)}
              placeholder="Enter a name for this question set..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 mb-4"
            />
            <div className="flex space-x-3">
              <button
                onClick={() => handleSaveAndFinish(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Don't Save
              </button>
              <button
                onClick={() => handleSaveAndFinish(true)}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
