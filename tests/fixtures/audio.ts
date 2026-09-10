// Synthetic byte fixtures for metadata validation and mock transport, not speech samples.
export function wavFixture(durationMs = 1000, rate = 16000, channels = 1) {
  const size = Math.round((durationMs / 1000) * rate) * channels * 2;
  const b = Buffer.alloc(44 + size);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(size, 40);
  return b;
}
function page(payload: Buffer, seq: number, flags: number, granule: bigint) {
  const b = Buffer.alloc(28 + payload.length);
  b.write('OggS');
  b[5] = flags;
  b.writeBigUInt64LE(granule, 6);
  b.writeUInt32LE(5, 14);
  b.writeUInt32LE(seq, 18);
  b[26] = 1;
  b[27] = payload.length;
  payload.copy(b, 28);
  return b;
}
export function oggFixture(durationMs = 20, channels = 1) {
  const head = Buffer.alloc(19);
  head.write('OpusHead');
  head[8] = 1;
  head[9] = channels;
  head.writeUInt32LE(48000, 12);
  const tags = Buffer.alloc(16);
  tags.write('OpusTags');
  return Buffer.concat([
    page(head, 0, 2, 0n),
    page(tags, 1, 0, 0n),
    page(Buffer.from([0xf8, 0xff, 0xfe]), 2, 4, BigInt(durationMs * 48)),
  ]);
}
