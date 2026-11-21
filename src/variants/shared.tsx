import { courses, courseProgress, type Task, type WorkspaceProps } from '../domain';
import { ArrowUpRight, Check } from 'lucide-react';
export type VariantProps = WorkspaceProps & {
  openTask: (id: string) => void;
  openCourse: (id: string) => void;
};
export const dateLabel = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: value + '%' }} />
    </div>
  );
}
export function TaskRow({
  task,
  openTask,
  compact = false,
}: {
  task: Task;
  openTask: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      className={'task-row ' + (compact ? 'compact' : '')}
      onClick={() => openTask(task.id)}
      data-task-id={task.id}
    >
      <span className={'task-mark ' + (task.status === 'done' ? 'checked' : '')}>
        {task.status === 'done' && <Check size={12} />}
      </span>
      <span className="task-copy">
        <strong>{task.title}</strong>
        <small>
          {courses.find((c) => c.id === task.courseId)?.name} · {task.kind}
        </small>
      </span>
      <span className="task-meta">
        <span>{dateLabel(task.due)}</span>
        <small>
          {task.priority === 'high'
            ? 'High priority'
            : task.status === 'done'
              ? 'Complete'
              : task.status === 'progress'
                ? 'In progress'
                : 'To do'}
        </small>
      </span>
      <ArrowUpRight className="row-arrow" size={15} />
    </button>
  );
}
export function CourseList({
  tasks,
  openCourse,
}: {
  tasks: Task[];
  openCourse: (id: string) => void;
}) {
  return (
    <div className="course-list">
      {courses.map((c) => (
        <button key={c.id} onClick={() => openCourse(c.id)}>
          <span>
            <strong>{c.name}</strong>
            <small>
              {tasks.filter((t) => t.courseId === c.id && t.status !== 'done').length} tasks
              remaining
            </small>
          </span>
          <span>{courseProgress(tasks, c.id)}%</span>
        </button>
      ))}
    </div>
  );
}
