// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { prepareAudio } from '../server/audio';
import { SPEECHKIT_SYNC } from '../src/domain/transcription';
import { wavFixture, oggFixture } from './fixtures/audio';
const wav = (bytes: Buffer) => prepareAudio({ name: 'meeting.wav', type: 'audio/wav', bytes });
const ogg = (bytes: Buffer) => prepareAudio({ name: 'meeting.ogg', type: 'audio/ogg', bytes });
describe('SpeechKit input validation', () => {
  it('reads PCM metadata and strips only the WAV wrapper', () => {
    const b = wavFixture();
    const p = wav(b);
    expect(p.format).toBe('lpcm');
    expect(p.durationMs).toBe(1000);
    expect(p.sampleRate).toBe(16000);
    expect(Buffer.from(p.body)).toEqual(b.subarray(44));
  });
  it('reads Opus granule duration, preserves bytes and accepts MIME parameters', () => {
    const b = oggFixture();
    const p = prepareAudio({ name: 'meeting.ogg', type: 'audio/ogg; codecs=opus', bytes: b });
    expect(p.format).toBe('oggopus');
    expect(p.durationMs).toBe(20);
    expect(Buffer.from(p.body)).toEqual(b);
  });
  it('accepts 30 seconds but rejects long compressed and PCM recordings', () => {
    expect(wav(wavFixture(30000, 8000)).durationMs).toBe(30000);
    for (const run of [() => wav(wavFixture(30001, 8000)), () => ogg(oggFixture(30001))])
      expect(run).toThrow(expect.objectContaining({ code: 'ASYNC_REQUIRED', status: 413 }));
  });
  it('rejects size limits before a provider call', () =>
    expect(() => wav(Buffer.alloc(SPEECHKIT_SYNC.maxBytes + 1))).toThrow(
      expect.objectContaining({ code: 'ASYNC_REQUIRED' }),
    ));
  it('rejects unsupported codecs, channels, bit depth and MIME', () => {
    const bits = wavFixture();
    bits.writeUInt16LE(32, 34);
    for (const run of [
      () => wav(wavFixture(1000, 16000, 2)),
      () => wav(wavFixture(1000, 44100)),
      () => wav(bits),
      () => ogg(oggFixture(20, 2)),
      () => prepareAudio({ name: 'a.mp3', type: 'audio/mpeg', bytes: Buffer.alloc(20) }),
      () => prepareAudio({ name: 'a.wav', type: 'text/html', bytes: wavFixture() }),
    ])
      expect(run).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_AUDIO', status: 415 }));
  });
  it('rejects truncation, inconsistent sample metadata and Ogg chains', () => {
    const badRate = wavFixture();
    badRate.writeUInt32LE(5, 28);
    const changedSerial = oggFixture();
    changedSerial.writeUInt32LE(6, 47 + 14);
    for (const run of [
      () => wav(wavFixture().subarray(0, 40)),
      () => wav(badRate),
      () => ogg(oggFixture().subarray(0, -1)),
      () => ogg(Buffer.concat([oggFixture(), oggFixture()])),
      () => ogg(changedSerial),
    ])
      expect(run).toThrow(expect.objectContaining({ code: 'INVALID_AUDIO' }));
  });
});
