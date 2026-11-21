# MoodSpace study protocol

Protocol: `moodspace-1.0`. This is an exploratory undergraduate HCI instrument, not a diagnostic tool. No human study has been completed by the software build itself. H1, H2 and H3 remain hypotheses until supported by genuine observations. Automated browser runs verify software behavior; they are not usability participants.

## Questions and hypotheses

The study asks how a student's naturally self-reported mood relates to performance, effort and preference among eight ways of organizing the same academic workspace. H1 predicts that structures may differ in usability. H2 predicts that relative rankings may differ by mood; an overall winner with no interaction is an acceptable result. H3 predicts an advantage from adaptation over a fixed baseline, but requires a later held-out or prospective comparison. A descriptive ranking of the collection dataset does not verify H3.

The three classified responses are Positive / Energetic (`positive`), Neutral / Balanced (`neutral`) and Stressed / Overwhelmed (`stressed`). An unclassified response permits participation but contributes only to overall summaries. These are participant labels for a class exercise, not independently verified psychological states. Pleasantness and energy are separate 1–5 context ratings and never silently replace the chosen class. Mood is checked again at the end; a single starting report must not be interpreted as constant mood throughout.

## Design and controls

UI structure has eight levels, U01–U08. Mood is observed, never assigned or induced. Each participant tests a within-person subset of four UIs, completing two scored tasks per UI: eight scored trials total. Task family, difficulty, device class, exposure order and trial position are retained as controls. Five fictional courses, 24 tasks and eight milestones form the common content. The content snapshot, canonical identifiers and domain actions are shared across all layouts, with a private reset at every trial. Completion during one trial must not simplify a later one.

Primary measures are task success and elapsed time. Secondary measures are incorrect responses/errors, retries, give-ups, timeouts, abandonment, perceived effort (1–7), satisfaction (1–5), clarity (1–5), reuse intent (1–5), and initial/final preference. The short ratings are individual items, not validated SUS or NASA-TLX scores. Final choice may name an untested preview; report tested-layout preference separately. Missing ratings are missing, not zeros.

## Sequence

1. Read consent, decide voluntarily, and receive a pseudonymous participant/session code.
2. Report current mood, pleasantness and energy. Optional feeling text has a separate save opt-in. Empty text is valid.
3. Browse a server-randomized gallery of all eight app-derived layout previews. Record the initial favorite and optional rationale independently of assignment.
4. Complete a short unscored practice to learn task instructions and submission controls.
5. Test four server-assigned layouts, two tasks per layout. Read the instruction, start explicitly, use the layout and submit. A 90-second maximum ends only that trial. Participants can give up or stop without a false success record. Neutral confirmation avoids evaluative praise.
6. After each layout, rate satisfaction, effort, clarity and reuse, with an optional comment.
7. View all eight previews again, choose a final favorite, explain any change optionally, and complete an end mood check.
8. Read the debrief. Only after the experimental trials, optionally open a recommendation and accept or override it.

The 12–18 minute session duration is a planning target, not a measured claim. Use a 6–8 person rehearsal to measure consent-to-debrief duration, instruction comprehension, timeout rate, layout parity, browser/device issues and missing records. An accelerated automated run is reported separately from a human rehearsal. Do not change the timeout after collection begins without versioning the protocol.

## Allocation and task matching

The server persists an allocation seed and assignment audit. Within the reported mood and provenance stratum, choose four distinct least-exposed UIs, using the persisted seed to break ties and shuffle their order. Allocation is based on assigned exposure, so unfinished sessions reserve their slots and are visible in the audit. Browser preference does not determine the assigned set. Record both allocated and actually completed counts; assignment balance is not completion balance. Unclassified sessions use a separate allocation stratum.

Match task families across blocks and rotate named examples without repeating the same answer. Retain task family, fixture version, difficulty and position for every trial. Equal task counts alone do not establish equal difficulty: pretest instructions and successful times. Exclude practice from scored aggregates. A refresh resumes persisted state; elapsed wall time while away may cause a timeout rather than resetting the clock.

Learning, order and fatigue remain plausible confounds in a four-layout subset. Report order distributions, analyze position, and inspect whether initial favorites have prior familiarity. The least-exposed scheduler is auditable balancing, not a Latin/Williams square and not random assignment to mood.

## Recommendation rule and readiness

The implementation's versioned recommendation is descriptive and exploratory. Compute each mood × UI cell from consented `real` records only. Report distinct participants, exposures, success, median successful time, family-normalized successful time, effort, satisfaction and reuse. A person's two tasks are one participant-level contribution to a cell, not two independent votes. Average repeated contributions from the same participant before comparing participants.

