import type { IslandId } from './IslandTypes';
import { CollisionSystem, type CircleCollider, type DynamicGroundProvider, type PlatformCollider } from '../world/Collision';
import { ISLAND_LAYOUT_OFFSETS } from './IslandRegistry';

/**
 * Collision adapter สำหรับรายละเอียดฉากที่ยังเก็บพิกัดเดิมไว้ใน source
 * รายละเอียดจะถูกเลื่อนด้วย root ของเกาะ ขณะที่ collider/height ถูกส่งเข้าโลกจริง
 * ในพิกัดใหม่ให้ตรงกับ terrain, NPC และผู้เล่น
 */
export class IslandBuildCollision extends CollisionSystem {
  private readonly offset: { x: number; z: number };

  constructor(private readonly base: CollisionSystem, islandId: IslandId) {
    super((x, z) => base.heightAt(x, z));
    this.offset = ISLAND_LAYOUT_OFFSETS[islandId];
  }

  override heightAt(x: number, z: number): number {
    return this.base.heightAt(x + this.offset.x, z + this.offset.z);
  }

  override addCollider(collider: CircleCollider): void {
    this.base.addCollider({
      ...collider,
      x: collider.x + this.offset.x,
      z: collider.z + this.offset.z,
    });
  }

  override addPlatform(platform: PlatformCollider): void {
    this.base.addPlatform({
      ...platform,
      minX: platform.minX + this.offset.x,
      maxX: platform.maxX + this.offset.x,
      minZ: platform.minZ + this.offset.z,
      maxZ: platform.maxZ + this.offset.z,
    });
  }

  override addDynamicGround(provider: DynamicGroundProvider): void {
    this.base.addDynamicGround((x, z) => provider(x - this.offset.x, z - this.offset.z));
  }

  override removeDynamicGround(provider: DynamicGroundProvider): void {
    // Island builders do not register dynamic decks, but preserve the API contract.
    this.base.removeDynamicGround(provider);
  }
}

export function createIslandBuildCollision(base: CollisionSystem, islandId: IslandId): IslandBuildCollision {
  return new IslandBuildCollision(base, islandId);
}
