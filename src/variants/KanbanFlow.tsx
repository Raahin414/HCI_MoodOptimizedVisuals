import { courses, type Status } from '../domain';
import { dateLabel, Progress, type VariantProps } from './shared';
import { ArrowRight, Check } from 'lucide-react';
export default function KanbanFlow(p: VariantProps) {
  return (
    <div className="kanban">
      {(['todo', 'progress', 'done'] as Status[]).map((status, i) => (
        <section className="kanban-column" key={status}>
          <header>
            <h3>
              <span className={'status-dot s' + i} />
              {['To do', 'In progress', 'Completed'][i]}
            </h3>
            <span>{p.tasks.filter((t) => t.status === status).length}</span>
          </header>
          {p.tasks
            .filter((t) => t.status === status)
            .map((t) => (
              <article className="kanban-card" key={t.id}>
                <small>{courses.find((c) => c.id === t.courseId)?.code}</small>
                <button className="card-title" onClick={() => p.openTask(t.id)}>
                  {t.title}
                </button>
                <p>
                  {dateLabel(t.due)} <span>· {t.priority} priority</span>
                </p>
                <Progress value={t.progress} label={t.title + ' progress'} />
                <button
                  className="text-action"
                  aria-label={
                    (status === 'todo'
                      ? 'Start '
                      : status === 'progress'
                        ? 'Complete '
                        : 'Reopen ') + t.title
                  }
                  onClick={() =>
                    p.onStatus(
                      t.id,
                      status === 'todo' ? 'progress' : status === 'progress' ? 'done' : 'todo',
                    )
                  }
                >
                  {status === 'todo' ? (
                    <>
                      Start task
                      <ArrowRight size={13} />
                    </>
                  ) : status === 'progress' ? (
                    <>
                      Complete
                      <Check size={13} />
                    </>
                  ) : (
                    'Reopen task'
                  )}
                </button>
              </article>
            ))}
        </section>
      ))}
    </div>
  );
}
