import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from './Collision';
import { ISLANDS, findIslandAt, getIsland, getSpawnPoint, inferIslandId } from '../island/IslandRegistry';
import type { IslandId, SpawnPointDefinition } from '../island/IslandTypes';

export interface SpawnLocation {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
}

/** ดูแลจุดเกิดที่ปลอดภัย แยกจากตำแหน่ง autosave ของผู้เล่น */
export class SpawnManager {
  readonly defaultSpawn: SpawnLocation;
  private checkpointSpawn: SpawnLocation;
  private checkpointIslandId: IslandId = 'starter-island';

  constructor(
    private controller: CharacterController,
    private collision: CollisionSystem,
  ) {
    this.defaultSpawn = this.toLocation(getIsland('starter-island').spawn);
    this.checkpointSpawn = this.defaultSpawn;
  }

  get islandId(): IslandId {
    return this.checkpointIslandId;
  }

  get checkpoint(): { spawnId: string; islandId: IslandId } {
    return { spawnId: this.checkpointSpawn.id, islandId: this.checkpointIslandId };
  }

  isSafeSavedPosition(value: { x: number; y: number; z: number }): boolean {
    if (![value.x, value.y, value.z].every(Number.isFinite)) return false;
    if (!findIslandAt(value.x, value.z, 9)) return false;
    const ground = this.collision.heightAt(value.x, value.z);
    return ground > -0.25 && value.y >= ground - 1 && value.y < ground + 12;
  }

  /** โหลด checkpoint จาก Save v3; Save v1-v2 จะอนุมานเกาะจากตำแหน่งเดิม */
  restoreCheckpoint(value: { x: number; z: number; spawnId?: string; islandId?: IslandId }): void {
    const savedSpawn = value.spawnId ? getSpawnPoint(value.spawnId) : undefined;
    if (savedSpawn && (!value.islandId || savedSpawn.islandId === value.islandId)) {
      this.activateSpawnPoint(savedSpawn.id);
      return;
    }
    const islandId = value.islandId ?? inferIslandId(value.x, value.z);
    const island = ISLANDS.find((candidate) => candidate.id === islandId)
      ?? ISLANDS.find((candidate) => candidate.spawn.id === value.spawnId);
    if (island) this.activateIsland(island.id);
  }

  /** เมื่อขึ้นฝั่งและค้นพบเกาะ จุดเกิดใหม่จะย้ายมาที่ Safe Zone ของเกาะนั้น */
  activateIsland(islandId: IslandId): void {
    const island = getIsland(islandId);
    this.activateSpawnPoint(island.spawn.id);
  }

  /** ตั้ง checkpoint โดยตรงจาก registry เหมาะกับท่าเรือ/ภารกิจ/ระบบยึดเกาะในอนาคต */
  activateSpawnPoint(spawnId: string): boolean {
    const spawn = getSpawnPoint(spawnId);
    if (!spawn) return false;
    this.checkpointIslandId = spawn.islandId;
    this.checkpointSpawn = this.toLocation(spawn);
    return true;
  }

  private toLocation(spawn: SpawnPointDefinition): SpawnLocation {
    return {
      id: spawn.id,
      x: spawn.x,
      y: this.collision.heightAt(spawn.x, spawn.z) + 0.02,
      z: spawn.z,
      heading: spawn.heading,
    };
  }

  teleportToDefault(): void {
    const spawn = this.defaultSpawn;
    this.controller.teleport(spawn.x, spawn.y, spawn.z);
    this.controller.heading = spawn.heading;
  }

  teleportToCheckpoint(): void {
    const spawn = this.checkpointSpawn;
    this.controller.teleport(spawn.x, spawn.y, spawn.z);
    this.controller.heading = spawn.heading;
  }

  respawn(): void {
    this.teleportToCheckpoint();
    this.controller.hp = this.controller.hpMax;
    this.controller.energy = this.controller.energyMax;
    this.controller.mp = this.controller.mpMax;
  }
}
