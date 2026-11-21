# Data dictionary and export contract

Study version: `moodspace-1.0`. The fictional courses/tasks are application content, not observations. Research tables begin empty. Every observation has explicit `source_type`: `real`, `demo` or `automated_test`. Metrics, exports and analysis exclude non-real records by default. Unknown provenance is excluded, never assumed real. IDs are pseudonymous, not names or email addresses.

## Storage representation

The SQLite tables use indexed identity/context columns (`id`, `participant_id`, `session_id`, `source_type` as applicable) and a JSON `data` payload. API validation establishes the typed record boundaries. JSON export flattens each payload into its record. Session authentication/withdrawal token hashes and internal workspace sandboxes are removed from session exports. Do not infer relational fields from screen labels.

Times are ISO-8601 UTC strings unless a field explicitly ends in `_ms`. `elapsed_ms` and client-relative event timestamps are durations in milliseconds, not Unix times. `null` means missing or inapplicable, not zero. Arrays/objects remain structured in JSON and are serialized/quoted in CSV. CSV cells containing commas, quotes or newlines must be escaped; import the CSV rather than splitting it on commas.

## Common context fields

| Field | Meaning |
| --- | --- |
| `id` | Unique record ID. Events use a stable client-generated ID for idempotent retry. |
| `participant_id` | Pseudonymous person code connecting repeated records. A session is not an independent person. |
| `session_id` | Study run code; absent/inapplicable for the participant entity itself. |
| `source_type` | Explicit observation provenance: real, demonstration or automation. |
| `created_at` / `timestamp` | Server-recorded creation time, according to the record's API contract. |

## Tables

| Table | Fields and interpretation |
| --- | --- |
| `participants` | `id`, `source_type`, `created_at`; optional coarse `device_class` if present. No direct identifier. Participant counts use distinct `id`. |
| `sessions` | `id`, `participant_id`, `source_type`, `consent_version`, `consented_at`, `study_version`, `status`, `phase`, `mood`, `assigned_sequence`, `allocation_seed`, `trial_index`, `created_at`, `ended_at`. `status` is active, complete or stopped. `phase` records restart-safe workflow progress. `assigned_sequence` has four distinct UI IDs; it is independent of initial preference. Ending time is absent until ended. Export omits authentication token hashes and per-trial sandboxes. |
| `mood_reports` | Context IDs plus `phase` (before/after), `mood`, `valence`, `arousal`, `text_opt_in`, `text`, time. Mood is positive, neutral, stressed or unclassified. Valence and arousal are integers 1–5. Text is null unless explicit text opt-in is true; empty opted-in text is valid but not a training example. Mood stays self-reported even when a rule-based demonstration offers a different suggestion. |
| `gallery_choices` | Context IDs plus `phase` (initial/final), `ui_variant`, `ordering`, `viewed_ids`, `rationale`, `tested`, time. Ordering records the gallery permutation. Viewed IDs describe previews actually inspected. Initial and final are separate records. Final `tested=false` means a choice based on preview rather than an assigned tested UI. |
| `trials` | Context IDs plus `ui_variant`, `task_id`, `task_family`, `difficulty`, `sequence_index`, `started_at`, `ended_at`, `elapsed_ms`, `status`, `error_count`, `retry_count`. UIs are stable U01–U08. Task IDs and family identify computable fixture targets. Position is needed for learning/fatigue analysis. Active trials may lack ending values. Terminal statuses are success, incorrect, timeout, give_up or abandoned. A timeout is never success. Practice is excluded from scored trial totals. |
| `interaction_events` | Unique id, session/trial context, `ui_variant`, event type, canonical target ID, client-relative timestamp and server time, and minimal metadata if applicable. Supported behaviors include opening tasks/courses, inspecting deadlines, completion actions, backtracking and major navigation. No raw keystrokes or mood text belong here. Retry of one event ID must not create two observations. |
| `variant_feedback` | Context IDs plus `ui_variant`, `satisfaction` (1–5), `effort` (1–7), `clarity` (1–5), `reuse_intent` (1–5), optional `comment`, time. These are short ordinal items, not a validated composite score. Missing feedback stays missing. |
| `recommendations` | Context IDs plus method/model version, permitted input summary, selected/recommended UI, support, fallback/readiness reason, time and acceptance/rejection/override where supplied. A heuristic/user-choice fallback is not a trained result. No recommendation changes a layout inside an experimental trial. |
| `allocations` | Context IDs, allocation seed, chosen four-layout sequence, mood/provenance stratum and audit counts. Allocation counts reserve exposure and may differ from completed-participant coverage. Use this table to audit the server scheduler, not as task-success evidence. |
| `mood_predictions` | Session/participant/source context, phase=before, independently reported `reference_mood`, method, predicted_mood or null, reason, optional model version/evaluation, consent flag, created_at. No raw text. Predictions require text consent and assessment phase. |
| `workspace_feedback` | Session/participant/source context, chosen ui_variant, active mood, satisfaction (1–5), effort (1–7), optional comment, and self-selected-workspace-not-randomized context. Never mixed into assigned variant_feedback or scored-trial ranking. |

