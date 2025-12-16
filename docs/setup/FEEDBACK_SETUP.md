# Feedback Feature Setup Instructions

The feedback feature has been successfully implemented! Here's what you need to do to complete the setup:

## Email Configuration

To receive feedback emails, you need to configure the email service:

### Option 1: Using Resend (Recommended)

1. Sign up for a free Resend account at https://resend.com
2. Verify your domain or use Resend's testing domain
3. Get your API key from the Resend dashboard
4. Add the following secrets to your Supabase project:
   - Go to your Supabase project dashboard
   - Navigate to Settings > Edge Functions > Secrets
   - Add these two secrets:
     - `RESEND_API_KEY`: Your Resend API key
     - `FEEDBACK_RECIPIENT_EMAIL`: Your email address (where feedback will be sent)

5. Update the `from` email in the Edge Function:
   - Edit `/supabase/functions/send-feedback-email/index.ts`
   - Change `from: "noreply@your-domain.com"` to your verified domain email

### Option 2: Using SendGrid

If you prefer SendGrid:

1. Sign up at https://sendgrid.com
2. Get your API key
3. Modify the Edge Function to use SendGrid's API instead of Resend
4. Add your SendGrid API key as `SENDGRID_API_KEY` in Supabase secrets

## Features Implemented

### 1. Feedback/Suggestion Page
- New navigation tab in the sidebar (below Informational)
- Two tabs: Feedback and Suggestions
- Text input with 2000 character limit
- File upload support for images and videos
- Drag-and-drop functionality
- Preview of uploaded files
- Form validation

### 2. Database Structure
- New `user_feedback` table with RLS policies
- Stores feedback type, text, media URLs, and user info
- Automatic timestamps and status tracking

### 3. Storage
- New `feedback-media` storage bucket
- Organized by user ID folders
- RLS policies for secure access
- Supports images (JPG, PNG, GIF, WebP) up to 5MB
- Supports videos (MP4, MOV, WebM) up to 50MB

### 4. Email Notifications
- Edge Function sends formatted HTML emails
- Includes user email, feedback type, message, and media links
- Graceful fallback if email fails (feedback still saved to database)

### 5. Fixed Issues
- **History Page Horizontal Scrolling**: Fixed by adding overflow-hidden and responsive flex layouts
- **History Page Sorting**: Fixed by correcting the sort option parsing logic
  - Now properly sorts by:
    - Creation date (newest/oldest)
    - Filename (A-Z/Z-A)

## Testing the Feature

1. Navigate to the Feedback tab in the sidebar
2. Switch between Feedback and Suggestion tabs
3. Enter some text (required)
4. Optionally upload images or videos
5. Submit the form
6. Check your database for the entry in `user_feedback` table
7. Once email is configured, check your inbox for the notification

## File Limits

- Maximum 5 files per submission
- Images: max 5MB each
- Videos: max 50MB each
- Accepted formats:
  - Images: JPEG, PNG, GIF, WebP
  - Videos: MP4, MOV, WebM

## Database Access

To view feedback submissions, you can query the database:

```sql
SELECT * FROM user_feedback ORDER BY created_at DESC;
```

Or use the Supabase dashboard to view the `user_feedback` table.

## Notes

- Feedback is automatically saved to the database even if email sending fails
- All uploaded media is stored securely in Supabase Storage
- Users can only view their own feedback submissions (RLS enforced)
- The email feature requires configuration before it will work
- Without email configuration, feedback will still be saved and viewable in the database
