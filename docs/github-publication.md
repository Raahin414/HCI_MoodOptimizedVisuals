# GitHub publication and small-scale experiment — 2026-11-21

Target authorized by the user: https://github.com/Raahin414/HCI_MoodOptimizedVisuals . The GitHub connector confirmed this repository was empty and the connected Raahin414 account had push permission. Local Git is used for the bulk project upload; no existing remote files/history are replaced and no force push is used. Commit identity uses the account's GitHub noreply address.

Publication includes original app source, tests, setup/research guides, fixture-derived previews, a small public-corpus numeric model and its actual evaluation/attribution. It excludes `.env`, SQLite, real/demo/test session records, exports, work/cache directories, raw corpus comments, Python environments, dependency folders, joblib and logs. `npm run check:publication` checks the staged source for private paths, configured secrets, token/private-key patterns and unexpected large/database files before commit.

The optional mood-guided design demonstration adds visible mood-dependent suggestions without asserting empirical superiority: positive→U02, neutral→U08, stressed→U01. Explicit preference wins; all eight remain available; a supported real empirical result wins over the heuristic. This feature is opt-in and outside the assigned experiment.

The external model is a separate source: human annotations on public comments, with a fear/nervousness proxy rather than actual stress or self-report. It never passes the genuine-study model gate. The benchmark preserves held-out splits and reports actual metrics without inventing participant support or H3 evidence.

GitHub Actions verifies Node 24 / Python 3.11 on Windows with a clean npm install, production build, unit/component/API tests, real browser workflows, Python analysis/model tests and synthetic coverage. The public-data download/training command is explicit and not silently run during application startup or ordinary CI. The repository is source hosting, not a deployed Node/SQLite website; run locally using README instructions.
