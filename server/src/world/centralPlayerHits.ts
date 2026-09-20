import { randomUUID } from 'node:crypto';
import { isWorldSafeZone, SHARED_MONSTER_TYPES, type RealtimeServerMessage, type WorldMonsterAttack, type WorldMonsterSnapshot } from '@pirate-fruit/shared';

export interface HitPlayerView {
  characterId: string; islandId?: string; x: number; z: number;
  playerVitalsReady?: boolean; blocking?: boolean;
}
export interface PendingPlayerHit {
  key: string; characterId: string; attack: WorldMonsterAttack; dueAt: number;
  resolved?: { damage: number; blocking: boolean; sourceX: number; sourceZ: number; at: number };
}

/** คิว hit-frame ของ engine เดิมเท่านั้น ไม่รับคำขอดาเมจจากผู้เล่น */
export class CentralPlayerHits {
  private readonly epoch = randomUUID();
  private readonly pending = new Map<string, PendingPlayerHit>();

  restore(entries: PendingPlayerHit[] = []): void {
    if (!Array.isArray(entries) || entries.length > 256) throw new Error('invalid-player-hit-state');
    for (const hit of entries) {
      if (!hit || typeof hit.key !== 'string' || hit.key.length > 128 || !hit.key.startsWith('pve:')
        || typeof hit.characterId !== 'string' || hit.characterId !== hit.attack?.targetId
        || !Number.isFinite(hit.dueAt) || !Number.isFinite(hit.attack.damage) || hit.attack.damage < 0
        || (hit.resolved && (!Number.isFinite(hit.resolved.at) || !Number.isFinite(hit.resolved.damage)
          || hit.resolved.damage < 0 || typeof hit.resolved.blocking !== 'boolean'
          || !Number.isFinite(hit.resolved.sourceX) || !Number.isFinite(hit.resolved.sourceZ)))) {
        throw new Error('invalid-player-hit-state');
      }
      this.pending.set(hit.key, structuredClone(hit));
    }
  }

  capture(messages: readonly RealtimeServerMessage[], players: readonly HitPlayerView[], now: number): void {
    const enabled = new Set(players.filter(player => player.playerVitalsReady === true).map(player => player.characterId));
    const cancelled = new Set<string>();
    for (const message of messages) {
      if (message.type === 'world-monster-delta') {
        for (const update of message.updates) if (update.cancelAttackId) cancelled.add(update.cancelAttackId);
      }
    }
    for (const [key, hit] of this.pending) {
      if (!hit.resolved && cancelled.has(hit.attack.attackId)) this.pending.delete(key);
    }
    for (const message of messages) {
      if (message.type !== 'world-monster-attack' || !enabled.has(message.attack.targetId)
        || cancelled.has(message.attack.attackId)) continue;
      const key = `pve:${this.epoch}:${message.attack.attackId}`;
      if (this.pending.has(key)) continue;
      if (this.pending.size >= 256) throw new Error('player-hit-backlog-full');
      this.pending.set(key, { key, characterId: message.attack.targetId, attack: structuredClone(message.attack),
        dueAt: now + Math.max(0, message.attack.hitDelayMs) });
    }
  }

  resolve(players: readonly HitPlayerView[], monsters: readonly WorldMonsterSnapshot[], now: number): void {
    for (const [key, hit] of this.pending) {
      if (hit.resolved || now < hit.dueAt) continue;
      const player = players.find(value => value.characterId === hit.characterId);
      const monster = monsters.find(value => value.spawnId === hit.attack.spawnId);
      const type = SHARED_MONSTER_TYPES[hit.attack.monsterId];
      if (!player || !player.playerVitalsReady || player.islandId !== hit.attack.islandId
        || !monster || monster.state === 'dead' || monster.hp <= 0 || !type
        || isWorldSafeZone(hit.attack.islandId, player.x, player.z)
        || Math.hypot(monster.x - player.x, monster.z - player.z) > type.attackRange + 0.6) {
        this.pending.delete(key);
        continue;
      }
      // ตรึงผลระยะและปุ่มบล็อกที่ hit-frame; CAS retry ไม่คำนวณจากตำแหน่งใหม่
      hit.resolved = { damage: hit.attack.damage, blocking: player.blocking === true,
        sourceX: monster.x, sourceZ: monster.z, at: now };
    }
  }

  export(): PendingPlayerHit[] { return structuredClone([...this.pending.values()]); }
  ready(): { key: string; characterId: string }[] {
    return [...this.pending.values()].filter(hit => hit.resolved).map(({ key, characterId }) => ({ key, characterId }));
  }
  get(key: string, characterId: string): PendingPlayerHit | undefined {
    const hit = this.pending.get(key);
    return hit?.resolved && hit.characterId === characterId ? structuredClone(hit) : undefined;
  }
  acknowledge(key: string, characterId: string): boolean {
    return !!this.get(key, characterId) && this.pending.delete(key);
  }
}
