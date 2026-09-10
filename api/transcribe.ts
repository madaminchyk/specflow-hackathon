import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from '../server/http';
export default function transcribe(req: IncomingMessage, res: ServerResponse) {
  return handle(req, res, 'transcribe');
}
