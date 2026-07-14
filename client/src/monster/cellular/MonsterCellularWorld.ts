import type { Monster } from '../Monster';
import type { DevilFruitInfluenceWorld } from '../../devilfruit/influence/DevilFruitInfluenceWorld';
import { resolveInfluenceWeight } from './CellularInfluence';
import { COMBAT_EXPERIENCE_CONFIG } from './CombatExperienceConfig';
import { applyCombatExperience } from './CombatExperienceAdapter';
import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import {
  emptyMetrics,
  metricsFromRegistry,
  runCellularTick,
  syncDeadCells,
} from './CellularTick';
import { behaviorIntentFromThought } from './MonsterBehaviorAdapter';
import { createCellId, MonsterRegistry } from './MonsterRegistry';
import type {
  CellularTickMetrics,
  MonsterBehaviorIntent,
  MonsterCell,
  MonsterThoughtState,
  NeighborSnapshot,
} from './MonsterCellularTypes';
import { SpatialGrid } from './SpatialGrid';

export interface MonsterCellularBinding {
  monster: Monster;
  cellId: string;
}

function emptySnapshot(): NeighborSnapshot {
  return {
    idleCount: 0,
    alertCount: 0,
    huntCount: 0,
    attackCount: 0,
    fleeCount: 0,
    regroupCount: 0,
    restCount: 0,
    deadCount: 0,
    idleInfluence: 0,
    alertInfluence: 0,
    huntInfluence: 0,
    attackInfluence: 0,
    fleeInfluence: 0,
    regroupInfluence: 0,
    restInfluence: 0,
    deadInfluence: 0,
    playerNearby: false,
    nearestPlayerDistance: Infinity,
    playerInAttackRange: false,
    monsterDensity: 0,
    monsterDensityInfluence: 0,
    neighborCount: 0,
    bossInfluence: 0,
    fireInfluence: 0,
    iceInfluence: 0,
    lightningInfluence: 0,
    smokeDensity: 0,
    poisonInfluence: 0,
    earthquakeInfluence: 0,
    areaMovementFactor: 1,
    areaCohesionFactor: 1,
    areaVisionFactor: 1,
  };
}

export class MonsterCellularWorld {
  readonly registry = new MonsterRegistry();
  private readonly grid = new SpatialGrid(MONSTER_CELLULAR_CONFIG.spatialCellSize);
  private readonly bindings = new Map<string, MonsterCellularBinding>();
  private influenceWorld: DevilFruitInfluenceWorld | null = null;
  private tick = 0;
  private latestMetrics: CellularTickMetrics = emptyMetrics();
  private lastSnapshots = new Map<string, NeighborSnapshot>();
  private lastPlayerX = 0;
  private lastPlayerZ = 0;
  debugMarkersEnabled = false;
  /** CE1 — show thought colors when player is in combat range */
  combatSignalsEnabled = true;

  bindInfluenceWorld(world: DevilFruitInfluenceWorld): void {
    this.influenceWorld = world;
  }

  bindMonster(monster: Monster): string {
    const existing = [...this.bindings.values()].find((b) => b.monster === monster);
    if (existing) return existing.cellId;

    const id = createCellId();
    const pos = monster.group.position;
    const cell: MonsterCell = {
      id,
      speciesId: monster.type.id,
      position: { x: pos.x, z: pos.z },
      currentState: monster.alive ? 'idle' : 'dead',
      nextState: monster.alive ? 'idle' : 'dead',
      hp: monster.hp,
      maxHp: monster.type.maxHp,
      energy: 0.85,
      hunger: 0.2,
      lastStateChangeTick: 0,
      homeX: monster.home.x,
      homeZ: monster.home.y,
      attackRange: monster.type.attackRange,
      perceptionRadius: Math.max(
        monster.type.aggroRange,
        MONSTER_CELLULAR_CONFIG.defaultPerceptionRadius,
      ),
      moveSpeed: monster.type.moveSpeed,
      influenceWeight: resolveInfluenceWeight(monster.type.id, monster.type.kind),
    };
    this.registry.register(cell);
    this.bindings.set(id, { monster, cellId: id });
    monster.cellularId = id;
    return id;
  }

  unbindMonster(monster: Monster): void {
    const id = monster.cellularId;
    if (!id) return;
    this.registry.remove(id);
    this.bindings.delete(id);
    this.lastSnapshots.delete(id);
    monster.cellularId = undefined;
  }

  syncFromMonsters(): void {
    for (const { monster, cellId } of this.bindings.values()) {
      const cell = this.registry.get(cellId);
      if (!cell) continue;
      cell.position.x = monster.group.position.x;
      cell.position.z = monster.group.position.z;
      cell.hp = monster.hp;
      cell.maxHp = monster.type.maxHp;
      cell.attackRange = monster.type.attackRange;
      cell.moveSpeed = monster.type.moveSpeed;
      if (!monster.alive) {
        cell.currentState = 'dead';
        cell.nextState = 'dead';
      }
    }
    syncDeadCells(this.registry.getAll());
  }

