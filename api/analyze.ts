import type { IncomingMessage, ServerResponse } from 'node:http';
import { handle } from '../server/http.js';
export default function analyze(req: IncomingMessage, res: ServerResponse) {
  return handle(req, res, 'analyze');
}
