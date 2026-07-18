import { describe, expect, it } from 'vitest';
import {
  REALTIME_IDLE_TIMEOUT_MS,
  REALTIME_MAX_CLIENT_MESSAGE_BYTES,
  type RealtimeServerMessage,
} from '@pirate-fruit/shared';
import { RealtimeHub, type RealtimeSocket } from './realtimeHub.js';

class FakeSocket implements RealtimeSocket {
  readyState = 1;
  readonly sent: RealtimeServerMessage[] = [];
  closedWith: { code?: number; reason?: string } | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as RealtimeServerMessage);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closedWith = { code, reason };
  }
}

describe('S9 realtime hub', () => {
  it('welcomes with seq 1 and keeps sequence gapless across broadcasts', () => {
    const hub = new RealtimeHub();
    const socket = new FakeSocket();
    hub.register(socket, 'user-a', 'char-a');

    hub.broadcastEconomy(10, '{"world":1}');
    hub.broadcastAnnouncement('พายุเข้าเกาะเริ่มต้น', 'warning');

    expect(socket.sent.map((message) => [message.type, message.seq])).toEqual([
      ['welcome', 1],
      ['economy', 2],
      ['announcement', 3],
    ]);
  });

  it('answers ping with pong echoing the timestamp', () => {
    const hub = new RealtimeHub();
    const socket = new FakeSocket();
    const connection = hub.register(socket, 'user-a', 'char-a')!;

    hub.handleClientMessage(connection, JSON.stringify({ type: 'ping', sentAt: 123 }));

    const pong = socket.sent.at(-1)!;
    expect(pong).toMatchObject({ type: 'pong', echo: 123, seq: 2 });
  });

  it('closes on protocol violations: oversized, invalid JSON, unknown type', () => {
    const hub = new RealtimeHub();
    for (const raw of [
      'x'.repeat(REALTIME_MAX_CLIENT_MESSAGE_BYTES + 1),
      'not-json{{',
      JSON.stringify({ type: 'cast-skill' }),
    ]) {
      const socket = new FakeSocket();
      const connection = hub.register(socket, 'user-a', 'char-a')!;
      hub.handleClientMessage(connection, raw);
      expect(socket.closedWith?.code).toBe(1008);
    }
    expect(hub.connectionCount).toBe(0);
  });

  it('reaps idle connections after the idle timeout', () => {
    let nowMs = 1_000_000;
    const hub = new RealtimeHub(undefined, () => nowMs);
    const idle = new FakeSocket();
    const active = new FakeSocket();
    hub.register(idle, 'user-a', 'char-a');
    const activeConnection = hub.register(active, 'user-b', 'char-b')!;

    nowMs += REALTIME_IDLE_TIMEOUT_MS - 1_000;
    hub.handleClientMessage(activeConnection, JSON.stringify({ type: 'ping', sentAt: nowMs }));
    nowMs += 2_000;
    hub.reapIdle();

    expect(idle.closedWith?.code).toBe(1001);
    expect(active.closedWith).toBeNull();
    expect(hub.connectionCount).toBe(1);
  });

  it('rejects connections beyond capacity and skips broken sockets on broadcast', () => {
    const hub = new RealtimeHub(undefined, () => Date.now(), 1);
    const first = new FakeSocket();
    const second = new FakeSocket();
    hub.register(first, 'user-a', 'char-a');
    expect(hub.register(second, 'user-b', 'char-b')).toBeNull();
    expect(second.closedWith?.code).toBe(1013);

    first.readyState = 3; // ปิดไปเงียบ ๆ
    hub.broadcastEconomy(1, '{}');
    expect(hub.connectionCount).toBe(0);
  });
});

