# Academics QA Checklist

## Scope
- Academics tab navigation and shell rendering
- Course creation with existing/new topic
- Basic profanity prevention for course/topic naming
- Course upload -> summary/flashcards/quiz generation
- Course mappings and analytics cards
- Library default view behavior
- Flashcard logging attribution metadata

## Manual QA Steps
1. Open Dashboard and click `Academics` in the sidebar.
2. Confirm Academics page loads without runtime errors.
3. Click `Create course`, enter:
   - valid course name
   - optional course code
   - existing topic
   - save, then verify new course appears in list.
4. Repeat creation with a new topic typed in the topic input and verify:
   - topic is accepted
   - topic appears in shared topics options afterward.
5. Attempt course/topic creation with profanity sample text and verify client validation blocks submission.
6. Select a course and upload a supported file (`pdf`, `pptx`, `docx`).
7. Run generation and verify:
   - private library item is created and linked to course
   - quiz is generated and linked to course (if edge function responds successfully)
   - generated content entries appear in Academics course section.
8. Confirm Topic Performance list appears in Academics and displays computed scores after data exists.
9. Confirm Course score card updates when course-linked quiz attempts exist.
10. Open Library and verify default view initializes as `mine` when no valid saved filter exists.
11. Study flashcards and verify logging now includes `item_id` and `study_mode` where item context is available.

## Smoke Regression
1. Dashboard main processing flow still works.
2. Quiz page quiz generation still works.
3. Library browsing/filtering still works.
4. Book mode flashcards render and function with `itemId` propagation.

## Notes
- Audio/TTS UI files are intentionally placeholders and not route-integrated yet.
- Server-side profanity check currently uses a basic placeholder banned-term list and should be expanded later.

