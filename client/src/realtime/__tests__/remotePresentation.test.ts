import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RemotePlayers } from '../RemotePlayers';
import type { RealtimePresenceSnapshot } from '../RealtimeClient';
import type { RealtimePlayerVisual, RealtimeProjectileState, RealtimeVisualEvent } from '@pirate-fruit/shared';

const point = { x: 5, y: 2, z: 7 };
const projectile: RealtimeProjectileState = { id: 'projectile_1', position: point, direction: { x: 0, y: 0, z: 1 }, velocity: { x: 0, y: 0, z: 10 }, color: 0x123456, scale: 1.25, elapsed: 0.5, lifeFraction: 0.5, remainingMs: 1000 };
const spark = (sequence: number, ageMs = 0): RealtimeVisualEvent => ({ sequence, kind: 'hit-spark', ageMs, position: point, color: 0xabcdef });
function visual(stateSequence = 1, events: RealtimeVisualEvent[] = [], projectiles: RealtimeProjectileState[] = [], sessionId = 'visual_session_A'): RealtimePlayerVisual {
  return { schemaVersion: 1, sessionId, stateSequence, events, projectiles };
}
function setup() {
  let time = 1000;
  const scene = new THREE.Scene();
  const remote = new RemotePlayers(scene, 'island', () => time, { tier: 'low', focus: () => new THREE.Vector3(10000, 0, 10000) });
  const pose: RealtimePresenceSnapshot = { playerId: 'remote', name: 'QA', islandId: 'island', x: 5, y: 0, z: 7, heading: 0, onBoat: false };
  return { scene, remote, send(state: RealtimePlayerVisual, changes: Partial<RealtimePresenceSnapshot> = {}) { remote.applyPresence({ ...pose, visual: state, ...changes }); },
    advance(seconds: number) { time += seconds * 1000; remote.update(seconds); },
    record() { return (remote as any).players.get('remote'); },
    roots(name?: string) { return scene.children.filter(child => child.name.startsWith('effect:') && (!name || child.name === name)); },
  };
}

