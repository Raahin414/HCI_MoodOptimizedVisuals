"""Public-model separation and pipeline regression tests; fixtures are invented here."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from experiment_public_mood import map_labels, normalized, prepare_splits, sparse_counts
from predict_mood import load_validated as load_real_model, matrix_metrics
from predict_public_mood import (FEATURES, FORMAT, MAPPING, MODEL_VERSION, MOODS, SOURCE_COMMIT,
                                 SOURCE_TYPE, TOKEN_PATTERN, hashed_counts, load_validated,
                                 predict_input, predict_portable)

ROOT = Path(__file__).resolve().parents[1]


def temporary_artifacts(folder):
    # These fixtures never enter models/ or the DB and contain no public-corpus comments.
    words = ("sunbeam", "levelness", "thunderous")
    indices = [next(iter(hashed_counts(word))) for word in words]
    assert len(set(indices)) == 3
    coefficients = [[0.0] * FEATURES for _ in MOODS]
    for i, index in enumerate(indices):
        coefficients[i][index] = 3.0
    model = {"format": FORMAT, "model_version": MODEL_VERSION, "source_type": SOURCE_TYPE,
             "training_run_id": "isolated-public-model-test-0001", "classes": list(MOODS),
             "preprocessing": {"lowercase": True, "token_pattern": TOKEN_PATTERN, "ngram_range": [1, 2],
                               "hash": "sha256-first8-big-endian-mod8192", "sublinear_tf": True, "norm": "l2"},
             "idf": [1.0] * FEATURES, "coefficients": coefficients, "intercepts": [0, 0, 0],
             "seen_features": indices}
    good = [[20, 0, 0], [0, 20, 0], [0, 0, 20]]
    baseline = [[0, 20, 0], [0, 20, 0], [0, 20, 0]]
    def metrics(matrix):
        f1, accuracy = matrix_metrics(matrix)
        return {"macro_f1": f1, "balanced_accuracy": accuracy, "confusion_matrix": matrix}
    report = {"status": "evaluated_external_public", "source_type": SOURCE_TYPE, "model_version": MODEL_VERSION,
              "classes": list(MOODS), "training_run_id": model["training_run_id"], "class_mapping": MAPPING,
              "is_moodspace_study_evidence": False, "source": {"corpus": "GoEmotions", "dataset_license": "CC-BY-4.0",
              "commit": SOURCE_COMMIT, "author_group_validation": False,
              "downloads": {name: {"sha256": "0" * 64} for name in ("train.tsv", "dev.tsv", "test.tsv", "emotions.txt")}},
              "protocol": {"split_strategy": "official_train_dev_test_remove_duplicate_texts", "hyperparameter_selection": "validation_only",
                           "heldout_test_evaluations": 1, "refit_after_test": False,
                           "training_features": "sha256-hashed-word-1-2-grams-tfidf", "cross_split_normalized_text_overlap": 0,
                           "self_report_labels": False, "participant_grouped_validation": False},
              "split_counts": {"test": {"used_class_counts": dict.fromkeys(MOODS, 20)}},
              "evaluation": {"model": metrics(good), "majority_class_baseline": metrics(baseline)}}
    write_artifacts(folder, model, report)
    return model, report, words


def write_artifacts(folder, model, report):
    raw = json.dumps(model, separators=(",", ":"), allow_nan=False).encode("utf-8")
    (folder / "model.json").write_bytes(raw)
    report["model_artifact"] = {"file": "model.json", "format": FORMAT, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    (folder / "evaluation.json").write_text(json.dumps(report), encoding="utf-8")


class PublicMoodChecks(unittest.TestCase):
    def setUp(self):
        (ROOT / "work").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / "work")
        self.folder = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_strict_native_mapping_rejects_ambiguous_or_unrelated_labels(self):
        self.assertEqual(map_labels(["joy", "optimism"]), "positive")
        self.assertEqual(map_labels(["fear", "nervousness"]), "stressed")
        self.assertEqual(map_labels(["neutral"]), "neutral")
        for labels in ([], ["joy", "neutral"], ["joy", "love"], ["sadness"], ["fear", "anger"]):
            self.assertIsNone(map_labels(labels))

    def test_dedup_drops_all_copies_across_and_within_official_splits(self):
        def row(text, identifier, labels):
            return {"text": text, "comment_id": identifier, "native_labels": labels}
        source = {"train": [row("Shared  TEXT", "a", ["joy"]), row("unique training sentence", "b", ["neutral"])],
                  "dev": [row(" shared text ", "c", ["joy"]), row("unique validation sentence", "d", ["fear"])],
                  "test": [row("unique heldout sentence", "e", ["optimism"]), row("same id different text", "b", ["neutral"])]}
        prepared, metadata = prepare_splits(source)
        self.assertEqual(prepared["train"], [])
        self.assertEqual(len(prepared["dev"]), 1)
        self.assertEqual(len(prepared["test"]), 1)
        self.assertEqual(metadata["train"]["excluded"]["repeated_normalized_text_or_comment_id"], 2)
        self.assertEqual(normalized("ＦＵＬＬ   WIDTH"), "full width")

    def test_hashes_are_deterministic_and_model_contains_no_corpus_vocabulary(self):
        self.assertEqual(hashed_counts("Repeated repeated"), hashed_counts("repeated REPEATED"))
        counts = hashed_counts("a a")
        self.assertEqual(sum(counts.values()), 3)  # two unigrams, one bigram
        self.assertTrue(all(0 <= index < FEATURES for index in counts))
        model, _, _ = temporary_artifacts(self.folder)
        self.assertNotIn("vocabulary", model)
        self.assertNotIn("text", model)

    def test_predicts_three_classes_and_never_passes_genuine_study_gate(self):
        _, _, words = temporary_artifacts(self.folder)
        for mood, word in zip(MOODS, words):
            result = predict_input(self.folder, {"text": word, "text_opt_in": True})
            self.assertTrue(result["available"])
            self.assertEqual(result["predicted_mood"], mood)
            self.assertEqual(result["source_type"], "external_public")
            self.assertFalse(result["is_moodspace_study_evidence"])
            self.assertIn("proxy", result["uncertainty"])
        self.assertFalse(load_real_model(self.folder)[1]["available"])

    def test_no_consent_empty_unknown_and_missing_artifact_abstain(self):
        self.assertFalse(load_validated(self.folder)[1]["available"])
        temporary_artifacts(self.folder)
        for request in ({"text": "sunbeam", "text_opt_in": False}, {"text": "sunbeam"},
                        {"text": " ", "text_opt_in": True}, {"text": "x" * 1001, "text_opt_in": True},
                        {"text": "unobservedfeatures", "text_opt_in": True}):
            self.assertFalse(predict_input(self.folder, request)["available"])

    def test_bad_hash_malformed_model_and_failed_baseline_abstain(self):
        model, original, _ = temporary_artifacts(self.folder)
        (self.folder / "model.json").write_text("{}", encoding="utf-8")
        self.assertEqual(load_validated(self.folder)[1]["reason"], "public_artifact_integrity_failed")
        write_artifacts(self.folder, model, original)
        for mutation in (lambda r: r["evaluation"].update(model=copy.deepcopy(r["evaluation"]["majority_class_baseline"])),
                         lambda r: r.update(source_type="real"),
                         lambda r: r["protocol"].update(cross_split_normalized_text_overlap=1),
                         lambda r: r["protocol"].update(hyperparameter_selection="test"),
                         lambda r: r["source"].update(author_group_validation=True),
                         lambda r: r["split_counts"]["test"]["used_class_counts"].update(stressed=1)):
            report = copy.deepcopy(original)
            mutation(report)
            (self.folder / "evaluation.json").write_text(json.dumps(report), encoding="utf-8")
            self.assertFalse(load_validated(self.folder)[1]["available"])
        model["idf"] = [float("nan")] * FEATURES
        # JSON malformed numeric payload must fail safely without a traceback.
        (self.folder / "model.json").write_text(json.dumps(model), encoding="utf-8")
        self.assertFalse(load_validated(self.folder)[1]["available"])

    def test_cli_does_not_log_opted_in_text_and_has_compact_metadata(self):
        temporary_artifacts(self.folder)
        command = [sys.executable, str(ROOT / "analysis/predict_public_mood.py"), "--model-dir", str(self.folder)]
        result = subprocess.run(command, input=json.dumps({"text": "PRIVATE sunbeam", "text_opt_in": True}), text=True, capture_output=True, check=True)
        self.assertNotIn("PRIVATE", result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["method"], "public-corpus-model")
        self.assertLess(len(result.stdout.encode()), 32000)
        result = subprocess.run(command, input="{PRIVATE", text=True, capture_output=True, check=True)
        self.assertFalse(json.loads(result.stdout)["available"])
        self.assertEqual(result.stderr, "")
        result = subprocess.run(command + ["--validate-only"], text=True, capture_output=True, check=True)
        self.assertTrue(json.loads(result.stdout)["available"])
        self.assertIsNone(json.loads(result.stdout)["predicted_mood"])

    @unittest.skipUnless(importlib.util.find_spec("sklearn"), "optional training dependencies unavailable")
    def test_portable_hashed_inference_matches_sklearn_on_authored_fixture(self):
        import numpy as np
        from sklearn.feature_extraction.text import TfidfTransformer
        from sklearn.linear_model import LogisticRegression
        sentences = ["sunbeam bright", "sunbeam energy", "levelness even", "levelness routine", "thunderous worry", "thunderous fear"]
        labels = np.array(["positive", "positive", "neutral", "neutral", "stressed", "stressed"])
        counts = sparse_counts(sentences)
        transformer = TfidfTransformer(sublinear_tf=True).fit(counts)
        matrix = transformer.transform(counts)
        fit = LogisticRegression(C=1).fit(matrix, labels)
        ordered = [list(fit.classes_).index(mood) for mood in MOODS]
        model = {"classes": list(MOODS), "idf": transformer.idf_.tolist(), "coefficients": fit.coef_[ordered].tolist(),
                 "intercepts": fit.intercept_[ordered].tolist(), "seen_features": np.flatnonzero(counts.getnnz(axis=0)).tolist()}
        self.assertEqual([predict_portable(model, sentence) for sentence in sentences], list(fit.predict(matrix)))

    def test_distributed_external_artifact_cannot_activate_real_gate(self):
        folder = ROOT / "models/public-corpus-demo"
        if not (folder / "model.json").exists():
            self.skipTest("external benchmark artifact not built")
        self.assertTrue(load_validated(folder)[1]["available"])
        self.assertFalse(load_real_model(folder)[1]["available"])
        raw = json.loads((folder / "model.json").read_text(encoding="utf-8"))
        self.assertNotIn("vocabulary", raw)
        self.assertNotIn("text", raw)


if __name__ == "__main__":
    unittest.main()
