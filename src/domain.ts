export const VERSION = 'moodspace-1.0';
export const REFERENCE_DAY = '2026-11-18';
export const VARIANTS = [
  {
    id: 'U01',
    name: 'Quiet Focus',
    tag: 'One thing at a time',
    description: 'A single task takes the spotlight. Your full queue waits one step away.',
    density: 'Low',
    structure: 'Spotlight',
  },
  {
    id: 'U02',
    name: 'Kanban Flow',
    tag: 'See work move forward',
    description: 'Three lanes turn a busy semester into a visible flow of work.',
    density: 'Medium',
    structure: 'Board',
  },
  {
    id: 'U03',
    name: 'Weekly Planner',
    tag: 'Make room in your week',
    description: 'Deadlines find their place on a seven-day calendar and daily agenda.',
    density: 'Medium',
    structure: 'Calendar',
  },
  {
    id: 'U04',
    name: 'Progress Studio',
    tag: 'See the bigger picture',
    description: 'Course progress leads you into the work behind every number.',
    density: 'Medium',
    structure: 'Metrics',
  },
  {
    id: 'U05',
    name: 'Course Hub',
    tag: 'A home for each subject',
    description: 'Organize your attention by course, with tasks and milestones together.',
    density: 'Medium',
    structure: 'Subjects',
  },
  {
    id: 'U06',
    name: 'Priority Matrix',
    tag: 'Decide what matters next',
    description: 'Separate urgency from importance in four actionable quadrants.',
    density: 'High',
    structure: 'Matrix',
  },
  {
    id: 'U07',
    name: 'Guided Assistant',
    tag: 'Find a way in',
    description: 'Use clear, guided questions to find deadlines, courses, and tasks.',
    density: 'Low',
    structure: 'Conversation',
  },
  {
    id: 'U08',
    name: 'Daily Brief',
    tag: 'Your day, in a few lines',
    description: 'An editorial briefing gathers priorities into a readable, ranked digest.',
    density: 'Low',
    structure: 'Briefing',
  },
] as const;
export type VariantId = (typeof VARIANTS)[number]['id'];
export const variantIds = VARIANTS.map((v) => v.id);
export const MOODS = [
  {
    id: 'positive',
    label: 'Positive / Energetic',
    short: 'Positive',
    copy: 'Feeling upbeat or ready to get going.',
  },
  {
    id: 'neutral',
    label: 'Neutral / Balanced',
    short: 'Neutral',
    copy: 'Somewhere in the middle, or steady.',
  },
  {
    id: 'stressed',
    label: 'Stressed / Overwhelmed',
    short: 'Stressed',
    copy: 'A lot on your mind, or feeling under pressure.',
  },
] as const;
export type Mood = 'positive' | 'neutral' | 'stressed' | 'unclassified';
export type Status = 'todo' | 'progress' | 'done';
export type Task = {
  id: string;
  courseId: string;
  title: string;
  due: string;
  priority: 'high' | 'medium' | 'low';
  status: Status;
  progress: number;
  kind: string;
  minutes: number;
  description: string;
};
export type Course = { id: string; name: string; code: string; note: string };
export const courses: Course[] = [
  {
    id: 'C01',
    name: 'Interaction Design',
    code: 'IXD 201',
    note: 'Designing with people, through small experiments.',
  },
  {
    id: 'C02',
    name: 'Data Structures',
    code: 'CS 204',
    note: 'Making information easier to work with.',
  },
  {
    id: 'C03',
    name: 'Applied Statistics',
    code: 'STA 210',
    note: 'Turning observations into careful conclusions.',
  },
  {
    id: 'C04',
    name: 'Systems Design',
    code: 'SYS 220',
    note: 'Understanding how the pieces fit together.',
  },
  {
    id: 'C05',
    name: 'Digital Communication',
    code: 'COM 203',
    note: 'Clear ideas, thoughtfully communicated.',
  },
];
const titles = [
  [
    'Interview synthesis',
    'Prototype walkthrough',
    'Accessibility reading',
    'Usability study plan',
    'Reflection notes',
  ],
  [
    'Tree traversal worksheet',
    'Hash table lab',
    'Complexity quiz',
    'Graph practice',
    'Algorithm review',
  ],
  [
    'Sampling worksheet',
    'Confidence interval lab',
    'Distribution reading',
    'Regression exercise',
    'Statistics reflection',
  ],
  [
    'Service map review',
    'Architecture sketch',
    'Reliability reading',
    'Team design critique',
    'System boundaries',
  ],
  ['Message audit', 'Presentation rehearsal', 'Visual hierarchy reading', 'Editorial storyboard'],
];
const offsets = [
  [-2, 1, 3, 5, 8],
  [0, 2, 4, 7, 10],
  [1, 3, 6, 9, 12],
  [2, 4, 5, 8, 11],
  [0, 3, 6, 9],
];
export function dateOffset(n: number) {
  const d = new Date(REFERENCE_DAY + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const fixtureTasks: Task[] = titles.flatMap((names, c) =>
  names.map((title, i) => ({
    id: `T${String(c * 5 + i + 1).padStart(2, '0')}`,
    courseId: courses[c].id,
    title,
    due: dateOffset(offsets[c][i]),
    priority: (i === 0 ? 'high' : i % 2 ? 'medium' : 'low') as Task['priority'],
    status: ((c === 2 ? i === 4 : i === 4 || i === 2)
      ? 'done'
      : i === 1
        ? 'progress'
        : 'todo') as Status,
    progress: (c === 2 ? i === 4 : i === 4 || i === 2) ? 100 : i === 1 ? 40 : 0,
    kind: ['Assignment', 'Lab', 'Reading', 'Team review', 'Reflection'][i],
    minutes: [35, 50, 20, 45, 15][i],
    description: `Prepare ${title.toLowerCase()} for ${courses[c].name}. Review your course notes, develop a clear response, and check the brief before submitting.`,
  })),
);
export const milestones = Array.from({ length: 8 }, (_, i) => ({
  id: `M${i + 1}`,
  courseId: courses[i % 5].id,
  title: [
    'Design review',
    'Implementation check',
    'Methods discussion',
    'System walkthrough',
    'Communication showcase',
    'Portfolio review',
    'Code demonstration',
    'Analysis presentation',
  ][i],
  due: dateOffset(4 + i * 2),
}));
export const freshTasks = () => structuredClone(fixtureTasks);
export const courseProgress = (tasks: Task[], id: string) => {
  const list = tasks.filter((t) => t.courseId === id);
  return Math.round(list.reduce((n, t) => n + t.progress, 0) / Math.max(1, list.length));
};
export const sortedTasks = (tasks: Task[]) =>
  [...tasks].sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
export const quadrant = (t: Task) =>
  `${t.due <= dateOffset(3) ? 'urgent' : 'later'}-${t.priority === 'high' ? 'important' : 'routine'}`;
export function updateTask(tasks: Task[], id: string, status: Status) {
  return tasks.map((t) =>
    t.id === id
      ? { ...t, status, progress: status === 'done' ? 100 : status === 'progress' ? 40 : 0 }
      : t,
  );
}
export type Challenge = {
  id: string;
  family:
    | 'deadline'
    | 'complete'
    | 'course-progress'
    | 'priority'
    | 'milestone'
    | 'count'
    | 'scheduled'
    | 'overdue';
  difficulty: 'standard';
  prompt: string;
  targetId: string;
  answer: string;
  options?: { id: string; label: string }[];
};
const dateOptions = [-2, 0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 12].map((n) => ({
  id: dateOffset(n),
  label: dateOffset(n),
}));
export const taskBank: Challenge[] = [
  ...[0, 5, 10, 15].map((i) => ({
    id: `D${i}`,
    family: 'deadline' as const,
    difficulty: 'standard' as const,
    prompt: `Find the due date for “${fixtureTasks[i].title}”.`,
    targetId: fixtureTasks[i].id,
    answer: fixtureTasks[i].due,
    options: dateOptions,
  })),
  ...[1, 6, 11, 16].map((i) => ({
    id: `A${i}`,
    family: 'complete' as const,
    difficulty: 'standard' as const,
    prompt: `Find “${fixtureTasks[i].title}” and mark it complete.`,
    targetId: fixtureTasks[i].id,
    answer: fixtureTasks[i].id,
  })),
  {
    id: 'lowest',
    family: 'course-progress',
    difficulty: 'standard',
    prompt: 'Which course has the lowest average task progress?',
    targetId: 'C03',
    answer: 'C03',
    options: courses.map((c) => ({ id: c.id, label: c.name })),
  },
  {
    id: 'next',
    family: 'priority',
    difficulty: 'standard',
    prompt: 'Which incomplete high-priority task is due next on or after the scenario day?',
    targetId: 'T06',
    answer: 'T06',
  },
  {
    id: 'milestone',
    family: 'milestone',
    difficulty: 'standard',
    prompt: 'What is the next Interaction Design milestone date?',
    targetId: 'M1',
    answer: milestones[0].due,
  },
  {
    id: 'count',
    family: 'count',
    difficulty: 'standard',
    prompt: 'How many incomplete tasks are in Applied Statistics?',
    targetId: 'C03',
    answer: '4',
  },
  {
    id: 'scheduled',
    family: 'scheduled',
    difficulty: 'standard',
    prompt: 'Which assignment is due on 2026-11-19 in Applied Statistics?',
    targetId: 'T11',
    answer: 'T11',
  },
  {
    id: 'overdue',
    family: 'overdue',
    difficulty: 'standard',
    prompt: 'Which incomplete high-priority item is overdue?',
    targetId: 'T01',
    answer: 'T01',
  },
];
export const challenge = (id: string) => taskBank.find((t) => t.id === id)!;
export function scoreTask(id: string, answer: string, tasks: Task[]) {
  const c = challenge(id);
  return c?.family === 'complete'
    ? tasks.some((t) => t.id === c.targetId && t.status === 'done')
    : c?.answer === answer;
}
export function ruleMood(text: string): { mood: Mood; method: string; reason: string } {
  const normalized = text.toLowerCase();
  const signals = {
    positive: ['excited', 'energized', 'energetic', 'happy', 'looking forward', 'motivated'],
    neutral: ['steady', 'balanced', 'okay', 'fine', 'neutral', 'calm'],
    stressed: ['overwhelmed', 'stressed', 'worried', 'anxious', 'too much', 'under pressure'],
  };
  const scores = Object.entries(signals)
    .map(([m, words]) => ({
      m: m as Mood,
      n: words.filter((w) => normalized.includes(w) && !normalized.includes('not ' + w)).length,
    }))
    .sort((a, b) => b.n - a.n);
  const mood = scores[0].n > 0 && scores[0].n > scores[1].n ? scores[0].m : 'unclassified';
  return {
    mood,
    method: 'rule-based demonstration',
    reason:
      mood === 'unclassified'
        ? 'No clear phrase match. Choose your own label.'
        : 'Matched a small, documented list of phrases. This can be wrong.',
  };
}
export type EventType =
  | 'task_open'
  | 'course_open'
  | 'deadline_inspect'
  | 'completion_action'
  | 'status_action'
  | 'backtrack'
  | 'navigation';
export type WorkspaceProps = {
  tasks: Task[];
  onStatus: (id: string, status: Status) => void;
  onEvent: (type: EventType, target: string) => void;
  preview?: boolean;
};
