import { useState } from 'react';
import { ArrowRight, Sun, Minus, Cloud } from 'lucide-react';
import { MOODS, ruleMood, type Mood } from './domain';
import CameraMood from './CameraMood';
export default function MoodCheck({
  after = false,
  onSave,
  predict,
  continueLabel,
  camera = false,
}: {
  after?: boolean;
  onSave: (b: any) => void;
  predict?: (text: string, reference_mood: Mood) => Promise<any>;
  continueLabel?: string;
  camera?: boolean;
}) {
  const [mood, setMood] = useState<Mood | ''>('');
  const [cameraSuggestion, setCameraSuggestion] = useState<Mood | null>(null);
  const [text, setText] = useState('');
  const [opt, setOpt] = useState(false);
  const [prediction, setPrediction] = useState<any>(null);
  const [referenceMood, setReferenceMood] = useState<Mood | null>(null);
  const [predicting, setPredicting] = useState(false),
    [error, setError] = useState('');
  async function assess() {
    setError('');
    if (!mood) return;
    const reference = referenceMood || mood;
    setReferenceMood(reference);
    setPredicting(true);
    try {
      if (opt && predict) setPrediction(await predict(text, reference));
      else {
        const result = ruleMood(text);
        setPrediction({
          method: result.method,
          predicted_mood: result.mood === 'unclassified' ? null : result.mood,
          reason: result.reason,
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPredicting(false);
    }
  }
  const [valence, setValence] = useState(3),
    [arousal, setArousal] = useState(3);
  const icons = [Sun, Minus, Cloud];
  return (
    <div className="study-form">
      <span className="context-label">{after ? 'A final check-in' : 'Before we begin'}</span>
      <h1>
        {after
          ? 'How are you feeling now?'
          : camera
            ? 'A space for your current mood.'
            : 'How are you arriving today?'}
      </h1>
      <p>
        {after
          ? 'Feelings can change during a session. This check-in records that context.'
          : 'Choose the closest description. Your own report is the main mood label; there is no right answer.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            mood,
            valence,
            arousal,
            text_opt_in: opt,
            ...(camera
              ? {
                  assessment_source: cameraSuggestion
                    ? cameraSuggestion === mood
                      ? 'camera-confirmed'
                      : 'camera-corrected'
                    : 'self-report',
                  camera_suggestion: cameraSuggestion || undefined,
                }
              : {}),
            ...(opt ? { text } : {}),
            ...(opt && prediction?.prediction_id
              ? { prediction_id: prediction.prediction_id }
              : {}),
          });
        }}
      >
        {camera && (
          <CameraMood
            onAccept={(m) => {
              setCameraSuggestion(m);
              setMood(m);
            }}
          />
        )}
        <fieldset className="mood-options">
          <legend className="sr-only">Current mood</legend>
          {MOODS.map((m, i) => {
            const Icon = icons[i];
            return (
              <label className={'mood-option ' + (mood === m.id ? 'active' : '')} key={m.id}>
                <input
                  type="radio"
                  name="mood"
                  value={m.id}
                  checked={mood === m.id}
                  onChange={() => setMood(m.id)}
                  required
                />
                <Icon size={22} />
                <strong>{m.label}</strong>
                <span>{m.copy}</span>
              </label>
            );
          })}
          <label className="unsure-option">
            <input
              type="radio"
              name="mood"
              checked={mood === 'unclassified'}
              onChange={() => setMood('unclassified')}
              value="unclassified"
            />
            I'm not sure / prefer not to classify
          </label>
        </fieldset>
        <div className="scale-grid">
          <label>
            Pleasantness <strong>{valence} / 5</strong>
            <input
              aria-label="Pleasantness"
              type="range"
              min={1}
              max={5}
              value={valence}
              onChange={(e) => setValence(+e.target.value)}
            />
            <small>
              1 · Unpleasant <span>5 · Pleasant</span>
            </small>
          </label>
          <label>
            Energy <strong>{arousal} / 5</strong>
            <input
              aria-label="Energy"
              type="range"
              min={1}
              max={5}
              value={arousal}
              onChange={(e) => setArousal(+e.target.value)}
            />
            <small>
              1 · Low energy <span>5 · High energy</span>
            </small>
          </label>
        </div>
        {!after && !camera && (
          <div className="optional-text">
            <label>
              In a sentence, how are you feeling right now? <span className="muted">Optional</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPrediction(null);
                }}
                placeholder="Skip this if you prefer. Avoid personal details."
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={opt}
                onChange={(e) => {
                  setOpt(e.target.checked);
                  setPrediction(null);
                }}
              />
              I explicitly agree to save this text for local mood-model research.
            </label>
            <p className="muted">
              Without this opt-in, your text is never sent to the server. You can continue with no
              text.
            </p>
            {text && (
              <button type="button" disabled={!mood || predicting} onClick={assess}>
                {predicting
                  ? 'Checking local model…'
                  : opt && predict
                    ? 'Predict from consented text'
                    : 'Try local phrase matching'}
              </button>
            )}
            {prediction && !prediction.dismissed && (
              <div className="prediction-note">
                <strong>{prediction.method}</strong>
                {prediction.method === 'public-corpus-model' && (
                  <p className="ethics-note">
                    Public-corpus experiment. The stressed category is a fear/nervousness proxy from
                    annotated comments, not a validated assessment of your stress. This model
                    provides no evidence about which interface is best.
                  </p>
                )}
                <p>
                  Tentative label: {prediction.predicted_mood || 'Uncertain — no class assigned'}.{' '}
                  {prediction.reason}
                </p>
                <p>
                  Does this seem right? Your current selection remains{' '}
                  <strong>{mood || 'unselected'}</strong>.
                </p>
                <p className="muted">
                  No calibrated confidence is available. Your report before this prediction remains
                  the reference label; your confirmed selection determines the active mood.
                </p>
                <button
                  disabled={!prediction.predicted_mood}
                  type="button"
                  onClick={() => setMood(prediction.predicted_mood)}
                >
                  Use this label
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (referenceMood) setMood(referenceMood);
                    setPrediction({ ...prediction, dismissed: true });
                  }}
                >
                  Keep my own selection
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p role="alert">{error} You can continue using your own report.</p>}
        <button type="submit" className="primary" disabled={!mood || predicting}>
          {after ? 'Finish check-in' : continueLabel || 'Continue to the designs'}
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="muted">
        Self-report for a class exercise. This is not a psychological assessment.
      </p>
    </div>
  );
}
