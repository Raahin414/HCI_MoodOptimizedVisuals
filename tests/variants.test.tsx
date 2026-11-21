// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Workspace from '../src/Workspace';
import { variantIds, freshTasks, courses, updateTask, type Task } from '../src/domain';
afterEach(cleanup);
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
function Harness({ id }: { id: (typeof variantIds)[number] }) {
  const [tasks, setTasks] = React.useState(freshTasks);
  return (
    <Workspace
      id={id}
      tasks={tasks}
      onStatus={(id, status) => setTasks((t) => updateTask(t, id, status))}
      onEvent={() => {}}
    />
  );
}
describe('all eight standalone renderers share action parity', () => {
  for (const id of variantIds)
    it(
      id + ' exposes every canonical task/course and supports deadline inspection and completion',
      () => {
        render(<Harness id={id} />);
        fireEvent.click(screen.getByRole('button', { name: 'All tasks' }));
        for (const t of freshTasks())
          expect(
            within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(t.title) }),
          ).toBeInTheDocument();
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: /Prototype walkthrough.*Interaction Design/,
          }),
        );
        expect(screen.getByRole('button', { name: '2026-11-19 · Nov 19' })).toBeInTheDocument();
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark complete' }),
        );
        expect(screen.getByText('Task marked complete.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
        fireEvent.click(screen.getByRole('button', { name: 'Courses' }));
        for (const c of courses)
          expect(
            screen.getByRole('button', { name: new RegExp(c.name + '.*' + c.code) }),
          ).toBeInTheDocument();
      },
    );
});
