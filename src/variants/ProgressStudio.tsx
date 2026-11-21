import { useState } from 'react';
import { courses, courseProgress } from '../domain';
import { Progress, TaskRow, type VariantProps } from './shared';
export default function ProgressStudio(p: VariantProps) {
  const [selected, setSelected] = useState('C03');
  const complete = p.tasks.filter((t) => t.status === 'done').length;
  return (
    <>
      <div className="progress-summary">
        <div>
          <span>Tasks completed</span>
          <strong>
            {complete}
            <small> / {p.tasks.length}</small>
          </strong>
        </div>
        <div>
          <span>In progress</span>
          <strong>{p.tasks.filter((t) => t.status === 'progress').length}</strong>
        </div>
        <div>
          <span>Average course progress</span>
          <strong>
            {Math.round(
              courses.reduce((n, c) => n + courseProgress(p.tasks, c.id), 0) / courses.length,
            )}
            <small>%</small>
          </strong>
        </div>
      </div>
      <div className="studio-layout">
        <section className="panel">
          <h2>Where your courses stand</h2>
          <p>Select a course to see the work behind its progress.</p>
          {courses.map((c) => (
            <button
              key={c.id}
              className={'bar-course ' + (selected === c.id ? 'selected' : '')}
              onClick={() => {
                setSelected(c.id);
                p.onEvent('course_open', c.id);
              }}
            >
              <span>{c.name}</span>
              <span>{courseProgress(p.tasks, c.id)}%</span>
              <Progress value={courseProgress(p.tasks, c.id)} label={c.name + ' completion'} />
            </button>
          ))}
        </section>
        <section>
          <header className="section-heading">
            <h3>{courses.find((c) => c.id === selected)?.name}</h3>
            <button onClick={() => p.openCourse(selected)}>Course details</button>
          </header>
          {p.tasks
            .filter((t) => t.courseId === selected)
            .map((t) => (
              <TaskRow key={t.id} task={t} openTask={p.openTask} compact />
            ))}
        </section>
      </div>
    </>
  );
}