describe('ภาพผู้เล่นออนไลน์จาก snapshot จริง', () => {
  it('รับ event ใหม่ใน state เดิมโดยไม่เล่น event ซ้ำ', () => {
    const q = setup(); q.send(visual(1, [spark(1)])); q.send(visual(1, [spark(1), spark(2)]));
    expect(q.roots('effect:hit-spark')).toHaveLength(2);
    q.send(visual(1, [spark(2)])); expect(q.roots('effect:hit-spark')).toHaveLength(2); q.remote.dispose();
  });
  it('session เก่าไม่ล้าง session ใหม่และไม่ทำให้ session ใหม่ถูก retire', () => {
    const q = setup(); q.send(visual(1, [spark(1)])); q.send(visual(1, [spark(1)], [], 'visual_session_B'));
    q.send(visual(100, [spark(100)])); expect(q.record().visualSessionId).toBe('visual_session_B');
    q.send(visual(2, [spark(2)], [], 'visual_session_B')); expect(q.roots('effect:hit-spark')).toHaveLength(2); q.remote.dispose();
  });
  it('ทิ้งข้อมูลเกิน TTL โดยไม่เลื่อนอายุของผู้เล่นอื่น และเล่นรอยฟันที่มาถึงช้าครบ', () => {
    const q = setup(); q.send(visual(1, [spark(1)]), { playerId: 'other' });
    q.send(visual(1, [{ sequence: 1, kind: 'slash', ageMs: 3001, position: point, color: 1, heading: 0, scale: 1 }]));
    expect(q.roots('effect:slash')).toHaveLength(0); expect(q.roots('effect:hit-spark')).toHaveLength(1);
    q.send(visual(2, [{ sequence: 2, kind: 'slash', ageMs: 400, position: point, color: 1, heading: 0, scale: 1 }]));
    expect(q.roots('effect:slash')).toHaveLength(1); q.remote.dispose();
  });
  it('late join เห็น phase และลูกพลังเคลื่อนด้วย velocity โดยไม่แก้ snapshot', () => {
    const q = setup(); const state = structuredClone(projectile); q.send(visual(1, [], [state]));
    const render = q.record().projectiles.get(state.id);
    expect(render.elapsed).toBeCloseTo(0.5); expect(render.core.rotation.x).toBeCloseTo(0.5 * 7.2);
    q.advance(0.1); expect(render.root.position.z).toBeCloseTo(8); expect(state.position.z).toBe(7);
    expect(render.elapsed).toBeCloseTo(0.6); q.remote.dispose();
  });
  it('equal/old state ไม่ต่อ TTL หรือย้อนตำแหน่งของลูกพลัง', () => {
    const q = setup(); q.send(visual(2, [], [projectile])); q.advance(0.5);
    q.send(visual(2, [], [{ ...projectile, position: { x: 999, y: 0, z: 0 } }]));
    q.send(visual(1, [spark(1)], [{ ...projectile, remainingMs: 120000 }]));
    expect(q.record().projectileSamples.get(projectile.id).state.position).toEqual(point);
    q.advance(0.6); expect(q.record().projectiles.size).toBe(0); q.remote.dispose();
  });
  it('empty/zero lifetime ล้าง current projectile โดยไม่สร้าง impact', () => {
    for (const list of [[], [{ ...projectile, remainingMs: 0 }]]) {
      const q = setup(); q.send(visual(1, [], [projectile])); q.send(visual(2, [], list));
      expect(q.record().projectiles.size).toBe(0); expect(q.roots('effect:energy-impact')).toHaveLength(0); q.remote.dispose();
    }
  });
  it('end ชนะ start และ active เก่า รวม snapshot ถัดไปที่ยังส่ง active เก่า', () => {
    const q = setup(); const end: RealtimeVisualEvent = { sequence: 2, kind: 'projectile-end', ageMs: 0, projectileId: projectile.id, position: { x: 20, y: 4, z: 30 }, color: projectile.color, scale: projectile.scale, burstScale: 0.8 };
    q.send(visual(1, [{ sequence: 1, kind: 'projectile-start', ageMs: 0, projectile }, end], [projectile]));
    expect(q.record().projectiles.size).toBe(0); expect(q.roots('effect:energy-impact')).toHaveLength(1);
    expect(q.roots('effect:energy-impact')[0].position.toArray()).toEqual([20, 4, 30]);
    q.send(visual(2, [end], [projectile])); expect(q.record().projectiles.size).toBe(0); expect(q.roots('effect:energy-impact')).toHaveLength(1); q.remote.dispose();
  });
  it('leave ล้างเฉพาะเอฟเฟกต์เจ้าของโดยไม่มี impact ปลอม', () => {
    const q = setup(); q.send(visual(1, [spark(1)], [projectile])); q.send(visual(1, [spark(1)]), { playerId: 'other' });
    q.remote.remove('remote'); expect(q.roots('effect:hit-spark')).toHaveLength(1); expect(q.roots('effect:energy-projectile')).toHaveLength(0);
    expect(q.roots('effect:energy-impact')).toHaveLength(0); q.remote.dispose(); expect(q.roots()).toHaveLength(0);
  });
  it('โล่ใช้ geometry เดียวกับ local ติด actor และเก็บ state ใหม่เมื่อ packet เก่ามา', () => {
    const q = setup(); q.send({ ...visual(2), shield: { active: true, opacity: 0.28 } });
    const shield = q.record().shield;
    expect(shield.geometry.parameters.thetaLength).toBeCloseTo(Math.PI * 0.62);
    expect(shield.parent).toBe(q.record().group); expect(shield.position.y).toBe(0.35);
    q.send({ ...visual(1), shield: { active: false, opacity: 0 } }); q.advance(0.01);
    expect(shield.visible).toBe(true); expect(shield.material.opacity).toBe(0.28);
    q.send(visual(3)); expect(shield.visible).toBe(false); q.remote.dispose();
  });
  it('legacy ที่ไม่มี presentation ไม่ล้างอุปกรณ์ แต่ activeItem:null ล้างได้', () => {
    const q = setup(); const presentation = { schemaVersion: 1 as const, avatarId: 'pirate-v1' as const, appearanceId: 'player-orange' as const, clothingIds: [], equipmentIds: ['qa-sword'], activeItem: { category: 'sword' as const, itemId: 'qa-sword' } };
    q.send(visual(1), { presentation }); q.advance(0.01);
    q.send(visual(2)); q.advance(0.01); expect(q.record().group.getObjectByName('equipment:sword').visible).toBe(true);
    q.send(visual(3), { presentation: { ...presentation, activeItem: null } }); q.advance(0.01);
    expect(q.record().group.getObjectByName('equipment:sword').visible).toBe(false); q.remote.dispose();
  });
});
