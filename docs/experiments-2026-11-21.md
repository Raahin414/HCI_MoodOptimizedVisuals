# Continued small-scale experiments — 2026-11-21

The project retains three moods and eight total workspace structures. This update adds an optional visible mood-guided design demo and an independently evaluated public-text classifier. Existing data is preserved; the local genuine participant/session/trial counts remained zero before/after these experiments.

## Executed checks

| Check | Observed result |
| --- | --- |
| Production build | TypeScript + Vite passed |
| JavaScript unit/component/API | 38 passed across 7 files, including actual public-model HTTP inference/provenance and opt-in heuristic rules |
| Playwright browser workflows | 12 passed; 56.7 seconds; complete study, all 24 combinations, all eight manual switches, privacy/withdrawal/recovery, 3 opt-in mood-guided render paths |
| Pinned Python analysis/model suite | 26 passed; genuine/private and external-public gates stay separate |
| Public benchmark | 15,000 training, 1,944 validation, 1,943 held-out mapped comments; macro-F1 0.7017, balanced accuracy 0.7093; baseline 0.3004 / 0.3333 |
| Reproducibility | Repeated prespecified cached experiment matched numeric weight hash, C and held-out metrics; portable/sklearn parity on all 1,944 validation rows, zero mismatches |
| Synthetic study coverage | 48 automated_test sessions, 384 synthetic trials, all 24 cells at 8 synthetic codes; genuine-only evidence 0 |
| Dependency audit | 0 npm vulnerabilities |
| Publication check | Staged-source check required before GitHub commit; secrets/data/caches/raw corpus excluded |

The actual proxy-class F1 was 0.557 on 79 held-out fear/nervousness examples. These labels are not stress diagnoses or student self-reports. No author IDs are available in the simplified official split, so participant-grouped validation is not claimed. The original genuine-text trainer still requires ≥15 opted-in distinct participants per class and grouped evaluation. UI empirical readiness still requires ≥8 genuine participants in every compared UI/mood cell. No external/synthetic records satisfy either threshold.

The optional design rule (positive→Kanban Flow, neutral→Daily Brief, stressed→Quiet Focus) is user-opted-in and explicitly non-empirical. All eight candidates and manual override remain available. It is never used to assign scored study layouts. Self-selected workspace feedback stays separate from randomized performance evidence.

Raw public downloads remain ignored. The distributable contains numeric hashed-feature coefficients/IDF, frozen-source hashes, actual evaluation, CC BY 4.0 license and attribution. It contains no raw comments, vocabulary, author IDs, participant records or `.env`.

GitHub Actions repeats clean-install/build/JS/browser/Python/coverage checks on the uploaded commit; its live result is available in the repository Actions tab. Local results above are not a fabricated remote-CI result.
