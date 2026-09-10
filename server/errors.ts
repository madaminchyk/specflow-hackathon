import type { CloudErrorCode } from '../src/domain/transcription';
export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: CloudErrorCode = 'PROVIDER_UNAVAILABLE',
  ) {
    super(message);
  }
}
