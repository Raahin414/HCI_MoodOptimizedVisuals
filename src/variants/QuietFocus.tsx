import { useState } from 'react';
import { ArrowRight, Leaf, List } from 'lucide-react';
import { courses, sortedTasks } from '../domain';
import { TaskRow, dateLabel, Progress, type VariantProps } from './shared';
export default function QuietFocus(p: VariantProps) {
  const [queue, setQueue] = useState(false);
  const task = sortedTasks(p.tasks.filter((t) => t.status !== 'done'))[0];
  return (
    <div className="quiet-layout">
      <section className="focus-panel">
        <span className="soft-label">
          <Leaf size={16} /> A little room to focus
        </span>
        {task ? (
          <>
            <p className="focus-course">{courses.find((c) => c.id === task.courseId)?.name}</p>
            <h2>{task.title}</h2>
            <p>{task.description}</p>
            <div className="focus-facts">
              <span>Due {dateLabel(task.due)}</span>
              <span>{task.minutes} min estimate</span>
              <span>{task.priority} priority</span>
            </div>
            <Progress value={task.progress} label="Task progress" />
            <button className="primary" onClick={() => p.openTask(task.id)}>
              Open this task <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <h2>A clear desk.</h2>
            <p>All tasks are complete. You can still review your queue.</p>
          </>
        )}
        <p className="quiet-note">One next step is enough to begin.</p>
      </section>
      <aside className="quiet-aside">
        <h3>Your queue</h3>
        <p>
          {p.tasks.filter((t) => t.status !== 'done').length} tasks still open across{' '}
          {courses.length} courses.
        </p>
        <button
          className="secondary"
          onClick={() => {
            setQueue(!queue);
            p.onEvent('navigation', 'queue');
          }}
        >
          <List size={16} />
          {queue ? 'Close full queue' : 'See full queue'}
        </button>
        <h3>Course check-in</h3>
        {courses.slice(0, 3).map((c) => (
          <button className="text-row" key={c.id} onClick={() => p.openCourse(c.id)}>
            {c.name}
            <ArrowRight size={14} />
          </button>
        ))}
      </aside>
      {queue && (
        <section className="full-span">
          <h3>All tasks · {p.tasks.length}</h3>
          {sortedTasks(p.tasks).map((t) => (
            <TaskRow key={t.id} task={t} openTask={p.openTask} />
          ))}
        </section>
      )}
    </div>
  );
}
