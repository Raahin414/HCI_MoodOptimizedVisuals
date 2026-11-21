# External public-text benchmark: GoEmotions proxy demo

This completed benchmark is **external_public**, not a MoodSpace participant study. It supplies a public-corpus demonstration only; it does not establish student mood accuracy or a best UI for any mood.

## Source and license

Frozen source commit: `7951440944924ac61b6e2f9a2a3c715834005c40`. Downloads came from the [original Google Research release](https://raw.githubusercontent.com/google-research/google-research/7951440944924ac61b6e2f9a2a3c715834005c40/goemotions/README.md). The [upstream repository README](https://raw.githubusercontent.com/google-research/google-research/7951440944924ac61b6e2f9a2a3c715834005c40/README.md) licenses its datasets under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The accompanying data-derived numeric model retains attribution and a copy of that license. Some mirrors label the dataset Apache 2.0; this experiment follows the original publisher's explicit dataset statement. No upstream training code, raw comments, author names, comment IDs, or corpus vocabulary is published.

Citation: Demszky et al. (2020), [GoEmotions: A Dataset of Fine-Grained Emotions](https://aclanthology.org/2020.acl-main.372/).

## Prespecified mapping and separation

Positive uses only joy/excitement/optimism labels; neutral requires neutral alone; the displayed stressed class uses only fear/nervousness labels **as a proxy**. A native multi-label example is eligible only when every label belongs to the same one of these sets. Target-plus-other and cross-class examples are excluded. These are third-party annotations of English Reddit language, not users' own mood reports. The original 28-label task is not being evaluated.

Official train/dev/test membership is preserved. NFKC, casefold and whitespace normalization identify repeated texts; every repeated text or comment ID is removed from all splits. No held-out row is moved into training. The simplified official files do not include authors, so participant/author-grouped validation is **not possible** and recurring-author leakage cannot be ruled out. Distinct comment IDs are not distinct people. Near duplicates/paraphrases may remain.

## Actual sample sizes

| Split | Official rows | Eligible after filtering/dedup | Used | Positive | Neutral | Fear/nervousness proxy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| train | 43410 | 15555 | 15000 | 2194 | 12290 | 516 |
| dev | 5426 | 1944 | 1944 | 288 | 1585 | 71 |
| test | 5427 | 1943 | 1943 | 270 | 1594 | 79 |

Raw native annotation counts, exclusion counts, source hashes, environment versions and exact mappings are in `models/public-corpus-demo/evaluation.json`. A deterministic stratified training-only cap is at most 15,000 rows. Validation/test keep all eligible rows.

## Model selection and held-out result

Features are 8,192 SHA256-hashed word unigrams/bigrams, sublinear TF-IDF and regularized class-balanced logistic regression. Hashing keeps raw vocabulary out of the published model. The training set alone fits IDF and model weights. C ∈ {0.5, 1, 2} is selected on validation macro-F1, then balanced accuracy, then the lower C. Selected C: **2.0**. The selected training-only model is evaluated on held-out test once, with no subsequent refit or test-based tuning.

| Held-out test metric | Model | Training-majority baseline |
| --- | ---: | ---: |
| Macro-F1 | 0.7017 | 0.3004 |
| Balanced accuracy | 0.7093 | 0.3333 |

Confusion matrix: rows are native-mapped reference classes; columns are predicted classes. Order: Positive, Neutral, Fear/nervousness proxy.

| Reference / prediction | Positive | Neutral | Proxy |
| --- | ---: | ---: | ---: |
| Positive | 178 | 85 | 7 |
| Neutral | 113 | 1453 | 28 |
| Fear/nervousness proxy | 5 | 30 | 44 |

Portable runtime gate: **True** (`validated_external_public_proxy_demo`). It requires internally consistent held-out metrics, both metrics above baseline, provenance, protocol and matching numeric-artifact hash. The distinct public artifact format/source type is always rejected by the genuine-study deployment gate. No calibrated confidence is reported. A gate pass is a software consistency check, not proof that corpus transfer works in MoodSpace.

## Reproduce

```powershell
Set-Location C:\Dev\moodspace-hci
.\.venv-analysis\Scripts\python.exe analysis/experiment_public_mood.py
.\.venv-analysis\Scripts\python.exe analysis/experiment_public_mood.py --offline
.\.venv-analysis\Scripts\python.exe analysis/predict_public_mood.py --model-dir models/public-corpus-demo --validate-only
.\.venv-analysis\Scripts\python.exe -m unittest discover -s analysis -p "test_*.py" -v
```

Raw downloads stay in ignored `work/public-data`; no participant database is opened. The tracked model contains numeric coefficients/IDF, hashed feature indices and source/evaluation metadata only. The first command makes a deterministic experiment; the offline command repeats it using verified cached downloads. Repetition is a reproducibility check, not an additional independent test sample.

Portable inference matched scikit-learn on all 1,944 validation rows (0 mismatches). Per frozen pipeline run, test is evaluated once after validation selection. The repeated experiment reuses that same held-out set to verify deterministic reproduction; it is not a second independent experiment and caused no hyperparameter changes.

## Limitations and interpretation

- Fear/nervousness is an externally annotated proxy, not stress or self-reported student mood.
- English Reddit comments differ from MoodSpace check-ins; domain transfer is unvalidated.
- Official TSVs lack authors, so person/author leakage cannot be ruled out or group-tested.
- Text deduplication prevents identical normalized strings, not paraphrase or topic leakage.
- Strict remapping excludes most native labels and does not evaluate the original 28-label task.
- Probabilities are not calibrated; no confidence or clinical claim is provided.
- This public-corpus result cannot activate genuine-study model or UI recommendation readiness.
- Class imbalance and the small proxy class remain material; macro metrics and per-class counts should be read together.
- The original authors warn of English/Reddit population and annotation biases and potentially problematic content. No clinical, cross-cultural or demographic-fairness claim is made.
- No p-value or statistical significance is manufactured. This experiment does not test adaptive UI benefit (H3), which needs genuine prospective/held-out participant outcomes.

## Download integrity

| File | SHA-256 |
| --- | --- |
| train.tsv | `1c254a142be5c00e80d819b9ae1bbd36d94b2eeb8f4b1271846508d57e57d9c5` |
| dev.tsv | `575489c079c9de1097062a01738f998590d6b7ead66dd1c9fd1d2ba01fd8bc62` |
| test.tsv | `0587b2dd8b27b97352adbfc3fb083d46005c8946657fdc2b1ca8b1cc7f1f8be4` |
| emotions.txt | `45c3ef86782d2a4d7fedcd6d8c111aa0d0e94720689bd164fac94fefb4495a89` |
| dataset-readme.md | `c882c69be9f400129bce8535319606434481a085be9c20263930670890e171a7` |
| repository-readme.md | `1022d37738b52c672304dbe71038a4a1f0d2cac5de3c9178652873a5698a8674` |
| CC-BY-4.0.txt | `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411` |

## Audited reproducibility repeat

Numeric weights identical: **True**; selected C identical: **True**; held-out evaluation identical: **True**. See `models/public-corpus-demo/reproducibility.json`. This repeat is not new independent evidence.

Numeric-weight SHA-256 (excludes run ID/timestamps): `5d36ea24704d963ff1f1b29d0c12f9ce376cb6bb73a2a0afad93d01ce3478d40`.

The initial request for `goemotions/data/README.md` and a subfolder-specific LICENSE returned 404; neither is used. Licensing was resolved from the original repository-level dataset statement. Downloads and training must fail explicitly on missing files, changed hashes, schema/row-count mismatches, insufficient mapped support or solver failure.