  cellularUpdate(playerX: number, playerZ: number): CellularTickMetrics {
    this.syncFromMonsters();
    this.tick += 1;
    this.lastPlayerX = playerX;
    this.lastPlayerZ = playerZ;
    const result = runCellularTick(
      this.registry,
      this.grid,
      {
        playerX,
        playerZ,
        sampleArea: this.influenceWorld
          ? (x, z) => this.influenceWorld!.sampleAt(x, z)
          : undefined,
      },
      this.tick,
    );
    this.lastSnapshots = result.snapshots;
    this.latestMetrics = metricsFromRegistry(
      this.registry,
      this.tick,
      result.transitions,
      result.averageNeighborCount,
      result.durationMs,
      result.combat,
    );
    return this.latestMetrics;
  }

  getThoughtState(monster: Monster): MonsterThoughtState {
    const id = monster.cellularId;
    if (!id) return monster.alive ? 'idle' : 'dead';
    return this.registry.get(id)?.currentState ?? (monster.alive ? 'idle' : 'dead');
  }

  getIntent(monster: Monster): MonsterBehaviorIntent {
    return this.getCombatIntent(monster, this.lastPlayerX, this.lastPlayerZ);
  }

  /** CE1 — cellular thought + formation/pressure/role layer */
  getCombatIntent(monster: Monster, playerX: number, playerZ: number): MonsterBehaviorIntent {
    const id = monster.cellularId;
    if (!id || !monster.alive) {
      return {
        locomotion: 'idle',
        shouldAttack: false,
        shouldFacePlayer: false,
        speedMultiplier: 0,
        returningHome: false,
        legacyState: 'dead',
      };
    }
    const cell = this.registry.get(id);
    if (!cell) {
      return behaviorIntentFromThought({
        id,
        speciesId: monster.type.id,
        position: { x: 0, z: 0 },
        currentState: 'idle',
        nextState: 'idle',
        hp: monster.hp,
        maxHp: monster.type.maxHp,
        energy: 1,
        hunger: 0,
        lastStateChangeTick: 0,
        homeX: monster.home.x,
        homeZ: monster.home.y,
        attackRange: monster.type.attackRange,
        perceptionRadius: MONSTER_CELLULAR_CONFIG.defaultPerceptionRadius,
        moveSpeed: monster.type.moveSpeed,
        influenceWeight: resolveInfluenceWeight(monster.type.id, monster.type.kind),
      });
    }
    const base = behaviorIntentFromThought(cell);
    const snapshot = this.lastSnapshots.get(id) ?? emptySnapshot();
    const intent = applyCombatExperience(
      cell,
      snapshot,
      base,
      playerX,
      playerZ,
      this.registry.getAll(),
      this.tick,
    );
    intent.speedMultiplier *= snapshot.areaMovementFactor;
    if (snapshot.areaCohesionFactor < 1 && intent.moveTargetX !== undefined && intent.moveTargetZ !== undefined) {
      const jitter = (1 - snapshot.areaCohesionFactor) * 2.5;
      intent.moveTargetX += (hashJitter(cell.id) - 0.5) * jitter;
      intent.moveTargetZ += (hashJitter(`${cell.id}:z`) - 0.5) * jitter;
    }
    return intent;
  }

  shouldShowCombatSignal(monster: Monster, playerX: number, playerZ: number): boolean {
    if (this.debugMarkersEnabled) return true;
    if (!this.combatSignalsEnabled) return false;
    const state = this.getThoughtState(monster);
    if (state === 'idle' || state === 'rest' || state === 'dead') return false;
    const dx = playerX - monster.group.position.x;
    const dz = playerZ - monster.group.position.z;
    return Math.hypot(dx, dz) <= COMBAT_EXPERIENCE_CONFIG.combatSignalsRange;
  }

  getPackCenter(cellId: string): { x: number; z: number } | null {
    const cell = this.registry.get(cellId);
    if (!cell) return null;
    this.grid.clear();
    for (const c of this.registry.getAll()) {
      if (c.currentState === 'dead') continue;
      this.grid.insert(c);
    }
    const ids = this.grid.queryNearby(cell.position.x, cell.position.z, cell.perceptionRadius);
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const id of ids) {
      const other = this.registry.get(id);
      if (!other || other.currentState === 'dead') continue;
      if (other.currentState === 'regroup' || other.currentState === 'alert') {
        sx += other.position.x;
        sz += other.position.z;
        n += 1;
      }
    }
    if (n === 0) return null;
    return { x: sx / n, z: sz / n };
  }

  get metrics(): CellularTickMetrics {
    return this.latestMetrics;
  }

  get snapshots(): ReadonlyMap<string, NeighborSnapshot> {
    return this.lastSnapshots;
  }

  getCell(id: string): MonsterCell | undefined {
    return this.registry.get(id);
  }

  getAllCells(): MonsterCell[] {
    return this.registry.getAll();
  }

  resetCellOnRespawn(monster: Monster): void {
    const cell = monster.cellularId ? this.registry.get(monster.cellularId) : undefined;
    if (!cell) return;
    cell.hp = monster.type.maxHp;
    cell.currentState = 'idle';
    cell.nextState = 'idle';
    cell.energy = 0.85;
    cell.hunger = 0.2;
    cell.lastStateChangeTick = this.tick;
  }
}

function hashJitter(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

export { regroupTarget, fleeDirection } from './MonsterBehaviorAdapter';
