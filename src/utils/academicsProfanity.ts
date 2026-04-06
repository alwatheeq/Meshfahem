const BASIC_PROFANITY_LIST = ['fuck', 'shit', 'bitch', 'asshole', 'bastard'];

export const hasBasicProfanity = (value: string): boolean => {
  const normalized = (value || '').toLowerCase();
  return BASIC_PROFANITY_LIST.some((term) => normalized.includes(term));
};

