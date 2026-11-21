import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const local =
  process.platform === 'win32' ? '.venv-analysis/Scripts/python.exe' : '.venv-analysis/bin/python';
const executable = process.env.MOOD_PYTHON || (existsSync(local) ? local : 'python');
const result = spawnSync(
  executable,
  ['analysis/experiment_public_mood.py', ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: true },
);
if (result.error) {
  console.error(
    'Install Python and the pinned optional analysis requirements; see analysis/README.md.',
  );
  process.exitCode = 1;
} else process.exitCode = result.status ?? 1;
