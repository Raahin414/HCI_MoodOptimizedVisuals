import { courses, courseProgress, milestones } from '../domain';
import { Progress, TaskRow, dateLabel, type VariantProps } from './shared';
export default function CourseHub(p: VariantProps) {
  return (
    <div className="hub-layout">
      <div>
        <h2>A place for every subject.</h2>
        <p>Open a course to gather its tasks, progress, and milestones.</p>
        {courses.map((c, i) => (
          <details className="course-folder" key={c.id} open={i === 0 || p.preview}>
            <summary>
              <span className="course-code">{c.code}</span>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {p.tasks.filter((t) => t.courseId === c.id && t.status !== 'done').length}{' '}
                  remaining · {courseProgress(p.tasks, c.id)}% progress
                </small>
              </span>
              <span className="folder-plus">+</span>
            </summary>
            <div className="folder-content">
              <Progress value={courseProgress(p.tasks, c.id)} label={c.name + ' progress'} />
              <p>{c.note}</p>
              {p.tasks
                .filter((t) => t.courseId === c.id)
                .map((t) => (
                  <TaskRow task={t} key={t.id} openTask={p.openTask} />
                ))}
              <button className="text-action" onClick={() => p.openCourse(c.id)}>
                View course and milestones →
              </button>
            </div>
          </details>
        ))}
      </div>
      <aside className="panel hub-milestones">
        <h3>Milestones ahead</h3>
        {milestones.map((m) => (
          <button className="milestone" key={m.id} onClick={() => p.openCourse(m.courseId)}>
            <small>{dateLabel(m.due)}</small>
            <strong>{m.title}</strong>
            <span>{courses.find((c) => c.id === m.courseId)?.name}</span>
          </button>
        ))}
      </aside>
    </div>
  );
}
