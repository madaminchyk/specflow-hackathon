import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App, repository } from '../src/app/App';
import { blankProject, type Segment } from '../src/domain/model';
import { sessionMedia } from '../src/services/files';
import { aiAnalyze, aiTranscribe, CloudError } from '../src/services/ai';

vi.mock('../src/services/ai', async (original) => ({
  ...(await original<typeof import('../src/services/ai')>()),
  aiAnalyze: vi.fn(),
  aiTranscribe: vi.fn(),
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:mock'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(aiTranscribe).mockReset();
  vi.mocked(aiAnalyze).mockReset();
});
afterEach(() => sessionMedia.clear());

async function openCloud() {
  const project = { ...blankProject(), processingStatus: 'uploaded' as const };
  repository.save(project);
  sessionMedia.set(project.id, new File(['mock audio'], 'meeting.wav', { type: 'audio/wav' }));
  render(
    <MemoryRouter initialEntries={['/project/' + project.id]}>
      <App />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'AI-обработка' }));
  await user.click(screen.getByRole('checkbox', { name: /Разрешаю отправить/ }));
  await user.click(screen.getByRole('button', { name: 'Начать обработку' }));
  return { user, project };
}

it('preserves real transcription on analysis failure and retries without repeating ASR', async () => {
  const segments: Segment[] = [
    {
      id: 'seg-1',
      speakerId: 'speaker',
      speakerName: 'Участник',
      startMs: 0,
      endMs: 1000,
      text: 'Нужно бронировать комнату.',
      timing: 'estimated',
    },
  ];
  vi.mocked(aiTranscribe).mockResolvedValue(segments);
  vi.mocked(aiAnalyze).mockRejectedValueOnce(
    new CloudError('Проверьте квоту Yandex.', 429, 'PROVIDER_LIMIT'),
  );
  const { user, project } = await openCloud();
  await waitFor(() =>
    expect(screen.getAllByText(/Распознанная транскрипция сохранена/).length).toBeGreaterThan(0),
  );
  expect(repository.list().find((p) => p.id === project.id)?.segments).toEqual(segments);
  vi.mocked(aiAnalyze).mockResolvedValue({
    requirements: [],
    roles: [],
    scenarios: [],
    conflicts: [],
  });
  await user.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() => expect(repository.list()[0].processingStatus).toBe('ready'));
  expect(aiTranscribe).toHaveBeenCalledTimes(1);
  expect(aiAnalyze).toHaveBeenCalledTimes(2);
});

it('shows an honest async limitation without running analysis or inventing a transcript', async () => {
  vi.mocked(aiTranscribe).mockRejectedValue(
    new CloudError('Запись длиннее 30 секунд; очередь не подключена.', 413, 'ASYNC_REQUIRED'),
  );
  const { project } = await openCloud();
  expect(await screen.findByText('Нужна асинхронная обработка')).toBeVisible();
  expect(repository.list().find((p) => p.id === project.id)?.segments).toEqual([]);
  expect(aiAnalyze).not.toHaveBeenCalled();
});
