import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ruleMood } from '../src/domain.js';
export type ModelResult = {
  available: boolean;
  method: string;
  predicted_mood: string | null;
  reason: string;
  model_version?: string;
  evaluation?: Record<string, number>;
  calibrated_confidence?: boolean;
  source_type?: string;
};
const unavailable = (reason: string): ModelResult => ({
  available: false,
  method: 'self-report',
  predicted_mood: null,
  reason,
  calibrated_confidence: false,
});
export async function modelBridge(text?: string): Promise<ModelResult> {
  if (!process.env.MOOD_MODEL_DIR)
    return unavailable('No evaluated trained model is configured. Self-report remains primary.');
  return runModel('analysis/predict_mood.py', process.env.MOOD_MODEL_DIR, text, 'trained-model');
}
export async function publicModelBridge(text?: string): Promise<ModelResult> {
  const directory = process.env.PUBLIC_MOOD_MODEL_DIR || 'models/public-corpus-demo';
  if (
    process.env.PUBLIC_MOOD_MODEL_ENABLED === 'false' ||
    !existsSync(resolve(directory, 'evaluation.json'))
  )
    return unavailable('The optional public-corpus demonstration is unavailable.');
  return runModel('analysis/predict_public_mood.py', directory, text, 'public-corpus-model');
}
async function runModel(
  script: string,
  directory: string,
  text: string | undefined,
  expectedMethod: string,
): Promise<ModelResult> {
  const executable = process.env.MOOD_PYTHON || 'python';
  const args = [
    resolve(script),
    '--model-dir',
    resolve(directory),
    ...(text === undefined ? ['--validate-only'] : []),
  ];
  return new Promise((resolveResult) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '',
      settled = false;
    const finish = (result: ModelResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(unavailable('Local model validation timed out; use self-report.'));
    }, 10000);
    child.on('error', () =>
      finish(unavailable('Configured local Python is unavailable; use self-report.')),
    );
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 32768) {
        child.kill();
        finish(unavailable('Invalid model response; use self-report.'));
      }
    });
    child.stderr.resume(); // Never forward model diagnostics or input text to telemetry.
    child.stdin.on('error', () => {});
    child.on('close', (code) => {
      try {
        const result = JSON.parse(output);
        if (
          code !== 0 ||
          typeof result.available !== 'boolean' ||
          typeof result.reason !== 'string' ||
          (result.available && result.method !== expectedMethod) ||
          (result.available &&
            expectedMethod === 'public-corpus-model' &&
            result.source_type !== 'external_public') ||
          (text !== undefined &&
            result.available &&
            !['positive', 'neutral', 'stressed'].includes(result.predicted_mood))
        )
          throw new Error();
        finish(result);
      } catch {
        finish(unavailable('Local model could not be validated; use self-report.'));
      }
    });
    child.stdin.end(text === undefined ? '' : JSON.stringify({ text, text_opt_in: true }));
  });
}
export async function predictMood(text: string) {
  const trained = await modelBridge(text);
  if (trained.available) return trained;
  const publicModel = await publicModelBridge(text);
  if (publicModel.available) return publicModel;
  const rule = ruleMood(text);
  return {
    available: true,
    method: rule.method,
    predicted_mood: rule.mood === 'unclassified' ? null : rule.mood,
    reason: rule.reason + ' ' + trained.reason,
    calibrated_confidence: false,
    model_available: false,
    source_type: 'rule_demo',
  };
}
