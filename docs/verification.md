# Executed verification

Verified on Windows, 2026-11-18 (Asia/Karachi), Node 24.14.1, Python 3.11.9. No human research participants were created by these checks. The development database contains zero observations; automated browser records use a separate database and automated_test provenance.

| Check | Actual result |
| --- | --- |
| `npm install` | Installed successfully; package lock committed to source deliverable |
| `npm run build` | Passed TypeScript and Vite production build |
| `npm test` | **25 passed**, 3 files: 11 domain/allocation/recommendation/export checks, 6 API checks, 8 renderer parity checks |
| `npm run test:e2e` | **5 passed**, Chromium; final observed run 25.7 seconds |
| Full browser participant session | Passed consent → mood → independent gallery choice → practice → 8 scored successes across 4 assigned UIs → 4 feedback forms → final preference → end mood → debrief → insufficient-evidence recommendation → manual override → withdrawal |
| Refresh during active browser trial | Passed; no task restart or duplicate observation |
| Failed mood-save network request | Visible error and Retry recovered the original operation; workflow continued |
| All moods / all UIs | All 24 manual combinations selected successfully; each renderer's deadline inspection/completion/course access verified |
| Responsive smoke | 1440, 768 and 390px; gallery and all eight workspace routes checked for page horizontal overflow |
| Keyboard / reduced motion | Enter opened task dialog, Escape closed it, focus returned to invoking control; reduced-motion preference enabled |
| Research security and export | Unauthorized API denied; configured secret admitted; JSON and CSV ZIP routes work; actual browser CSV ZIP download passed; no synthetic research counts |
| `npm run export` | Wrote manifest, JSON and 9 CSV files; zero genuine rows, demo/test excluded |
| `npm audit` | 0 vulnerabilities after updating the test dependency; no suppressed audit findings |
| `python -m unittest discover -s analysis -p 'test_*.py' -v` | **8 passed**, including an isolated in-memory grouped-training path, consent/provenance filters, participant aggregation and zero-data readiness |
| Design browser inspector | Final measured gallery: **0 FAIL, 1 WARN** at 1440/768/390; remaining small-text proportion warning prompted larger descriptions, navigation and filter text |

The full browser session ran in 9.1 seconds with explicit TEST_MODE, a 20-second task limit, and automated actions. This is not a measurement of human study duration and provides no evidence for H1–H3. Unit/API cases also verify timeout, incorrect/give-up/abandonment, idempotent responses/events, allocation balance over accumulating participants, invalid transitions/ratings/IDs, and atomic withdrawal. Empirical support activation is tested with isolated test-only fixtures; those fixtures never enter application evidence.

Production smoke also passed: `npm start` served `/gallery` and `/api/health` with HTTP 200, configured research authentication returned 200 with zero genuine participants and 24 coverage cells, and the administrator secret was absent from every built JavaScript asset. `npm run reset:demo` ran successfully and preserved real data.

Screenshots in `work/screenshots/` are generated from the runnable local application. The gallery's eight source captures are in `public/previews/`. The design inspection looked at desktop, tablet and phone screenshots. The selected style is editorial-greeting (seed 1968611802), with no redraws. Static miniature text is decorative screenshot content; actual interactive workspaces use readable live text.

## Limits of verification

No human usability rehearsal, actual participant study, causal validation, real-device testing, complete screen-reader audit, Internet deployment, or trained-model deployment was performed. Bootstrap uncertainty and mixed/ordinal models are documented analysis extensions rather than implemented outputs. Node 24 emits its SQLite experimental warning. The first Python run used preinstalled sklearn 1.5 and emitted SciPy deprecation warnings.

## Pinned Python environment

Created `.venv-analysis` under the project, installed all exact versions in `analysis/requirements.txt` (including sklearn 1.9.1), and reran the eight Python tests: **8 passed**, 6.8 seconds, no SciPy warnings. Ran both CLI scripts on the actual zero-row real export. The model correctly wrote `not_trainable`, three zero class counts, null evaluation, and explicit 15-per-class requirements; the analysis reported zero real participants and all 24 cells without fabricated statistics. No model artifact or accuracy was fabricated from empty observations.
