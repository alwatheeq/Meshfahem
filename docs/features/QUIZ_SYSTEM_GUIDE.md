# Quiz System Guide

## Overview

The Quiz System allows users to generate multiple-choice quizzes from their library content or uploaded documents. The system uses AI (Claude) to create high-quality educational questions.

## Features

- Generate quizzes from library items or uploaded documents
- Customize question count (5-50 questions)
- Select difficulty level (Easy, Medium, Hard)
- Take quizzes with progress tracking
- View quiz history and scores
- Review answers with explanations

## How It Works

### Quiz Generation Flow

1. **Content Source Selection**
   - **From Library**: Use existing content from your library
   - **Upload File**: Upload a new document (PDF, DOCX, PPTX)

2. **Content Processing**
   - For library items: Fetches the summary_text directly
   - For uploaded files: Extracts text using the extract-text Edge Function

3. **AI Generation**
   - Content is sent to Claude AI (Haiku model)
   - AI generates questions based on difficulty level
   - Questions are validated for structure and correctness

4. **Database Storage**
   - Quiz session is saved to `quiz_sessions` table
   - Questions are stored as JSONB in `questions_json` column

5. **Taking Quizzes**
   - Users answer questions one by one
   - Progress is tracked in real-time
   - Results are saved to `quiz_attempts` table

## Recent Fixes

### Authentication Issue - "Auth session missing!" (RESOLVED - v2)
**Problem**: Quiz generation was failing with "Unauthorized" and "AuthSessionMissingError: Auth session missing!" errors in Edge Function logs.

**Root Cause**: The Edge Function was calling `supabase.auth.getUser()` without passing the JWT token parameter. When you create a Supabase client with the anon key and call `getUser()` without parameters, it tries to read from a non-existent session context.

**Solution**: Implemented proper JWT verification pattern for Edge Functions:

**Client-side (QuizPage.tsx)**:
- Uses `supabase.functions.invoke('generate-quiz', { body: {...} })`
- This automatically includes the user's JWT token in the Authorization header

**Edge Function (generate-quiz/index.ts)**:
1. Extracts JWT token from `Authorization: Bearer <token>` header
2. Creates Supabase admin client using `SUPABASE_SERVICE_ROLE_KEY`
3. Verifies JWT by calling `supabase.auth.getUser(token)` with the extracted token
4. If valid, uses the verified `user.id` for database operations
5. Service role key allows bypassing RLS since we've already verified the user

This is the standard authentication pattern for Supabase Edge Functions that need to verify user identity.

## Required Configuration

### Supabase Edge Function Secrets

The quiz system requires the following secret to be configured in your Supabase project:

