import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from '../server/http.js';
export default function transcribe(req: IncomingMessage, res: ServerResponse) {
  return handle(req, res, 'transcribe');
}
