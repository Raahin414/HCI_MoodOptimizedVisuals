import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateOffset, sortedTasks } from '../domain';
import { dateLabel, TaskRow, type VariantProps } from './shared';
export default function WeeklyPlanner(p: VariantProps) {
  const [offset, setOffset] = useState(-2);
  const days = Array.from({ length: 7 }, (_, i) => dateOffset(offset + i));
  return (
    <>
      <header className="section-heading">
        <div>
          <h2>Your week, with room to breathe.</h2>
          <p>
            {dateLabel(days[0])} – {dateLabel(days[6])}, 2026
          </p>
        </div>
        <div className="actions">
          <button
            aria-label="Previous week"
            onClick={() => {
              setOffset(offset - 7);
              p.onEvent('navigation', 'week');
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setOffset(-2)}>Scenario week</button>
          <button
            aria-label="Next week"
            onClick={() => {
              setOffset(offset + 7);
              p.onEvent('navigation', 'week');
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <div className="week-grid">
        {days.map((day) => (
          <section className={'day-column ' + (day === dateOffset(0) ? 'today' : '')} key={day}>
            <header>
              <small>
                {new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
              </small>
              <strong>{Number(day.slice(-2))}</strong>
              {day === dateOffset(0) && <small>Scenario day</small>}
            </header>
            {p.tasks
              .filter((t) => t.due === day)
              .map((t) => (
                <button
                  key={t.id}
                  className={'calendar-task ' + (t.status === 'done' ? 'done' : '')}
                  onClick={() => p.openTask(t.id)}
                >
                  <small>{t.kind}</small>
                  <strong>{t.title}</strong>
                  <span>
                    {t.priority} priority · {t.progress}%
                  </span>
                </button>
              ))}
            {!p.tasks.some((t) => t.due === day) && <p className="empty-day">No deadlines</p>}
          </section>
        ))}
      </div>
      <details className="below-fold">
        <summary>Full semester agenda · {p.tasks.length} tasks</summary>
        {sortedTasks(p.tasks).map((t) => (
          <TaskRow key={t.id} task={t} openTask={p.openTask} />
        ))}
      </details>
    </>
  );
}
