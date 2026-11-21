"""Isolated analysis fixtures: never inserted into the application database."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

from analyze_study import summarize
from train_mood import eligible_texts, readiness, train


def payload():
    return {"manifest": {"study_version": "analysis-automated-test"}, "tables": {
        name: [] for name in ("participants", "sessions", "mood_reports", "trials", "variant_feedback", "gallery_choices")}}


def add_person(data, participant, session, mood="neutral", source="real"):
    # `real` here exercises the provenance boundary in memory only.
    if not any(p["id"] == participant for p in data["tables"]["participants"]):
        data["tables"]["participants"].append({"id": participant, "source_type": source})
    data["tables"]["sessions"].append({"id": session, "participant_id": participant, "source_type": source,
                                       "consented_at": "2026-01-01T00:00:00Z", "consent_version": "test-only",
                                       "mood": mood, "status": "active"})


def observation(participant, session, **fields):
    return {"participant_id": participant, "session_id": session, "source_type": "real", **fields}


class AnalysisChecks(unittest.TestCase):
    def test_empty_data_is_not_trainable_and_has_all_cells(self):
        _, report = readiness(payload())
        self.assertEqual(report["status"], "not_trainable")
        self.assertEqual(report["class_counts"], {"positive": 0, "neutral": 0, "stressed": 0})
        summary = summarize(payload())
        self.assertEqual(len(summary["coverage"]), 24)
        self.assertTrue(all(c["unique_participants"] == 0 for c in summary["coverage"]))
        self.assertTrue(all(r["status"] == "insufficient_evidence" for r in summary["recommendation_readiness"].values()))

    def test_consent_provenance_and_phase_fail_closed(self):
        data = payload()
        add_person(data, "p1", "s1")
        add_person(data, "p2", "s2", source="demo")
        for index, fields in enumerate((
            {"text_opt_in": False, "text": "personal text"},
            {"text_opt_in": "true", "text": "personal text"},
            {"text_opt_in": True, "text": "  "},
            {"text_opt_in": True, "text": "after-only", "phase": "after"},
        )):
            data["tables"]["mood_reports"].append(observation("p1", "s1", id=f"m{index}", mood="neutral", phase="before", **{k:v for k,v in fields.items() if k != "phase"}))
            if "phase" in fields:
                data["tables"]["mood_reports"][-1]["phase"] = fields["phase"]
        data["tables"]["mood_reports"].append({**observation("p2", "s2", phase="before", mood="neutral", text_opt_in=True, text="demo"), "source_type": "demo"})
        rows, excluded = eligible_texts(data)
        self.assertEqual(rows, [])
        self.assertEqual(excluded["no_explicit_text_opt_in"], 2)
        self.assertEqual(excluded["not_before_study"], 1)
        self.assertEqual(summarize(data)["real_participants"], 1)

    def test_repeated_sessions_do_not_meet_distinct_participant_floor(self):
        data = payload()
        for i in range(20):
            add_person(data, "same-person", f"s{i}")
            data["tables"]["mood_reports"].append(observation("same-person", f"s{i}", phase="before", mood="neutral", text_opt_in=True, text="steady and ready"))
        _, report = readiness(data)
        self.assertEqual(report["class_counts"]["neutral"], 20)
        self.assertEqual(report["participants_per_class"]["neutral"], 1)
        self.assertEqual(report["status"], "not_trainable")

    def test_observed_trials_aggregate_by_participant_not_rows(self):
        data = payload()
        add_person(data, "p1", "s1")
        add_person(data, "p2", "s2")
        for elapsed in (1000, 3000):
            data["tables"]["trials"].append(observation("p1", "s1", ui_variant="U01", task_family="lookup", status="success", elapsed_ms=elapsed, error_count=0))
        data["tables"]["trials"].append(observation("p2", "s2", ui_variant="U01", task_family="lookup", status="timeout", elapsed_ms=90000, error_count=0))
        data["tables"]["trials"].append(observation("p2", "s2", ui_variant="U02", task_family="lookup", status="active", elapsed_ms=None))
        cell = summarize(data)["overall"][0]
        self.assertEqual(cell["unique_participants"], 2)
        self.assertEqual(cell["participant_mean_success_rate"], 0.5)
        self.assertEqual(cell["median_participant_successful_ms"], 2000)
        self.assertEqual(cell["median_participant_family_time_ratio"], 1.0)
        self.assertEqual(cell["statuses"]["timeout"], 1)
        self.assertEqual(summarize(data)["overall"][1]["observed_trials"], 0)

    def test_mismatched_person_and_unknown_provenance_excluded(self):
        data = payload()
        add_person(data, "p1", "s1")
        data["tables"]["trials"].append(observation("someone-else", "s1", ui_variant="U01", status="success"))
        data["tables"]["trials"].append({"participant_id": "p1", "session_id": "s1", "ui_variant": "U01", "status": "success"})
        self.assertEqual(summarize(data)["overall"][0]["observed_trials"], 0)

    def test_readiness_cannot_lower_prespecified_floor(self):
        with self.assertRaises(ValueError):
            readiness(payload(), minimum=1)

    def test_not_trainable_writes_no_model_or_accuracy(self):
        scratch = Path(__file__).resolve().parents[1] / "work"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            report = train(payload(), Path(folder))
            self.assertEqual(report["status"], "not_trainable")
            self.assertIsNone(report["evaluation"])
            self.assertFalse((Path(folder) / "model.joblib").exists())

    @unittest.skipUnless(importlib.util.find_spec("sklearn"), "optional scikit-learn not installed")
    def test_grouped_training_full_path_is_isolated(self):
        data = payload()
        words = {"positive": "energized optimistic cheerful", "neutral": "steady balanced ordinary", "stressed": "overwhelmed pressured worried"}
        for mood, text in words.items():
            for i in range(15):
                person = f"isolated-test-{mood}-{i}"
                add_person(data, person, person, mood)
                data["tables"]["mood_reports"].append(observation(person, person, phase="before", mood=mood, text_opt_in=True, text=f"{text} today"))
        scratch = Path(__file__).resolve().parents[1] / "work"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as folder:
            result = train(data, Path(folder))
            self.assertEqual(result["status"], "evaluated_offline")
            self.assertEqual(result["evaluation"]["method"], "five-fold stratified participant-grouped cross-validation")
            self.assertTrue(all(fold["participant_overlap"] == 0 for fold in result["evaluation"]["folds"]))
            self.assertTrue((Path(folder) / "model.joblib").exists())
            self.assertEqual(result["participants_per_class"], {"positive": 15, "neutral": 15, "stressed": 15})
            self.assertTrue(result["deployment_eligible"])
            from predict_mood import load_validated, predict_input
            self.assertTrue(load_validated(Path(folder))[1]["available"])
            for mood, sentence in words.items():
                predicted = predict_input(Path(folder), {"text": sentence, "text_opt_in": True})
                self.assertEqual(predicted["predicted_mood"], mood)


if __name__ == "__main__":
    unittest.main()
