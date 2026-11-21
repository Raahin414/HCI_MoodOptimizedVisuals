import { courses, sortedTasks, courseProgress } from '../domain';
import { dateLabel, type VariantProps } from './shared';
export default function DailyBrief(p: VariantProps) {
  const ranked = [...p.tasks].sort(
    (a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done') ||
      Number(b.priority === 'high') - Number(a.priority === 'high') ||
      a.due.localeCompare(b.due),
  );
  const open = p.tasks.filter((t) => t.status !== 'done');
  return (
    <div className="brief-layout">
      <article>
        <header className="brief-masthead">
          <span>MoodSpace / Study desk</span>
          <span>November 18, 2026</span>
        </header>
        <h2>Your daily brief.</h2>
        <p className="brief-lead">
          {open.length} open tasks. {open.filter((t) => t.priority === 'high').length} high
          priorities. Start with what deserves your attention.
        </p>
        <h3>The priority reading</h3>
        <ol className="brief-list">
          {ranked.map((t) => (
            <li key={t.id}>
              <details>
                <summary>
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {courses.find((c) => c.id === t.courseId)?.name} · {dateLabel(t.due)} ·{' '}
                      {t.priority} priority ·{' '}
                      {t.status === 'done' ? 'Complete' : t.progress + '% progress'}
                    </small>
                  </span>
                </summary>
                <p>{t.description}</p>
                <div className="actions">
                  <button onClick={() => p.openTask(t.id)}>Inspect task</button>
                  <button disabled={t.status === 'done'} onClick={() => p.onStatus(t.id, 'done')}>
                    {t.status === 'done' ? 'Completed' : 'Mark complete'}
                  </button>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </article>
      <aside>
        <h3>From your courses</h3>
        {courses.map((c) => (
          <button className="brief-course" key={c.id} onClick={() => p.openCourse(c.id)}>
            <strong>{c.name}</strong>
            <p>
              {courseProgress(p.tasks, c.id)}% progress. Next:{' '}
              {dateLabel(
                sortedTasks(p.tasks.filter((t) => t.courseId === c.id && t.status !== 'done'))[0]
                  ?.due || '2026-11-18',
              )}
              .
            </p>
            <span>Read course notes →</span>
          </button>
        ))}
      </aside>
    </div>
  );
}
