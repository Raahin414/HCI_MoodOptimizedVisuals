# Optional local mood-model deployment

MoodSpace uses the person's self-report as the primary reference label. No genuine-study trained model is activated without its participant-based gate. The 2026-11-21 update separately includes an optional public-corpus demonstration, described in `public-data-experiment.md`; it cannot pass the genuine gate below. If neither validated path is available, text suggestions use labeled rules. Any model remains exploratory, not a diagnosis or a proven measure of someone's emotion.

## Genuine-data training

Export the locally collected study records using the documented export command. The training program independently joins explicitly real, consented sessions and participants; it rejects demo, automated-test and unknown provenance even if a mixed export was supplied. It accepts before-assessment text only when `text_opt_in` is the boolean `true`, the text is nonempty, and the reference label belongs to positive, neutral or stressed. Both study and direct workspace sessions may supply text labels. Workspace use remains excluded from randomized trial-performance summaries.

New mood records retain `reference_mood`, the initial self-report made before displaying a prediction. Training prefers that label over the final human-confirmed active `mood`, so a model suggestion does not generate its own training target. Legacy records lacking `reference_mood` use their original mood field. An explicit unclassified reference stays unclassified and is excluded.

Require at least 15 distinct real participants in each class; repeated sessions from one person do not satisfy this floor. TF-IDF vocabulary and IDF are fitted inside each of five participant-grouped folds. No participant overlaps train and test. Repeated sessions receive participant-balanced weight. Reports include weighted macro-F1, balanced accuracy, a confusion matrix, a fold-specific majority-class baseline, class counts and participant support. Post-task outcomes are not features.

```powershell
Set-Location C:\Dev\moodspace-hci
.\.venv-analysis\Scripts\python.exe -m pip install -r analysis/requirements.txt
.\.venv-analysis\Scripts\python.exe analysis/train_mood.py exports/<timestamp>/study.json --out work/mood-model
.\.venv-analysis\Scripts\python.exe analysis/predict_mood.py --model-dir work/mood-model --validate-only
```

An insufficient export writes `evaluation.json` with `not_trainable`, counts and reasons; no accuracy is invented. A fully evaluated run writes a portable `model.json`, optional offline `model.joblib`, and `evaluation.json`. Artifacts have an explicit version, common training-run ID, source-export SHA-256 and model SHA-256. Evaluation is written last through an atomic replacement; interrupted or mismatched updates cause runtime abstention. Re-running insufficient training into an old model directory invalidates the prior deployment through the new failing evaluation.

## Deployment gate

`analysis/predict_mood.py` checks all of these before predicting:

- Recognized model/artifact versions and three classes, with at least 15 distinct real participants per class.
- Explicit real, consented, before-report reference-label provenance and a source-export hash.
- Five grouped folds, zero participant overlap, valid counts and vocabulary fitted inside folds.
- Internally consistent 3 × 3 participant-weighted confusion matrices and finite macro-F1/balanced accuracy.
- **Both** held-out macro-F1 and balanced accuracy must exceed the majority-class baseline by more than numerical tolerance (`1e-6`). Passing this gate is exploratory validation, not a guarantee of future performance.
- Fixed artifact filenames, size limits, matching SHA-256, training-run ID, schema, vocabulary indices and finite numeric weights.

Missing, legacy, malformed, hash-mismatched, insufficient or baseline-failing artifacts abstain. Empty text, absent consent and text with no supported vocabulary also abstain. There is no calibrated confidence output; the UI must invite correction and retain human confirmation.

Set these server-side values in the ignored `.env` only after inspecting a genuine-data evaluation:

```dotenv
MOOD_MODEL_DIR=C:/Dev/moodspace-hci/work/mood-model
MOOD_PYTHON=C:/Dev/moodspace-hci/.venv-analysis/Scripts/python.exe
```

Restart the server after configuration. Do not point the application at the isolated test fixtures. No model directory means self-report/rule-based fallback. The Node bridge should pass text through the child's stdin, bound execution time and output size, and treat process failure as an unavailable model. No browser may select an arbitrary model path. The Python runtime needs only its standard library to run the portable predictor; the pinned optional environment is required for training.

## CLI contract and trust

Invoke `analysis/predict_mood.py --model-dir <configured-local-directory>`. Input is one JSON object on stdin: `{"text":"an opted-in sentence","text_opt_in":true}`. Output is one JSON object with `available`, `method`, `predicted_mood`, `reason` and `calibrated_confidence:false`. Valid predictions include model version and held-out evaluation summaries. `--validate-only` takes no text and reports deployment availability/evaluation with `predicted_mood:null`. Failures return structured abstention with exit code zero; input text and exception details never appear in stdout/stderr. The server must still validate output and fall back on process errors.

Runtime inference reads declarative JSON weights and **never loads pickle/joblib**. The joblib file is retained solely for local offline inspection by the researcher. Artifact checks establish consistency with a local evaluation, not the authenticity of the underlying human observations. The administrator must trust the export's provenance, the training code and the local model directory, restrict write access, and never install an arbitrary downloaded artifact. A malicious person with write access could replace both model and evaluation; checksums are not a digital signature or an ethics approval. Vocabularies can retain volunteered words; include model copies in withdrawal, access and retention policies.

## Verification and limits

The pinned CPython 3.11 environment was checked with `pip check`; dependencies were consistent. Analysis tests verify a complete temporary training→evaluation→portable prediction path and malformed, insufficient, non-real, baseline-failing and tampered artifact paths. Test fixtures stay isolated in temporary `work/` directories and never enter the application database. Their metrics are software test outputs, not study findings.

The existing real-only export inspected during this audit had zero eligible text labels. It produced `not_trainable` and unavailable inference, as required. Real predictive performance, calibration, demographic fairness, multilingual generalization, human study duration and the causal benefit of adaptive UI remain unverified. The small English keyword demonstration and token-based text model can misunderstand context, negation, irony and language. Self-report and manual correction remain available.
