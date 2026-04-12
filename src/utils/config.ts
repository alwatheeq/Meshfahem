// StudyFlow Configuration
// This file contains all the constants and settings for the application
// Replace placeholder values with your actual API keys and settings

export const CONFIG = {
  // AI Model Configuration
  ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
  
  // Processing Limits
  MAX_SLIDES_PER_UPLOAD: 400,
  MONTHLY_SLIDE_LIMIT: 2000,
  BATCH_SIZE: 25,

  // Text Processing Configuration
  CHARS_PER_PAGE: 2500,
  CHARS_PER_CHUNK: 14000,
  MIN_WORDS_PER_BULLET: 30,
  MAX_WORDS_PER_BULLET: 100,
  CHARS_PER_BULLET_TARGET: 500,

  // Processing Thresholds
  FAST_MODE_MAX_SLIDES: 100,
  FAST_MODE_MAX_FLASHCARDS: 20,
  
  // Storage and Caching
  RETENTION_PERIOD_DAYS: 180,
  CACHE_EXPIRY_HOURS: 24,
  
  // Flashcard Options
  FLASHCARD_COUNTS: [10, 20, 30, 40, 50],
  
  // File Upload Settings
  MAX_FILE_SIZE_MB: 50,
  ALLOWED_FILE_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  
  // Rate Limiting
  MAX_CONCURRENT_REQUESTS: 3,
  REQUEST_TIMEOUT_MS: 60000,
  
  // Authentication
  MAX_CONCURRENT_LOGINS: 2,
  SESSION_TIMEOUT_HOURS: 24,
  
  // UI Settings
  ANIMATION_DURATION_MS: 300,
  PROGRESS_UPDATE_INTERVAL_MS: 500,
  
  // Error Handling
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  
  // Development Settings
  DEBUG_MODE: process.env.NODE_ENV === 'development',
  LOG_LEVEL: 'info'
} as const;

// Predefined topics for user selection when publishing to library
// Topics are organized alphabetically by first letter of first word
export const PREDEFINED_TOPICS: readonly string[] = [
  'Anesthesiology',
  'Anatomy',
  'Anatomy Review',
  'Anthropology',
  'Article Summary',
  'Art',
  'Astronomy',
  'Biochemistry',
  'Biology',
  'Board Exam Prep',
  'Book Summary',
  'Business',
  'Cardiology',
  'Chemistry',
  'Clinical Case Study',
  'Clinical Guidelines',
  'Computer Science',
  'Dermatology',
  'Document Analysis',
  'Drug Information',
  'Economics',
  'Education',
  'Emergency Medicine',
  'Endocrinology',
  'Engineering',
  'Environmental Science',
  'Epidemiology',
  'Exam Prep',
  'Gastroenterology',
  'Genetics',
  'Geography',
  'Gynecology',
  'History',
  'Immunology',
  'Important Points',
  'Infectious Diseases',
  'Internal Medicine',
  'Key Concepts',
  'Law',
  'Lecture Notes',
  'Linguistics',
  'Literature',
  'Main Ideas',
  'Mathematics',
  'Medical Textbook',
  'Microbiology',
  'Music',
  'Nephrology',
  'Neurology',
  'Obstetrics',
  'Oncology',
  'Ophthalmology',
  'Original Text Summary',
  'Orthopedics',
  'Pathology',
  'Pathophysiology',
  'Pediatrics',
  'Pharmacology',
  'Philosophy',
  'Physics',
  'Physiology',
  'Physiology Notes',
  'Political Science',
  'Psychiatry',
  'Psychology',
  'Pulmonology',
  'Quick Reference',
  'Radiology',
  'Research Paper',
  'Review Material',
  'Sociology',
  'Statistics',
  'Study Guide',
  'Summarized',
  'Summarized Text Summary',
  'Surgery',
  'Urology'
];

// Simplified validation (API key now handled server-side)
export const validateConfig = (): boolean => {
  return true;
};

export default CONFIG;
