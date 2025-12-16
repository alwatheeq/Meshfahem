/**
 * Tutorial Configuration for All Pages
 * 
 * Each page has a multi-step tutorial that explains how to use
 * the features and functions of that specific page.
 */

export type PageName = 
  | 'dashboard' 
  | 'library' 
  | 'quiz' 
  | 'eduplay' 
  | 'study-rooms' 
  | 'history' 
  | 'informational' 
  | 'feedback' 
  | 'profile';

export interface TutorialStep {
  title: string;
  content: string;
  highlightElement?: string; // Optional: CSS selector or element ID to highlight
}

export interface TutorialConfig {
  pageName: PageName;
  title: string;
  steps: TutorialStep[];
}

export const tutorialConfigs: Record<PageName, TutorialConfig> = {
  dashboard: {
    pageName: 'dashboard',
    title: 'Dashboard Overview',
    steps: [
      {
        title: 'Welcome to Your Dashboard',
        content: 'Welcome! This is your main workspace where you can process documents, generate summaries, and create flashcards. Let\'s explore the key features.',
      },
      {
        title: 'Upload Documents',
        content: 'Click "Upload File" to process PDF, DOCX, or PPTX files. Supported files up to 400 pages. Your document will be converted into summaries and flashcards.',
      },
      {
        title: 'Paste Text Directly',
        content: 'Alternatively, you can paste text directly into the text area. This is perfect for quick summaries of notes, articles, or any text content.',
      },
      {
        title: 'Processing Options',
        content: 'Before processing, you can customize: Flashcard count (5-50), Medical mode for medical content, and Language selection for translations.',
      },
      {
        title: 'View Your Results',
        content: 'After processing, you\'ll see your summary and flashcards. You can view flashcards, publish to your library, or start over with new content.',
      },
      {
        title: 'Navigation Sidebar',
        content: 'Use the sidebar on the left to navigate between pages: Library, Quiz, EduPlay, Study Rooms, History, and more. Hover to expand or click to navigate.',
      },
      {
        title: 'AI Chatbot Assistant',
        content: 'Look for the floating AI assistant button. It provides context-aware help based on your current content. Drag it around and resize it to your preference.',
      },
      {
        title: 'Credits System',
        content: 'Your credit balance is shown in the header. Credits are used for processing content and AI features. Credits refresh monthly based on your subscription.',
      },
      {
        title: 'You\'re All Set!',
        content: 'You now know the basics! Start by uploading a document or pasting text to create your first summary and flashcards. Happy studying!',
      },
    ],
  },
  library: {
    pageName: 'library',
    title: 'My Library',
    steps: [
      {
        title: 'Your Content Library',
        content: 'Your Library stores all your processed summaries and flashcards. Everything you publish from the Dashboard is saved here for easy access.',
      },
      {
        title: 'Search Your Library',
        content: 'Use the search icon in the top right to find specific content. Click it to expand the search bar, then type keywords to filter your library items.',
      },
      {
        title: 'Filter and Sort',
        content: 'Use the filter dropdown to sort by: Date, Title, Most Liked, or Topics. This helps you quickly find the content you need.',
      },
      {
        title: 'View Content Details',
        content: 'Click on any library item to view its full summary, flashcards, original text, and topics. You can also edit, share, or delete items from here.',
      },
      {
        title: 'Organize Your Content',
        content: 'Use folders and tags to organize your library. Create folders for different subjects or topics to keep your content well-organized.',
      },
      {
        title: 'Share Content',
        content: 'Share your summaries with others by generating shareable links. Others can view your content without needing an account.',
      },
      {
        title: 'Library Actions',
        content: 'Each item has action buttons: View, Edit, Share, Delete. Use these to manage your library content efficiently.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Your library is your knowledge base. Keep it organized and use search to quickly find what you need. Happy studying!',
      },
    ],
  },
  quiz: {
    pageName: 'quiz',
    title: 'Quiz Generator',
    steps: [
      {
        title: 'Create Quizzes from Your Content',
        content: 'The Quiz page lets you create and take quizzes from your processed content. Test your knowledge and track your progress.',
      },
      {
        title: 'Choose Question Source',
        content: 'Select where to get questions from: Your Library (saved content), Your History (recent processing), or create questions manually.',
      },
      {
        title: 'AI Question Generation',
        content: 'Click "Generate Questions" to create AI-powered questions from your content. Choose difficulty level and question types (multiple choice, true/false, etc.).',
      },
      {
        title: 'Take a Quiz',
        content: 'Select a quiz from your folders and click "Start Quiz". Answer questions within the time limit and track your score in real-time.',
      },
      {
        title: 'View Quiz Results',
        content: 'After completing a quiz, review your results: correct answers, incorrect answers, time taken, and overall score. Learn from your mistakes.',
      },
      {
        title: 'Organize Quiz Folders',
        content: 'Create folders to organize your quizzes by subject or topic. This makes it easy to find and manage your quiz collection.',
      },
      {
        title: 'Quiz Settings',
        content: 'Customize quiz settings: time limits, question count, difficulty level, and more. Adjust these to match your study preferences.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Start creating quizzes from your content to test your knowledge. Regular practice with quizzes helps reinforce what you\'ve learned!',
      },
    ],
  },
  eduplay: {
    pageName: 'eduplay',
    title: 'EduPlay Games',
    steps: [
      {
        title: 'Educational Games',
        content: 'EduPlay offers interactive educational games to make learning fun. Play solo or compete with others in multiplayer games.',
      },
      {
        title: 'Brain Rush Game',
        content: 'Brain Rush is a fast-paced quiz game. Answer questions quickly to score points. The faster you answer correctly, the higher your score.',
      },
      {
        title: 'Game Setup',
        content: 'Before starting, choose your question source (Library or History), set difficulty level, and configure time limits. Customize the game to your preference.',
      },
      {
        title: 'Multiplayer Games',
        content: 'Join or create multiplayer game sessions. Compete with friends or other users in real-time. See leaderboards and track your rankings.',
      },
      {
        title: 'Game Results',
        content: 'After each game, view your results: score, accuracy, time taken, and ranking. Review questions you got wrong to improve.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Start playing Brain Rush to make learning engaging and competitive. Challenge yourself and others to improve your knowledge!',
      },
    ],
  },
  'study-rooms': {
    pageName: 'study-rooms',
    title: 'Study Rooms',
    steps: [
      {
        title: 'Collaborative Study Spaces',
        content: 'Study Rooms let you study together with others in real-time. Create or join rooms to collaborate on learning materials.',
      },
      {
        title: 'Joining Rooms',
        content: 'Browse available public rooms or join private rooms using a room code. Filter rooms by subject, topic, or number of participants.',
      },
      {
        title: 'Creating Rooms',
        content: 'Click "Create Room" to start your own study room. Set the room name, description, privacy settings, and choose study materials.',
      },
      {
        title: 'Collaboration Features',
        content: 'In a study room, you can share content, discuss topics, and work together on flashcards or quizzes. Real-time updates keep everyone in sync.',
      },
      {
        title: 'Room Management',
        content: 'As a room creator, you can manage participants, change settings, and control room content. Leave rooms anytime or delete rooms you created.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Start collaborating! Create a room for your study group or join existing rooms to learn together with others.',
      },
    ],
  },
  history: {
    pageName: 'history',
    title: 'Processing History',
    steps: [
      {
        title: 'Your Processing History',
        content: 'The History page shows all your past document processing and content generation. Everything you\'ve processed is saved here.',
      },
      {
        title: 'Viewing History',
        content: 'Browse through your processing history chronologically. Each entry shows the file name, processing date, and content type (summary, flashcards, etc.).',
      },
      {
        title: 'Revisiting Content',
        content: 'Click on any history item to view its summary, flashcards, and original text. You can republish items to your library or reprocess them.',
      },
      {
        title: 'History Actions',
        content: 'From history items, you can: View full content, Publish to library, Delete old entries, or Export content. Manage your history efficiently.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Use History to revisit past processing and keep track of all your learning materials. Nothing is lost!',
      },
    ],
  },
  informational: {
    pageName: 'informational',
    title: 'Help & Information',
    steps: [
      {
        title: 'Help Resources',
        content: 'This page contains helpful information about using the app. Find guides, tips, and answers to common questions.',
      },
      {
        title: 'Finding Information',
        content: 'Browse through different topics and categories to find the information you need. Use the search function to quickly locate specific topics.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Refer to this page anytime you need help or want to learn more about app features. We\'re here to help!',
      },
    ],
  },
  feedback: {
    pageName: 'feedback',
    title: 'Feedback & Suggestions',
    steps: [
      {
        title: 'Share Your Thoughts',
        content: 'Your feedback helps us improve! Share your thoughts, report issues, or suggest new features. We value your input.',
      },
      {
        title: 'Submitting Feedback',
        content: 'Fill out the feedback form with your message, select the feedback type (bug report, feature request, general feedback), and submit.',
      },
      {
        title: 'Feature Requests',
        content: 'Have an idea for a new feature? Submit it here! You can also vote on existing feature requests from other users.',
      },
      {
        title: 'You\'re Ready!',
        content: 'We appreciate your feedback! Your suggestions help make the app better for everyone. Thank you!',
      },
    ],
  },
  profile: {
    pageName: 'profile',
    title: 'Profile & Settings',
    steps: [
      {
        title: 'Your Profile',
        content: 'Manage your account settings, preferences, and subscription from your Profile page. Customize your experience here.',
      },
      {
        title: 'Account Settings',
        content: 'Update your profile information, email address, and password. Keep your account secure and up-to-date.',
      },
      {
        title: 'Preferences',
        content: 'Customize your experience: Choose color themes, set language preferences, and configure sidebar behavior (collapsible or pinnable).',
      },
      {
        title: 'Subscription Management',
        content: 'View your subscription status, billing information, and upgrade options. Manage your subscription and payment methods here.',
      },
      {
        title: 'Credits & Usage',
        content: 'Monitor your credit balance, usage statistics, and credit history. See when your credits will refresh and track your usage.',
      },
      {
        title: 'You\'re Ready!',
        content: 'Your profile is your control center. Customize settings to match your preferences and manage your account easily.',
      },
    ],
  },
};


