import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import { expressionMood, loadFaceModel } from './faceMood';
import type { Mood } from './domain';
const labels: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  stressed: 'Stressed',
};
export default function CameraMood({ onAccept }: { onAccept: (mood: Mood) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Camera is off. You can also choose a mood below.');
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<Mood | null>(null);
  function release() {
    generation.current++;
    clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function stop() {
    release();
    setRunning(false);
    setStatus('Camera stopped. Restart or choose a mood below.');
  }
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      release();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  async function start() {
    release();
    const run = generation.current;
    setError('');
    setSuggestion(null);
    setRunning(true);
    setStatus('Requesting camera permission…');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Camera access needs localhost or HTTPS and a browser with camera support.',
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (run !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      setStatus('Loading the local expression model…');
      const model = await loadFaceModel();
      let history: Mood[] = [];
      const scan = async () => {
        if (run !== generation.current) return;
        try {
          const faces = await model
            .detectAllFaces(
              video.current!,
              new model.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }),
            )
            .withFaceExpressions();
          if (run !== generation.current) return;
          const mood =
            faces.length === 1
              ? expressionMood(faces[0].expressions as unknown as Record<string, number>)
              : null;
          if (!mood) {
            history = [];
            setStatus(
              faces.length > 1
                ? 'More than one face. Please use the camera alone.'
                : faces.length === 0
                  ? 'No face found. Face the camera in good light.'
                  : 'Expression is unclear. Hold still or choose your mood below.',
            );
          } else {
            history = [...history, mood].slice(-5);
            setStatus(
              `Checking ${labels[mood].toLowerCase()} expression… ${history.filter((m) => m === mood).length}/5 frames`,
            );
            if (history.length === 5 && history.filter((m) => m === mood).length >= 4) {
              setSuggestion(mood);
              release();
              setRunning(false);
              setStatus('Expression estimate ready. Camera has been switched off.');
              return;
            }
          }
          timer.current = setTimeout(scan, 400);
        } catch (e) {
          fail(e);
        }
      };
      if (run === generation.current) await scan();
    } catch (e) {
      if (run === generation.current) fail(e);
    }
  }
  function fail(e: unknown) {
    release();
    setRunning(false);
    setError(
      e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow it in your browser and retry, or select a mood below.'
        : `Camera check failed: ${(e as Error).message}. Retry or select a mood below.`,
    );
  }
  return (
    <section className="camera-mood" aria-label="Camera mood check">
      <h2>Let your expression suggest a space.</h2>
      <p>
        With your permission, a local model estimates your facial expression. No photos, video, face
        identities or expression scores are saved or uploaded.
      </p>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Live camera preview"
        className={running ? 'camera-preview' : 'camera-preview camera-idle'}
      />
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      <div className="camera-actions">
        {!running ? (
          <button type="button" className="primary" onClick={start}>
            <Camera size={18} />
            {suggestion ? 'Scan again' : 'Enable camera & scan'}
          </button>
        ) : (
          <button type="button" onClick={stop}>
            <CameraOff size={18} />
            Stop camera
          </button>
        )}
        {suggestion && (
          <button type="button" className="primary" onClick={() => onAccept(suggestion)}>
            Use {labels[suggestion].toLowerCase()} suggestion
          </button>
        )}
      </div>
      {suggestion && (
        <p>
          <strong>Suggested mode: {labels[suggestion]}</strong>. Does this fit? Accept it or choose
          another mood below.
        </p>
      )}
      <p className="muted">
        Expression is not inner mood. Happy → positive; neutral → neutral; sad, fearful, angry or
        disgusted → stressed as a demo proxy. Unclear expressions receive no suggestion.
      </p>
    </section>
  );
}
