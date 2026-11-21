# Participant testing guide

## Organizer preparation

- Keep source/data outside OneDrive. Start `npm run dev` from the project folder; verify `/api/health` and all eight workspace routes.
- Obtain required course/institution review, add/provide an actual organizer contact, agree a retention period, and explain participation/withdrawal before recruiting. The software does not claim approval.
- Run a 6–8-person rehearsal in **Rehearsal** mode to check instructions, mobile/keyboard use, timeout rate, missing records and actual consent-to-debrief duration. The 12–18-minute target is not a validated duration. Never induce stress to fill a mood quota.
- Keep `TEST_MODE=false` for genuine collection and use genuine participant observation only for actual volunteers. Use one participant code per person/session protocol; recreating a code cannot prove it is a new human. Do not auto-relabel developer/test records as real. Keep `.env`, private codes, SQLite and raw exports access-restricted.

## Full experimental session

1. Open `/study`, read consent, choose the appropriate purpose, and voluntarily agree. Declining participation leaves the gallery/demo available.
2. Select your closest current mood or unclassified response. Pleasantness and energy are separate context scales. A text sentence is optional; without its separate opt-in, it is not sent or saved. Avoid names or personal details in text/comments.
3. If you request optional prediction after consent, it is either a labeled rule demonstration or an explicitly validated local model. You can keep/correct it. Your pre-prediction report is retained independently; a suggestion is not a diagnosis.
4. Browse all eight available previews and record the layout you initially prefer. Assignment is separate; a preferred UI may be assigned anywhere or not assigned at all.
5. Finish the unscored practice, then attempt two tasks in each of four assigned layouts. Start explicitly. Inspect data or mark the named task complete, then Record response. You may give up. The 90-second limit is not a successful completion. Each task begins with a private seed reset.
6. Rate each assigned layout, skip optional comments if desired, choose a final favorite from all eight previews, and report your ending mood. An untested final preview choice is identified separately.
7. Read the debrief. Any recommendation afterward is outside the experiment. Choose freely; its actual renderer opens and optional follow-up ratings are saved separately.

## Pausing, resuming and deletion

Session controls reveal a private `session-id.token` code. Store it privately if needed. Reloading preserves the server state; time away from an active task counts toward its limit. Stop for now records an active task as abandoned and saves the remaining place. Resume using this browser or the private-code field on `/study`. Delete my data removes the participant and related live records. Request corresponding deletion from already exported copies or trained artifacts through the organizer.

## Optional personal workspace

`/adapt` provides assessment → explained suggestion → accept/manual choice → actual workspace → voluntary follow-up feedback without the randomized study. Rehearsal is the default. Its self-selected outcomes do not rank experimental designs. Workspace controls provide a resume/deletion code; its own resume form restores this mode. Do not enter a study code in that form.

## Organizer checks after a session

Inspect actual outcomes, four feedback forms, separate preferences, before/after moods, source labels and incomplete states in `/research`. Export genuine-only records by default. Include synthetic/rehearsal rows only explicitly and retain their labels; those exports are not pure research evidence. Compare actual 24-cell support rather than nominal recruitment targets. Never fill missing answers or infer that an interface is best from one participant or from generated coverage trials.
