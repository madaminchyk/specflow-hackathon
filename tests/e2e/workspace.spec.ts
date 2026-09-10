import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('demo: evidence, edit, persistence, conflict, exports, responsive layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть демо за 30 секунд' }).click();
  await expect(
    page.getByRole('heading', { name: 'Бронирование переговорных', exact: true }),
  ).toBeVisible();
  await page
    .locator('.card-main')
    .filter({ hasText: 'Вход через корпоративную учётную запись' })
    .click();
  await page.locator('.evidence-link').first().click();
  await expect(page.locator('#seg-3')).toHaveClass(/source-active/);
  await expect(page.locator('#seg-3')).toContainText(
    'Нужно входить через корпоративную учётную запись.',
  );
  const mobile = info.project.name !== 'desktop';
  if (mobile)
    await page
      .getByRole('navigation', { name: 'Рабочие зоны' })
      .getByRole('button', { name: 'Инспектор' })
      .click();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Корпоративный вход — проверено');
  await page.getByLabel('Статус', { exact: true }).selectOption('needsClarification');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Сохранено');
  await page.reload();
  await expect(
    page.locator('.card-main').filter({ hasText: 'Корпоративный вход — проверено' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Разделы проекта' })
    .getByRole('button', { name: /Противоречия/ })
    .click();
  await expect(page.locator('.conflict-sources')).toContainText('30 дней');
  await expect(page.locator('.conflict-sources')).toContainText('14 дней');
  await page.getByLabel('Решение и основание').fill('Для пилота согласовали 14 дней.');
  await page.getByRole('button', { name: 'Решено', exact: true }).click();
  await expect(page.locator('.conflict-card>.badge')).toHaveText('Решено');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Markdown/ }).click();
  const dl = await downloadPromise;
  const content = await fs.readFile((await dl.path())!, 'utf8');
  expect(content).toContain('Корпоративный вход — проверено');
  expect(content).toContain('Матрица трассировки');
  expect(content).toContain('Для пилота согласовали 14 дней.');
  await page.getByRole('button', { name: 'Закрыть диалог' }).click();
  await page
    .getByRole('navigation', { name: 'Разделы проекта' })
    .getByRole('button', { name: 'Требования', exact: true })
    .click();
  await expect(page.locator('body')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await fs.mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: `docs/screenshots/${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
test('local import, filters, add, remove and restore', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
  await page
    .getByLabel('Или вставьте транскрипцию')
    .fill(
      'Заказчик: Нужно бронировать комнату.\nАналитик: Нельзя бронировать занятый интервал.\nЗаказчик: Вопрос: нужна почта?',
    );
  await page.getByRole('button', { name: 'Разобрать текст' }).click();
  await expect(page.locator('.requirement-card')).toHaveCount(3);
  await page.getByLabel('Поиск требований').fill('почта');
  await expect(page.locator('.requirement-card')).toHaveCount(1);
  await page.getByLabel('Поиск требований').fill('');
  await page.getByRole('button', { name: 'Добавить требование' }).click();
  await page.getByRole('button', { name: 'Удалить элемент', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Восстановить' }).click();
  if (info.project.name !== 'desktop')
    await page
      .getByRole('navigation', { name: 'Рабочие зоны' })
      .getByRole('button', { name: 'Требования', exact: true })
      .click();
  await expect(page.locator('.requirement-card')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.requirement-card')).toHaveCount(4);
});
