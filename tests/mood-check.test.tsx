// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MoodCheck from '../src/MoodCheck';
afterEach(cleanup);
it('keeps the independent report when a prediction is accepted then rejected, while retaining its audit link', async () => {
  const save = vi.fn();
  render(
    <MoodCheck
      onSave={save}
      predict={async () => ({
        predicted_mood: 'positive',
        method: 'rule-based demonstration',
        prediction_id: 'e5ec2dd0-3ac8-4d3a-8a37-e20efdc1da56',
        reason: 'Phrase match',
      })}
    />,
  );
  fireEvent.click(screen.getByRole('radio', { name: /Neutral \/ Balanced/ }));
  fireEvent.change(screen.getByLabelText(/In a sentence/), { target: { value: 'happy' } });
  fireEvent.click(screen.getByLabelText(/I explicitly agree/));
  fireEvent.click(screen.getByRole('button', { name: 'Predict from consented text' }));
  await screen.findByText('rule-based demonstration');
  fireEvent.click(screen.getByRole('button', { name: 'Use this label' }));
  expect(screen.getByRole('radio', { name: /Positive \/ Energetic/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Keep my own selection' }));
  expect(screen.getByRole('radio', { name: /Neutral \/ Balanced/ })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to the designs' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        mood: 'neutral',
        prediction_id: 'e5ec2dd0-3ac8-4d3a-8a37-e20efdc1da56',
      }),
    ),
  );
});