describe('S13 presence relay', () => {
  function moved(island: string, x: number, z: number, onBoat = false) {
    return JSON.stringify({ type: 'move', islandId: island, x, y: 0, z, heading: 0, onBoat });
  }

  it('ignores move frames when presence is disabled (default)', () => {
    const hub = new RealtimeHub();
    const socket = new FakeSocket();
    const connection = hub.register(socket, 'user-a', 'char-a', 'Alice')!;
    hub.handleClientMessage(connection, moved('starter-island', 1, 2));
    // ไม่ถูกตัด และไม่มี presence ส่งออก
    expect(socket.closedWith).toBeNull();
    expect(socket.sent.some((message) => message.type === 'presence')).toBe(false);
  });

  it('relays presence between two players on the same island', () => {
    let clock = 1_000;
    const hub = new RealtimeHub(undefined, () => clock, 200, true);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const ca = hub.register(a, 'user-a', 'char-a', 'Alice')!;
    const cb = hub.register(b, 'user-b', 'char-b', 'Bob')!;

    hub.handleClientMessage(ca, moved('starter-island', 5, 6));
    // ยังไม่มีใครอื่นเคลื่อนไหว → B ยังไม่รู้จัก A จนกว่า A จะ broadcast (B ไม่มี presence)
    clock += 100;
    hub.handleClientMessage(cb, moved('starter-island', 1, 1));
    // B เพิ่งปรากฏ → เห็น A (seed) และ A เห็น B (broadcast)
    const bPresence = b.sent.find((message) => message.type === 'presence');
    expect(bPresence).toMatchObject({ type: 'presence', playerId: 'char-a', name: 'Alice', x: 5, z: 6 });
    const aPresence = a.sent.find((message) => message.type === 'presence');
    expect(aPresence).toMatchObject({ type: 'presence', playerId: 'char-b', name: 'Bob', x: 1, z: 1 });
  });

  it('does not relay across different islands', () => {
    let clock = 1_000;
    const hub = new RealtimeHub(undefined, () => clock, 200, true);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const ca = hub.register(a, 'user-a', 'char-a', 'Alice')!;
    const cb = hub.register(b, 'user-b', 'char-b', 'Bob')!;
    hub.handleClientMessage(ca, moved('starter-island', 5, 6));
    clock += 100;
    hub.handleClientMessage(cb, moved('mist-jungle', 1, 1));
    expect(a.sent.some((message) => message.type === 'presence')).toBe(false);
    expect(b.sent.some((message) => message.type === 'presence')).toBe(false);
  });

  it('throttles rapid moves but always keeps the latest position', () => {
    let clock = 1_000;
    const hub = new RealtimeHub(undefined, () => clock, 200, true);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const ca = hub.register(a, 'user-a', 'char-a', 'Alice')!;
    const cb = hub.register(b, 'user-b', 'char-b', 'Bob')!;
    hub.handleClientMessage(cb, moved('starter-island', 0, 0));
    hub.handleClientMessage(ca, moved('starter-island', 1, 1)); // first move → relay
    const before = b.sent.filter((message) => message.type === 'presence').length;
    clock += 10; // < 80ms
    hub.handleClientMessage(ca, moved('starter-island', 2, 2)); // throttled
    const after = b.sent.filter((message) => message.type === 'presence').length;
    expect(after).toBe(before);
    clock += 100; // > 80ms
    hub.handleClientMessage(ca, moved('starter-island', 3, 3)); // relayed
    const relayed = b.sent.filter((message) => message.type === 'presence');
    expect(relayed.at(-1)).toMatchObject({ playerId: 'char-a', x: 3, z: 3 });
  });

  it('broadcasts presence-leave to islanders when a player disconnects', () => {
    let clock = 1_000;
    const hub = new RealtimeHub(undefined, () => clock, 200, true);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const ca = hub.register(a, 'user-a', 'char-a', 'Alice')!;
    const cb = hub.register(b, 'user-b', 'char-b', 'Bob')!;
    hub.handleClientMessage(ca, moved('starter-island', 5, 6));
    clock += 100;
    hub.handleClientMessage(cb, moved('starter-island', 1, 1));

    hub.unregister(ca);
    const leave = b.sent.find((message) => message.type === 'presence-leave');
    expect(leave).toMatchObject({ type: 'presence-leave', playerId: 'char-a' });
  });

  it('drops the connection on an invalid move payload', () => {
    const hub = new RealtimeHub(undefined, () => 1_000, 200, true);
    const socket = new FakeSocket();
    const connection = hub.register(socket, 'user-a', 'char-a', 'Alice')!;
    hub.handleClientMessage(connection, JSON.stringify({ type: 'move', islandId: 'x', x: 'nope' }));
    expect(socket.closedWith?.code).toBe(1008);
  });

  it('relays the boat id when a player is sailing (S14)', () => {
    let clock = 1_000;
    const hub = new RealtimeHub(undefined, () => clock, 200, true);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const ca = hub.register(a, 'user-a', 'char-a', 'Alice')!;
    const cb = hub.register(b, 'user-b', 'char-b', 'Bob')!;
    hub.handleClientMessage(cb, JSON.stringify({ type: 'move', islandId: 'starter-island', x: 0, y: 0, z: 0, heading: 0, onBoat: false }));
    clock += 100;
    hub.handleClientMessage(ca, JSON.stringify({ type: 'move', islandId: 'starter-island', x: 3, y: 0, z: 4, heading: 1, onBoat: true, boatId: 'war-galleon' }));
    const presence = b.sent.find((message) => message.type === 'presence') as { boatId?: string; onBoat?: boolean };
    expect(presence).toMatchObject({ onBoat: true, boatId: 'war-galleon' });
  });

  it('drops the boat id when the player is on foot', () => {
    let clock = 1_000;
    const hub = new RealtimeHub(undefined, () => clock, 200, true);
    const a = new FakeSocket();
    const b = new FakeSocket();
    const ca = hub.register(a, 'user-a', 'char-a', 'Alice')!;
    const cb = hub.register(b, 'user-b', 'char-b', 'Bob')!;
    hub.handleClientMessage(cb, JSON.stringify({ type: 'move', islandId: 'starter-island', x: 0, y: 0, z: 0, heading: 0, onBoat: false }));
    clock += 100;
    // onBoat:false แต่แนบ boatId มา → ต้องถูกทิ้ง
    hub.handleClientMessage(ca, JSON.stringify({ type: 'move', islandId: 'starter-island', x: 3, y: 0, z: 4, heading: 1, onBoat: false, boatId: 'war-galleon' }));
    const presence = b.sent.find((message) => message.type === 'presence') as { boatId?: string };
    expect(presence.boatId).toBeUndefined();
  });

});