The authoritative exact field names for interaction/recommendation/audit payloads are the validated API/source types; this dictionary describes their meaning without promising absent measurements. Raw comments and opted-in mood text may contain volunteered personal information. Keep exports restricted and use a minimized analysis copy when sharing results.

Audit additions: sessions have mode (study/workspace; missing legacy mode means study), active_mood (latest human-confirmed mood) and active_ui. Starting mood remains unchanged for trial grouping. Mood reports retain reference_mood, prediction_id and prediction_confirmed; reference_mood is recorded before optional prediction. Recommendations preserve original ui_variant, chosen_ui, decision, evidence snapshot, all eight candidates, selection_source and inputs. The current lexicographic version is v1.1. Mean successful time is participant-weighted, alongside the existing participant-level median.

There are now eleven record tables. Manifest scope and counts_by_source identify explicit synthetic inclusion. The dashboard always uses genuine data; including labeled synthetic records in an export does not change dashboard evidence.

## Export container

The export contains `manifest`, `tables` and an analysis `summary`. The manifest identifies study version, export time, row counts and whether synthetic records were excluded. The example below deliberately has no invented participants or observations; its timestamp is a schema label rather than a collected date.

```json
{
  "manifest": {
    "study_version": "moodspace-1.0",
    "exported_at": "<ISO-8601 UTC timestamp>",
    "row_counts": {
      "participants": 0,
      "sessions": 0,
      "mood_reports": 0,
      "gallery_choices": 0,
      "trials": 0,
      "interaction_events": 0,
      "variant_feedback": 0,
      "recommendations": 0,
      "allocations": 0,
      "mood_predictions": 0,
      "workspace_feedback": 0
    },
    "excluded_synthetic": true
  },
  "tables": {
    "participants": [],
    "sessions": [],
    "mood_reports": [],
    "gallery_choices": [],
    "trials": [],
    "interaction_events": [],
    "variant_feedback": [],
    "recommendations": [],
    "allocations": [],
    "mood_predictions": [],
    "workspace_feedback": []
  },
  "summary": {}
}
```

## Analysis eligibility

The offline scripts join a row to an explicitly real, consented session and real participant; unknown/mismatched provenance is rejected. Mood text training uses before-study reports only, explicit boolean text opt-in, nonempty text, a classified mood and participant-grouped folds. There must be at least 15 distinct participants per class. Test data cannot activate readiness. Per-mood UI readiness requires eight distinct real participants in each of the eight compared cells. Coverage is based on observed terminal trials, not the number of seeded task records.

Participant-level UI summaries first aggregate repeated trials/sessions from one person. Successful time is normalized by task-family median; report unsuccessful statuses beside time. Ordinal feedback uses only actual responses. The offline script produces descriptive summaries rather than causal effects, p-values or fabricated confidence.

## Withdrawal and retention

The participant's session/withdrawal credential authenticates retrieval and deletion, while the researcher dashboard uses a configured server-side administrator secret. Do not publish these credentials. Deletion removes related records from the live store; any previously exported copies require the researcher to apply deletion separately. Agree a class/institutional retention period before collecting real data. See methodology for consent and recruitment limits.
