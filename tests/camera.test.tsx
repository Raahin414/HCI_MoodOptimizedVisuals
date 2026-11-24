// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CameraMood from '../src/CameraMood';
const detect = vi.hoisted(() => vi.fn());
vi.mock('../src/faceMood', async (original) => ({
  ...(await original<typeof import('../src/faceMood')>()),
  loadFaceModel: async () => ({
    detectAllFaces: () => ({ withFaceExpressions: detect }),
    TinyFaceDetectorOptions: class {},
  }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('requires repeated predictions, stops capture, and only accepts after a click', async () => {
  const stop = vi.fn();
  const accept = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  detect.mockResolvedValue([{ expressions: { happy: 0.9 } }]);
  render(<CameraMood onAccept={accept} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera & scan' }));
  await waitFor(
    () => expect(screen.getByRole('button', { name: 'Use positive suggestion' })).toBeVisible(),
    { timeout: 4000 },
  );
  expect(detect).toHaveBeenCalledTimes(5);
  expect(stop).toHaveBeenCalledOnce();
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use positive suggestion' }));
  expect(accept).toHaveBeenCalledWith('positive');
});
it('handles permission denial with a recoverable manual option', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    },
  });
  render(<CameraMood onAccept={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera & scan' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('permission was denied'));
  expect(screen.getByRole('button', { name: 'Enable camera & scan' })).toBeEnabled();
});
