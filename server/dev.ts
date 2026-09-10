import 'dotenv/config';
import { createServer } from 'node:http';
import { handle } from './http';
createServer((req, res) => {
  const path = req.url?.split('?')[0];
  if (path === '/api/analyze' || path === '/api/transcribe') {
    void handle(req, res, path === '/api/analyze' ? 'analyze' : 'transcribe');
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(3001, '127.0.0.1', () => console.log('SpecFlow API: http://127.0.0.1:3001'));
