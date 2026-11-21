# Public-data scope review — 2026-11-21

The public-data experiment addresses optional English text prediction. It cannot replace new observations on MoodSpace's eight original structures.

| Primary source | Decision |
| --- | --- |
| [Google Research GoEmotions](https://github.com/google-research/google-research/tree/master/goemotions) | Suitable for a small, explicitly external annotated-text benchmark. It has neutral and selected positive/fear-related labels. Fear/nervousness is only a proxy for MoodSpace's stressed class. It is not student self-report and includes no MoodSpace UI preference/performance data. |
| [Google Research dataset terms](https://github.com/google-research/google-research/blob/master/README.md) | Original release states datasets use CC BY 4.0, separately from Apache-licensed source code. Preserve attribution/terms, record revision/download hashes, and avoid uploading raw comments. |
| [DAIR emotion dataset card](https://huggingface.co/datasets/dair-ai/emotion/blob/main/README.md) | Reviewed but not used: its six emotion classes omit a neutral category, so it would not directly support the requested three-class mapping. Educational/research terms differ from the selected original release. |
| [AMUSED record](https://zenodo.org/records/15870704) | Related HCI data, but file access is restricted and it studies usability issues on other prototypes with additional modalities. Do not pretend it supplies observations on our eight layouts. |
| [Adaptive GUI customization data](https://zenodo.org/records/17599976) | Related experiments on different interfaces. Even if open, their conditions and UI identities do not establish MoodSpace-specific mood–structure rankings. |
| [Website interaction/emotion dataset paper](https://www.nature.com/articles/s41597-025-06079-1) | Related UX research with facial-expression-derived measurements on other sites. These labels and interactions are not MoodSpace's self-reported moods or original assigned interfaces. |

No external rows are imported into participants, sessions, trials or genuine study aggregates. Real MoodSpace text training remains a separate path with consent/reference-label and participant-grouped validation gates. The external model has its own artifact format and source marker and can never satisfy that gate.

The user-requested small-scale visible adaptation is implemented as an optional **mood-guided design demo**: positive → Kanban Flow, neutral → Daily Brief, stressed → Quiet Focus. Those choices are design rationales, not empirical winners. The default remains user preference/neutral fallback, all eight structures remain available, explicit preference takes priority, and a sufficiently supported empirical recommendation takes priority over the demo. Assigned study trials never use this rule.
