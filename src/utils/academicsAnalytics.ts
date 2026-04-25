type QuizQuestion = {
  index?: number;
  topic?: string;
  correct_answer?: string;
  type?: string;
  options?: string[];
};

function normalizeTopicAnswer(answer: string): string {
  return answer
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"()-]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function topicQuizAnswerMatches(q: QuizQuestion, userAnswer: string): boolean {
  const u = normalizeTopicAnswer(userAnswer);
  const c = normalizeTopicAnswer(q.correct_answer || '');
  const kind = q.type;

  if (kind === 'open_ended') {
    if (!u || !c) return false;
    if (u.length >= 4 && c.toLowerCase().includes(u)) return true;
    const words = c.split(/\s+/).filter((w) => w.length > 3);
    return words.some((w) => u.includes(w.toLowerCase()));
  }
  if (kind === 'fill_in_blank') {
    return (u === c && c.length > 0) || (c.length > 0 && u.includes(c)) || (u.length > 0 && c.includes(u));
  }
  return u === c && c.length > 0;
}

type QuizSession = {
  id: string;
  questions_json: QuizQuestion[];
};

type QuizAttempt = {
  quiz_session_id: string;
  answers_json: Record<string, string>;
};

type TopicAggregate = {
  correct: number;
  total: number;
};

const getTopicKey = (input: string | undefined): string => {
  const cleaned = (input || '').trim();
  return cleaned || 'General';
};

export const computeTopicQuizScores = (
  quizSessions: QuizSession[],
  attempts: QuizAttempt[]
): Record<string, number> => {
  const sessionMap = new Map<string, QuizSession>();
  quizSessions.forEach((s) => sessionMap.set(s.id, s));

  const aggregate = new Map<string, TopicAggregate>();

  attempts.forEach((attempt) => {
    const session = sessionMap.get(attempt.quiz_session_id);
    if (!session || !Array.isArray(session.questions_json)) return;

    session.questions_json.forEach((q, i) => {
      const key = getTopicKey(q.topic);
      const idx = q.index ?? i;
      const answer = (attempt.answers_json || {})[String(idx)] || '';
      const isCorrect = topicQuizAnswerMatches(q, answer);

      const prev = aggregate.get(key) || { correct: 0, total: 0 };
      aggregate.set(key, {
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1
      });
    });
  });

  const scores: Record<string, number> = {};
  aggregate.forEach((value, key) => {
    scores[key] = value.total > 0 ? Math.round((value.correct / value.total) * 100) : 0;
  });

  return scores;
};

export const mergeTopicScores = (
  quizScores: Record<string, number>,
  flashcardScores: Record<string, number>
): Array<{ topic: string; score: number }> => {
  const keys = new Set([...Object.keys(quizScores), ...Object.keys(flashcardScores)]);
  const merged: Array<{ topic: string; score: number }> = [];

  keys.forEach((k) => {
    const quiz = quizScores[k];
    const flash = flashcardScores[k];
    const hasQuiz = typeof quiz === 'number';
    const hasFlash = typeof flash === 'number';

    let score = 0;
    if (hasQuiz && hasFlash) score = Math.round((quiz + flash) / 2);
    else if (hasQuiz) score = quiz;
    else if (hasFlash) score = flash;

    merged.push({ topic: k, score });
  });

  return merged.sort((a, b) => b.score - a.score);
};

export const computeFlashcardTopicScores = (
  logs: Array<{ item_id: string | null; user_rating: 'easy' | 'good' | 'hard' | string }>,
  itemTopicsMap: Record<string, string[]>
): Record<string, number> => {
  const pointsByTopic = new Map<string, { points: number; total: number }>();
  const ratingWeight: Record<string, number> = { easy: 1, good: 0.75, hard: 0.3 };

  logs.forEach((log) => {
    if (!log.item_id) return;
    const topics = itemTopicsMap[log.item_id] || ['General'];
    const weight = ratingWeight[log.user_rating] ?? 0.5;

    topics.forEach((topic) => {
      const key = getTopicKey(topic);
      const prev = pointsByTopic.get(key) || { points: 0, total: 0 };
      pointsByTopic.set(key, { points: prev.points + weight, total: prev.total + 1 });
    });
  });

  const scores: Record<string, number> = {};
  pointsByTopic.forEach((value, key) => {
    scores[key] = value.total > 0 ? Math.round((value.points / value.total) * 100) : 0;
  });

  return scores;
};