Prespecified ordering (`lexicographic-v1.1`): rank descending participant-mean success rate, ascending median participant family-normalized successful time, ascending participant-mean effort, then descending participant-mean satisfaction. No opaque weighted score is used. A timeout, incorrect response, give-up or abandonment is unsuccessful; successful-only time excludes these failures and must always be shown with success and failure counts to avoid a misleading speed advantage. Missing feedback/time never becomes a favorable zero. Normalize each successful trial time by the pooled successful median for its task family and take a median within participant/UI, followed by a median across participants. A family with no successful observations contributes no successful-time value. A UI is practically tied with the leading UI when its success rate differs by less than 0.01 and normalized time differs by less than 0.05. Preserve the person's preferred UI when it is in that tie set; otherwise retain the ranked leader. Ties remain available options, not proof of equivalence. Missing time/effort is ranked after observed values; satisfaction missingness ranks after actual ratings. Read support and success before interpreting any time comparison.

Require at least eight distinct real participants in **each of all eight compared mood/UI cells** before naming a mood-specific empirical winner. Sparse mood evidence yields `insufficient_evidence`; fall back to a sufficiently supported overall observed baseline or the participant's own choice. Report exact support and missing cells. Unknown mood never produces a mood-specific claim. Confidence is not invented. The interface must permit any manual choice and must not switch during a scored trial.

Compare descriptive results with the fixed overall-best UI and, where observed, the participant's initial preference. These are in-sample descriptions unless held-out participants are explicitly reserved. A subsequent prospective comparison should freeze the rule, assign adaptation versus static baseline before collection, and compare outcomes with participant clustering and task/order adjustment. Do not reuse outcomes both to choose the winning UI and to claim its independent improvement.

## Analysis plan

Start with recruitment flow, missingness, completion rate, mood transitions, device distribution and actual 24-cell coverage. Plot success, time and ratings by UI and mood, with participant counts beside every cell. Retain incomplete sessions and classify their missing observations; do not impute completed responses. A sensitivity analysis can compare complete sessions against all observed trials and starting-mood-only against stable-mood sessions.

When support permits, resample whole participants for clustered bootstrap intervals. Every row belonging to a sampled participant travels together, preserving within-person dependence. For success and elapsed time, consider regression/mixed models adjusting for task family and trial position, with participant effects; timeouts may require a survival or censored-time analysis rather than treating the limit as a successful completion. Ordinal ratings need appropriately cautious summaries or ordinal models. Mood × UI interaction is exploratory, and multiple comparisons and wide uncertainty must be reported. Tiny samples justify descriptive reports, not unsupported significance statements.

The included offline analysis produces descriptive summaries and readiness only; it does not automatically run confirmatory inferential models or bootstrap intervals. No p-values or causal effects are generated by the app. Pre-register any expanded analysis before reviewing its outcomes.

## Optional text model

Only opted-in, nonempty, before-prediction texts from consented real study or workspace sessions with one of the three independently self-reported reference classes are eligible. New records use reference_mood, captured before a prediction is shown; legacy records use mood. Require at least 15 distinct participants per class and all three classes. TF-IDF vocabulary/weights and regularized logistic regression are fitted inside participant-grouped folds; no participant appears in both train and held-out data. Compare held-out macro-F1, balanced accuracy and confusion matrix with a majority-class baseline. Never use future trial behavior as a pre-study predictor. The rule-based keyword demonstration is separate and has no accuracy claim or calibrated confidence. Evaluation alone does not activate inference or establish emotion detection. Explicit local deployment requires the matching portable model/evaluation hash, provenance/support/fold checks, and both macro-F1 and balanced accuracy exceeding the majority baseline. See model-deployment.md. Probabilities are uncalibrated and not shown.

## Recruitment, ethics and privacy

Rehearse with 6–8 volunteers after satisfying class/institution requirements. A possible later recruitment target is about 72 real participants, nominally 24 per naturally occurring mood. This is exploratory planning, not achieved enrollment or a power guarantee. Four UIs per person would provide 12 participant exposures per cell only if mood counts balance and allocation is completed as intended. The actual counts take precedence. Do not induce or recruit people into distress to balance cells.

Consent explains minimal behavior/ratings collection, optional text, voluntary exit and deletion by the participant's code. No name, email, webcam, facial data, audio or precise location is collected. Avoid personal details in optional comments. Keep the database and exports locally access-restricted, protect researcher endpoints, and agree an institutional retention period before recruitment (proposed class policy: delete raw records 90 days after grading). Deletion from the live database does not automatically remove prior exported backups; researchers must apply the same withdrawal to those copies. Do not claim institutional approval until it has actually been granted.

Risks include self-report bias, mood drift, sparse or imbalanced cells, device differences, novelty and familiarity, practice effects, informative dropout, optional-text selection bias and limited generalizability beyond this class context. Report these alongside results, even if the interface recommendation looks persuasive.

## Audit scope additions

Starting mood remains the grouping label for randomized trial analysis. The final check-in sets active_mood for a later recommendation without rewriting the starting label. Direct workspace sessions use mode=workspace and are excluded from all randomized trial-performance cells; follow-up ratings use workspace_feedback. Model predictions, independent reference labels and corrections are retained separately in mood_predictions/mood_reports. Model inference is permitted only in the pre-outcome assessment phase. Recommendation evidence snapshots are frozen at generation; the latest explicit decision is counted once per session. Acceptance rates are descriptive, not adaptation effectiveness estimates. Missing successful times tie explicitly rather than implying a speed advantage.
