import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from './Collision';
import { WORLD_POIS } from './WorldPOI';

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

  constructor(
    private controller: CharacterController,
    private collision: CollisionSystem,
  ) {
    const { x, z, id } = WORLD_POIS.village;
    this.defaultSpawn = {
      id,
      x,
      y: collision.heightAt(x, z) + 0.02,
      z,
      heading: Math.PI,
    };
  }

  isSafeSavedPosition(value: { x: number; y: number; z: number }): boolean {
    if (![value.x, value.y, value.z].every(Number.isFinite)) return false;
    if (Math.hypot(value.x, value.z) > 95) return false;
    const ground = this.collision.heightAt(value.x, value.z);
    return ground > -0.25 && value.y >= ground - 1 && value.y < ground + 12;
  }

  teleportToDefault(): void {
    const spawn = this.defaultSpawn;
    this.controller.teleport(spawn.x, spawn.y, spawn.z);
    this.controller.heading = spawn.heading;
  }

  respawn(): void {
    this.teleportToDefault();
    this.controller.hp = Math.max(1, this.controller.hp - 5);
  }
}
