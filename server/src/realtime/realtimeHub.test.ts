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
