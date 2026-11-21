"""Trusted-local, validated portable text-model inference; never unpickles a model.

stdin: {"text": "optional consented sentence", "text_opt_in": true}
stdout: one JSON result; no input text, probabilities or exception details are logged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

MOODS = ("positive", "neutral", "stressed")
FORMAT = "moodspace-portable-tfidf-logistic-v1"
MODEL_VERSION = "moodspace-text-2.0"
GATE_VERSION = "grouped-real-baseline-v1"
MAX_ARTIFACT_BYTES = 2_000_000
TOKEN_PATTERN = r"(?u)\b\w+\b"


def abstain(reason: str) -> dict:
    return {"available": False, "method": "self-report", "predicted_mood": None,
            "reason": reason, "calibrated_confidence": False}


def finite(value, minimum=None, maximum=None):
    return (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
            and (minimum is None or value >= minimum) and (maximum is None or value <= maximum))


def integer(value, minimum=0):
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum


def matrix_metrics(matrix):
    if (not isinstance(matrix, list) or len(matrix) != 3
            or any(not isinstance(row, list) or len(row) != 3 for row in matrix)
            or any(not finite(v, 0) for row in matrix for v in row)):
        raise ValueError("invalid_metrics")
    recall, f1 = [], []
    for i in range(3):
        actual = sum(matrix[i])
        predicted = sum(matrix[j][i] for j in range(3))
        if not actual:
            raise ValueError("invalid_metrics")
        recall.append(matrix[i][i] / actual)
        f1.append(2 * matrix[i][i] / (actual + predicted) if actual + predicted else 0)
    return sum(f1) / 3, sum(recall) / 3


def validate_evaluation(report: dict) -> tuple[bool, str]:
    """Fail closed on unrecognized/legacy artifacts or unsupported research claims."""
    if isinstance(report, dict) and report.get("status") == "not_trainable":
        return False, "model_not_trainable"
    if not isinstance(report, dict) or report.get("status") != "evaluated_offline":
        return False, "model_not_evaluated"
    if report.get("model_version") != MODEL_VERSION or report.get("gate_version") != GATE_VERSION:
        return False, "unsupported_model_version"
    if report.get("classes") != list(MOODS) or report.get("vocabulary_fitted_inside_each_fold") is not True:
        return False, "invalid_validation_metadata"
    if not integer(report.get("minimum_participants_per_class"), 15):
        return False, "insufficient_real_participants"
    n = report.get("unique_participants")
    if not integer(n, 15):
        return False, "insufficient_real_participants"
    for mood in MOODS:
        support = report.get("participants_per_class", {}).get(mood)
        count = report.get("class_counts", {}).get(mood)
        if not integer(support, 15) or support > n or not integer(count, support):
            return False, "insufficient_real_participants"
    provenance = report.get("source_summary", {})
    expected = {"source_type": "real", "text_consent_required": True, "phase": "before",
                "self_report_labels": True, "excluded_synthetic": True}
    if any(provenance.get(k) != v for k, v in expected.items()):
        return False, "invalid_training_provenance"
    if not re.fullmatch(r"[a-f0-9]{64}", str(provenance.get("export_sha256", ""))):
        return False, "invalid_training_provenance"
    ev = report.get("evaluation", {})
    if (ev.get("method") != "five-fold stratified participant-grouped cross-validation"
            or ev.get("confusion_matrix_label_order") != list(MOODS)
            or ev.get("confusion_matrix_unit") != "participant-weighted observations"
            or ev.get("calibrated_confidence") is not False):
        return False, "invalid_grouped_evaluation"
    folds = ev.get("folds")
    if not isinstance(folds, list) or len(folds) != 5:
        return False, "invalid_grouped_evaluation"
    test_participants = 0
    for fold in folds:
        if (not isinstance(fold, dict) or not integer(fold.get("participant_overlap")) or fold.get("participant_overlap") != 0
                or not integer(fold.get("train_participants"), 2)
                or not integer(fold.get("test_participants"), 1)
                or fold["train_participants"] + fold["test_participants"] != n
                or any(not integer(fold.get("train_class_counts", {}).get(mood), 1) for mood in MOODS)):
            return False, "invalid_grouped_evaluation"
        test_participants += fold["test_participants"]
    if test_participants != n:
        return False, "invalid_grouped_evaluation"
    try:
        for key in ("model", "majority_class_baseline"):
            values = ev[key]
            f1, accuracy = matrix_metrics(values["confusion_matrix"])
            if (not finite(values.get("macro_f1"), 0, 1) or not finite(values.get("balanced_accuracy"), 0, 1)
                    or abs(values["macro_f1"] - f1) > 1e-7 or abs(values["balanced_accuracy"] - accuracy) > 1e-7
                    or abs(sum(sum(row) for row in values["confusion_matrix"]) - n) > 1e-6):
                return False, "invalid_evaluation_metrics"
        model, baseline = ev["model"], ev["majority_class_baseline"]
        if (model["macro_f1"] <= baseline["macro_f1"] + 1e-6
                or model["balanced_accuracy"] <= baseline["balanced_accuracy"] + 1e-6):
            return False, "model_does_not_outperform_baseline"
    except (KeyError, TypeError, ValueError):
        return False, "invalid_evaluation_metrics"
    return True, "validated_exploratory_model"


def validate_portable(model: dict, report: dict):
    if (not isinstance(model, dict) or model.get("format") != FORMAT or model.get("model_version") != MODEL_VERSION
            or model.get("training_run_id") != report.get("training_run_id")
            or not isinstance(model.get("training_run_id"), str) or len(model["training_run_id"]) < 16
            or model.get("classes") != list(MOODS)
            or model.get("preprocessing") != {"lowercase": True, "token_pattern": TOKEN_PATTERN,
                                              "ngram_range": [1, 2], "sublinear_tf": True, "norm": "l2"}):
        raise ValueError("invalid_portable_model")
    vocab, idf = model.get("vocabulary"), model.get("idf")
    if (not isinstance(vocab, dict) or not 1 <= len(vocab) <= 6000
            or any(not isinstance(token, str) or len(token) > 2048 for token in vocab)
            or any(not integer(index) for index in vocab.values())
            or set(vocab.values()) != set(range(len(vocab)))
            or not isinstance(idf, list) or len(idf) != len(vocab) or any(not finite(v, 1, 1e6) for v in idf)):
        raise ValueError("invalid_portable_model")
    coef, intercept = model.get("coefficients"), model.get("intercepts")
    if (not isinstance(coef, list) or len(coef) != 3
            or any(not isinstance(row, list) or len(row) != len(vocab) for row in coef)
            or any(not finite(v, -1e6, 1e6) for row in coef for v in row)
            or not isinstance(intercept, list) or len(intercept) != 3
            or any(not finite(v, -1e6, 1e6) for v in intercept)):
        raise ValueError("invalid_portable_model")


def load_validated(model_dir: Path):
    """Read only fixed JSON filenames in the admin-configured local directory."""
    try:
        folder = model_dir.resolve(strict=True)
        if not folder.is_dir():
            return None, abstain("model_directory_missing")
        paths = [folder / "evaluation.json", folder / "model.json"]
        if paths[0].is_symlink() or not paths[0].is_file() or not 0 < paths[0].stat().st_size <= MAX_ARTIFACT_BYTES:
            return None, abstain("model_artifacts_missing_or_invalid")
        report = json.loads(paths[0].read_text(encoding="utf-8"))
        valid, reason = validate_evaluation(report)
        if not valid:
            return None, abstain(reason)
        if paths[1].is_symlink() or not paths[1].is_file() or not 0 < paths[1].stat().st_size <= MAX_ARTIFACT_BYTES:
            return None, abstain("model_artifacts_missing_or_invalid")
        raw = paths[1].read_bytes()
        artifact = report.get("model_artifact", {})
        if (artifact.get("file") != "model.json" or artifact.get("format") != FORMAT
                or artifact.get("sha256") != hashlib.sha256(raw).hexdigest()
                or artifact.get("bytes") != len(raw)):
            return None, abstain("model_integrity_check_failed")
        model = json.loads(raw)
        validate_portable(model, report)
        evaluation = report["evaluation"]
        result = {"available": True, "method": "trained-model", "predicted_mood": None,
                  "reason": reason, "model_version": MODEL_VERSION, "calibrated_confidence": False,
                  "evaluation": {"macro_f1": evaluation["model"]["macro_f1"],
                                 "balanced_accuracy": evaluation["model"]["balanced_accuracy"],
                                 "majority_macro_f1": evaluation["majority_class_baseline"]["macro_f1"],
                                 "majority_balanced_accuracy": evaluation["majority_class_baseline"]["balanced_accuracy"]},
                  "participants_per_class": report["participants_per_class"],
                  "confusion_matrix": evaluation["model"]["confusion_matrix"],
                  "confusion_matrix_label_order": list(MOODS),
                  "majority_confusion_matrix": evaluation["majority_class_baseline"]["confusion_matrix"],
                  "uncertainty": "Probabilities are uncalibrated; confirm or correct this suggestion."}
        return model, result
    except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
        return None, abstain("model_artifacts_missing_or_invalid")


def predict_input(model_dir: Path, request: dict):
    if not isinstance(request, dict) or request.get("text_opt_in") is not True:
        return abstain("text_consent_required")
    text = request.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        return abstain("nonempty_text_up_to_1000_characters_required")
    model, result = load_validated(model_dir)
    if model is None:
        return result
    tokens = re.findall(TOKEN_PATTERN, text.lower())
    terms = tokens + [tokens[i] + " " + tokens[i + 1] for i in range(len(tokens) - 1)]
    counts = Counter(terms)
    values = {model["vocabulary"][term]: (1 + math.log(count)) * model["idf"][model["vocabulary"][term]]
              for term, count in counts.items() if term in model["vocabulary"]}
    if not values:
        return abstain("no_supported_vocabulary_keep_self_report")
    norm = math.sqrt(sum(value * value for value in values.values()))
    scores = [intercept + sum(coefficients[index] * value / norm for index, value in values.items())
              for coefficients, intercept in zip(model["coefficients"], model["intercepts"])]
    result["predicted_mood"] = model["classes"][max(range(3), key=scores.__getitem__)]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    try:
        if args.validate_only:
            _, result = load_validated(args.model_dir)
        else:
            raw = sys.stdin.read(8193)
            if len(raw) > 8192:
                result = abstain("invalid_prediction_request")
            else:
                result = predict_input(args.model_dir, json.loads(raw))
    except Exception:
        # A failure must not expose text or a traceback to parent logs.
        result = abstain("invalid_prediction_request")
    sys.stdout.write(json.dumps(result, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
