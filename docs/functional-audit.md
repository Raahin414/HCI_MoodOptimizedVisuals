# Functional audit and finalization — 2026-11-19

The existing `C:\Dev\moodspace-hci` project was audited in place. No reference repository code/assets were consulted or copied. The existing SQLite store was snapshotted to an ignored `work/audit/before-*.sqlite` using SQLite VACUUM INTO before schema additions. It contained zero observations in each original table; no real records were inserted, reset or deleted by this audit. New tables initialize additively.

## Findings and final status

| Requirement | Audit finding | Final state and source |
| --- | --- | --- |
| Eight functional structures | Implemented; independent renderers, shared fixture/action parity | Preserved and reverified, `src/variants/*.tsx`, `src/Workspace.tsx`, `tests/variants.test.tsx` |
| Three moods / 24 cells | Implemented; mood never hardcodes a theme | All 24 selectable combinations verified; `src/domain.ts`, `server/allocation.ts` |
| Complete experimental workflow | Implemented; persisted consent, preferences, trials, ratings, recovery and withdrawal | Preserved, `server/app.ts`, `tests/e2e/study.spec.ts` |
| Post-study current mood | Defect: suggestion used starting report after an end mood change; demo renderer showed unrelated neutral mood | Separate `active_mood` uses final check-in; chosen workspace carries it. Starting `mood` stays immutable for trial analysis. `server/app.ts`, `src/SelectedWorkspace.tsx` |
| Direct new-user adaptation | Missing assessment → suggestion → chosen renderer path outside the full study | Added `/adapt` with consent, preference/neutral fallback, assessment, eight candidates, accept/override, persisted renderer/actions and follow-up ratings. `src/AdaptiveWorkspace.tsx` |
| Acceptance save / actual rendering | Existing post-study choice navigated before its save finished; subsequent workspace actions were browser-only | Await successful decision save, then render `/chosen-workspace`; save actions and separate follow-up ratings. `src/App.tsx`, `src/SelectedWorkspace.tsx` |
| Recommendation history | Defect: GET regenerated historical evidence and could discard choice metadata | Freeze each generated evidence snapshot, preserve original suggestion and latest actual choice/decision. Reject mismatched “accepted” UI. `server/app.ts` |
| Missing-time ties | Defect: Infinity-minus-Infinity prevented ties when all successful times were absent; alternatives could include the selected preferred tie | Missing values tie explicitly; preserve preference, correct chosen support and alternatives. All eight candidate metrics returned. `server/recommendation.ts`, `tests/adaptive.test.ts` |
| Guided unsupported intent | Defect: guide emitted canonical `fallback`, server rejected it and blocked subsequent saves | Allow documented fallback navigation target. `server/app.ts`, `src/variants/GuidedAssistant.tsx` |
| Mood prediction | Rule demonstration and offline training existed; no runtime deployment | Optional local supervised inference with a strict evaluation gate; no configured genuine model today. `server/moodModel.ts`, `analysis/predict_mood.py`, `analysis/train_mood.py` |
| Independent reference label | Prediction could overwrite the only self-report label | Preserve pre-prediction `reference_mood`, final human-confirmed `mood`, prediction linkage and agreement; training uses the independent reference. Rejecting a suggestion restores the original report. `src/MoodCheck.tsx`, `server/app.ts` |
| Future-outcome leakage | No post-task features in offline text model | Runtime prediction allowed only in assessment phase and before outcomes; inputs are consented text and independently recorded report. `server/app.ts`, `analysis/train_mood.py` |
| Research dashboard | Partial: median time and basic evidence existed; model performance, decision rates, mean time and charts missing | Added participant-weighted mean/median, failures/missingness, mood/coverage charts, evaluated model metrics/confusion matrix, acceptance/rejection/override rates and separate workspace scope. `src/ResearchAnalytics.tsx`, `server/researchMetrics.ts` |
| Synthetic exports | Default genuine-only export worked; no explicit synthetic export control | Authenticated explicit `include_synthetic=true`, UI checkbox and CLI flag; source labels/counts and manifest scope retained. Dashboard stays genuine-only. `server/exports.ts`, `server/export-cli.ts`, `src/App.tsx` |
| Real ML feasibility | Existing training runnable but zero eligible real texts | Pinned environment runs training/evaluation/inference tests; real export safely reports not_trainable. No genuine trained accuracy or classifier is claimed. `analysis/test_*.py` |

## Experimental fairness

Allocation stays least-exposed within reported mood and source stratum, with persisted seeded ties/order and four distinct interfaces per person. Two matched task families rotate four unique deadline and four unique completion examples; each assigned UI receives one of each, with order alternation. Practice is separate and never reappears as a scored prompt. Initial preference does not control assignments. Assigned and observed exposures remain distinct; stopped/incomplete sessions are not fabricated as complete.

`npm run demo:coverage` exercised the real API, allocation, private resets, scoring, four ratings and end workflow for **48 automated_test sessions / 384 synthetic scored trials** in a separate in-memory database. Each of the 24 cells had eight distinct synthetic codes and sixteen synthetic trials. Its genuine-only export had zero records. See `work/coverage-demo/report.md` and `synthetic-coverage.csv`. Those counts establish software coverage, never empirical mood superiority or H1–H3 evidence.

Self-selected direct/post-study workspace outcomes go into `workspace_feedback` and events with no scored trial. They do not enter randomized-trial ranking or static baseline performance. Optional text from either mode can train only with explicit consent and the pre-prediction reference label.

## Remaining data-dependent work

No human rehearsal, course/institution ethics approval, real recruitment, prospective adaptive-versus-static experiment, statistical power claim, or clinical emotion detection is complete. The 90-second task limit and 12–18-minute planning estimate still require a 6–8-person human rehearsal. All support/accuracy fields remain empty or insufficient until actual eligible records exist. Held-out grouped evaluation is a deployment gate, not proof of generalization or causal adaptation benefit. Bootstrap intervals/mixed models remain analysis extensions. Private model files and their provenance require a trusted organizer; metadata/hash consistency cannot prove people supplied the original records. Existing consent/privacy/retention arrangements remain the organizer's responsibility.

Executed commands and current results are in `verification.md`; instructor and participant procedures are in the two accompanying guides.
