"""Deployment-gate tests use temporary artifacts; no application DB is touched."""
from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from predict_mood import (FORMAT, GATE_VERSION, MODEL_VERSION, MOODS, TOKEN_PATTERN,
                          load_validated, matrix_metrics, predict_input)
from test_analysis import add_person, observation, payload
from train_mood import eligible_texts, train

ROOT = Path(__file__).resolve().parents[1]


def isolated_artifacts(folder: Path):
    """A tiny declarative test model, never persisted or labeled as research evidence."""
    model = {"format": FORMAT, "model_version": MODEL_VERSION, "training_run_id": "isolated-test-run-0001",
             "classes": list(MOODS), "preprocessing": {"lowercase": True, "token_pattern": TOKEN_PATTERN,
             "ngram_range": [1, 2], "sublinear_tf": True, "norm": "l2"},
             "vocabulary": {"happy": 0, "steady": 1, "worried": 2}, "idf": [1.0, 1.0, 1.0],
             "coefficients": [[2.0, 0.0, 0.0], [0.0, 2.0, 0.0], [0.0, 0.0, 2.0]], "intercepts": [0, 0, 0]}
    good = [[15.0, 0.0, 0.0], [0.0, 15.0, 0.0], [0.0, 0.0, 15.0]]
    baseline = [[15.0, 0.0, 0.0], [15.0, 0.0, 0.0], [15.0, 0.0, 0.0]]
    def metrics(matrix):
        f1, accuracy = matrix_metrics(matrix)
        return {"macro_f1": f1, "balanced_accuracy": accuracy, "confusion_matrix": matrix}
    report = {"model_version": MODEL_VERSION, "gate_version": GATE_VERSION, "status": "evaluated_offline",
              "training_run_id": model["training_run_id"], "classes": list(MOODS), "minimum_participants_per_class": 15,
              "participants_per_class": dict.fromkeys(MOODS, 15), "class_counts": dict.fromkeys(MOODS, 15),
              "unique_participants": 45, "vocabulary_fitted_inside_each_fold": True,
              "source_summary": {"source_type": "real", "text_consent_required": True, "phase": "before",
                                 "self_report_labels": True, "excluded_synthetic": True, "export_sha256": "0" * 64},
              "evaluation": {"method": "five-fold stratified participant-grouped cross-validation",
                             "confusion_matrix_label_order": list(MOODS), "confusion_matrix_unit": "participant-weighted observations",
                             "calibrated_confidence": False, "model": metrics(good), "majority_class_baseline": metrics(baseline),
                             "folds": [{"train_participants": 36, "test_participants": 9, "participant_overlap": 0,
                                        "train_class_counts": dict.fromkeys(MOODS, 12)} for _ in range(5)]}}
    write_artifacts(folder, model, report)
    return model, report


