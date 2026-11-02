// A tiny static file server, so the demo needs nothing but Node.
// Used by `npm start` and by the browser test.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

export function serve(port = 0) {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const file = resolve(join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
    const servable = file.startsWith(ROOT + sep) && statSync(file, { throwIfNoEntry: false })?.isFile();
    if (!servable) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(port, 'localhost', () => done(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await serve(Number(process.env.PORT ?? 8123));
  console.log(`Pandan Lane is on http://localhost:${server.address().port}`);
}