1. Go to your Supabase Dashboard
2. Navigate to Edge Functions → Manage secrets
3. Add the following secret:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: Your Anthropic API key (get it from https://console.anthropic.com/)

Without this configuration, quiz generation will fail with an error message.

## Troubleshooting

### Quiz Generation Fails

#### 1. Check API Key Configuration
- Ensure `ANTHROPIC_API_KEY` is set in Supabase Edge Function secrets
- Verify the API key is valid and has sufficient credits

#### 2. Check Content Length
- Content must be at least 300 characters
- Library items should have sufficient summary_text
- Uploaded files must contain extractable text

#### 3. Check Edge Function Logs
Navigate to Supabase Dashboard → Edge Functions → Logs to see detailed error messages:
- Look for emoji indicators (🚀, ✅, ❌) for easy identification
- Check for authentication errors
- Verify API response status codes

### File Upload Issues

#### Supported File Types
- PDF (.pdf)
- Word Documents (.docx)
- PowerPoint Presentations (.pptx)

#### File Size Limits
- Maximum file size: 50 MB
- Maximum estimated pages: 400

#### Text Extraction Fails
- Ensure the file contains readable text (not just images)
- Scanned PDFs may not extract properly
- Try a different file format

### Quiz Taking Issues

#### Quiz Won't Load
- Check browser console for error messages
- Verify the quiz session exists in the database
- Ensure questions_json is not null or empty

#### Questions Display Incorrectly
- Questions must have at least 2 options
- correct_answer must match one of the options
- If corrupt, delete and regenerate the quiz

## Database Schema

### quiz_sessions Table
```sql
- id (uuid): Primary key
- user_id (uuid): Foreign key to auth.users
- quiz_title (text): Title of the quiz
- source_type (text): 'uploaded_document' or 'library_item'
- source_id (uuid): Reference to source content
- question_count (integer): Number of questions (5-50)
- difficulty_level (text): 'easy', 'medium', or 'hard'
- questions_json (jsonb): Array of question objects
- created_at (timestamp): Creation timestamp
```

### quiz_attempts Table
```sql
- id (uuid): Primary key
- quiz_session_id (uuid): Foreign key to quiz_sessions
- user_id (uuid): Foreign key to auth.users
- answers_json (jsonb): User's answers
- score_percentage (numeric): Score as percentage
- correct_count (integer): Number of correct answers
- incorrect_count (integer): Number of incorrect answers
- unanswered_count (integer): Number of unanswered questions
- time_taken_seconds (integer): Time taken to complete
- started_at (timestamp): Start time
- completed_at (timestamp): Completion time
```

## Question Structure

Each question in `questions_json` has the following structure:

```json
{
  "index": 0,
  "question": "What is the capital of France?",
  "options": ["London", "Paris", "Berlin", "Madrid"],
  "correct_answer": "Paris",
  "explanation": "Paris is the capital and largest city of France.",
  "topic": "Geography",
  "type": "multiple_choice"
}
```

## Best Practices

### For Better Quiz Generation

1. **Content Quality**
   - Use well-structured content with clear topics
   - Ensure content has enough detail for questions
   - Aim for at least 1000 characters for best results

2. **Question Count**
   - Match question count to content length
   - 5-10 questions for short content
   - 20-30 questions for comprehensive content

3. **Difficulty Selection**
   - **Easy**: Basic recall and understanding
   - **Medium**: Comprehension and application
   - **Hard**: Analysis and critical thinking

### For Users

1. **Taking Quizzes**
   - Answer all questions for best score tracking
   - Review explanations to learn from mistakes
   - Retake quizzes to improve understanding

2. **Managing Quizzes**
   - Use descriptive titles for easy identification
   - Delete old or unused quizzes to keep things organized
   - Check quiz history to track progress

## API Endpoints

### Generate Quiz
- **Endpoint**: `/functions/v1/generate-quiz`
- **Method**: POST
- **Auth**: Required (Bearer token)
- **Payload**:
  ```json
  {
    "text": "Content to generate quiz from",
    "questionCount": 10,
    "difficulty": "medium",
    "sourceType": "library_item",
    "sourceId": "uuid-here",
    "quizTitle": "My Quiz"
  }
  ```

### Extract Text
- **Endpoint**: `/functions/v1/extract-text`
- **Method**: POST
- **Auth**: Required (Bearer token)
- **Content-Type**: multipart/form-data
- **Payload**: File upload

## Logging and Debugging

The system includes comprehensive logging with emoji indicators:

- 🚀 Function started
- ✅ Success / Validation passed
- ❌ Error / Validation failed
- 🔐 Authentication check
- 👤 User verification
- 📥 Data parsing
- 📊 Data processing
- 🔍 Validation
- 🤖 AI API call
- 💾 Database operation
- 🎉 Operation complete
- 💥 Critical error
- ⚠️ Warning

Check both browser console and Supabase Edge Function logs for complete debugging information.

## Performance Considerations

### Quiz Generation Time
- Typical generation time: 5-15 seconds
- Depends on question count and content length
- Timeout set to 60 seconds
- Shows warning after 30 seconds

### Rate Limits
- Anthropic API has rate limits
- Failed requests show specific error messages
- Wait a few moments before retrying

## Future Enhancements

Potential improvements for the quiz system:

1. Multiple quiz types (true/false, fill-in-the-blank)
2. Timed quizzes with countdown
3. Quiz sharing between users
4. Leaderboards and competition mode
5. Export quiz results as PDF
6. Quiz templates and presets
7. Bulk quiz generation
8. Question bank management
