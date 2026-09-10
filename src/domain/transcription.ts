import type { Segment } from './model';

// Public capabilities only. Credentials and configurable model settings stay on the server.
export const SPEECHKIT_SYNC = {
  maxBytes: 1_000_000,
  maxDurationMs: 30_000,
  maxChannels: 1,
  asyncEnabled: false,
} as const;

export type CloudErrorCode =
  | 'NOT_CONFIGURED'
  | 'ASYNC_REQUIRED'
  | 'ASYNC_NOT_CONFIGURED'
  | 'UNSUPPORTED_AUDIO'
  | 'INVALID_AUDIO'
  | 'NO_SPEECH'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'ANALYSIS_TOO_LONG';

// Contract for a future durable worker, not an in-memory or simulated job queue.
export type TranscriptionJob =
  | { id: string; status: 'queued' | 'running'; createdAt: string }
  | { id: string; status: 'completed'; createdAt: string; segments: Segment[] }
  | {
      id: string;
      status: 'failed';
      createdAt: string;
      error: { code: CloudErrorCode; message: string };
    };

export interface AsyncTranscriptionProvider {
  submit(
    input: { objectKey: string; requestId: string },
    signal?: AbortSignal,
  ): Promise<TranscriptionJob>;
  get(jobId: string, signal?: AbortSignal): Promise<TranscriptionJob>;
}