def write_artifacts(folder, model, report):
    raw = json.dumps(model, separators=(",", ":"), allow_nan=False).encode("utf-8")
    (folder / "model.json").write_bytes(raw)
    report["model_artifact"] = {"file": "model.json", "format": FORMAT, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    (folder / "evaluation.json").write_text(json.dumps(report), encoding="utf-8")


class PredictionChecks(unittest.TestCase):
    def setUp(self):
        (ROOT / "work").mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=ROOT / "work")
        self.folder = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def test_missing_malformed_and_legacy_artifacts_abstain(self):
        self.assertFalse(load_validated(self.folder)[1]["available"])
        (self.folder / "evaluation.json").write_text("{bad", encoding="utf-8")
        (self.folder / "model.json").write_text("{}", encoding="utf-8")
        self.assertFalse(load_validated(self.folder)[1]["available"])
        (self.folder / "evaluation.json").write_text(json.dumps({"status": "evaluated_offline", "model_version": "moodspace-text-1.0"}), encoding="utf-8")
        self.assertEqual(load_validated(self.folder)[1]["reason"], "unsupported_model_version")

    def test_sufficient_evaluation_predicts_all_classes_without_confidence(self):
        isolated_artifacts(self.folder)
        for text, mood in (("Happy", "positive"), ("steady", "neutral"), ("worried", "stressed")):
            result = predict_input(self.folder, {"text": text, "text_opt_in": True})
            self.assertTrue(result["available"])
            self.assertEqual(result["predicted_mood"], mood)
            self.assertNotIn("confidence", result)
            self.assertNotIn("text", result)
            self.assertFalse(result["calibrated_confidence"])

    def test_consent_empty_input_and_unknown_vocabulary_abstain(self):
        isolated_artifacts(self.folder)
        for request in ({"text": "happy", "text_opt_in": False}, {"text": "happy", "text_opt_in": "true"},
                        {"text": "", "text_opt_in": True}, {"text": "x" * 1001, "text_opt_in": True},
                        {"text": "unseen vocabulary", "text_opt_in": True}):
            self.assertFalse(predict_input(self.folder, request)["available"])

    def test_hash_mismatch_and_version_mismatch_abstain(self):
        model, report = isolated_artifacts(self.folder)
        (self.folder / "model.json").write_text("{}", encoding="utf-8")
        self.assertEqual(load_validated(self.folder)[1]["reason"], "model_integrity_check_failed")
        model["model_version"] = "forged-version"
        write_artifacts(self.folder, model, report)
        self.assertFalse(load_validated(self.folder)[1]["available"])

    def test_insufficient_support_bad_folds_and_nonreal_provenance_abstain(self):
        _, original = isolated_artifacts(self.folder)
        for mutation in (lambda r: r["participants_per_class"].update(positive=14),
                         lambda r: r["evaluation"]["folds"][0].update(participant_overlap=1),
                         lambda r: r["source_summary"].update(source_type="automated_test"),
                         lambda r: r["source_summary"].update(excluded_synthetic=False)):
            report = copy.deepcopy(original)
            mutation(report)
            (self.folder / "evaluation.json").write_text(json.dumps(report), encoding="utf-8")
            self.assertFalse(load_validated(self.folder)[1]["available"])

    def test_baseline_failure_or_fabricated_summary_metrics_abstain(self):
        _, report = isolated_artifacts(self.folder)
        report["evaluation"]["model"] = copy.deepcopy(report["evaluation"]["majority_class_baseline"])
        (self.folder / "evaluation.json").write_text(json.dumps(report), encoding="utf-8")
        self.assertEqual(load_validated(self.folder)[1]["reason"], "model_does_not_outperform_baseline")
        report["evaluation"]["model"]["macro_f1"] = 0.99
        (self.folder / "evaluation.json").write_text(json.dumps(report), encoding="utf-8")
        self.assertEqual(load_validated(self.folder)[1]["reason"], "invalid_evaluation_metrics")

    def test_cli_stdout_contract_and_malformed_input_do_not_leak_text(self):
        isolated_artifacts(self.folder)
        command = [sys.executable, str(ROOT / "analysis" / "predict_mood.py"), "--model-dir", str(self.folder)]
        process = subprocess.run(command, input=json.dumps({"text": "PRIVATE happy", "text_opt_in": True}), capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(process.stdout)["predicted_mood"], "positive")
        self.assertNotIn("PRIVATE", process.stdout + process.stderr)
        process = subprocess.run(command, input="{PRIVATE", capture_output=True, text=True, check=True)
        self.assertFalse(json.loads(process.stdout)["available"])
        self.assertEqual(process.stderr, "")
        process = subprocess.run(command + ["--validate-only"], capture_output=True, text=True, check=True)
        self.assertTrue(json.loads(process.stdout)["available"])
        self.assertIsNone(json.loads(process.stdout)["predicted_mood"])

    def test_reference_label_prevents_prediction_feedback_leakage(self):
        data = payload()
        add_person(data, "p1", "s1")
        data["tables"]["sessions"][0]["mode"] = "workspace"
        data["tables"]["mood_reports"].append(observation("p1", "s1", phase="before", mood="positive", reference_mood="stressed", text_opt_in=True, text="I am feeling pressured"))
        rows, _ = eligible_texts(data)
        self.assertEqual(rows[0]["mood"], "stressed")
        from analyze_study import summarize
        self.assertEqual(summarize(data)["sessions"], 0)

    def test_insufficient_training_invalidates_stale_good_deployment(self):
        isolated_artifacts(self.folder)
        self.assertTrue(load_validated(self.folder)[1]["available"])
        train(payload(), self.folder)
        self.assertFalse(load_validated(self.folder)[1]["available"])


if __name__ == "__main__":
    unittest.main()
