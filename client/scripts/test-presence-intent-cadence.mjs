// เทสต์เฉพาะเมธอดจริงจาก source โดยไม่โหลด WebGL/dependencies บน VPS
// ไม่แทน Vitest ทั้งคลาส, browser E2E หรือผล production
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/realtime/PocketMonsterParentPresence.ts', import.meta.url), 'utf8');
function method(start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, `ไม่พบ ${start}`);
  const finish = source.indexOf(end, offset);
  assert.ok(finish > offset, `ไม่พบ ${end}`);
  return source.slice(offset, finish).trim().replace(/^private /, '').replace('(force: boolean): void', '(force)').replace('(): void', '()');
}
const methods = new Function('PIRATE_LOCAL_PRESENCE_MESSAGE', 'POCKET_MONSTER_PIRATE_ZONE',
  `return { ${method('  private publishLocalPresence(', '  private applySnapshot(')},
  ${method('  update(): void {', '  dispose(): void {')} };`
)('pirate-local-presence', 'pirate-fruit');

function fixture() {
  let now = 1_000;
  let pose = { x: 7, z: 0, dir: 0 };
  const pending = [];
  const sent = [];
  let drains = 0;
  const state = {
    ...methods, started: true, now: () => now, publishIntervalMs: 50,
    lastPublishedAt: -Infinity, sampledPresence: pose,
    syncIsland() {}, sampleLocalPresence() { this.sampledPresence = pose; },
    options: { targetOrigin: 'https://pocket.example',
      host: { postToParent(message) { sent.push(message); } },
      drainMonsterIntents() { drains++; return pending.splice(0); },
    },
  };
  return { state, pending, sent, get drains() { return drains; },
    clock(value) { now = value; }, pose(value) { pose = value; } };
}
function intent(sequence = 1) {
  return { schemaVersion: 1, intentId: `monster-intent:1:${sequence}`, sequence,
    zone: 'pirate-fruit', kind: 'melee', category: 'style', forwardX: 1,
    forwardZ: 0, range: 2.6, targetActorId: 'wild-1' };
}

test('คำสั่งตีในสเตปถัดมาของเฟรมเดียวกันส่งทันทีและไม่ซ้ำ', () => {
  const f = fixture();
  f.state.update();
  const hit = intent();
  f.pending.push(hit);
  f.pose({ x: 8, z: 1, dir: 0 });
  f.state.update();
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent[1].monsterIntents, [hit]);
  assert.equal(f.sent[1].x, 8);
  assert.equal(f.drains, 2);
  f.state.update();
  assert.equal(f.sent.length, 2);
  f.clock(1050);
  f.state.update();
  assert.deepEqual(f.sent[2].monsterIntents, []);
});
test('ตำแหน่งอย่างเดียวยังคงรอบ 50ms รวมกรณีคิวว่างและไม่มี provider', () => {
  for (const provider of [true, false]) {
    const f = fixture();
    if (!provider) delete f.state.options.drainMonsterIntents;
    f.state.update();
    for (let time = 1001; time < 1050; time++) { f.clock(time); f.state.update(); }
    assert.equal(f.sent.length, 1);
    f.clock(1050); f.state.update();
    assert.equal(f.sent.length, 2);
    if (!provider) assert.equal('monsterIntents' in f.sent[1], false);
  }
});
test('ไม่ดึงคิวเมื่อหยุดหรือ pose ใช้ไม่ได้', () => {
  const f = fixture();
  f.pending.push(intent());
  f.state.started = false; f.state.update();
  assert.equal(f.drains, 0);
  f.state.started = true; f.pose(null); f.state.update();
  assert.equal(f.drains, 0);
  assert.equal(f.pending.length, 1);
  assert.equal(f.sent.length, 0);
});
test('คงเพดาน 32 intents / 128 actors และ targetOrigin เดิม', () => {
  const f = fixture();
  f.state.update();
  f.pending.push(...Array.from({ length: 40 }, (_, i) => intent(i + 1)));
  f.state.options.getMonsterActors = () => Array.from({ length: 140 }, (_, id) => ({ id }));
  f.state.options.host.postToParent = (message, origin) => { assert.equal(origin, 'https://pocket.example'); f.sent.push(message); };
  f.state.update();
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].monsterIntents.length, 32);
  assert.equal(f.sent[1].actors.length, 128);
});
test('provider error ยังคงถูกกั้นและ retry pose ใน update ถัดไปได้', () => {
  const f = fixture();
  f.state.options.drainMonsterIntents = () => { throw new Error('test'); };
  assert.doesNotThrow(() => f.state.update());
  assert.equal(f.state.lastPublishedAt, -Infinity);
  delete f.state.options.drainMonsterIntents;
  f.state.update();
  assert.equal(f.sent.length, 1);
});
