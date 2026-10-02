import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../engine/Game';
import { Input } from '../../engine/Input';
import { Effects } from '../../effects/Effects';
import { ScopedVisualEffects } from '../../realtime/ScopedVisualEffects';
import { PlayerCombat } from '../PlayerCombat';
import { SkillLoadout } from '../SkillLoadout';
import { COMBO_WINDOW, LOADOUT_ITEMS } from '../CombatData';

function fixture(online = true, sword = false) {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const scene = new THREE.Scene();
  const input = {
    block: false, transientResetSequence: 0,
    consumeAttack: vi.fn(() => false), consumeWeaponSwitch: () => false,
    consumeSkillAim: () => null, consumeUltimateAim: () => null, getSkillAimPreview: () => null,
  };
  const controller = {
    position: new THREE.Vector3(2, 0, 3), heading: 0, hp: 100, hpMax: 100,
    mp: 100, mpMax: 100, isMounted: false, inputEnabled: true, verticalSpeed: 0,
    setMovementLock: vi.fn(), applyStun: vi.fn(), applyKnockback: vi.fn(),
  };
  const loadout = new SkillLoadout();
  if (sword) loadout.equipSword('training-sword');
  const combat = new PlayerCombat(scene, input as never, controller as never,
    { playerAttack: vi.fn(), recordPresentationEventAt: vi.fn() } as never,
    new ScopedVisualEffects(new Effects(scene)), null, loadout);
  combat.setServerVitalsAuthority(online);
  const hits: number[] = [];
  combat.onSharedMonsterAttack = () => { hits.push(now); };
  const game = Object.assign(Object.create(Game.prototype), {
    fixedDt: 1 / 60, maxSubSteps: 5, accumulator: 0,
    clock: { getDelta: () => 0 }, updatables: [combat],
    fpsFrames: 0, fpsTime: 0, fps: 0, scene, camera: {}, renderer: { render: vi.fn() },
  }) as any;
  const attack = () => { input.consumeAttack.mockReturnValueOnce(true); combat.update(0); };
  let previous = 0;
  const frame = (time: number) => {
    const frameDelta = (time - previous) / 1_000;
    now = time;
    game.clock.getDelta = () => frameDelta;
    previous = now;
    game.tick();
  };
  return { combat, controller, input, hits, game, attack, frame, setNow: (value: number) => { now = value; } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('M1ออนไลน์ใช้elapsedเดิมแยกจากงบฟิสิกส์', () => {
  it.each([1_000 / 60, 125, 250, 500])('เฟรม%imsไม่ยืดwindupและไม่สร้างhitซ้ำ', (frameMs) => {
    const f = fixture();
    f.attack();
    for (let index = 1; index <= Math.ceil(2_000 / frameMs); index++) f.frame(index * frameMs);
    expect(f.hits).toHaveLength(1);
    const windupMs = LOADOUT_ITEMS['basic-brawl'].combo[0].windup * 1_000;
    expect(f.hits[0]).toBeGreaterThanOrEqual(windupMs - 0.001);
    expect(f.hits[0]).toBeLessThanOrEqual(Math.max(windupMs, frameMs) + 1_000 / 60 + 0.001);
    expect(f.controller.hp).toBe(100);
    expect(f.game.maxSubSteps).toBe(5);
  });

  it('ดาบยังใช้windup140ms/recovery380msเดิม ไม่เร่งกฎอาวุธ', () => {
    const f = fixture(true, true);
    f.attack();
    f.frame(125);
    expect(f.hits).toHaveLength(0);
    f.frame(250);
    expect(f.hits).toEqual([250]);
    f.frame(500);
    expect(f.combat.state).toBe('attack1');
    f.frame(625);
    expect(f.combat.state).toBe('idle');
    expect(f.hits).toHaveLength(1);
  });

  it('offlineยังเดินตามfixedstepเดิม', () => {
    const f = fixture(false);
    f.attack();
    f.frame(250);
    expect(f.hits).toHaveLength(0);
    f.frame(500);
    expect(f.hits).toEqual([500]);
  });

  it('กดรัวไม่ข้ามrecoveryและไม่ปล่อยhitย้อนหลังหลายครั้ง', () => {
    const f = fixture();
    f.attack();
    f.frame(250);
    f.attack();
    expect(f.hits).toEqual([250]);
    f.frame(500);
    expect(f.combat.state).toBe('idle');
    f.attack();
    f.frame(550);
    expect(f.hits).toEqual([250]);
    f.frame(600);
    expect(f.hits).toEqual([250, 600]);
  });

  it('combo windowหมดตามเวลาเดิมแม้มีเฟรมช้า', () => {
    const f = fixture();
    f.attack();
    f.frame(500);
    f.frame((LOADOUT_ITEMS['basic-brawl'].combo[0].windup
      + LOADOUT_ITEMS['basic-brawl'].combo[0].recovery + COMBO_WINDOW) * 1_000 + 1);
    f.attack();
    expect(f.combat.state).toBe('attack1');
  });

  it.each(['reset', 'disabled', 'mounted', 'authority'] as const)('%sยกเลิกswingเก่าก่อนส่งhit', (reason) => {
    const f = fixture();
    f.attack();
    if (reason === 'reset') f.input.transientResetSequence++;
    if (reason === 'disabled') f.controller.inputEnabled = false;
    if (reason === 'mounted') f.controller.isMounted = true;
    if (reason === 'authority') f.combat.setServerVitalsAuthority(false);
    f.frame(500);
    expect(f.hits).toHaveLength(0);
    expect(f.combat.state).toBe('idle');
  });

  it('snapshotซ้ำไม่ยกเลิกswingที่ยังอยู่authorityเดิม', () => {
    const f = fixture();
    f.attack();
    f.combat.setServerVitalsAuthority(true);
    f.frame(250);
    expect(f.hits).toEqual([250]);
  });
});

describe('Inputทำให้swingค้างใช้ต่อหลังblur/hidden/modechangeไม่ได้', () => {
  it('resetsequenceและattackqueueจริง ไม่ต้องสร้างtimerหรือตัวส่งเกมใหม่', () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', pointerLockElement: null });
    const dom = Object.assign(new EventTarget(), { requestPointerLock: vi.fn() });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    const input = new Input(dom as unknown as HTMLElement);
    const click = () => dom.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    click();
    win.dispatchEvent(new Event('blur'));
    expect(input.transientResetSequence).toBe(1);
    expect(input.consumeAttack()).toBe(false);
    click();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(input.transientResetSequence).toBe(2);
    expect(input.consumeAttack()).toBe(false);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(input.transientResetSequence).toBe(2);
    click();
    input.setMode('boat');
    expect(input.transientResetSequence).toBe(3);
    expect(input.consumeAttack()).toBe(false);
    input.setMode('boat');
    expect(input.transientResetSequence).toBe(3);
  });
});
