# Project and Database Reference

**Meshfahem** — Single reference for application structure, features, database schema, edge functions, and configuration. The source of truth for schema is `supabase/migrations/`. For setup and feature deep-dives, see the links at the end.

---

## 1. Project overview

- **Product**: Meshfahem (educational / resume project).
- **Stack**: React 18, TypeScript, Vite, Tailwind CSS, Supabase (Auth, Postgres, Edge Functions), Stripe (payments), Zego (study room video).
- **Repo**: Git; npm scripts: `dev`, `build`, `lint`, `test`, `supabase:deploy`, `supabase:db-push`, `supabase:link`, etc.

---

## 2. Application structure

### Entry and provider hierarchy

- **Entry**: `src/main.tsx` → `src/App.tsx`.
- **Provider order** (outer to inner): `ErrorBoundary` → `EnvValidator` → `Router` → `I18nProvider` → `AuthProvider` → `CreditProvider` → `UserPreferencesProvider` → `OnboardingProvider` → `ThemeProvider` → `ChatProvider` → `PersistentModalProvider` → `ToastProvider`; then `SubscriptionRefreshListener` and the route tree.

### Routes

| Path | Access | Description |
| ---- | ------ | ----------- |
| `/` | Public / auth | Auth screen or Dashboard (if logged in). Blocked users → `/account/suspended`; admins → `/admin/dashboard`. |
| `/share/:shareableLinkId` | Public | Shared content view (`ShareView`). |
| `/join/:gameCode` | Public | Join EduPlay game by code (`GameJoinPage`). |
| `/pricing` | Public | Pricing page. |
| `/checkout` | Any | Checkout (Stripe). |
| `/payment/success`, `/payment/cancel` | Any | Post-payment redirects. |
| `/account/suspended` | Any | Shown when user is blocked. |
| `/profile/subscription` | Protected | Subscription management. |
| `/profile/billing` | Protected | Billing history. |
| `/admin/login` | Public | Admin login. |
| `/admin/dashboard` | Admin | Admin dashboard (`AdminRoute`). |
| `/view/history/:id`, `/view/library/:id` | Protected | Content view (history or library item). |
| `/*` | Catch-all | Renders `AppContent` (Auth or Dashboard). |

### Dashboard views (single-page, no URL change)

Rendered inside `src/components/Dashboard/Dashboard.tsx` via `currentView` and `Sidebar`:

- **main** — Upload, processing, and summary (idle / uploading / processing / completed / error).
- **library** — My Library.
- **quiz** — Quizzes & Exams (create, my quizzes, history, global exams).
- **eduplay** — EduPlay / Brain Rush.
- **study-rooms** — Study Rooms (Zego).
- **goals-achievements** — Goals & Achievements (sidebar item may be disabled).
- **history** — Processing history.
- **informational** — How to use the app.
- **feedback** — Feedback form.
- **profile** — Profile and settings.

---

## 3. Database structure

Tables are defined in `supabase/migrations/`. RLS is enabled on user-facing tables. Below: purpose and key columns. For full DDL and constraints, see the migration files.

### Core / auth & users

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `user_profiles` | Per-user profile, credits, study stats | `id` (PK, = auth.users.id), `email`, `display_name`, `user_role`, `credits_remaining`, `credits_total`, `credits_cycle_start`, `credits_cycle_end`, `free_credits_claimed`, `notified_at_1000/500/250`, study stats (e.g. `study_streak_current`, `total_flashcards_studied`), `has_paid`, `payment_date`, `payment_notes`, `created_at`, `updated_at`. |
| `user_preferences` | UI/locale/theme, sidebar behavior | `id`, `user_id` (UNIQUE), `sidebar_mode` ('collapsible' \| 'pinnable'), `created_at`, `updated_at`. Later migrations may add locale/theme (e.g. `color_theme`). |
| `admin_users` | Admin access | `id` (auth.users.id), `email`, `is_active`, `created_at`, `last_login_at`, `created_by`, `notes`. |
| `admin_login_attempts` | Admin login audit | `email`, `success`, `user_id`, `ip_address`, `user_agent`, `attempted_at`, `error_message`. |
| `user_block_history` | User blocking history | Used by RPC `check_user_block_status`; App redirects blocked users to `/account/suspended`. |

### Content & library

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `user_folders` | User folders for organizing items | `id`, `user_id`, `name`, `is_public`, etc. |
| `tags` | Tag definitions | `id`, `user_id`, tag metadata. |
| `item_tags` | Item–tag association | Item and tag references. |
| `user_library_items` | Saved library items | `id`, `user_id`, `title`, `summary_text`, `flashcards_json`, `source_type` ('processed' \| 'uploaded'), `created_at`. |
| `user_history` | Processing history | `id`, `user_id`, references to content, timestamps. |
| `cached_content` | Cached extracted/processed content | Content cache key and payload. |

