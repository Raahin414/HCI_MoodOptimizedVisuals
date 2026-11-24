import type { Mood } from './domain';
export type ExpressionScores = Record<string, number | undefined>;
// These are interface demo mappings, not measured psychological states.
export function expressionMood(scores: ExpressionScores): Mood | null {
  const candidates = [
    ['positive', scores.happy || 0],
    ['neutral', scores.neutral || 0],
    [
      'stressed',
      (scores.angry || 0) + (scores.fearful || 0) + (scores.sad || 0) + (scores.disgusted || 0),
    ],
  ] as [Mood, number][];
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][1] >= 0.5 && candidates[0][1] - candidates[1][1] >= 0.15
    ? candidates[0][0]
    : null;
}
let loading: Promise<typeof import('@vladmandic/face-api')> | undefined;
export function loadFaceModel() {
  return (loading ||= (async () => {
    try {
      const face = await import('@vladmandic/face-api');
      // Upstream's bundled TF runtime has these methods, but omits them from its declarations.
      const tf = face.tf as unknown as {
        setBackend(name: string): Promise<boolean>;
        ready(): Promise<void>;
      };
      await tf.setBackend('webgl');
      await tf.ready();
      await Promise.all([
        face.nets.tinyFaceDetector.loadFromUri('/models/face'),
        face.nets.faceExpressionNet.loadFromUri('/models/face'),
      ]);
      return face;
    } catch (error) {
      loading = undefined;
      throw error;
    }
  })());
}
