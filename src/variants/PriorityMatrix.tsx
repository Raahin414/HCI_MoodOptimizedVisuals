import { quadrant } from '../domain';
import { TaskRow, type VariantProps } from './shared';
export default function PriorityMatrix(p: VariantProps) {
  const groups = [
    ['urgent-important', 'Do first', 'Urgent + important'],
    ['later-important', 'Make a plan', 'Important, with time'],
    ['urgent-routine', 'Keep it moving', 'Urgent + routine'],
    ['later-routine', 'Find a little space', 'Routine, with time'],
  ];
  return (
    <>
      <p className="mapping-note">
        Urgent = due by Nov 21 (including overdue). Important = high priority. All tasks remain
        visible, including completed work.
      </p>
      <div className="matrix">
        {groups.map(([id, title, caption], i) => (
          <section key={id} className={'quadrant quadrant-' + i}>
            <header>
              <span>{caption}</span>
              <h2>{title}</h2>
              <small>{p.tasks.filter((t) => quadrant(t) === id).length} tasks</small>
            </header>
            {p.tasks
              .filter((t) => quadrant(t) === id)
              .map((t) => (
                <TaskRow key={t.id} task={t} openTask={p.openTask} compact />
              ))}
            {!p.tasks.some((t) => quadrant(t) === id) && <p>No tasks in this quadrant.</p>}
          </section>
        ))}
      </div>
    </>
  );
}