### Quiz & EduPlay

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `quiz_documents` | Quiz document metadata | `id`, `user_id`, document info. |
| `quiz_sessions` | Quiz session (generated quiz) | `id`, `user_id`, `folder_id`, `quiz_title`, `source_type`, etc. |
| `quiz_attempts` | User quiz attempts | Session, user, score, answers, time. |
| `quiz_folders` | Quiz folder organization | `id`, `user_id`, `name`, `color`, `icon`. |
| `eduplay_game_sessions` | Brain Rush / EduPlay game | `id`, `host_id`, `game_code` (6-char), `game_title`, `quiz_session_id`, `question_timer_seconds`, `total_questions`, `difficulty_level`, `status` ('waiting' \| 'in_progress' \| 'completed' \| 'cancelled'), `current_question_index`, `started_at`, `ended_at`. |
| `eduplay_participants` | Players in a game | `id`, `game_session_id`, `user_id`, `display_name`, `score`, `rank`, `is_host`, `joined_at`, `left_at`. |
| `eduplay_game_questions` | Questions for a game | `id`, `game_session_id`, `question_index`, `question_text`, `options` (jsonb), `correct_answer`, `difficulty`, `time_limit_seconds`. |
| `eduplay_answers` | Participant answers | `id`, `game_session_id`, `participant_id`, `question_index`, `selected_answer`, `is_correct`, `time_taken_ms`, `points_earned`, `answered_at`. |
| `eduplay_custom_question_sets` | Custom question sets | User-defined question sets for EduPlay. |
| `global_exams` | Global exam definitions | `id`, `exam_name`, `exam_code`, `country`, `region`, `exam_type`, `difficulty_level`, `total_questions`, `time_limit_minutes`, `is_active`. |
| `global_exam_sections` | Sections within an exam | `id`, `exam_id`, `section_name`, `section_order`, `question_count`. |
| `global_exam_questions` | Exam questions | `id`, `exam_id`, `section_id`, `question_text`, `question_type`, `options`, `correct_answer`, `question_order`, `points`. |
| `global_exam_attempts` | User exam attempts | `id`, `exam_id`, `user_id`, `answers_json`, `score_percentage`, `started_at`, `completed_at`. |

### Study & goals

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `study_goals` | User study goals | `id`, `user_id`, goal fields. |
| `study_sessions` | Study session records | Session and user linkage. |
| `study_session_log` | Session log entries | Links to sessions and content. |
| `flashcard_study_log` | Flashcard practice log | User, item, practice data. |
| `achievements_definitions` | Achievement definitions | `id`, name, criteria, etc. |
| `user_achievements` | User-unlocked achievements | `user_id`, achievement reference, unlocked_at. |

### Payments & subscriptions

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `subscriptions` | Active subscription state | `id`, `user_id`, `subscription_tier`, `status` ('active' \| 'canceled' \| 'expired' \| 'payment_failed'), `start_date`, `end_date`, `next_billing_date`, `stripe_subscription_id`, `stripe_customer_id`, `billing_cycle_start`, `billing_cycle_end`, `tokens_used_current_cycle`, `token_limit`, etc. (later migrations add billing cycle and expiration fixes). |
| `transactions` | Payment history | `id`, `user_id`, `subscription_id`, `stripe_payment_intent_id`, `amount`, `currency`, `status`, `transaction_type`, `receipt_url`, `created_at`. |
| `credit_operations` | Credit audit log | `id`, `user_id`, `operation_type` ('deduction' \| 'refund' \| 'reset' \| 'claim_free' \| 'admin_adjustment'), `tokens_used`, `credits_deducted`, `credits_before`, `credits_after`, `status`, `created_at`. |
| `subscription_modal_dismissals` | Dismissed subscription modal state | User and dismissal metadata. |
| `promotional_codes` | Promo/discount codes | `code`, `discount_percentage`, `discount_amount`, `valid_from`, `valid_until`, `max_uses`, `current_uses`, `applicable_plans`, `is_active`. |
| `subscription_status_log` | Subscription status history | Log of status changes. |

### Other

