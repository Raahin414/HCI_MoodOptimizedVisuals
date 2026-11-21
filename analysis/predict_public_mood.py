"""Explicit external-corpus demonstration; never a real MoodSpace study model.

Only numeric JSON artifacts are read. Text arrives through opted-in stdin and is never logged.
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

from predict_mood import MOODS, finite, integer, matrix_metrics

FORMAT = "moodspace-public-hashed-tfidf-logistic-v1"
MODEL_VERSION = "goemotions-proxy-demo-1.0"
SOURCE_COMMIT = "7951440944924ac61b6e2f9a2a3c715834005c40"
SOURCE_TYPE = "external_public"
FEATURES = 8192
TOKEN_PATTERN = r"(?u)\b\w+\b"
MAX_BYTES = 2_000_000
MAPPING = {"positive": ["joy", "excitement", "optimism"], "neutral": ["neutral"],
           "stressed": ["fear", "nervousness"]}
UNCERTAINTY = ("External English Reddit annotation model; fear/nervousness is only a stress proxy, "
               "not the person's self-reported mood. Probabilities are uncalibrated. Confirm or correct it.")


def hashed_counts(text: str) -> dict[int, int]:
    tokens = re.findall(TOKEN_PATTERN, text.lower())
    terms = tokens + [tokens[i] + " " + tokens[i + 1] for i in range(len(tokens) - 1)]
    return dict(Counter(int.from_bytes(hashlib.sha256(term.encode("utf-8")).digest()[:8], "big") % FEATURES for term in terms))


def abstain(reason: str):
    return {"available": False, "method": "public-corpus-model", "source_type": SOURCE_TYPE,
            "predicted_mood": None, "reason": reason, "uncertainty": UNCERTAINTY,
            "calibrated_confidence": False}


def validate_report(report):
    if (not isinstance(report, dict) or report.get("status") != "evaluated_external_public"
            or report.get("source_type") != SOURCE_TYPE or report.get("model_version") != MODEL_VERSION
            or report.get("classes") != list(MOODS) or report.get("class_mapping") != MAPPING
            or report.get("is_moodspace_study_evidence") is not False):
        raise ValueError("invalid_public_model_metadata")
    source = report.get("source", {})
    if (source.get("corpus") != "GoEmotions" or source.get("dataset_license") != "CC-BY-4.0"
            or source.get("commit") != SOURCE_COMMIT
            or source.get("author_group_validation") is not False):
        raise ValueError("invalid_public_source")
    for name in ("train.tsv", "dev.tsv", "test.tsv", "emotions.txt"):
        if not re.fullmatch(r"[a-f0-9]{64}", source.get("downloads", {}).get(name, {}).get("sha256", "")):
            raise ValueError("invalid_public_source")
    protocol = report.get("protocol", {})
    if (protocol.get("split_strategy") != "official_train_dev_test_remove_duplicate_texts"
            or protocol.get("hyperparameter_selection") != "validation_only"
            or protocol.get("heldout_test_evaluations") != 1
            or protocol.get("refit_after_test") is not False
            or protocol.get("training_features") != "sha256-hashed-word-1-2-grams-tfidf"
            or protocol.get("self_report_labels") is not False
            or protocol.get("participant_grouped_validation") is not False
            or protocol.get("cross_split_normalized_text_overlap") != 0):
        raise ValueError("invalid_public_evaluation_protocol")
    evaluation = report.get("evaluation", {})
    counts = report.get("split_counts", {}).get("test", {}).get("used_class_counts", {})
    if any(not integer(counts.get(mood), 20) for mood in MOODS):
        raise ValueError("insufficient_public_test_support")
    n = sum(counts.values())
    for key in ("model", "majority_class_baseline"):
        entry = evaluation[key]
        f1, accuracy = matrix_metrics(entry["confusion_matrix"])
        if (not finite(entry.get("macro_f1"), 0, 1) or not finite(entry.get("balanced_accuracy"), 0, 1)
                or abs(f1 - entry["macro_f1"]) > 1e-7 or abs(accuracy - entry["balanced_accuracy"]) > 1e-7
                or sum(sum(row) for row in entry["confusion_matrix"]) != n
                or [sum(row) for row in entry["confusion_matrix"]] != [counts[m] for m in MOODS]):
            raise ValueError("invalid_public_test_metrics")
    baseline = evaluation["majority_class_baseline"]
    model = evaluation["model"]
    if model["macro_f1"] <= baseline["macro_f1"] + 1e-6 or model["balanced_accuracy"] <= baseline["balanced_accuracy"] + 1e-6:
        raise ValueError("public_model_does_not_outperform_baseline")


def load_validated(model_dir: Path):
    try:
        folder = model_dir.resolve(strict=True)
        evaluation_file, model_file = folder / "evaluation.json", folder / "model.json"
        if any(p.is_symlink() or not p.is_file() or not 0 < p.stat().st_size <= MAX_BYTES for p in (evaluation_file, model_file)):
            return None, abstain("public_artifacts_missing_or_invalid")
        report = json.loads(evaluation_file.read_text(encoding="utf-8"))
        validate_report(report)
        raw = model_file.read_bytes()
        artifact = report.get("model_artifact", {})
        if (artifact.get("file") != "model.json" or artifact.get("format") != FORMAT
                or artifact.get("sha256") != hashlib.sha256(raw).hexdigest() or artifact.get("bytes") != len(raw)):
            return None, abstain("public_artifact_integrity_failed")
        model = json.loads(raw)
        preprocessing = {"lowercase": True, "token_pattern": TOKEN_PATTERN, "ngram_range": [1, 2],
                         "hash": "sha256-first8-big-endian-mod8192", "sublinear_tf": True, "norm": "l2"}
        if (model.get("format") != FORMAT or model.get("model_version") != MODEL_VERSION
                or model.get("source_type") != SOURCE_TYPE or model.get("classes") != list(MOODS)
                or model.get("training_run_id") != report.get("training_run_id")
                or not isinstance(model.get("training_run_id"), str) or len(model["training_run_id"]) < 16
                or model.get("preprocessing") != preprocessing):
            return None, abstain("invalid_public_portable_model")
        idf, coefficients, intercepts, seen = model.get("idf"), model.get("coefficients"), model.get("intercepts"), model.get("seen_features")
        if (not isinstance(idf, list) or len(idf) != FEATURES or any(not finite(v, 1, 1e6) for v in idf)
                or not isinstance(coefficients, list) or len(coefficients) != 3
                or any(not isinstance(row, list) or len(row) != FEATURES for row in coefficients)
                or any(not finite(v, -1e6, 1e6) for row in coefficients for v in row)
                or not isinstance(intercepts, list) or len(intercepts) != 3 or any(not finite(v, -1e6, 1e6) for v in intercepts)
                or not isinstance(seen, list) or len(set(seen)) != len(seen) or not seen
                or any(not integer(v) or v >= FEATURES for v in seen)):
            return None, abstain("invalid_public_portable_weights")
        ev = report["evaluation"]
        result = {"available": True, "method": "public-corpus-model", "source_type": SOURCE_TYPE,
                  "predicted_mood": None, "reason": "validated_external_public_proxy_demo",
                  "model_version": MODEL_VERSION, "uncertainty": UNCERTAINTY, "calibrated_confidence": False,
                  "evaluation": {"macro_f1": ev["model"]["macro_f1"], "balanced_accuracy": ev["model"]["balanced_accuracy"],
                                 "majority_macro_f1": ev["majority_class_baseline"]["macro_f1"],
                                 "majority_balanced_accuracy": ev["majority_class_baseline"]["balanced_accuracy"]},
                  "confusion_matrix": ev["model"]["confusion_matrix"], "confusion_matrix_label_order": list(MOODS),
                  "test_class_counts": report["split_counts"]["test"]["used_class_counts"],
                  "is_moodspace_study_evidence": False}
        return model, result
    except (OSError, ValueError, TypeError, KeyError, AttributeError, OverflowError):
        return None, abstain("public_artifacts_or_evaluation_invalid")


def predict_input(model_dir: Path, request: dict):
    if not isinstance(request, dict) or request.get("text_opt_in") is not True:
        return abstain("text_consent_required")
    text = request.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        return abstain("nonempty_text_up_to_1000_characters_required")
    model, result = load_validated(model_dir)
    if model is None:
        return result
    predicted = predict_portable(model, text)
    if predicted is None:
        return abstain("no_supported_features_keep_self_report")
    result["predicted_mood"] = predicted
    return result


def predict_portable(model, text):
    counts = hashed_counts(text)
    if not set(counts).intersection(model["seen_features"]):
        return None
    values = {index: (1 + math.log(count)) * model["idf"][index] for index, count in counts.items()}
    norm = math.sqrt(sum(value * value for value in values.values()))
    scores = [intercept + sum(row[index] * value / norm for index, value in values.items())
              for row, intercept in zip(model["coefficients"], model["intercepts"])]
    return model["classes"][max(range(3), key=scores.__getitem__)]


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
            result = abstain("invalid_prediction_request") if len(raw) > 8192 else predict_input(args.model_dir, json.loads(raw))
    except Exception:
        result = abstain("invalid_prediction_request")
    sys.stdout.write(json.dumps(result, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
