import type { Monster } from '../Monster';
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
} from './MonsterCellularTypes';
import { SpatialGrid } from './SpatialGrid';

export interface MonsterCellularBinding {
  monster: Monster;
  cellId: string;
}

export class MonsterCellularWorld {
  readonly registry = new MonsterRegistry();
  private readonly grid = new SpatialGrid(MONSTER_CELLULAR_CONFIG.spatialCellSize);
  private readonly bindings = new Map<string, MonsterCellularBinding>();
  private tick = 0;
  private latestMetrics: CellularTickMetrics = emptyMetrics();
  debugMarkersEnabled = false;

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
    const result = runCellularTick(
      this.registry,
      this.grid,
      { playerX, playerZ },
      this.tick,
    );
    this.latestMetrics = metricsFromRegistry(
      this.registry,
      this.tick,
      result.transitions,
      result.averageNeighborCount,
      result.durationMs,
    );
    return this.latestMetrics;
  }

  getThoughtState(monster: Monster): MonsterThoughtState {
    const id = monster.cellularId;
    if (!id) return monster.alive ? 'idle' : 'dead';
    return this.registry.get(id)?.currentState ?? (monster.alive ? 'idle' : 'dead');
  }

  getIntent(monster: Monster): MonsterBehaviorIntent {
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
      });
    }
    return behaviorIntentFromThought(cell);
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

// re-export for adapter
export { regroupTarget, fleeDirection } from './MonsterBehaviorAdapter';
