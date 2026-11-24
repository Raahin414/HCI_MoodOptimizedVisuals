# Camera-first personal workspace

## Simplified flow

The default flow is consent → camera or three mood buttons → Open my workspace. It opens the suggested layout directly. Preferences, record purpose and optional review are under More options; explanations and feedback are collapsed. All eight layouts remain in the workspace switcher. Pleasantness and energy sliders appear only in the original study, where they are independent self-reported measurements. Personal camera check-ins save these unmeasured values as null, rather than fabricating them from an expression label. Mood recognition does not measure energy or pleasantness.

The user's revised requirement on 2026-11-24 replaces optional text prediction as the primary personal-workspace input. The original master prompt explicitly excluded cameras; the original self-report study protocol remains intact at `/study`. The revised `/adapt` uses a camera, three confirmed mood modes and eight existing interactive structures. Text is absent from this personal check-in.

Click Enable camera & scan, grant browser permission, face the camera alone in good lighting, accept or correct the suggestion, then continue to the recommendation and open the workspace. Mood-guided demo suggestions are enabled initially. Existing workspaces have a Start a new mood check control; save the resume code to return to the old workspace.

Inference uses @vladmandic/face-api 1.7.15 (MIT), with bundled Tiny Face Detector and Face Expression models. Model files are copied from the pinned npm package to `public/models/face`; their MIT notice is included. Source: https://github.com/vladmandic/face-api . The upstream is archived; the pinned model integration is suitable for this small class demonstration, not an actively maintained recognition platform.

The dynamically loaded browser TensorFlow runtime uses WebGL. No API key, Python, cloud inference or online model download is needed after installation. The roughly 523 kB of model weights and 1.3 MB uncompressed runtime are served locally. Browser camera access requires localhost or HTTPS. Denial, absent hardware, unclear expressions and multiple faces leave manual selection available.

Happy maps to positive, neutral to neutral, and combined angry/fearful/sad/disgusted scores map to a stressed proxy. Surprise has no mood mapping. The winning group needs score >=0.5, margin >=0.15, and agreement on at least four of five consecutive usable frames. Missing or ambiguous frames clear the window. These thresholds are engineering safeguards, not calibrated confidence or evidence of stress. Expressions cannot establish inner feelings.

No identity recognition, age or gender estimation is loaded. No frames, face embeddings or expression scores leave the browser or enter storage. The stream stops on a suggestion, Stop camera, tab hiding, errors and component unmount. Only the accepted suggestion and the person's final confirmed/corrected mood are saved, with `assessment_source` and `camera_suggestion`. Camera metadata is rejected on study sessions. Personal observations do not produce randomized study trials or empirical UI winners.

The layout engine selects among fixed, independently implemented structures; it does not generate interfaces with an LLM. With no empirical evidence and no explicit preference, the demo rules suggest U02/positive, U08/neutral, U01/stressed. Every mode can open all eight structures manually. The guided assistant remains a transparent deterministic interface.

Verification distinguishes model loading and no-face abstention in a real browser from controlled mocked-expression tests. Human facial accuracy, demographic fairness, true stress recognition, and an adaptation benefit have not been validated. A live scan on the user's hardware remains necessary.