| Table | Purpose | Key columns |
| ----- | ------- | ----------- |
| `user_feedback` | User feedback/suggestions | `user_id`, `feedback_type`, `feedback_text`, `media_urls`, `status`. |
| `comments` | Comments on content | Comment thread and user. |
| `item_reactions` | Reactions on items | User, item, reaction type. |
| `notifications` | In-app notifications | `user_id`, `notification_type`, `message`, `is_read`, `action_url`, `expires_at`. |
| `feature_usage_tracking` | Feature usage analytics | `user_id`, `feature_name`, `usage_count`, `last_used_at`. |
| `token_usage_history` | Historical token usage per cycle | User, subscription, cycle, tokens_used, token_limit. |
| `chatbot_conversations` | Chat assistant conversations | `id`, `user_id`, `context_type` ('summary' \| 'library_item' \| 'history_item' \| 'shared'), `context_id`, `summary_text`, `original_text`, `topics`, `medical_mode`, `updated_at`. |
| `chatbot_messages` | Messages in a conversation | `id`, `conversation_id`, `role` ('user' \| 'assistant'), `content`, `tokens_used`, `created_at`. |
| `study_rooms` | Study rooms (Zego) | `id`, `creator_id`, `room_name`, `room_description`, `room_code` (8-char), `max_participants`, `is_active`, `video_session_token`, `expires_at`. |
| `study_room_participants` | Room participants | `room_id`, `user_id`, `joined_at`, `left_at`, `is_host` (PK: room_id, user_id). |
| `study_room_shared_items` | Shared items in room | `id`, `room_id`, `item_id`, `shared_by_user_id`, `item_snapshot` (jsonb), `shared_at`. |
| `room_chat_messages` | Room chat | `id`, `room_id`, `user_id`, `message_text`, `created_at`. |
| `multiplayer_game_lobbies` | Multiplayer game lobbies | Lobby and game state. |
| `multiplayer_game_players` | Players in multiplayer game | Lobby and user linkage. |
| `multiplayer_game_answers` | Multiplayer game answers | Answer and scoring. |
| `multiplayer_game_scores` | Multiplayer game scores | Per-player scores. |
| `user_notes` | User notes (admin/user) | Note content and ownership. |
| `user_tags` | User tags (admin/user) | Tag definitions per user. |
| `summary_notes` | Book mode notes | Linked to summary/content. |
| `book_widget_layouts` | Book mode widget layout | Layout state per user/content. |
| `user_page_tutorials` | Onboarding/tutorial progress | Page and completion state. |
| `quiz_generation_errors` | Quiz generation error log | Error details for debugging. |
| `admin_audit_log` | Admin action audit | Admin, action, timestamp. |
| `admin_user_profile_archive`, `admin_subscription_archive` | Admin archives | Archived rows for history. |

---

## 4. Edge functions

Hosted under `supabase/functions/`. Invoked from the client or by Stripe/webhooks.

| Function | Purpose |
| -------- | ------- |
| `accept-folder-invitation` | Accept folder share invitation. |
| `chat-assistant` | Chat assistant (AI) for summaries/library context. |
| `claim-free-credits` | One-time free credit claim. |
| `cleanup-expired-history` | Scheduled cleanup of old history. |
| `create-checkout-session` | Create Stripe checkout session. |
| `detect-language` | Detect language of text. |
| `extract-text` | Extract text from uploaded documents. |
| `generate-brain-rush-questions` | Generate Brain Rush / EduPlay questions. |
| `generate-quiz` | Generate quiz from content. |
| `generate-share-link` | Generate shareable link for content. |
| `generate-summary-and-flashcards` | Generate summary and flashcards. |
| `get-credit-balance` | Return current user credit balance. |
| `manage-shared-folder` | Create/manage folder sharing. |
| `med-student-mode` | Med-student-specific processing. |
| `ocr-scan` | OCR on documents. |
| `send-feedback-email` | Send feedback email. |
| `stripe-webhook` | Handle Stripe events (subscriptions, payments). |
| `translate-quiz-bulk` | Bulk translate quiz content. |
| `translate-text` | Translate text. |

---

## 5. Auth and roles

- **Auth**: Supabase Auth (email/password). Session and user from `AuthContext`; `useAuth()` exposes `user`, `loading`, and `role` (derived from profile/admin).
- **Roles**: Normal user vs **admin**. Admins are redirected to `/admin/dashboard`; they use a separate admin login and `AdminRoute`.
- **Blocking**: RPC `check_user_block_status(p_user_id)` returns whether the user is blocked; App redirects blocked users to `/account/suspended`.

---

## 6. Credits and subscriptions

- **Credits**: Stored on `user_profiles` (`credits_remaining`, `credits_total`, `credits_cycle_start`, `credits_cycle_end`). 1 credit = 1,000 tokens. Refill on plan/renewal; low-credit flags: `notified_at_1000`, `notified_at_500`, `notified_at_250`. All mutations via DB functions (e.g. deduct, refund, claim free). `CreditContext` and `get-credit-balance` edge function used by the app.
- **Subscriptions**: Stripe; `stripe-webhook` updates `subscriptions`. Tiers (e.g. trial, monthly, standard) and token/credit limits. Billing cycle and expiration logic in migrations (e.g. `20260125205941_fix_credit_balance_on_subscription_expiry.sql`, `20260127160000_fix_subscription_cycle_and_expiration.sql`).

---

## 7. Environment and configuration

- **Frontend env**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Optional: any Stripe publishable or Zego keys used in the client.
- **Backend**: Secrets (Stripe secret, OpenAI, etc.) in Supabase project (Edge Function secrets).
- **Validation**: `src/components/EnvValidator.tsx` checks `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at runtime and shows a configuration error page if missing.

---

## 8. Cross-references

- [Documentation index](README.md) — Overview of all docs.
- [Quick start](setup/QUICK_START_GUIDE.md) — Local setup and run.
- [Phase 1 database](implementation/PHASE1_DATABASE_DOCUMENTATION.md) — Admin and core tables, RPCs.
- [Admin setup](admin/ADMIN_SETUP.md) — Admin access and dashboard.
- [Production readiness](implementation/PHASE10_PRODUCTION_READINESS_DOCUMENTATION.md) — Production checklist.

This reference is the high-level map; implementation and feature docs in `implementation/`, `features/`, `admin/`, and `setup/` contain detailed steps and decisions.
