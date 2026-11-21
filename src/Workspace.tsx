import { useEffect, useRef, useState } from 'react';
import { Search, X, Check, ArrowLeft, BookOpen, List } from 'lucide-react';
import {
  courses,
  milestones,
  courseProgress,
  VARIANTS,
  type VariantId,
  type WorkspaceProps,
} from './domain';
import QuietFocus from './variants/QuietFocus';
import KanbanFlow from './variants/KanbanFlow';
import WeeklyPlanner from './variants/WeeklyPlanner';
import ProgressStudio from './variants/ProgressStudio';
import CourseHub from './variants/CourseHub';
import PriorityMatrix from './variants/PriorityMatrix';
import GuidedAssistant from './variants/GuidedAssistant';
import DailyBrief from './variants/DailyBrief';
import { TaskRow, Progress, dateLabel } from './variants/shared';
export const renderers = {
  U01: QuietFocus,
  U02: KanbanFlow,
  U03: WeeklyPlanner,
  U04: ProgressStudio,
  U05: CourseHub,
  U06: PriorityMatrix,
  U07: GuidedAssistant,
  U08: DailyBrief,
};
export function Preview({ id }: { id: VariantId }) {
  const Renderer = renderers[id];
  return (
    <Renderer
      tasks={[]}
      openTask={() => {}}
      openCourse={() => {}}
      onStatus={() => {}}
      onEvent={() => {}}
      preview
    />
  );
}
export default function Workspace({ id, ...p }: WorkspaceProps & { id: VariantId }) {
  const [detail, setDetail] = useState<{
    type: 'task' | 'course' | 'tasks' | 'courses';
    id?: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (detail) {
      previous.current = document.activeElement as HTMLElement;
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      previous.current?.focus();
    }
  }, [detail]);
  useEffect(() => {
    setDetail(null);
    setSearch('');
  }, [id]);
  const openTask = (target: string) => {
    p.onEvent('task_open', target);
    setDetail({ type: 'task', id: target });
  };
  const openCourse = (target: string) => {
    p.onEvent('course_open', target);
    setDetail({ type: 'course', id: target });
  };
  const close = () => {
    p.onEvent('backtrack', 'all');
    setDetail(null);
  };
  const Renderer = renderers[id];
  const task = p.tasks.find((t) => t.id === detail?.id);
  const course = courses.find((c) => c.id === detail?.id);
  return (
    <div className={'workspace workspace-' + id}>
      <div className="workspace-tools">
        <span className="workspace-scope">Fictional semester · Nov 18, 2026</span>
        <div className="actions">
          <button
            onClick={() => {
              p.onEvent('navigation', 'tasks');
              setDetail({ type: 'tasks' });
            }}
          >
            <List size={15} />
            All tasks
          </button>
          <button
            onClick={() => {
              p.onEvent('navigation', 'courses');
              setDetail({ type: 'courses' });
            }}
          >
            <BookOpen size={15} />
            Courses
          </button>
        </div>
      </div>
      <Renderer {...p} openTask={openTask} openCourse={openCourse} />
      <dialog
        ref={dialog}
        className="detail-dialog"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        aria-labelledby="detail-title"
      >
        <header>
          <button className="icon-button" onClick={close} aria-label="Close details">
            <ArrowLeft size={18} />
          </button>
          <h2 id="detail-title">
            {detail?.type === 'task'
              ? 'Task details'
              : detail?.type === 'course'
                ? 'Course details'
                : detail?.type === 'tasks'
                  ? 'All tasks'
                  : 'All courses'}
          </h2>
          <button className="icon-button" onClick={close} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {detail?.type === 'task' && task && (
          <div className="task-detail">
            <span className="soft-label">
              {courses.find((c) => c.id === task.courseId)?.name} · {task.kind}
            </span>
            <h3>{task.title}</h3>
            <p>{task.description}</p>
            <dl>
              <div>
                <dt>Due date</dt>
                <dd>
                  <button
                    className="inline-value"
                    onClick={() => p.onEvent('deadline_inspect', task.id)}
                  >
                    {task.due} · {dateLabel(task.due)}
                  </button>
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{task.priority}</dd>
              </div>
              <div>
                <dt>Estimated work</dt>
                <dd>{task.minutes} minutes</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>{task.progress}%</dd>
              </div>
            </dl>
            <Progress value={task.progress} label="Task completion" />
            <div className="actions">
              <button
                className="primary"
                onClick={() => p.onStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
              >
                <Check size={16} />
                {task.status === 'done' ? 'Reopen task' : 'Mark complete'}
              </button>
              <button
                onClick={() => p.onStatus(task.id, 'progress')}
                disabled={task.status === 'progress'}
              >
                Set in progress
              </button>
            </div>
            <p role="status" className="muted">
              {task.status === 'done'
                ? 'Task marked complete.'
                : 'Changes apply to this workspace only.'}
            </p>
          </div>
        )}
        {detail?.type === 'course' && course && (
          <>
            <span className="soft-label">{course.code}</span>
            <h3>{course.name}</h3>
            <p>{course.note}</p>
            <p>
              {courseProgress(p.tasks, course.id)}% average progress ·{' '}
              {p.tasks.filter((t) => t.courseId === course.id && t.status !== 'done').length}{' '}
              incomplete tasks
            </p>
            <Progress value={courseProgress(p.tasks, course.id)} label="Course progress" />
            <h3>Milestones</h3>
            {milestones
              .filter((m) => m.courseId === course.id)
              .map((m) => (
                <p key={m.id}>
                  {m.title} <strong>{m.due}</strong>
                </p>
              ))}
            <h3>Course tasks</h3>
            {p.tasks
              .filter((t) => t.courseId === course.id)
              .map((t) => (
                <TaskRow task={t} key={t.id} openTask={openTask} />
              ))}
          </>
        )}
        {detail?.type === 'tasks' && (
          <>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Find a task"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a task or course…"
              />
            </label>
            {p.tasks
              .filter((t) =>
                (t.title + ' ' + courses.find((c) => c.id === t.courseId)?.name)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((t) => (
                <TaskRow task={t} key={t.id} openTask={openTask} />
              ))}
            {!p.tasks.some((t) =>
              (t.title + ' ' + courses.find((c) => c.id === t.courseId)?.name)
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && <p>No matching tasks. Try a course name.</p>}
          </>
        )}
        {detail?.type === 'courses' &&
          courses.map((c) => (
            <button className="course-directory" key={c.id} onClick={() => openCourse(c.id)}>
              <span>
                {c.name}
                <small>{c.code}</small>
              </span>
              <span>{courseProgress(p.tasks, c.id)}%</span>
            </button>
          ))}
      </dialog>
    </div>
  );
}
