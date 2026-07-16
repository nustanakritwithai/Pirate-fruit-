import assert from 'node:assert/strict';
import { buildServer } from '../dist/app.js';
import { loadEnvironment } from '../dist/config/environment.js';

const environment = loadEnvironment({
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  CLIENT_ORIGIN: 'http://localhost:5173',
  SERVER_VERSION: 'smoke-test',
});

const database = {
  enabled: false,
  async ping() {
    return 0;
  },
  async close() {},
};

const app = await buildServer({ environment, database, logger: false });

try {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert(address && typeof address === 'object');

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const [health, ready, version] = await Promise.all([
    fetch(`${baseUrl}/health`),
    fetch(`${baseUrl}/ready`),
    fetch(`${baseUrl}/version`),
  ]);

  assert.equal(health.status, 200);
  assert.equal(ready.status, 200);
  assert.equal(version.status, 200);
  assert.equal((await health.json()).service, 'pirate-fruit-server');
  assert.equal((await ready.json()).database, 'disabled');
  assert.equal((await version.json()).version, 'smoke-test');
} finally {
  await app.close();
}
