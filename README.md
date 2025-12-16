# StudyBuddy - AI-Powered Learning Platform

<div align="center">

![StudyBuddy](https://img.shields.io/badge/StudyBuddy-AI%20Learning-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-3178C6?style=for-the-badge&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)

**A comprehensive AI-powered study platform that transforms your learning materials into interactive study tools**

[Features](#features) • [Getting Started](#getting-started) • [Tech Stack](#tech-stack) • [Documentation](#documentation)

</div>

---

## 📚 About StudyBuddy

StudyBuddy is an intelligent learning companion designed to revolutionize how students study and retain information. By leveraging cutting-edge AI technology, StudyBuddy transforms any document, text, or file into personalized study materials including summaries, flashcards, and quizzes.

### 🎯 Mission
To make learning more efficient, engaging, and accessible for students worldwide through AI-powered study tools and gamified learning experiences.

---

## ✨ Features

### 🤖 AI-Powered Content Processing
- **Smart Document Processing**: Upload PDFs, Word docs, PowerPoint presentations, or paste text
- **Intelligent Summarization**: Generate comprehensive summaries using advanced AI models
- **Automatic Flashcard Generation**: Create custom flashcards from any content
- **Medical Mode**: Specialized processing for medical and scientific content
- **Multi-Language Support**: Translate content to English, French, Arabic, and Turkish

### 📖 My Library
- **Content Organization**: Save and organize unlimited study materials
- **Folder System**: Create hierarchical folder structures for better organization
- **Tagging System**: Tag content with topics and predefined categories
- **Public Sharing**: Share folders and content with the community
- **Collaborative Learning**: Invite others to collaborate on shared folders
- **Search & Filter**: Advanced search and filtering capabilities
- **Export Options**: Export to multiple formats

### 🎯 Quiz System
- **AI Quiz Generation**: Generate quizzes from any content or library item
- **Multiple Difficulty Levels**: Easy, Medium, and Hard questions
- **Question Types**: Multiple choice, true/false, and more
- **Quiz Folders**: Organize quizzes in custom folders
- **Performance Tracking**: Track scores and progress over time
- **Language Support**: Generate quizzes in multiple languages
- **Quiz History**: Review past attempts and performance

### 🎮 EduPlay - Brain Rush Game
- **Live Multiplayer**: Compete with friends in real-time quiz battles
- **Game Modes**:
  - Manual Questions: Create custom question sets
  - AI-Generated: Let AI create questions on any topic
  - Library-Based: Use your saved library content
- **Live Leaderboard**: Real-time score tracking
- **Timed Questions**: Configurable question timers
- **Game Codes**: Easy joining with 6-digit codes
- **QR Code Sharing**: Quick join via QR codes
- **Host Controls**: Manage participants and game flow

### 🎯 Goals & Achievements
- **Study Goals**: Set and track daily, weekly, and monthly goals
- **Achievement System**: Earn badges and rewards for milestones
- **Progress Analytics**: Detailed insights into study patterns
- **XP System**: Level up as you learn
- **Categories**:
  - Learning achievements
  - Social achievements
  - Speed achievements
  - Consistency achievements
  - Special events

### 📊 Study Tracking
- **History Page**: View all your past processing sessions
- **Usage Analytics**: Track tokens used and content processed
- **Study Stats**: See flashcards created, summaries generated, quizzes taken
- **Progress Dashboard**: Visual representations of your learning journey

### 💎 Credit System
- **Token-Based Usage**: Fair usage tracking system
- **520,000 Tokens/Month**: Generous monthly allowance
- **30-Day Billing Cycles**: Automatic monthly reset
- **Low Credit Warnings**: Proactive notifications at 20% remaining
- **Insufficient Credit Protection**: Prevents accidental overuse
- **Credit Balance Widget**: Real-time credit tracking

### 💳 Subscription System
- **Flexible Plans**: Free trial, monthly, and annual subscriptions
- **Persistent Modals**: Smart upgrade prompts that respect user choice
- **Feature Gating**: Premium features for subscribed users
- **Stripe Integration**: Secure payment processing
- **Billing History**: Track all transactions
- **Subscription Management**: Easy upgrade, downgrade, and cancellation

### 🌐 Multi-Language Support
- **Interface Languages**: English, French, Arabic, Turkish
- **Content Translation**: Translate summaries and flashcards
- **RTL Support**: Full right-to-left support for Arabic
- **Language Toggle**: Quick switching between languages

### 🎨 Beautiful UI/UX
- **Modern Design**: Clean, intuitive interface
- **Dark Mode**: Full dark mode support
- **Responsive**: Works on desktop, tablet, and mobile
- **Smooth Animations**: Delightful micro-interactions
- **Accessibility**: WCAG compliant
- **Premium Feel**: Professional design with attention to detail

### 👥 Community Features
- **Public Library**: Explore community-shared content
- **Global Exams**: Access pre-made exam resources
- **Study Rooms**: Collaborative study spaces (Coming Soon)
- **Video Chat**: Built-in video conferencing (Coming Soon)
- **Comments & Reactions**: Like and comment on content
- **Social Learning**: Connect with other learners

### 🔒 Security & Privacy
- **Supabase Authentication**: Secure email/password auth
- **Row Level Security**: Database-level security policies
- **Admin System**: Separate admin dashboard
- **Secure Payments**: PCI-compliant Stripe integration
- **Data Privacy**: Your data belongs to you

---

## 🚀 Getting Started

### Prerequisites
```bash
- Node.js 18+
- npm or yarn
- Supabase account
- Stripe account (for payments)
- Anthropic API key (for AI features)
```

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd studdybuddy
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe Configuration
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# API Configuration
VITE_ANTHROPIC_API_KEY=your_anthropic_api_key

# LiveKit (for video chat)
VITE_LIVEKIT_URL=your_livekit_url
```

4. **Set up Supabase**

Run the migrations in order:
```bash
# Navigate to supabase/migrations and apply them via Supabase dashboard
# Or use Supabase CLI:
supabase db push
```

5. **Deploy Edge Functions**

The following edge functions need to be deployed:
- `extract-text` - Extract text from files
- `generate-summary-and-flashcards` - AI content processing
- `generate-quiz` - Quiz generation
- `generate-brain-rush-questions` - Game question generation
- `translate-text` - Content translation
- `create-checkout-session` - Stripe checkout
- `stripe-webhook` - Stripe webhook handler
- `get-credit-balance` - Credit system
- `claim-free-credits` - Credit claiming

6. **Run the development server**
```bash
npm run dev
```

7. **Build for production**
```bash
npm run build
```

---

## 🛠️ Tech Stack

### Frontend
- **React 18.3.1** - UI library
- **TypeScript 5.5.3** - Type safety
- **Vite 5.4.2** - Build tool
- **React Router 7.9.1** - Routing
- **Tailwind CSS 3.4.1** - Styling
- **Lucide React** - Icons
- **html2pdf.js** - PDF export
- **qrcode.react** - QR code generation

### Backend & Infrastructure
- **Supabase** - Database, Auth, Storage, Edge Functions
- **PostgreSQL** - Database
- **Row Level Security** - Database security
- **Stripe** - Payment processing
- **Anthropic Claude** - AI processing
- **LiveKit** - Video conferencing

### AI & ML
- **Claude 3.5 Sonnet** - Premium content processing
- **Claude Haiku** - Fast processing
- **Medical Student Mode** - Specialized medical AI
- **Custom Prompt Engineering** - Optimized prompts

### Edge Functions (Deno)
- **Deno Runtime** - Edge function environment
- **Supabase Functions** - Serverless functions
- **Stripe SDK** - Payment processing
- **Anthropic SDK** - AI integration

---

## 📁 Project Structure

```
studdybuddy/
├── src/
│   ├── components/
│   │   ├── Auth/              # Authentication components
│   │   ├── Dashboard/         # Main dashboard components
│   │   │   ├── Dashboard.tsx           # Main dashboard
│   │   │   ├── LibraryPage.tsx        # Library management
│   │   │   ├── QuizPage.tsx           # Quiz system
│   │   │   ├── EduPlayPage.tsx        # Brain Rush game
│   │   │   ├── GoalsAndAchievementsPage.tsx
│   │   │   ├── HistoryPage.tsx        # Study history
│   │   │   ├── ProfilePage.tsx        # User profile
│   │   │   └── ...
│   │   ├── Admin/             # Admin dashboard
│   │   ├── Subscription/      # Subscription components
│   │   └── Pricing/           # Pricing pages
│   ├── contexts/
│   │   ├── AuthContext.tsx           # Auth state
│   │   ├── I18nContext.tsx           # Internationalization
│   │   ├── CreditContext.tsx         # Credit system
│   │   └── PersistentModalContext.tsx # Modal management
│   ├── hooks/
│   │   ├── useAuth.ts               # Auth hook
│   │   ├── useSubscription.ts       # Subscription hook
│   │   ├── useFeatureAccess.ts      # Feature access control
│   │   └── useNotifications.ts      # Notifications
│   ├── utils/
│   │   ├── fileProcessor.js         # File processing
│   │   ├── queueProcessor.js        # Batch processing
│   │   ├── medicalQueueProcessor.js # Medical processing
│   │   ├── translation.js           # Translation utils
│   │   ├── deduplication.js         # Cache & dedup
│   │   └── studyTracking.ts         # Analytics
│   ├── locales/              # Translation files
│   │   ├── en.json           # English
│   │   ├── fr.json           # French
│   │   ├── ar.json           # Arabic
│   │   └── tr.json           # Turkish
│   └── lib/
│       └── supabase.ts       # Supabase client
├── supabase/
│   ├── migrations/           # Database migrations
│   └── functions/            # Edge functions
│       ├── extract-text/
│       ├── generate-summary-and-flashcards/
│       ├── generate-quiz/
│       ├── generate-brain-rush-questions/
│       ├── translate-text/
│       ├── create-checkout-session/
│       ├── stripe-webhook/
│       └── ...
├── public/                   # Static assets
├── dist/                     # Production build
└── docs/                     # Documentation files
```

---

## 🗄️ Database Schema

### Core Tables
- **user_profiles** - User profile data and stats
- **user_summaries** - Generated summaries and flashcards
- **study_history** - Processing history
- **user_folders** - Folder organization
- **user_tags** - Custom tags
- **folder_shares** - Collaborative folders

### Quiz System
- **quiz_sessions** - Quiz metadata
- **quiz_questions** - Questions and answers
- **quiz_attempts** - User attempts
- **quiz_folders** - Quiz organization

### EduPlay System
- **eduplay_game_sessions** - Game sessions
- **eduplay_game_participants** - Players
- **eduplay_questions** - Game questions
- **eduplay_answers** - Player answers

### Goals & Achievements
- **study_goals** - User goals
- **achievements_definitions** - Achievement types
- **user_achievements** - Earned achievements

### Subscription System
- **user_subscriptions** - Subscription data
- **billing_history** - Transaction history
- **subscription_modal_dismissals** - Modal state

### Admin System
- **admin_users** - Admin accounts
- **feedback** - User feedback
- **feedback_media** - Feedback attachments

---

## 🎮 Key Features Explained

### AI Content Processing Pipeline

1. **Text Extraction**: Files are sent to `extract-text` edge function
2. **Content Analysis**: Determines if medical mode is needed
3. **Batch Processing**: Large content split into manageable chunks
4. **AI Generation**: Claude generates summaries and flashcards
5. **Quality Check**: Validates output quality
6. **Storage**: Saves to database with metadata
7. **Caching**: Implements deduplication to save resources

### Credit System Architecture

- **30-Day Billing Cycles**: Fixed monthly periods
- **520,000 Tokens**: Generous monthly allowance
- **Token Tracking**: Real-time usage monitoring
- **Automatic Reset**: Cycles reset automatically
- **Low Credit Warnings**: 20% threshold alerts
- **Credit History**: Detailed usage logs
- **Admin Override**: Admins can adjust credits

### Persistent Subscription Modal System

- **Database-Backed**: Dismissals stored in Supabase
- **Cross-Session**: Persists across devices and sessions
- **Feature-Specific**: Different modals for different features
- **Non-Intrusive**: X-button only dismissal
- **Smart Triggers**:
  - Library: On page load
  - Dashboard: On content processing attempt
  - Quiz: On page load
  - Goals: On page load

### Quiz Generation Process

1. **Source Selection**: Choose library item or upload content
2. **Parameter Setting**: Difficulty, count, language
3. **AI Generation**: Claude creates contextual questions
4. **Quality Validation**: Ensures question quality
5. **Storage**: Saves with full metadata
6. **Organization**: Auto-organizes in folders
7. **Multi-Language**: Supports bulk translation

### Brain Rush Game Flow

1. **Host Creates Game**: Sets parameters and question source
2. **Generates Code**: 6-digit unique game code
3. **QR Code**: Shareable QR for easy joining
4. **Live Lobby**: Players join in real-time
5. **Game Start**: Host initiates when ready
6. **Live Questions**: Timed questions with countdown
7. **Real-Time Scoring**: Instant leaderboard updates
8. **Results**: Final standings and performance stats

---

## 🔐 Authentication & Security

### Authentication System
- **Email/Password**: Supabase Auth
- **Row Level Security**: Database-level access control
- **Session Management**: Secure token handling
- **Admin Separation**: Completely separate admin auth

### Security Features
- **RLS Policies**: Every table has strict RLS
- **Input Validation**: All inputs sanitized
- **CORS Protection**: Proper CORS headers
- **Rate Limiting**: API rate limiting
- **Secure Headers**: Security headers set
- **Environment Variables**: Secrets in env vars

### Admin System
- **Separate Table**: `admin_users` table
- **Role-Based**: Admin role in user_profiles
- **Protected Routes**: Admin-only routes
- **Audit Logs**: Admin action tracking
- **User Management**: View and manage users
- **Analytics Dashboard**: Platform analytics
- **Subscription Management**: Manage user subscriptions
- **Feedback Review**: Review user feedback

---

## 💰 Subscription & Pricing

### Plans
1. **Free Trial**
   - Limited features
   - Low token limit
   - Access to basic features

2. **Premium Monthly**
   - 520,000 tokens/month
   - All features unlocked
   - Priority support
   - Advanced analytics

3. **Premium Annual**
   - 520,000 tokens/month
   - 2 months free
   - All premium features
   - Priority support

### Stripe Integration
- **Checkout Sessions**: Secure payment flow
- **Webhooks**: Real-time subscription updates
- **Customer Portal**: Self-service management
- **Billing History**: Transaction records
- **Auto-Renewal**: Automatic subscription renewal
- **Cancellation**: Easy cancellation process

---

## 🌍 Internationalization (i18n)

### Supported Languages
- 🇺🇸 English (en)
- 🇫🇷 French (fr)
- 🇸🇦 Arabic (ar) - with RTL support
- 🇹🇷 Turkish (tr)

### Translation System
- **React Context**: I18nContext for state management
- **JSON Files**: Organized translation files
- **Dynamic Loading**: Load language on demand
- **Fallback**: Defaults to English
- **RTL Support**: Automatic RTL for Arabic
- **Content Translation**: Translate generated content

---

## 📊 Analytics & Tracking

### User Analytics
- **Study Time**: Total time spent studying
- **Content Created**: Summaries and flashcards
- **Quizzes Taken**: Quiz performance
- **Achievements Earned**: Badges and XP
- **Streak Tracking**: Daily/weekly streaks

### Admin Analytics
- **User Growth**: New user registrations
- **Engagement Metrics**: Active users
- **Usage Statistics**: Feature usage
- **Revenue Tracking**: Subscription metrics
- **Token Usage**: Platform-wide usage
- **Error Tracking**: System health

---

## 🐛 Known Issues & Limitations

### Current Limitations
- Study Rooms feature is under development
- Video chat integration pending
- Some translations incomplete
- Mobile responsiveness needs refinement in some areas

### Planned Features
- [ ] Study Rooms with video chat
- [ ] Mobile native apps
- [ ] More AI models
- [ ] Advanced analytics
- [ ] API for integrations
- [ ] Browser extensions
- [ ] Spaced repetition system
- [ ] Mind map generation

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs**: Open issues for bugs
2. **Suggest Features**: Share your ideas
3. **Submit PRs**: Fix bugs or add features
4. **Improve Docs**: Help with documentation
5. **Translate**: Add more languages

---

## 📝 License

[Add your license here]

---

## 👥 Support

- **Email**: support@studdybuddy.com
- **Documentation**: [Link to docs]
- **Issues**: [GitHub Issues]
- **Discord**: [Community Discord]

---

## 🙏 Acknowledgments

- **Anthropic** - For Claude AI
- **Supabase** - For backend infrastructure
- **Stripe** - For payment processing
- **React Team** - For React
- **All Contributors** - For making this possible

---

## 📈 Roadmap

### ✅ Completed (2024-2025)
- ✅ Study Rooms implementation
- ✅ Admin dashboard with comprehensive management
- ✅ Error handling standardization
- ✅ Code cleanup and optimization
- ✅ Performance monitoring integration
- ✅ Search input debouncing
- ✅ Documentation organization

### Q1 2025
- [ ] Mobile app development
- [ ] Advanced spaced repetition
- [ ] API development

### Q2 2025
- [ ] Mind map generation
- [ ] Collaborative notes
- [ ] Advanced analytics
- [ ] Browser extensions

### Q3 2025
- [ ] AI tutor feature
- [ ] Voice notes
- [ ] Offline mode
- [ ] Custom AI models

---

## 📖 Documentation

All project documentation has been organized in the [`docs/`](./docs/) directory:

- **[Implementation Guides](./docs/implementation/)** - Phase documentation, database schema, authentication
- **[Admin System](./docs/admin/)** - Admin setup, management guides, SQL scripts
- **[Features](./docs/features/)** - Feature-specific documentation (Brain Rush, Credits, Quizzes, etc.)
- **[Cleanup Reports](./docs/cleanup/)** - Code cleanup, migration summaries, error handling
- **[Setup Guides](./docs/setup/)** - Quick start, configuration, testing

See [docs/README.md](./docs/README.md) for the complete documentation index.

---

<div align="center">

**Made with ❤️ for students worldwide**

[Website](https://studdybuddy.com) • [Documentation](https://docs.studdybuddy.com) • [Twitter](https://twitter.com/studdybuddy)

</div>
