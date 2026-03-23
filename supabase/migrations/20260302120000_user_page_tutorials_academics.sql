/*
  Allow Academics page in user_page_tutorials.page_name.
  Extends CHECK constraint to include 'academics' for page-specific tutorials.
*/

ALTER TABLE user_page_tutorials
  DROP CONSTRAINT IF EXISTS user_page_tutorials_page_name_check;

ALTER TABLE user_page_tutorials
  ADD CONSTRAINT user_page_tutorials_page_name_check CHECK (page_name IN (
    'dashboard',
    'library',
    'quiz',
    'eduplay',
    'study-rooms',
    'history',
    'informational',
    'feedback',
    'profile',
    'academics'
  ));

COMMENT ON COLUMN user_page_tutorials.page_name IS
  'Name of the page: dashboard, library, quiz, eduplay, study-rooms, history, informational, feedback, profile, academics';
