"""Reproducible GoEmotions proxy benchmark, isolated from MoodSpace observations.

Downloads only official frozen TSV files to ignored work/public-data, never a database.
Fits a small hashed TF-IDF/logistic model; publishes numeric weights, no comments/tokens.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import unicodedata
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from predict_public_mood import (FEATURES, FORMAT, MAPPING, MODEL_VERSION, MOODS, SOURCE_TYPE,
                                 TOKEN_PATTERN, SOURCE_COMMIT, hashed_counts, load_validated, predict_portable)

ROOT = Path(__file__).resolve().parents[1]
BASE = f"https://raw.githubusercontent.com/google-research/google-research/{SOURCE_COMMIT}"
FILES = {name: f"{BASE}/goemotions/data/{name}" for name in ("train.tsv", "dev.tsv", "test.tsv", "emotions.txt")}
FILES.update({"dataset-readme.md": f"{BASE}/goemotions/README.md", "repository-readme.md": f"{BASE}/README.md",
              "CC-BY-4.0.txt": "https://creativecommons.org/licenses/by/4.0/legalcode.txt"})
EXPECTED_ROWS = {"train": 43410, "dev": 5426, "test": 5427}
# Frozen download hashes are checked on every run; values are populated from the audited release.
EXPECTED_SHA256 = {
    "train.tsv": "1c254a142be5c00e80d819b9ae1bbd36d94b2eeb8f4b1271846508d57e57d9c5",
    "dev.tsv": "575489c079c9de1097062a01738f998590d6b7ead66dd1c9fd1d2ba01fd8bc62",
    "test.tsv": "0587b2dd8b27b97352adbfc3fb083d46005c8946657fdc2b1ca8b1cc7f1f8be4",
    "emotions.txt": "45c3ef86782d2a4d7fedcd6d8c111aa0d0e94720689bd164fac94fefb4495a89",
    "dataset-readme.md": "c882c69be9f400129bce8535319606434481a085be9c20263930670890e171a7",
    "repository-readme.md": "1022d37738b52c672304dbe71038a4a1f0d2cac5de3c9178652873a5698a8674",
    "CC-BY-4.0.txt": "9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411",
}
CS = (0.5, 1.0, 2.0)
SEED = 20261121


def download(cache: Path, offline=False):
    cache.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in FILES.items():
        target = cache / name
        if not target.exists():
            if offline:
                raise ValueError("missing_offline_cache")
            request = urllib.request.Request(url, headers={"User-Agent": "MoodSpace-undergraduate-HCI-public-benchmark/1.0"})
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read(20_000_001)
            if len(raw) > 20_000_000:
                raise ValueError("unexpected_download_size")
            temporary = cache / (name + ".tmp")
            temporary.write_bytes(raw)
            temporary.replace(target)
        raw = target.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if name in EXPECTED_SHA256 and digest != EXPECTED_SHA256[name]:
            raise ValueError("frozen_download_hash_mismatch")
        manifest[name] = {"url": url, "sha256": digest, "bytes": len(raw)}
    # Verify the primary upstream dataset license statement rather than a mirror card tag.
    repository_readme = (cache / "repository-readme.md").read_text(encoding="utf-8")
    if "CC BY 4.0" not in repository_readme or "datasets" not in repository_readme:
        raise ValueError("dataset_license_statement_missing")
    (cache / "download-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def normalized(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def map_labels(labels):
    selected = set(labels)
    matches = [mood for mood in MOODS if selected and selected.issubset(set(MAPPING[mood]))]
    return matches[0] if len(matches) == 1 else None


def read_splits(cache: Path):
    emotions = (cache / "emotions.txt").read_text(encoding="utf-8").splitlines()
    if len(emotions) != 28 or len(set(emotions)) != 28:
        raise ValueError("unexpected_native_label_schema")
    rows, metadata = {}, {}
    for split, expected in EXPECTED_ROWS.items():
        loaded, raw_counts = [], Counter()
        with (cache / f"{split}.tsv").open(encoding="utf-8", newline="") as stream:
            for row in csv.reader(stream, delimiter="\t", quoting=csv.QUOTE_NONE):
                if len(row) != 3:
                    raise ValueError("malformed_official_tsv")
                text, raw_labels, comment_id = row
                indices = [int(value) for value in raw_labels.split(",")]
                if not indices or any(index < 0 or index >= len(emotions) for index in indices):
                    raise ValueError("unknown_native_label")
                labels = [emotions[index] for index in indices]
                raw_counts.update(labels)
                loaded.append({"text": text, "native_labels": labels, "comment_id": comment_id, "normalized": normalized(text)})
        if len(loaded) != expected:
            raise ValueError("published_split_row_count_mismatch")
        rows[split] = loaded
        metadata[split] = {"official_rows": len(loaded), "native_annotation_counts": dict(sorted(raw_counts.items()))}
    return prepare_splits(rows, metadata)


def prepare_splits(rows, metadata=None):
    metadata = metadata or {split: {"official_rows": len(values)} for split, values in rows.items()}
    text_counts = Counter(row.get("normalized", normalized(row["text"])) for values in rows.values() for row in values)
    id_counts = Counter(row["comment_id"] for values in rows.values() for row in values)
    prepared = {}
    for split, values in rows.items():
        excluded, selected = Counter(), []
        for row in values:
            key = row.get("normalized", normalized(row["text"]))
            if not key:
                excluded["empty_normalized_text"] += 1
            elif text_counts[key] > 1 or id_counts[row["comment_id"]] > 1:
                # Drop every copy, never move a held-out row into training.
                excluded["repeated_normalized_text_or_comment_id"] += 1
            elif len(row["text"]) > 1000:
                excluded["text_over_runtime_1000_character_limit"] += 1
            else:
                label = map_labels(row["native_labels"])
                if label is None:
                    mapped_groups = {m for m in MOODS if set(row["native_labels"]).intersection(MAPPING[m])}
                    excluded["cross_class_or_target_plus_other_label" if mapped_groups else "no_target_native_label"] += 1
                else:
                    selected.append({"text": row["text"], "label": label, "normalized": key})
        prepared[split] = selected
        metadata[split].update(excluded=dict(excluded), mapped_rows_before_cap=len(selected),
                               mapped_class_counts=dict(Counter(row["label"] for row in selected)))
    all_keys = [row["normalized"] for values in prepared.values() for row in values]
    if len(all_keys) != len(set(all_keys)):
        raise ValueError("duplicate_leakage_detected")
    return prepared, metadata


def sparse_counts(texts):
    from scipy.sparse import csr_matrix
    values, columns, pointers = [], [], [0]
    for text in texts:
        counts = hashed_counts(text)
        for index in sorted(counts):
            columns.append(index)
            values.append(float(counts[index]))
        pointers.append(len(values))
    return csr_matrix((values, columns, pointers), shape=(len(texts), FEATURES))


def metrics(labels, predictions):
    from sklearn.metrics import balanced_accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support
    precision, recall, f1, support = precision_recall_fscore_support(labels, predictions, labels=list(MOODS), zero_division=0)
    return {"macro_f1": float(f1_score(labels, predictions, labels=list(MOODS), average="macro", zero_division=0)),
            "balanced_accuracy": float(balanced_accuracy_score(labels, predictions)),
            "confusion_matrix": confusion_matrix(labels, predictions, labels=list(MOODS)).tolist(),
            "per_class": {mood: {"precision": float(precision[i]), "recall": float(recall[i]),
                                  "f1": float(f1[i]), "support": int(support[i])} for i, mood in enumerate(MOODS)}}


def run(cache: Path, output: Path, report_path: Path, offline=False, max_train=15000):
    import numpy as np
    import scipy
    import sklearn
    from sklearn.feature_extraction.text import TfidfTransformer
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedShuffleSplit
    downloads = download(cache, offline)
    splits, counts = read_splits(cache)
    if max_train < 100 or max_train > 15000:
        raise ValueError("training_cap_must_be_100_to_15000")
    if len(splits["train"]) > max_train:
        labels = [row["label"] for row in splits["train"]]
        indices, _ = next(StratifiedShuffleSplit(n_splits=1, train_size=max_train, random_state=SEED).split(np.zeros(len(labels)), labels))
        splits["train"] = [splits["train"][int(i)] for i in sorted(indices)]
    for split, values in splits.items():
        label_counts = dict(Counter(row["label"] for row in values))
        if any(label_counts.get(mood, 0) < 20 for mood in MOODS):
            raise ValueError("insufficient_mapped_class_support")
        counts[split].update(used_rows=len(values), used_class_counts=label_counts)
    labels = {split: np.array([row["label"] for row in values], dtype=object) for split, values in splits.items()}
    matrices = {split: sparse_counts([row["text"] for row in values]) for split, values in splits.items()}
    transformer = TfidfTransformer(sublinear_tf=True, norm="l2", smooth_idf=True)
    train = transformer.fit_transform(matrices["train"])
    dev = transformer.transform(matrices["dev"])
    candidates, fitted_models = [], {}
    for c in CS:
        fitted = LogisticRegression(C=c, class_weight="balanced", max_iter=1500, solver="lbfgs", random_state=SEED).fit(train, labels["train"])
        if max(fitted.n_iter_) >= 1500:
            raise ValueError("candidate_solver_failed_to_converge")
        result = metrics(labels["dev"], fitted.predict(dev))
        candidates.append({"C": c, "validation": result})
        fitted_models[c] = fitted
    chosen = sorted(candidates, key=lambda r: (-r["validation"]["macro_f1"], -r["validation"]["balanced_accuracy"], r["C"]))[0]
    fitted = fitted_models[chosen["C"]]
    # One held-out test evaluation after the complete candidate decision. No refit/tuning follows.
    test = transformer.transform(matrices["test"])
    predicted = fitted.predict(test)
    majority = sorted(Counter(labels["train"]).items(), key=lambda item: (-item[1], item[0]))[0][0]
    evaluation = {"model": metrics(labels["test"], predicted),
                  "majority_class_baseline": metrics(labels["test"], np.array([majority] * len(labels["test"]), dtype=object)),
                  "confusion_matrix_label_order": list(MOODS), "majority_label_from_training_only": majority}
    run_id = str(uuid.uuid4())
    ordered = [list(fitted.classes_).index(mood) for mood in MOODS]
    portable = {"format": FORMAT, "model_version": MODEL_VERSION, "source_type": SOURCE_TYPE,
                "training_run_id": run_id, "classes": list(MOODS),
                "preprocessing": {"lowercase": True, "token_pattern": TOKEN_PATTERN, "ngram_range": [1, 2],
                                  "hash": "sha256-first8-big-endian-mod8192", "sublinear_tf": True, "norm": "l2"},
                "idf": transformer.idf_.tolist(), "coefficients": fitted.coef_[ordered].tolist(),
                "intercepts": fitted.intercept_[ordered].tolist(),
                "seen_features": np.flatnonzero(matrices["train"].getnnz(axis=0)).tolist()}
    # Compile/inference parity is checked on validation only; no test-informed revision.
    portable_dev = [predict_portable(portable, row["text"]) for row in splits["dev"]]
    parity_mismatches = sum(a != b for a, b in zip(portable_dev, fitted.predict(dev)))
    if parity_mismatches:
        raise ValueError("portable_inference_parity_failed")
    output.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(portable, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
    (output / "model.json").write_bytes(raw)
    result = {"status": "evaluated_external_public", "model_version": MODEL_VERSION, "source_type": SOURCE_TYPE,
              "training_run_id": run_id, "generated_at": datetime.now(timezone.utc).isoformat(),
              "is_moodspace_study_evidence": False, "classes": list(MOODS), "class_mapping": MAPPING,
              "source": {"corpus": "GoEmotions", "commit": SOURCE_COMMIT, "downloads": downloads,
                         "dataset_license": "CC-BY-4.0", "dataset_license_source": FILES["repository-readme.md"],
                         "author_group_validation": False, "author_metadata": "not present in simplified official TSVs; comment IDs are not people"},
              "protocol": {"split_strategy": "official_train_dev_test_remove_duplicate_texts",
                           "deduplication": "NFKC + casefold + whitespace collapse; drop every repeated normalized text or comment ID across/within splits",
                           "hyperparameter_selection": "validation_only", "heldout_test_evaluations": 1,
                           "refit_after_test": False, "training_features": "sha256-hashed-word-1-2-grams-tfidf",
                           "feature_dimensions": FEATURES, "train_cap": max_train, "random_seed": SEED,
                           "cross_split_normalized_text_overlap": 0, "self_report_labels": False,
                           "participant_grouped_validation": False},
              "split_counts": counts, "validation_candidates": candidates, "selected_C": chosen["C"],
              "evaluation": evaluation,
              "portable_validation_parity": {"checked_rows": len(portable_dev), "mismatches": parity_mismatches},
              "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__,
                              "numpy": np.__version__, "scipy": scipy.__version__},
              "model_artifact": {"file": "model.json", "format": FORMAT, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)},
              "limitations": ["Fear/nervousness is an externally annotated proxy, not stress or self-reported student mood.",
                              "English Reddit comments differ from MoodSpace check-ins; domain transfer is unvalidated.",
                              "Official TSVs lack authors, so person/author leakage cannot be ruled out or group-tested.",
                              "Text deduplication prevents identical normalized strings, not paraphrase or topic leakage.",
                              "Strict remapping excludes most native labels and does not evaluate the original 28-label task.",
                              "Probabilities are not calibrated; no confidence or clinical claim is provided.",
                              "This public-corpus result cannot activate genuine-study model or UI recommendation readiness."]}
    (output / "evaluation.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    (output / "LICENSE-CC-BY-4.0.txt").write_bytes((cache / "CC-BY-4.0.txt").read_bytes())
    (output / "NOTICE.md").write_text(notice(), encoding="utf-8")
    _, checked = load_validated(output)
    result["runtime_gate"] = {"available": checked["available"], "reason": checked["reason"]}
    (output / "evaluation.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(render_report(result), encoding="utf-8")
    return result


def notice():
    return ("# GoEmotions-derived external demonstration\n\n"
            "Data attribution: Dorottya Demszky, Dana Movshovitz-Attias, Jeongwoo Ko, Alan Cowen, Gaurav Nemade and Sujith Ravi (2020), "
            "GoEmotions: A Dataset of Fine-Grained Emotions, ACL 2020. https://aclanthology.org/2020.acl-main.372/\n\n"
            "Original data: https://github.com/google-research/google-research/tree/" + SOURCE_COMMIT + "/goemotions\n\n"
            "The original publisher states datasets are CC BY 4.0; the accompanying license text applies to this attributed data-derived numeric artifact. "
            "Source code in the upstream repository is separately Apache 2.0; no upstream model code is copied.\n\n"
            "Changes: strict three-class proxy remapping, removal of duplicate normalized comments, training cap, SHA256 feature hashing, TF-IDF and logistic regression. "
            "No raw Reddit comments, IDs, author names, or corpus vocabulary are distributed. The artifact contains only numeric hashed feature weights. "
            "No endorsement by the original authors or Google is implied.\n\n"
            "This is external_public demonstration evidence, never MoodSpace participant/self-report evidence. Fear/nervousness is not stress. "
            "The genuine-study model gate rejects this artifact format.\n")


def snapshot(output: Path):
    model = json.loads((output / "model.json").read_text(encoding="utf-8"))
    report = json.loads((output / "evaluation.json").read_text(encoding="utf-8"))
    numeric = {key: model[key] for key in ("idf", "coefficients", "intercepts", "seen_features")}
    digest = hashlib.sha256(json.dumps(numeric, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return {"weights_sha256": digest, "C": report["selected_C"], "evaluation": report["evaluation"]}


def render_report(result):
    ev = result["evaluation"]
    lines = ["# External public-text benchmark: GoEmotions proxy demo", "",
             "This completed benchmark is **external_public**, not a MoodSpace participant study. It supplies a public-corpus demonstration only; it does not establish student mood accuracy or a best UI for any mood.", "",
             "## Source and license", "",
             f"Frozen source commit: `{SOURCE_COMMIT}`. Downloads came from the [original Google Research release]({BASE}/goemotions/README.md). "
             f"The [upstream repository README]({BASE}/README.md) licenses its datasets under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). "
             "The accompanying data-derived numeric model retains attribution and a copy of that license. Some mirrors label the dataset Apache 2.0; this experiment follows the original publisher's explicit dataset statement. "
             "No upstream training code, raw comments, author names, comment IDs, or corpus vocabulary is published.", "",
             "Citation: Demszky et al. (2020), [GoEmotions: A Dataset of Fine-Grained Emotions](https://aclanthology.org/2020.acl-main.372/).", "",
             "## Prespecified mapping and separation", "",
             "Positive uses only joy/excitement/optimism labels; neutral requires neutral alone; the displayed stressed class uses only fear/nervousness labels **as a proxy**. "
             "A native multi-label example is eligible only when every label belongs to the same one of these sets. Target-plus-other and cross-class examples are excluded. "
             "These are third-party annotations of English Reddit language, not users' own mood reports. The original 28-label task is not being evaluated.", "",
             "Official train/dev/test membership is preserved. NFKC, casefold and whitespace normalization identify repeated texts; every repeated text or comment ID is removed from all splits. "
             "No held-out row is moved into training. The simplified official files do not include authors, so participant/author-grouped validation is **not possible** and recurring-author leakage cannot be ruled out. "
             "Distinct comment IDs are not distinct people. Near duplicates/paraphrases may remain.", "",
             "## Actual sample sizes", "", "| Split | Official rows | Eligible after filtering/dedup | Used | Positive | Neutral | Fear/nervousness proxy |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for split in ("train", "dev", "test"):
        counts = result["split_counts"][split]
        used = counts["used_class_counts"]
        lines.append(f"| {split} | {counts['official_rows']} | {counts['mapped_rows_before_cap']} | {counts['used_rows']} | {used['positive']} | {used['neutral']} | {used['stressed']} |")
    lines += ["", "Raw native annotation counts, exclusion counts, source hashes, environment versions and exact mappings are in `models/public-corpus-demo/evaluation.json`. "
              "A deterministic stratified training-only cap is at most 15,000 rows. Validation/test keep all eligible rows.", "",
              "## Model selection and held-out result", "",
              "Features are 8,192 SHA256-hashed word unigrams/bigrams, sublinear TF-IDF and regularized class-balanced logistic regression. "
              "Hashing keeps raw vocabulary out of the published model. The training set alone fits IDF and model weights. "
              "C ∈ {0.5, 1, 2} is selected on validation macro-F1, then balanced accuracy, then the lower C. "
              f"Selected C: **{result['selected_C']}**. The selected training-only model is evaluated on held-out test once, with no subsequent refit or test-based tuning.", "",
              "| Held-out test metric | Model | Training-majority baseline |", "| --- | ---: | ---: |",
              f"| Macro-F1 | {ev['model']['macro_f1']:.4f} | {ev['majority_class_baseline']['macro_f1']:.4f} |",
              f"| Balanced accuracy | {ev['model']['balanced_accuracy']:.4f} | {ev['majority_class_baseline']['balanced_accuracy']:.4f} |", "",
              "Confusion matrix: rows are native-mapped reference classes; columns are predicted classes. Order: Positive, Neutral, Fear/nervousness proxy.", "",
              "| Reference / prediction | Positive | Neutral | Proxy |", "| --- | ---: | ---: | ---: |"]
    for label, row in zip(("Positive", "Neutral", "Fear/nervousness proxy"), ev["model"]["confusion_matrix"]):
        lines.append(f"| {label} | {row[0]} | {row[1]} | {row[2]} |")
    lines += ["", f"Portable runtime gate: **{result['runtime_gate']['available']}** (`{result['runtime_gate']['reason']}`). "
              "It requires internally consistent held-out metrics, both metrics above baseline, provenance, protocol and matching numeric-artifact hash. "
              "The distinct public artifact format/source type is always rejected by the genuine-study deployment gate. "
              "No calibrated confidence is reported. A gate pass is a software consistency check, not proof that corpus transfer works in MoodSpace.", "",
              "## Reproduce", "", "```powershell", "Set-Location C:\\Dev\\moodspace-hci",
              ".\\.venv-analysis\\Scripts\\python.exe analysis/experiment_public_mood.py",
              ".\\.venv-analysis\\Scripts\\python.exe analysis/experiment_public_mood.py --offline",
              ".\\.venv-analysis\\Scripts\\python.exe analysis/predict_public_mood.py --model-dir models/public-corpus-demo --validate-only",
              ".\\.venv-analysis\\Scripts\\python.exe -m unittest discover -s analysis -p \"test_*.py\" -v", "```", "",
              "Raw downloads stay in ignored `work/public-data`; no participant database is opened. The tracked model contains numeric coefficients/IDF, hashed feature indices and source/evaluation metadata only. "
              "The first command makes a deterministic experiment; the offline command repeats it using verified cached downloads. Repetition is a reproducibility check, not an additional independent test sample.", "",
              f"Portable inference matched scikit-learn on all {result['portable_validation_parity']['checked_rows']:,} validation rows "
              f"({result['portable_validation_parity']['mismatches']} mismatches). Per frozen pipeline run, test is evaluated once after validation selection. "
              "The repeated experiment reuses that same held-out set to verify deterministic reproduction; it is not a second independent experiment and caused no hyperparameter changes.", "",
              "## Limitations and interpretation", ""]
    lines.extend("- " + limitation for limitation in result["limitations"])
    lines += ["- Class imbalance and the small proxy class remain material; macro metrics and per-class counts should be read together.",
              "- The original authors warn of English/Reddit population and annotation biases and potentially problematic content. No clinical, cross-cultural or demographic-fairness claim is made.",
              "- No p-value or statistical significance is manufactured. This experiment does not test adaptive UI benefit (H3), which needs genuine prospective/held-out participant outcomes.", "",
              "## Download integrity", "", "| File | SHA-256 |", "| --- | --- |"]
    lines.extend(f"| {name} | `{meta['sha256']}` |" for name, meta in result["source"]["downloads"].items())
    if result.get("reproducibility_check"):
        repeat = result["reproducibility_check"]
        lines += ["", "## Audited reproducibility repeat", "",
                  f"Numeric weights identical: **{repeat['numeric_weights_identical']}**; selected C identical: **{repeat['selected_C_identical']}**; "
                  f"held-out evaluation identical: **{repeat['heldout_evaluation_identical']}**. "
                  "See `models/public-corpus-demo/reproducibility.json`. This repeat is not new independent evidence.", "",
                  f"Numeric-weight SHA-256 (excludes run ID/timestamps): `{repeat['numeric_weights_sha256']}`."]
    lines += ["", "The initial request for `goemotions/data/README.md` and a subfolder-specific LICENSE returned 404; neither is used. "
              "Licensing was resolved from the original repository-level dataset statement. Downloads and training must fail explicitly on missing files, changed hashes, schema/row-count mismatches, insufficient mapped support or solver failure.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / "work/public-data/goemotions" / SOURCE_COMMIT)
    parser.add_argument("--out", type=Path, default=ROOT / "models/public-corpus-demo")
    parser.add_argument("--report", type=Path, default=ROOT / "docs/public-data-experiment.md")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--max-train", type=int, default=15000)
    parser.add_argument("--verify-reproduction", action="store_true", help="Compare this frozen repeat with existing numeric artifacts/metrics; no new tuning.")
    args = parser.parse_args()
    if args.download_only:
        print(json.dumps({"status": "downloaded", "source_type": SOURCE_TYPE, "files": download(args.cache, args.offline)}, indent=2))
    else:
        before = snapshot(args.out) if args.verify_reproduction else None
        result = run(args.cache, args.out, args.report, args.offline, args.max_train)
        if before:
            after = snapshot(args.out)
            reproduction = {"source_type": SOURCE_TYPE, "repeated_same_prespecified_experiment": True,
                            "numeric_weights_sha256": after["weights_sha256"],
                            "numeric_weights_identical": before["weights_sha256"] == after["weights_sha256"],
                            "selected_C_identical": before["C"] == after["C"],
                            "heldout_evaluation_identical": before["evaluation"] == after["evaluation"],
                            "independent_new_evidence": False, "validation_portable_parity": result["portable_validation_parity"]}
            (args.out / "reproducibility.json").write_text(json.dumps(reproduction, indent=2) + "\n", encoding="utf-8")
            if not all(reproduction[key] for key in ("numeric_weights_identical", "selected_C_identical", "heldout_evaluation_identical")):
                raise ValueError("reproducibility_check_failed")
            args.report.write_text(render_report({**result, "reproducibility_check": reproduction}), encoding="utf-8")
        print(json.dumps({"status": result["status"], "source_type": SOURCE_TYPE, "split_counts": {
            split: data["used_class_counts"] for split, data in result["split_counts"].items()},
            "selected_C": result["selected_C"], "evaluation": result["evaluation"], "runtime_gate": result["runtime_gate"]}, indent=2))


if __name__ == "__main__":
    main()
