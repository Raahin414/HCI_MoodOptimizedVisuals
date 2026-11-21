import { useState } from 'react';
import { ArrowUp, ArrowRight } from 'lucide-react';
import { courses, courseProgress, sortedTasks } from '../domain';
import { TaskRow, type VariantProps } from './shared';
export default function GuidedAssistant(p: VariantProps) {
  const [intent, setIntent] = useState('welcome');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const options = [
    ['next', 'Show my next deadline'],
    ['attention', 'Which course needs attention?'],
    ['complete', 'Mark a task complete'],
    ['tasks', 'Show all tasks'],
    ['courses', 'Browse courses'],
  ];
  function choose(id: string, label: string) {
    setIntent(id);
    setMessages((m) => [...m.slice(-2), label]);
    p.onEvent('navigation', id);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.toLowerCase();
    const id = q.includes('deadline')
      ? 'next'
      : q.includes('attention')
        ? 'attention'
        : q.includes('complete')
          ? 'complete'
          : q.includes('course')
            ? 'courses'
            : q.includes('task')
              ? 'tasks'
              : 'fallback';
    choose(id, query);
    setQuery('');
  }
  const lowest = [...courses].sort(
    (a, b) => courseProgress(p.tasks, a.id) - courseProgress(p.tasks, b.id),
  )[0];
  return (
    <div className="assistant-layout">
      <aside>
        <span className="soft-label">Guided workspace</span>
        <h2>A question is a good place to start.</h2>
        <p>
          This is a local, rule-based guide. Choose an option or ask about deadlines, attention,
          completion, courses, or tasks.
        </p>
        <div className="assistant-options">
          {options.map(([id, label]) => (
            <button key={id} onClick={() => choose(id, label)}>
              {label}
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </aside>
      <section className="conversation">
        <div className="chat-history">
          {messages.map((m, i) => (
            <p key={i} className="user-message">
              {m}
            </p>
          ))}
          <div className="assistant-message">
            <strong>MoodSpace guide</strong>
            <p>
              {
                (
                  {
                    welcome: 'What would help you find your next step?',
                    next: 'Here is your nearest incomplete deadline.',
                    attention: `${lowest.name} currently has the lowest average task progress (${courseProgress(p.tasks, lowest.id)}%).`,
                    complete: 'Choose a task below. Its detail view has a Mark complete control.',
                    tasks: 'Here is your full task list, ordered by due date.',
                    courses: 'Choose a course to see its tasks and milestones.',
                    fallback:
                      'I could not match that question. Try one of the guided options. No message is sent to an AI service.',
                  } as Record<string, string>
                )[intent]
              }
            </p>
          </div>
          {intent === 'next' &&
            sortedTasks(p.tasks.filter((t) => t.status !== 'done'))
              .slice(0, 1)
              .map((t) => <TaskRow key={t.id} task={t} openTask={p.openTask} />)}
          {intent === 'attention' && (
            <button onClick={() => p.openCourse(lowest.id)}>Open {lowest.name}</button>
          )}
          {['tasks', 'complete'].includes(intent) &&
            sortedTasks(p.tasks).map((t) => (
              <TaskRow key={t.id} task={t} openTask={p.openTask} compact />
            ))}
          {intent === 'courses' &&
            courses.map((c) => (
              <button className="text-row" key={c.id} onClick={() => p.openCourse(c.id)}>
                {c.name}
                <ArrowRight size={14} />
              </button>
            ))}
        </div>
        <form className="chat-input" onSubmit={submit}>
          <label className="sr-only" htmlFor="guide-query">
            Ask the rule-based guide
          </label>
          <input
            id="guide-query"
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “show all tasks”"
          />
          <button type="submit" disabled={!query.trim()} aria-label="Send question">
            <ArrowUp size={18} />
          </button>
        </form>
        <small className="muted">Deterministic rules · messages stay in this browser view</small>
      </section>
    </div>
  );
}
