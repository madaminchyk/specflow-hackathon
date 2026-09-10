// @vitest-environment node
import { it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { createDemo } from '../src/data/demo';
import { exportDocx } from '../src/services/export';
it('creates a real DOCX with headings, evidence and Russian text', async () => {
  const blob = await exportDocx(createDemo());
  const zip = Buffer.from(await blob.arrayBuffer());
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  let xml = '';
  for (let i = 0; i < zip.length - 46; i++) {
    if (zip.readUInt32LE(i) !== 0x02014b50) continue;
    const size = zip.readUInt32LE(i + 20);
    const nameLength = zip.readUInt16LE(i + 28);
    const local = zip.readUInt32LE(i + 42);
    if (zip.subarray(i + 46, i + 46 + nameLength).toString() !== 'word/document.xml') continue;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    xml = (zip.readUInt16LE(i + 10) === 8 ? inflateRawSync(data) : data).toString();
    break;
  }
  expect(xml).toContain('Бронирование переговорных');
  expect(xml).toContain('Матрица трассировки');
  expect(xml).toContain('корпоративную учётную запись');
  expect(xml).not.toContain('undefined');
});
