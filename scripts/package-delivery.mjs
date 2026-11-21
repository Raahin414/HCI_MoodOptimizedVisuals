import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { zipSync } from 'fflate';
const destination = process.argv[2];
if (!destination) throw new Error('Pass an absolute, non-OneDrive deliverables directory.');
if (/onedrive/i.test(resolve(destination))) throw new Error('OneDrive output is forbidden.');
const directories = [
  'src',
  'server',
  'tests',
  'analysis',
  'docs',
  'scripts',
  'public',
  'models',
  '.github',
];
const roots = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'index.html',
  'README.md',
  '.env.example',
  '.gitignore',
  '.gitattributes',
  '.prettierrc.json',
];
const files = {};
async function add(path) {
  files['moodspace-hci/' + path.replaceAll('\\', '/')] = await readFile(path);
}
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const file = join(path, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) await add(file);
  }
}
for (const dir of directories) await walk(dir);
for (const file of roots) await add(file);
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'MoodSpace-finalized-source.zip'), zipSync(files, { level: 6 }));
await copyFile('README.md', join(destination, 'MoodSpace-finalized-README.md'));
await copyFile('docs/verification.md', join(destination, 'MoodSpace-verification.md'));
await copyFile('work/screenshots/gallery-1440.png', join(destination, 'MoodSpace-gallery.png'));
await copyFile('work/screenshots/gallery-390.png', join(destination, 'MoodSpace-mobile.png'));
for (const [source, target] of [
  ['docs/functional-audit.md', 'MoodSpace-audit.md'],
  ['docs/audit-verification.md', 'MoodSpace-audit-verification.md'],
  ['docs/instructor-demo-guide.md', 'MoodSpace-instructor-guide.md'],
  ['docs/participant-testing-guide.md', 'MoodSpace-participant-guide.md'],
  ['work/coverage-demo/report.md', 'MoodSpace-synthetic-coverage.md'],
  ['work/coverage-demo/synthetic-coverage.csv', 'MoodSpace-synthetic-coverage.csv'],
])
  await copyFile(source, join(destination, target));
const screenshots = {};
for (const file of await readdir('work/screenshots'))
  if (
    /^(U0[1-8]-(desktop|mobile)|gallery-(1440|390)|adaptive-(entry|chosen|recommendation)|research-console)\.png$/.test(
      file,
    )
  )
    screenshots[file] = await readFile(join('work/screenshots', file));
await writeFile(join(destination, 'MoodSpace-screenshots.zip'), zipSync(screenshots));
console.log(
  'Packaged ' +
    Object.keys(files).length +
    ' source files. Secrets, databases, dependencies and exports excluded.',
);
