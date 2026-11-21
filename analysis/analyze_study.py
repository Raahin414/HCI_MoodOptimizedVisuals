"""Descriptive MoodSpace export analysis; standard library only.

Usage: python analysis/analyze_study.py exports/<stamp>/study.json --out work/analysis.json
No fake records are generated, and non-real/unknown provenance is always excluded.
"""
from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median

MOODS = ("positive", "neutral", "stressed")
UIS = tuple(f"U{i:02d}" for i in range(1, 9))
TERMINAL = {"success", "incorrect", "timeout", "give_up", "abandoned"}
MIN_SUPPORT = 8


def records(payload: dict, table: str) -> list[dict]:
    """Accept the flattened JSON export, or equivalent internal JSON-data rows."""
    result = []
    for row in payload.get("tables", {}).get(table, []):
        if not isinstance(row, dict):
            continue
        data = row.get("data")
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except (ValueError, TypeError):
                data = {}
        result.append({**row, **data} if isinstance(data, dict) else row)
    return result


def real_sessions(payload: dict) -> dict[str, dict]:
    people = {p["id"] for p in records(payload, "participants")
              if p.get("source_type") == "real" and p.get("id")}
    return {s["id"]: s for s in records(payload, "sessions")
            if s.get("source_type") == "real" and s.get("participant_id") in people
            and s.get("id") and s.get("consented_at") and s.get("consent_version")}


def eligible_rows(payload: dict, table: str, sessions: dict[str, dict]) -> list[dict]:
    return [{**row, "participant_id": sessions[row["session_id"]]["participant_id"]}
            for row in records(payload, table)
            if row.get("source_type") == "real" and row.get("session_id") in sessions
            and row.get("participant_id") == sessions[row["session_id"]].get("participant_id")]


def safe_median(values):
    selected = [value for value in values if isinstance(value, (int, float))
                and not isinstance(value, bool) and math.isfinite(value)]
    return median(selected) if selected else None


def summarize(payload: dict) -> dict:
    # Direct workspace use is not a randomized experimental exposure.
    sessions = {sid: session for sid, session in real_sessions(payload).items()
                if session.get("mode", "study") == "study"}
    trials = [r for r in eligible_rows(payload, "trials", sessions)
              if r.get("ui_variant") in UIS and r.get("status") in TERMINAL]
    feedback = eligible_rows(payload, "variant_feedback", sessions)
    choices = eligible_rows(payload, "gallery_choices", sessions)
    family_times = defaultdict(list)
    for trial in trials:
        if trial.get("status") == "success" and isinstance(trial.get("elapsed_ms"), (int, float)) and trial["elapsed_ms"] > 0:
            family_times[trial.get("task_family", "unknown")].append(trial["elapsed_ms"])
    family_medians = {family: median(times) for family, times in family_times.items()}

    def cell(ui: str, mood: str | None):
        selected = [r for r in trials if r["ui_variant"] == ui
                    and (mood is None or sessions[r["session_id"]].get("mood") == mood)]
        by_person = defaultdict(list)
        for row in selected:
            by_person[row["participant_id"]].append(row)
        person_success, person_times, person_adjusted, person_errors = [], [], [], []
        for rows in by_person.values():
            person_success.append(mean(r["status"] == "success" for r in rows))
            person_errors.append(mean(r.get("error_count", 0) for r in rows))
            times = [r["elapsed_ms"] for r in rows if r["status"] == "success"
                     and isinstance(r.get("elapsed_ms"), (int, float)) and r["elapsed_ms"] > 0]
            if times:
                person_times.append(median(times))
            adjusted = [r["elapsed_ms"] / family_medians[r.get("task_family", "unknown")]
                        for r in rows if r["status"] == "success"
                        and isinstance(r.get("elapsed_ms"), (int, float)) and r["elapsed_ms"] > 0
                        and r.get("task_family", "unknown") in family_medians]
            if adjusted:
                person_adjusted.append(median(adjusted))
        selected_feedback = [r for r in feedback if r.get("ui_variant") == ui
                             and r["participant_id"] in by_person
                             and (mood is None or sessions[r["session_id"]].get("mood") == mood)]
        ratings = {}
        for field in ("effort", "satisfaction", "clarity", "reuse_intent"):
            grouped = defaultdict(list)
            for row in selected_feedback:
                value = row.get(field)
                if isinstance(value, (int, float)):
                    grouped[row["participant_id"]].append(value)
            values = [mean(items) for items in grouped.values()]
            ratings[field] = {"participants": len(values), "mean": mean(values) if values else None,
                              "median": safe_median(values)}
        return {"ui_variant": ui, "mood": mood or "overall", "unique_participants": len(by_person),
                "exposures": len({r["session_id"] for r in selected}), "observed_trials": len(selected),
                "participant_mean_success_rate": mean(person_success) if person_success else None,
                "median_participant_successful_ms": safe_median(person_times),
                "median_participant_family_time_ratio": safe_median(person_adjusted),
                "mean_participant_errors": mean(person_errors) if person_errors else None,
                "statuses": dict(Counter(r["status"] for r in selected)), "ratings": ratings}

    coverage = [cell(ui, mood) for mood in MOODS for ui in UIS]
    overall = [cell(ui, None) for ui in UIS]
    readiness = {}
    for mood in (*MOODS, "overall"):
        cells = overall if mood == "overall" else [r for r in coverage if r["mood"] == mood]
        missing = [{"ui_variant": c["ui_variant"], "needed": max(0, MIN_SUPPORT - c["unique_participants"])}
                   for c in cells if c["unique_participants"] < MIN_SUPPORT]
        readiness[mood] = {"status": "insufficient_evidence" if missing else "exploratory_support_met",
                           "minimum_unique_participants_per_cell": MIN_SUPPORT, "missing": missing}
    by_session = defaultdict(dict)
    for choice in choices:
        by_session[choice["session_id"]][choice.get("phase")] = choice
    pairs = [phases for phases in by_session.values() if "initial" in phases and "final" in phases]
    return {
        "analysis_version": "moodspace-descriptive-1.0", "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_filter": "consented real sessions only; demo/test/unknown excluded",
        "study_version": payload.get("manifest", {}).get("study_version"),
        "real_participants": len({s["participant_id"] for s in sessions.values()}),
        "sessions": len(sessions), "complete_sessions": sum(s.get("status") == "complete" for s in sessions.values()),
        "incomplete_sessions": sum(s.get("status") != "complete" for s in sessions.values()),
        "mood_distribution": dict(Counter(s.get("mood", "unclassified") for s in sessions.values())),
        "family_successful_time_medians_ms": family_medians, "coverage": coverage, "overall": overall,
        "recommendation_readiness": readiness,
        "preference": {"paired_sessions": len(pairs), "changed": sum(p["initial"].get("ui_variant") != p["final"].get("ui_variant") for p in pairs),
                       "final_preview_only": sum(p["final"].get("tested") is False for p in pairs)},
        "h3": "unverified: descriptive collection data cannot establish an adaptation benefit",
        "limitations": ["No significance testing or causal comparison is performed.",
                        "Successful-only times must be read with success/failure counts.",
                        "Incomplete sessions contribute only actually observed terminal trials.",
                        "Repeated contributions are first aggregated within participant/UI."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = summarize(json.loads(args.export.read_text(encoding="utf-8-sig")))
    rendered = json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered, encoding="utf-8")
    print(rendered, end="")


if __name__ == "__main__":
    main()
