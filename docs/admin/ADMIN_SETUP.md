# Admin System Setup Guide

The admin system has been successfully implemented! Here's everything you need to know.

## Overview

A complete admin dashboard system has been created that allows administrators to:
- View all registered users and their activity
- Manage user feedback and suggestions
- Monitor platform statistics and analytics
- Update feedback status without needing external email services

## Features Implemented

### 1. Database & Security
- **User Roles**: Added `user_role` column to `user_profiles` table (values: 'user' or 'admin')
- **Row Level Security**: Admins can view all user data while regular users only see their own
- **Helper Function**: `is_admin()` function checks if current user has admin role
- **Secure Policies**: All admin operations are protected by RLS policies

### 2. Admin Authentication
- **Separate Login**: Dedicated admin login page at `/admin/login`
- **Route Protection**: `AdminRoute` component prevents non-admin access
- **Session Management**: Secure admin authentication flow
- **Automatic Redirect**: Admins are redirected to dashboard, regular users to main app

### 3. Admin Dashboard Layout
- **Professional UI**: Clean, modern design matching your app's aesthetic
- **Responsive**: Works on desktop and tablet devices
- **Dark Mode**: Full dark mode support
- **Navigation**: Collapsible sidebar with three main sections

### 4. User Management (`/admin/dashboard` - Users Tab)
- **User List**: View all registered users with email, role, usage, and signup date
- **Search**: Filter users by email address
- **User Details**: Click to view complete user profile and statistics
- **Activity Stats**: See user's history items, library items, and feedback count
- **CSV Export**: Download user data as CSV file

### 5. Feedback Management (`/admin/dashboard` - Feedback Tab)
- **Feedback List**: View all user feedback and suggestions
- **Filters**: Filter by status (pending/reviewed/resolved) and type (feedback/suggestion)
- **Search**: Search through feedback text and user emails
- **Status Updates**: Change feedback status with dropdown menu
- **Media Viewer**: View uploaded images and videos directly in the dashboard
- **Detailed View**: Click to see full feedback with all attachments
- **CSV Export**: Export feedback data to CSV

### 6. Analytics Dashboard (`/admin/dashboard` - Overview Tab)
- **Key Metrics**: Total users, active users, feedback counts, summaries, library items
- **Recent Activity**: See latest user actions
- **Quick Stats**: Visual cards showing important metrics
- **At-a-Glance**: Monitor platform health without switching views

## How to Use

### Step 1: Promote Your Account to Admin

Since you're the first admin, you need to manually update your account in the database:

1. Log into your Supabase dashboard
2. Go to the Table Editor
3. Open the `user_profiles` table
4. Find your user record (search by email if needed)
5. Edit the `user_role` column and change it from `'user'` to `'admin'`
6. Save the changes

### Step 2: Access the Admin Portal

1. Navigate to `/admin/login` in your browser
2. Sign in with your account credentials
3. You'll be automatically redirected to `/admin/dashboard`

### Step 3: Manage Your Platform

**View All Users:**
- Click "Users" in the sidebar
- Search for specific users
- Click "View" to see detailed user information
- Export user list as CSV

**Manage Feedback:**
- Click "Feedback" in the sidebar
- Use filters to find specific feedback
- Click "View" to see full details and attachments
- Update status from the dropdown (pending → reviewed → resolved)
- Export feedback as CSV

**Monitor Statistics:**
- Click "Overview" in the sidebar
- View key platform metrics
- Check recent user activity
- Monitor pending feedback count

## Security Features

- **Role-Based Access**: Only users with `user_role = 'admin'` can access admin pages
- **Protected Routes**: Non-admin users are automatically redirected
- **RLS Policies**: All database queries enforce admin permissions
- **Audit Trail**: Admin actions are logged (created_at, updated_at timestamps)
- **Secure Sessions**: Admin authentication uses same secure Supabase auth

## Database Schema Changes

### New Column: `user_profiles.user_role`
- Type: `text`
- Default: `'user'`
- Constraint: Must be either `'user'` or `'admin'`
- Indexed for performance

### New Policies Added
- Admins can view all user profiles
- Admins can view all user history
- Admins can view all library items
- Admins can view and update all feedback
- Admins can view all feedback media in storage

## Routes Added

- `/admin/login` - Admin login page
- `/admin/dashboard` - Admin dashboard (protected)

## Components Created

All admin components are in `src/components/Admin/`:
- `AdminRoute.tsx` - Route protection wrapper
- `AdminLogin.tsx` - Admin authentication page
- `AdminDashboard.tsx` - Main admin dashboard
- `AdminHeader.tsx` - Admin dashboard header
- `AdminSidebar.tsx` - Admin navigation sidebar
- `OverviewPage.tsx` - Analytics and statistics
- `UsersPage.tsx` - User management
- `FeedbackManagementPage.tsx` - Feedback management

## Alternative to Email Notifications

Instead of receiving feedback via email (which requires Resend), you now have a centralized dashboard where you can:
1. See all feedback in one place
2. Filter by status to focus on new submissions
3. Mark feedback as reviewed or resolved
4. View attached media files
5. Export feedback to CSV for external processing

## Tips

1. **Check Pending Feedback Regularly**: The Overview page shows how many pending items need review
2. **Update Status**: Mark feedback as "reviewed" once you've read it, and "resolved" once addressed
3. **Export Data**: Use CSV export for deeper analysis or reporting
4. **Monitor Active Users**: Track monthly active users to gauge platform engagement
5. **Search Functionality**: Use search bars to quickly find specific users or feedback

## Troubleshooting

**Can't access admin dashboard?**
- Verify your `user_role` is set to `'admin'` in the database
- Try logging out and back in
- Check browser console for errors

**Don't see user emails in Users page?**
- This is normal - fetching happens in background
- Wait a moment for the data to load
- Check your Supabase permissions

**Feedback media not loading?**
- Verify the storage bucket policies are set correctly
- Check that files exist in the `feedback-media` bucket
- Ensure your admin account has the correct permissions

## Next Steps

1. Promote your account to admin using the database
2. Log in at `/admin/login`
3. Explore the three main sections
4. Set up a routine to check pending feedback
5. Monitor user growth and engagement metrics

The admin system is fully integrated with your existing application and doesn't interfere with regular user functionality.
