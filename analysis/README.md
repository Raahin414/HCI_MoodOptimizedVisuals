# Optional offline analysis

The running app needs no Python. From the project root, analyze a real JSON export with the standard library:

```powershell
python analysis/analyze_study.py exports/<timestamp>/study.json --out work/descriptive-analysis.json
python analysis/train_mood.py exports/<timestamp>/study.json --out work/mood-model
```

Use the actual JSON filename emitted by `npm run export` if it differs. Both commands reject demo/test/unknown provenance. With no eligible text, the training command writes `evaluation.json` with `status: not_trainable`, explicit class counts and reasons. This path does not import scikit-learn and works before installing optional packages.

For text model evaluation after enough real opted-in data exists, create a local environment outside OneDrive:

```powershell
python -m venv .venv-analysis
.\.venv-analysis\Scripts\python.exe -m pip install -r analysis/requirements.txt
.\.venv-analysis\Scripts\python.exe analysis/train_mood.py exports/<timestamp>/study.json --out work/mood-model
```

All three classes require at least 15 distinct participants. Five stratified participant-grouped folds keep people out of their own held-out test set. Vocabulary fitting is inside each fold. Repeated sessions have participant-balanced weights. The report includes class counts, macro-F1, balanced accuracy, participant-weighted confusion matrices, majority-class baseline and fold overlap checks. It does not print participant text. No accuracy is invented when training is unavailable.

An eligible run writes portable `model.json`, offline `model.joblib` and `evaluation.json` locally. Optional runtime deployment requires the explicit local configuration and strict grouped-evaluation/baseline/hash gate in [model-deployment.md](../docs/model-deployment.md). The runtime reads only JSON weights and never unpickles joblib. Missing or failed evaluation keeps self-report and the labeled rule-based demonstration available. No probabilities are presented as calibrated confidence. Do not load untrusted joblib files. Model vocabularies may retain volunteered words; restrict artifact access and apply withdrawal/retention policies to training copies and artifacts.

New records train against `reference_mood`, the self-report supplied before a prediction was shown; legacy records use `mood`. Both real study/workspace sessions can supply opted-in text. Direct workspace records are excluded from randomized trial-performance summaries.

`analyze_study.py` reports actual terminal observations, participant-level success and ratings, family-normalized successful time, 24-cell support and readiness. It does not run confirmatory hypothesis tests, a clustered bootstrap, infer adaptation benefit, or automatically select a deployable policy. Read `docs/methodology.md` before interpreting the output.

Verification helpers use isolated in-memory fixtures and temporary output. Some in-memory rows deliberately exercise the `real` eligibility boundary; they are never inserted into the application database or retained as study records.

```powershell
python -m unittest discover -s analysis -p "test_*.py" -v
```
