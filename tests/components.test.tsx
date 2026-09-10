import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { createDemo } from '../src/data/demo';
import { blankProject } from '../src/domain/model';
import { RequirementList } from '../src/features/requirements/RequirementList';
import { Inspector } from '../src/features/requirements/Inspector';
import { ImportDialog, NO_AI_MESSAGE } from '../src/features/upload/ImportDialog';
it('filters requirements by text and status', async () => {
  const user = userEvent.setup();
  render(
    <RequirementList
      project={createDemo()}
      selected=""
      onSelect={vi.fn()}
      onAdd={vi.fn()}
      onBulk={vi.fn()}
    />,
  );
  await user.type(screen.getByLabelText('Поиск требований'), 'Outlook');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Фильтры' }));
  await user.selectOptions(screen.getByLabelText('Статус'), 'approved');
  expect(screen.getByText('Элементы не найдены')).toBeVisible();
});
it('edits an item, marks clarification, and navigates to literal evidence', async () => {
  const user = userEvent.setup();
  const p = createDemo();
  const save = vi.fn();
  const source = vi.fn();
  render(
    <Inspector
      item={p.requirements[0]}
      project={p}
      onSave={save}
      onDelete={vi.fn()}
      onSource={source}
    />,
  );
  await user.click(screen.getByRole('button', { name: /Заказчик.*00:34/ }));
  expect(source).toHaveBeenCalledWith('seg-3');
  await user.click(screen.getByRole('button', { name: 'Редактировать' }));
  await user.clear(screen.getByLabelText('Название'));
  await user.type(screen.getByLabelText('Название'), 'Вход через SSO');
  await user.selectOptions(screen.getByLabelText('Статус'), 'needsClarification');
  await user.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Вход через SSO', status: 'needsClarification' }),
  );
});
it('does not pretend to transcribe arbitrary media without a provider', async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = vi.fn();
  const user = userEvent.setup();
  const media = vi.fn();
  const imported = vi.fn();
  render(
    <ImportDialog project={blankProject()} onClose={vi.fn()} onMedia={media} onImport={imported} />,
  );
  const file = new File(['sample'], 'meeting.mp3', { type: 'audio/mpeg' });
  await user.upload(screen.getByLabelText('Файл встречи'), file);
  expect(media).toHaveBeenCalledWith(file);
  expect(within(screen.getByRole('alert')).getByText(NO_AI_MESSAGE)).toBeInTheDocument();
  expect(imported).not.toHaveBeenCalled();
});
