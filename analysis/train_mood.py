"""Evaluate optional consented-text mood prediction, independently of the React app.

python analysis/train_mood.py exports/<stamp>/study.json --out work/mood-model
Writes not_trainable with reasons unless all three classes have >=15 participants.
No text is printed. Optional local deployment requires a validated evaluation artifact.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from analyze_study import MOODS, eligible_rows, real_sessions
from predict_mood import FORMAT, GATE_VERSION, MODEL_VERSION, TOKEN_PATTERN, validate_evaluation

MIN_PARTICIPANTS = 15


def eligible_texts(payload: dict):
    sessions = real_sessions(payload)
    reports = eligible_rows(payload, "mood_reports", sessions)
    rows, excluded, seen = [], Counter(), set()
    for row in reports:
        # A prediction must not manufacture its own later training label.
        reference = row.get("reference_mood", row.get("mood"))
        if row.get("phase") != "before":
            excluded["not_before_study"] += 1
        elif row.get("text_opt_in") is not True:
            excluded["no_explicit_text_opt_in"] += 1
        elif reference not in MOODS:
            excluded["unclassified_mood"] += 1
        elif not isinstance(row.get("text"), str) or not row["text"].strip():
            excluded["empty_text"] += 1
        elif row["session_id"] in seen:
            excluded["duplicate_before_report"] += 1
        else:
            seen.add(row["session_id"])
            rows.append({"participant_id": row["participant_id"], "text": row["text"].strip(), "mood": reference})
    return rows, dict(excluded)


def readiness(payload: dict, minimum: int = MIN_PARTICIPANTS):
    if minimum < MIN_PARTICIPANTS:
        raise ValueError("The preregistered support floor is 15 participants per class; lower it only in a versioned protocol.")
    rows, excluded = eligible_texts(payload)
    counts = {mood: sum(r["mood"] == mood for r in rows) for mood in MOODS}
    participants = {mood: len({r["participant_id"] for r in rows if r["mood"] == mood}) for mood in MOODS}
    reasons = [f"{mood}: {participants[mood]} distinct opted-in real participants; need {minimum}"
               for mood in MOODS if participants[mood] < minimum]
    export_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
    return rows, {"model_version": MODEL_VERSION, "gate_version": GATE_VERSION,
                  "training_run_id": str(uuid.uuid4()), "generated_at": datetime.now(timezone.utc).isoformat(),
                  "target": "before-prediction self-reported reference mood", "classes": list(MOODS), "class_counts": counts,
                  "participants_per_class": participants, "unique_participants": len({r["participant_id"] for r in rows}),
                  "eligible_texts": len(rows), "excluded_reports": excluded,
                  "minimum_participants_per_class": minimum, "status": "not_trainable" if reasons else "ready_for_evaluation",
                  "reasons": reasons, "evaluation": None,
                  "source_summary": {"source_type": "real", "text_consent_required": True, "phase": "before",
                                     "self_report_labels": True, "excluded_synthetic": True, "export_sha256": export_hash,
                                     "session_modes": "study and workspace; reference_mood preferred over legacy mood"},
                  "deployment_eligible": False, "deployment_reason": "insufficient_real_participants",
                  "deployment": "explicit local configuration only; human-confirmed mood remains authoritative"}


def train(payload: dict, output: Path, minimum: int = MIN_PARTICIPANTS):
    rows, result = readiness(payload, minimum)
    output.mkdir(parents=True, exist_ok=True)
    if result["status"] == "not_trainable":
        save_evaluation(output, result)
        return result
    try:
        import joblib
        import numpy as np
        import sklearn
        from sklearn.dummy import DummyClassifier
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import balanced_accuracy_score, confusion_matrix, f1_score
        from sklearn.model_selection import StratifiedGroupKFold
        from sklearn.pipeline import Pipeline
    except ImportError:
        result.update(status="not_trainable", reasons=["Install the pinned optional dependencies in analysis/requirements.txt."])
        save_evaluation(output, result)
        return result

    texts = np.array([r["text"] for r in rows], dtype=object)
    labels = np.array([r["mood"] for r in rows], dtype=object)
    groups = np.array([r["participant_id"] for r in rows], dtype=object)
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=1729)
    predicted, baseline_predicted = np.empty_like(labels), np.empty_like(labels)
    folds = []

    def pipeline():
        return Pipeline([("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=6000,
                                                    sublinear_tf=True, token_pattern=r"(?u)\b\w+\b")),
                         ("logistic", LogisticRegression(C=1.0, max_iter=1500, class_weight="balanced", solver="lbfgs"))])

    try:
        for train_idx, test_idx in splitter.split(texts, labels, groups):
            if set(groups[train_idx]) & set(groups[test_idx]):
                raise ValueError("Participant leakage detected; evaluation stopped.")
            if set(labels[train_idx]) != set(MOODS):
                raise ValueError("A grouped training fold lacks a class; gather more diverse participants.")
            train_counts = Counter(groups[train_idx])
            weights = np.array([1.0 / train_counts[group] for group in groups[train_idx]])
            model = pipeline().fit(texts[train_idx], labels[train_idx], logistic__sample_weight=weights)
            baseline = DummyClassifier(strategy="most_frequent").fit(np.zeros((len(train_idx), 1)), labels[train_idx], sample_weight=weights)
            predicted[test_idx] = model.predict(texts[test_idx])
            baseline_predicted[test_idx] = baseline.predict(np.zeros((len(test_idx), 1)))
            folds.append({"train_participants": len(set(groups[train_idx])), "test_participants": len(set(groups[test_idx])),
                          "train_class_counts": dict(Counter(labels[train_idx])),
                          "test_class_counts": dict(Counter(labels[test_idx])), "participant_overlap": 0})
        def metrics(predictions):
            # Each participant has total evaluation weight one, even with several sessions.
            counts = Counter(groups)
            weights = np.array([1.0 / counts[group] for group in groups])
            return {"macro_f1": float(f1_score(labels, predictions, labels=list(MOODS), average="macro", sample_weight=weights, zero_division=0)),
                    "balanced_accuracy": float(balanced_accuracy_score(labels, predictions, sample_weight=weights)),
                    "confusion_matrix": confusion_matrix(labels, predictions, labels=list(MOODS), sample_weight=weights).tolist()}
        evaluation = {"method": "five-fold stratified participant-grouped cross-validation",
                      "folds": folds, "confusion_matrix_label_order": list(MOODS),
                      "confusion_matrix_unit": "participant-weighted observations", "model": metrics(predicted),
                      "majority_class_baseline": metrics(baseline_predicted), "calibrated_confidence": False}
        all_counts = Counter(groups)
        fitted = pipeline().fit(texts, labels, logistic__sample_weight=np.array([1.0 / all_counts[group] for group in groups]))
        joblib.dump(fitted, output / "model.joblib")
        # Runtime uses declarative numeric JSON, never unpickles the offline artifact.
        vectorizer, logistic = fitted.named_steps["tfidf"], fitted.named_steps["logistic"]
        class_indices = [list(logistic.classes_).index(mood) for mood in MOODS]
        portable = {"format": FORMAT, "model_version": MODEL_VERSION, "training_run_id": result["training_run_id"],
                    "classes": list(MOODS), "preprocessing": {"lowercase": True, "token_pattern": TOKEN_PATTERN,
                    "ngram_range": [1, 2], "sublinear_tf": True, "norm": "l2"},
                    "vocabulary": {term: int(index) for term, index in vectorizer.vocabulary_.items()},
                    "idf": vectorizer.idf_.tolist(), "coefficients": logistic.coef_[class_indices].tolist(),
                    "intercepts": logistic.intercept_[class_indices].tolist()}
        raw = (json.dumps(portable, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
        model_temp = output / "model.json.tmp"
        model_temp.write_bytes(raw)
        model_temp.replace(output / "model.json")
        result.update(status="evaluated_offline", evaluation=evaluation, scikit_learn_version=sklearn.__version__,
                      vocabulary_fitted_inside_each_fold=True,
                      model_artifact={"file": "model.json", "format": FORMAT, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
                      limitations=["Self-reports are class-exercise labels, not verified emotions.",
                                   "Cross-validation does not establish prospective deployment performance.",
                                   "Probabilities are not calibrated or exposed as confidence.",
                                   "A fitted model may retain vocabulary from optional text; restrict local artifact access."])
        result["deployment_eligible"], result["deployment_reason"] = validate_evaluation(result)
    except ValueError:
        # Do not echo exception text: a library error might contain participant text.
        result.update(status="not_trainable", reasons=["Evaluation could not fit valid grouped text folds (check class support and usable vocabulary)."],
                      evaluation=None, deployment_eligible=False, deployment_reason="invalid_grouped_evaluation")
    save_evaluation(output, result)
    return result


def save_evaluation(output: Path, result: dict):
    temporary = output / "evaluation.json.tmp"
    temporary.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(output / "evaluation.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--out", type=Path, default=Path("work/mood-model"))
    parser.add_argument("--min-participants", type=int, default=MIN_PARTICIPANTS)
    args = parser.parse_args()
    try:
        result = train(json.loads(args.export.read_text(encoding="utf-8-sig")), args.out, args.min_participants)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        # Do not print file contents or errors that may contain optional personal text.
        result = {"status": "not_trainable", "model_version": MODEL_VERSION,
                  "reasons": ["The export could not be read or did not match the validated MoodSpace export contract."],
                  "evaluation": None, "deployment_eligible": False}
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
