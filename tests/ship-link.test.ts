import assert from 'node:assert/strict';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {test} from 'node:test';
import {MAX_LINK_REDIRECTS, headLink, linkChain, linkProblem} from '../scripts/ship-plan';

// The check of a public link against a real HTTP server on this machine: the fetch options only mean anything on the wire.

const BYTES = 1000;

type Route = (request: IncomingMessage, response: ServerResponse) => void;

const answers = (status: number, headers: Record<string, string> = {}): Route => (_request, response) => {
  response.writeHead(status, headers);
  response.end();
};

const redirectsTo = (location: string, status = 301): Route => answers(status, {location});

const delayed = (ms: number, route: Route): Route => (request, response) => {
  setTimeout(() => route(request, response), ms);
};

/** A server with these routes (anything else answers 404 with no length), the requests it saw, and its origin. */
const withServer = async (routes: (origin: string) => Record<string, Route>, run: (origin: string, seen: IncomingMessage[]) => Promise<void>) => {
  const seen: IncomingMessage[] = [];
  let table: Record<string, Route> = {};
  const server = createServer((request, response) => {
    seen.push(request);
    (table[request.url ?? ''] ?? answers(404))(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  table = routes(origin);
  try {
    await run(origin, seen);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};

const FILE: Record<string, Route> = {'/file': answers(200, {'content-length': String(BYTES)})};

test('200 with the right size passes, asked with HEAD and identity', async () => {
  await withServer(() => FILE, async (origin, seen) => {
    assert.equal(linkProblem(`${origin}/file`, await headLink(`${origin}/file`), BYTES), null);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.method, 'HEAD');
    assert.equal(seen[0]!.headers['accept-encoding'], 'identity');
  });
});

test('200 with another size fails on one line that names the status and the length', async () => {
  await withServer(() => FILE, async (origin) => {
    const line = linkProblem(`${origin}/file`, await headLink(`${origin}/file`), 2000);
    assert.equal(line, `${origin}/file does not serve the zip: 200; final status 200, content-length 1000, expected 200 with 2000 B; state.json was not updated and the local files were kept.`);
    assert(!line.includes('\n'));
  });
});

test('a 301 to a 404 fails, and the line shows the whole chain (the 2026-11-01 outage)', async () => {
  await withServer((origin) => ({'/moved': redirectsTo(`${origin}/gone`)}), async (origin) => {
    const line = String(linkProblem(`${origin}/moved`, await headLink(`${origin}/moved`), BYTES));
    assert(line.includes(`301 -> ${origin}/gone -> 404`), line);
    assert(line.includes('final status 404'), line);
    assert(line.includes('content-length none'), line);
  });
});

test('a 404 with the right length still fails: only 200 and 206 serve the zip', async () => {
  await withServer(() => ({'/page': answers(404, {'content-length': String(BYTES)})}), async (origin) => {
    assert.match(String(linkProblem(`${origin}/page`, await headLink(`${origin}/page`), BYTES)), /final status 404, content-length 1000/);
  });
});

test('a server that never answers fails within the timeout', {timeout: 10_000}, async () => {
  await withServer(() => ({'/stuck': () => {}}), async (origin) => {
    const answer = await headLink(`${origin}/stuck`, 200);
    assert.equal(answer.status, null);
    assert.match(String(linkProblem(`${origin}/stuck`, answer, BYTES)), /does not serve the zip: no answer within 200 ms; final status none, content-length none/);
  });
});

test('the timeout covers the whole chain, not each hop', {timeout: 10_000}, async () => {
  // Each hop answers in less than the timeout; together they take more.
  await withServer((origin) => ({
    '/a': delayed(300, redirectsTo(`${origin}/b`)),
    '/b': delayed(300, redirectsTo(`${origin}/file`)),
    ...FILE,
  }), async (origin) => {
    const answer = await headLink(`${origin}/a`, 500);
    assert.equal(answer.failure, 'no answer within 500 ms');
    assert.equal(linkProblem(`${origin}/a`, answer, BYTES) === null, false);
  });
});

test('a relative Location is followed from the link that sent it, not from the first one', async () => {
  await withServer(() => ({
    '/deep/moved': redirectsTo('../sub/next'),
    '/sub/next': redirectsTo('file'),
    '/sub/file': FILE['/file']!,
  }), async (origin) => {
    const answer = await headLink(`${origin}/deep/moved`);
    assert.equal(linkProblem(`${origin}/deep/moved`, answer, BYTES), null);
    assert.equal(linkChain(answer), '301 -> ../sub/next -> 301 -> file -> 200');
  });
});

test('every redirect status is followed', async () => {
  const statuses = [301, 302, 303, 307, 308];
  await withServer(() => ({...Object.fromEntries(statuses.map((status) => [`/s${status}`, redirectsTo('/file', status)])), ...FILE}), async (origin) => {
    for (const status of statuses) {
      const answer = await headLink(`${origin}/s${status}`);
      assert.equal(linkChain(answer), `${status} -> /file -> 200`);
      assert.equal(linkProblem(`${origin}/s${status}`, answer, BYTES), null);
    }
  });
});

test('a redirect with no Location is the final answer, and fails', async () => {
  await withServer(() => ({'/nowhere': answers(301)}), async (origin) => {
    const answer = await headLink(`${origin}/nowhere`);
    assert.deepEqual(answer.redirects, []);
    assert.match(String(linkProblem(`${origin}/nowhere`, answer, BYTES)), /final status 301/);
  });
});

test('a status that is not a redirect is the final answer, even with a Location', async () => {
  await withServer(() => ({'/created': answers(201, {location: '/file', 'content-length': String(BYTES)}), ...FILE}), async (origin) => {
    const answer = await headLink(`${origin}/created`);
    assert.deepEqual(answer.redirects, []);
    assert.match(String(linkProblem(`${origin}/created`, answer, BYTES)), /final status 201/);
  });
});

test('a redirect loop stops past the cap, in bounded time', {timeout: 10_000}, async () => {
  await withServer(() => ({'/loop': redirectsTo('/loop', 302)}), async (origin) => {
    const answer = await headLink(`${origin}/loop`);
    assert.equal(answer.failure, `stopped after ${MAX_LINK_REDIRECTS} redirects`);
    assert.equal(answer.failure, 'stopped after 5 redirects');
    assert.equal(answer.redirects.length, 6);
    const line = String(linkProblem(`${origin}/loop`, answer, BYTES));
    assert.match(line, /302 -> \/loop -> stopped after 5 redirects; final status 302/);
  });
});

test('as many redirects as the cap still reach the file', async () => {
  const hops = Object.fromEntries(Array.from({length: MAX_LINK_REDIRECTS}, (_, hop) => [`/hop${hop}`, redirectsTo(hop + 1 === MAX_LINK_REDIRECTS ? '/file' : `/hop${hop + 1}`)]));
  await withServer(() => ({...hops, ...FILE}), async (origin) => {
    const answer = await headLink(`${origin}/hop0`);
    assert.equal(answer.redirects.length, MAX_LINK_REDIRECTS);
    assert.equal(linkProblem(`${origin}/hop0`, answer, BYTES), null);
  });
});

test('206 passes with the right length and fails with a partial one', async () => {
  await withServer(() => ({
    '/whole': answers(206, {'content-length': String(BYTES)}),
    '/part': answers(206, {'content-length': '10'}),
  }), async (origin) => {
    assert.equal(linkProblem(`${origin}/whole`, await headLink(`${origin}/whole`), BYTES), null);
    assert.match(String(linkProblem(`${origin}/part`, await headLink(`${origin}/part`), BYTES)), /final status 206, content-length 10,/);
  });
});

test('200 with no content-length fails', async () => {
  await withServer(() => ({'/open': answers(200)}), async (origin) => {
    assert.match(String(linkProblem(`${origin}/open`, await headLink(`${origin}/open`), BYTES)), /final status 200, content-length none/);
  });
});

/** A port that was just free, so a connection to it is refused. */
const closedPort = async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

test('a refused connection fails on one line that names the cause', async () => {
  const url = `http://127.0.0.1:${await closedPort()}/file`;
  const line = String(linkProblem(url, await headLink(url), BYTES));
  assert.match(line, /does not serve the zip: connect ECONNREFUSED 127\.0\.0\.1:\d+; final status none, content-length none/);
  assert(!line.includes('\n'));
});

test('a refusal from a name with several addresses, whose cause has an empty message, still says something', async () => {
  // localhost resolves to ::1 and 127.0.0.1 here: Node then reports an AggregateError with no message.
  const url = `http://localhost:${await closedPort()}/file`;
  const answer = await headLink(url);
  assert.equal(answer.status, null);
  assert.notEqual(answer.failure, '');
});

test('a cause that spans lines still gives one line', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed', {cause: new Error('first line\n  second line\n')});
  });
  assert.equal((await headLink('http://example.invalid/file')).failure, 'first line second line');
});

test('a bad Location is a failed link, never an exception', async () => {
  await withServer(() => ({'/bad': redirectsTo('http://')}), async (origin) => {
    const answer = await headLink(`${origin}/bad`);
    assert.equal(answer.status, null);
    assert.equal(answer.redirects.length, 1);
    assert.match(String(linkProblem(`${origin}/bad`, answer, BYTES)), /301 -> http:\/\/ -> Invalid URL; final status none/);
  });
});
