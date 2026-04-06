/*
  # Slate Mist & Plum Sand themes; retire cool-neutrals and soft-minimal

  Aligns user_preferences.color_theme CHECK with ThemeContext (frontend).
  Maps legacy DB values to current theme slugs before tightening the constraint.
*/

ALTER TABLE "public"."user_preferences"
  DROP CONSTRAINT IF EXISTS "user_preferences_color_theme_check";

-- Legacy theme slugs removed from the app → match ThemeContext.normalizeColorTheme
UPDATE "public"."user_preferences"
SET color_theme = 'sky-blue'
WHERE color_theme = 'cool-neutrals';

UPDATE "public"."user_preferences"
SET color_theme = 'warm-neutrals'
WHERE color_theme = 'soft-minimal';

UPDATE "public"."user_preferences"
SET color_theme = 'sky-blue'
WHERE color_theme = 'earth-tones';

ALTER TABLE "public"."user_preferences"
  ALTER COLUMN color_theme SET DEFAULT 'sky-blue';

ALTER TABLE "public"."user_preferences"
  ADD CONSTRAINT "user_preferences_color_theme_check"
  CHECK (
    color_theme IN (
      'monochrome',
      'warm-neutrals',
      'sky-blue',
      'rose-pink',
      'slate-mist',
      'plum-sand'
    )
  );

COMMENT ON COLUMN "public"."user_preferences".color_theme IS
  'User-selected color theme. Options: monochrome, warm-neutrals, sky-blue, rose-pink, slate-mist, plum-sand';

UPDATE "public"."user_preferences"
SET color_theme = 'sky-blue'
WHERE color_theme NOT IN (
  'monochrome',
  'warm-neutrals',
  'sky-blue',
  'rose-pink',
  'slate-mist',
  'plum-sand'
);
