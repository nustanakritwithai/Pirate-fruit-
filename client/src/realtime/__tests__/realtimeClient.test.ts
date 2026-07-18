import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeClient, type RealtimeSocketLike } from '../RealtimeClient';

class FakeSocket implements RealtimeSocketLike {
  readyState = 1;
  sent: string[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(data: string): void { this.sent.push(data); }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
  }

  // ตัวช่วยจำลองฝั่ง server
  open(): void { this.onopen?.({}); }
  push(message: object): void { this.onmessage?.({ data: JSON.stringify(message) }); }
  welcome(): void {
    this.open();
    this.push({
      type: 'welcome', seq: 1, protocolVersion: 1,
      serverTime: new Date().toISOString(), heartbeatIntervalMs: 1_000,
    });
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const events = {
    economy: [] as number[],
    resyncs: 0,
    announcements: [] as string[],
    status: [] as boolean[],
  };
  const client = new RealtimeClient('ws://test/ws', {
    onEconomy: (_state, tick) => events.economy.push(tick),
    onResync: () => { events.resyncs += 1; },
    onAnnouncement: (message) => events.announcements.push(message),
    onStatusChange: (connected) => events.status.push(connected),
  }, {
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    backoffBaseMs: 100,
    backoffMaxMs: 1_000,
    random: () => 0.5,
  });
  return { client, sockets, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('S9 realtime client', () => {
  it('handshakes, applies in-order economy frames, and ignores stale ones', () => {
    const { client, sockets, events } = harness();
    client.start();
    const socket = sockets[0];
    socket.welcome();
    expect(client.connected).toBe(true);

    socket.push({ type: 'economy', seq: 2, tick: 10, state: { schemaVersion: 1, world: '{}' } });
    socket.push({ type: 'economy', seq: 2, tick: 10, state: { schemaVersion: 1, world: '{}' } }); // ซ้ำ
    socket.push({ type: 'announcement', seq: 3, message: 'ประกาศ', level: 'info' });

    expect(events.economy).toEqual([10]);
    expect(events.announcements).toEqual(['ประกาศ']);
    expect(events.resyncs).toBe(0);
    client.stop();
  });

  it('requests a resync when the sequence jumps (missed messages)', () => {
    const { client, sockets, events } = harness();
    client.start();
    sockets[0].welcome();

    sockets[0].push({ type: 'economy', seq: 5, tick: 42, state: { schemaVersion: 1, world: '{}' } });

    expect(events.resyncs).toBe(1);
    // เฟรมที่มากับ gap ยังถูกใช้ (ใหม่กว่าเดิมแน่นอน) และนับ seq ต่อจากจุดใหม่
    expect(events.economy).toEqual([42]);
    sockets[0].push({ type: 'economy', seq: 6, tick: 43, state: { schemaVersion: 1, world: '{}' } });
    expect(events.economy).toEqual([42, 43]);
    client.stop();
  });

  it('reconnects with exponential backoff after a disconnect', () => {
    const { client, sockets, events } = harness();
    client.start();
    sockets[0].welcome();
    expect(events.status).toEqual([true]);

    sockets[0].close();
    expect(events.status).toEqual([true, false]);
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(100); // base × 2^0 × jitter(1.0)
    expect(sockets).toHaveLength(2);
    sockets[1].close();
    vi.advanceTimersByTime(150); // ยังไม่ถึง base × 2^1
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(60);
    expect(sockets).toHaveLength(3);

    sockets[2].welcome();
    expect(client.connected).toBe(true);
    client.stop();
  });

  it('sends heartbeat pings and drops a silent connection via the idle watchdog', () => {
    const { client, sockets } = harness();
    client.start();
    const socket = sockets[0];
    socket.welcome();

    vi.advanceTimersByTime(1_000);
    expect(socket.sent.some((raw) => (JSON.parse(raw) as { type: string }).type === 'ping')).toBe(true);

    // server เงียบสนิท > 2.5 รอบ heartbeat → ตัดเอง แล้วเข้าคิว reconnect
    vi.advanceTimersByTime(3_000);
    expect(socket.readyState).toBe(3);
    vi.advanceTimersByTime(200);
    expect(sockets.length).toBeGreaterThan(1);
    client.stop();
  });

  it('closes on an unexpected first message (bad handshake)', () => {
    const { client, sockets } = harness();
    client.start();
    const socket = sockets[0];
    socket.open();
    socket.push({ type: 'economy', seq: 1, tick: 1, state: { schemaVersion: 1, world: '{}' } });
    expect(socket.readyState).toBe(3);
    expect(client.connected).toBe(false);
    client.stop();
  });

  it('dispatches presence and presence-leave to handlers and sends move frames', () => {
    const sockets: FakeSocket[] = [];
    const presence: string[] = [];
    const left: string[] = [];
    const client = new RealtimeClient('ws://test/ws', {
      onEconomy: () => undefined,
      onResync: () => undefined,
      onPresence: (snapshot) => presence.push(`${snapshot.playerId}@${snapshot.x},${snapshot.z}`),
      onPresenceLeave: (playerId) => left.push(playerId),
    }, {
      webSocketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.start();
    const socket = sockets[0];
    socket.welcome();

    socket.push({
      type: 'presence', seq: 2, playerId: 'char-b', name: 'Bob',
      islandId: 'starter-island', x: 5, y: 0, z: 6, heading: 0, onBoat: false,
    });
    socket.push({ type: 'presence-leave', seq: 3, playerId: 'char-b' });
    expect(presence).toEqual(['char-b@5,6']);
    expect(left).toEqual(['char-b']);

    client.sendMove({ islandId: 'starter-island', x: 1, y: 0, z: 2, heading: 0.5, onBoat: false });
    const moveFrame = socket.sent.map((raw) => JSON.parse(raw)).find((m) => m.type === 'move');
    expect(moveFrame).toMatchObject({ type: 'move', islandId: 'starter-island', x: 1, z: 2 });
    client.stop();
  });

  it('dispatches authoritative boat state and sends intent without position, HP, or damage', () => {
    const sockets: FakeSocket[] = [];
    const deltas: string[] = [];
    const client = new RealtimeClient('ws://test/ws', {
      onEconomy: () => undefined,
      onResync: () => undefined,
      onBoatDelta: (boat) => deltas.push(`${boat.entityId}:${boat.hp}`),
    }, {
      webSocketFactory: () => {
        const socket = new FakeSocket(); sockets.push(socket); return socket;
      },
    });
    client.start();
    const socket = sockets[0];
    socket.welcome();
    socket.push({
      type: 'boat-delta', seq: 2,
      boat: { entityId: 'boat-a', ownerId: 'owner-a', definitionId: 'training-dinghy',
        islandId: 'starter-island', x: 4, z: -43, heading: 0, speed: 0,
        hp: 130, maxHp: 130, anchor: true, state: 'docked', passengerIds: [] },
    });
    expect(deltas).toEqual(['boat-a:130']);
    const intentId = client.sendBoatIntent('input', { entityId: 'boat-a', throttle: 1, steer: -1 });
    client.sendBoatIntent('input', { entityId: 'boat-a', throttle: 1, steer: -1 }, intentId!);
    const intents = socket.sent.map((raw) => JSON.parse(raw)).filter((message) => message.type === 'boat-intent');
    const intent = intents[0];
    expect(intent).toMatchObject({ type: 'boat-intent', action: 'input', entityId: 'boat-a', throttle: 1, steer: -1 });
    expect(intent.intentId).toEqual(expect.any(String));
    expect(intents[1].intentId).toBe(intent.intentId);
    expect(intent).not.toHaveProperty('x');
    expect(intent).not.toHaveProperty('hp');
    expect(intent).not.toHaveProperty('damage');
    client.stop();
  });

});
