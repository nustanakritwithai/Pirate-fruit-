import type { CharacterController } from '../player/CharacterController';
import type { SpawnManager } from '../world/SpawnManager';
import { ISLANDS, findIslandAt, worldHeightAt } from './IslandRegistry';
import type { IslandId } from './IslandTypes';

const DETAIL_VISIBLE_DISTANCE = 155;

/** ตรวจการขึ้นฝั่ง, เปลี่ยน checkpoint และเปิด/ปิดรายละเอียดเกาะไกลเพื่อลด draw call มือถือ */
export class IslandManager {
  private activeIslandId: IslandId;
  private bannerTimer = 0;
  private readonly banner: HTMLDivElement;

  constructor(
    private controller: CharacterController,
    private spawns: SpawnManager,
    private detailRoots: ReadonlyMap<IslandId, { visible: boolean }>,
  ) {
    this.activeIslandId = spawns.islandId;
    this.banner = document.createElement('div');
    this.banner.className = 'island-arrival-banner';
    this.banner.style.cssText =
      'position:fixed;left:50%;top:12%;z-index:19;transform:translate(-50%,-14px);opacity:0;' +
      'pointer-events:none;text-align:center;color:#fff5ce;padding:9px 18px;border-radius:13px;' +
      'background:rgba(4,24,29,.78);border:1px solid rgba(139,232,190,.52);' +
      'font:700 15px/1.35 sans-serif;transition:opacity .25s,transform .25s;';
    document.body.appendChild(this.banner);
  }

  update(dt: number): void {
    const position = this.controller.position;
    for (const island of ISLANDS) {
      const root = this.detailRoots.get(island.id);
      if (!root) continue;
      root.visible = Math.hypot(position.x - island.center.x, position.z - island.center.z)
        <= DETAIL_VISIBLE_DISTANCE;
    }

    const island = findIslandAt(position.x, position.z, 7);
    if (island && worldHeightAt(position.x, position.z) > -0.25 && island.id !== this.activeIslandId) {
      this.activeIslandId = island.id;
      this.spawns.activateIsland(island.id);
      const [minLevel, maxLevel] = island.recommendedLevel;
      this.banner.innerHTML = `${island.name}<small style="display:block;color:#a9d9c8;font-size:10px">${island.subtitle} · Lv.${minLevel}-${maxLevel}</small>`;
      this.bannerTimer = 3.2;
      this.banner.style.opacity = '1';
      this.banner.style.transform = 'translate(-50%,0)';
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner.style.opacity = '0';
        this.banner.style.transform = 'translate(-50%,-14px)';
      }
    }
  }
}
