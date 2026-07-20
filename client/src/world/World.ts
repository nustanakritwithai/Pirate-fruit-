import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CollisionSystem } from './Collision';
import { scatterProps } from './props';
import type { WorldTextures } from './textures';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { buildStarterIsland } from '../island/StarterIsland';
import {
  ISLANDS,
  STARTER_ISLAND_RADIUS,
  worldHeightAt,
} from '../island/IslandRegistry';
import type { IslandDefinition, IslandId } from '../island/IslandTypes';
import { Ocean, SEA_BOUNDARY, WATER_LEVEL } from '../ocean/Ocean';
import { CloudLayer } from './CloudLayer';
import { DayNightCycle } from './DayNightCycle';
import { islandStreamingAction } from './IslandStreamingPolicy';
import { batchStaticIsland } from '../art/StaticIslandBatcher';

export const ISLAND_RADIUS = STARTER_ISLAND_RADIUS;
export { WATER_LEVEL };

/** จำนวนรอบ tiling ของ procedural micro-surface บนเกาะ */
const TERRAIN_TILE = 34;
type StreamedIslandId = Exclude<IslandId, 'starter-island'>;
type IslandBuilder = (
  scene: THREE.Scene,
  collision: CollisionSystem,
  textures: WorldTextures,
  graphics: GraphicsProfile,
  nightMaterial: THREE.MeshStandardMaterial,
  nightLights: THREE.PointLight[],
) => { root: THREE.Group };

const STREAMED_ISLAND_BUILDERS: Record<StreamedIslandId, () => Promise<IslandBuilder>> = {
  'mist-jungle': () => import('../island/MistJungleIsland').then((module) => module.buildMistJungleIsland),
  'sunscar-desert': () => import('../island/SunscarDesertIsland').then((module) => module.buildSunscarDesertIsland),
  'azure-frost': () => import('../island/AzureFrostIsland').then((module) => module.buildAzureFrostIsland),
  'tempest-sky': () => import('../island/TempestSkyIsland').then((module) => module.buildTempestSkyIsland),
  'ember-volcano': () => import('../island/EmberVolcanoIsland').then((module) => module.buildEmberVolcanoIsland),
};

interface StreamedIsland {
  terrain: THREE.Mesh;
  root: THREE.Group;
  nightLights: THREE.PointLight[];
}

/**
 * ความสูงของพื้นเกาะที่จุด (x, z) — เป็นสูตรล้วนๆ จึงใช้ร่วมกัน
 * ระหว่างการสร้าง mesh และการเช็คชนพื้นได้โดยไม่ต้องยิง ray
 */
export function heightAt(x: number, z: number): number {
  return worldHeightAt(x, z);
}

/**
 * โลกของเกมแบบ Mobile Realistic PBR:
 * - ท้องฟ้าจำลองบรรยากาศจริง (Sky) + environment map จาก PMREM ให้ทุกวัสดุ
 * - พื้นเกาะ texture splatting 3 ชั้น (ทราย/หญ้า/หิน) ตามความสูง+ความชัน
 * - น้ำทะเล normal map เคลื่อนไหว 2 ชั้น (ไม่ใช้ planar reflection — ประหยัด GPU มือถือ)
 */
export class World {
  readonly collision: CollisionSystem;
  readonly dayNight: DayNightCycle;
  readonly islandDetailRoots = new Map<IslandId, THREE.Object3D>();
  private readonly ocean: Ocean;
  private readonly clouds: CloudLayer;
  private readonly streamedIslands = new Map<StreamedIslandId, StreamedIsland>();
  private readonly pendingIslands = new Set<StreamedIslandId>();
  private readonly nightMaterial: THREE.MeshStandardMaterial;
  private readonly nightLights: THREE.PointLight[];
  private focusProvider: (() => { x: number; z: number }) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    private textures: WorldTextures,
    private graphics: GraphicsProfile,
  ) {
    this.collision = new CollisionSystem(heightAt);

    // ---------- ท้องฟ้า (บรรยากาศจริง) ----------
    const sky = new Sky();
    // แผนที่ถูกขยายออกจาก origin แล้ว Sky เดิม 450 หน่วยจะครอบไม่ถึงเกาะท้ายๆ
    // และเปิดช่องให้ background เริ่มต้นสีดำโผล่เข้ามาในบางมุมกล้อง
    sky.scale.setScalar(Math.max(900, SEA_BOUNDARY * 4));
    const skyU = sky.material.uniforms;
    skyU.turbidity.value = 6;
    skyU.rayleigh.value = 2.2;
    skyU.mieCoefficient.value = 0.005;
    skyU.mieDirectionalG.value = 0.8;

    // ดวงอาทิตย์ช่วงบ่าย แสงเฉียงให้เงาสวย
    const sunDir = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(90 - 38), // elevation 38°
      THREE.MathUtils.degToRad(140),
    );
    skyU.sunPosition.value.copy(sunDir);

    // environment map ทำเพียงครั้งเดียว โหมด Low ข้ามขั้นนี้เพื่อลดเวลาเริ่มเกมและหน่วยความจำ GPU
    if (graphics.tier !== 'low') {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(sky);
      scene.environment = pmrem.fromScene(envScene).texture;
      scene.environmentIntensity = graphics.tier === 'high' ? 0.68 : 0.56;
      pmrem.dispose();
    }
    scene.add(sky);

    const fog = new THREE.Fog(0xcadfeb, 110, SEA_BOUNDARY + 90);
    scene.fog = fog;

    // ---------- แสงอาทิตย์ (เงา) ----------
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
    sun.position.copy(sunDir).multiplyScalar(130);
    sun.castShadow = graphics.shadows;
    sun.shadow.mapSize.set(graphics.shadowMapSize, graphics.shadowMapSize);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = graphics.tier === 'high' ? 2.4 : 1.4;
    scene.add(sun);
    scene.add(sun.target);

    // แสงฟุ้งจากฟ้า/พื้นเบาๆ เสริม env map
    const hemisphere = new THREE.HemisphereLight(0xbdd8ee, 0x51624c, 0.35);
    scene.add(hemisphere);

    // ---------- พื้นเกาะ + ทะเล ----------
    // เกาะเริ่มต้นพร้อมทันที ส่วนเกาะอื่นจะโหลด code/geometry เมื่อผู้เล่นเข้าใกล้
    const starterDefinition = ISLANDS.find((island) => island.id === 'starter-island')!;
    scene.add(this.buildTerrain(starterDefinition));
    this.ocean = new Ocean(textures.waterNormal, graphics);
    scene.add(this.ocean.mesh);

    // ---------- สถานที่หลัก หมู่บ้าน ท่าเรือ หาดฝึก ----------
    const starterIsland = buildStarterIsland(scene, this.collision, textures, graphics);
    batchStaticIsland(starterIsland.root);
    this.nightMaterial = starterIsland.nightMaterial;
    this.nightLights = starterIsland.nightLights;

    // ---------- ธรรมชาติแบบ instancing ----------
    scatterProps(scene, this.collision, heightAt, ISLAND_RADIUS, textures, graphics);

    this.clouds = new CloudLayer(graphics);
    scene.add(this.clouds.mesh);
    this.dayNight = new DayNightCycle(
      scene,
      sky,
      sun,
      hemisphere,
      fog,
      starterIsland.nightMaterial,
      starterIsland.nightLights,
    );

  }

  get timeOfDay(): number {
    return this.dayNight.value;
  }

  setTimeOfDay(value: number): void {
    this.dayNight.setTime(value);
  }

  setFocusProvider(provider: () => { x: number; z: number }): void {
    this.focusProvider = provider;
  }

  update(dt: number): void {
    this.ocean.update(dt);
    this.clouds.update(dt);
    const focus = this.focusProvider?.();
    if (focus) {
      this.dayNight.setFocus(focus.x, focus.z);
      this.updateIslandStreaming(focus.x, focus.z);
    }
    this.dayNight.update(dt);
  }

  private updateIslandStreaming(x: number, z: number): void {
    for (const island of ISLANDS) {
      if (island.id === 'starter-island') continue;
      const id = island.id as StreamedIslandId;
      const distance = Math.hypot(x - island.center.x, z - island.center.z);
      const action = islandStreamingAction(
        distance,
        this.streamedIslands.has(id),
        this.pendingIslands.has(id),
      );
      if (action === 'load') {
        this.loadIsland(id, island);
      } else if (action === 'unload') {
        this.unloadIsland(id);
      }
    }
  }

  private loadIsland(id: StreamedIslandId, definition: IslandDefinition): void {
    if (this.streamedIslands.has(id) || this.pendingIslands.has(id)) return;
    this.pendingIslands.add(id);
    const collisionScope = `island:${id}`;

    void STREAMED_ISLAND_BUILDERS[id]().then((build) => {
      const terrain = this.buildTerrain(definition);
      this.scene.add(terrain);
      const lightStart = this.nightLights.length;
      const result = this.collision.runInScope(collisionScope, () => build(
        this.scene,
        this.collision,
        this.textures,
        this.graphics,
        this.nightMaterial,
        this.nightLights,
      ));
      batchStaticIsland(result.root);
      const addedLights = this.nightLights.slice(lightStart);
      result.root.visible = false;
      result.root.children.forEach((child) => { child.visible = false; });
      this.islandDetailRoots.set(id, result.root);
      this.streamedIslands.set(id, { terrain, root: result.root, nightLights: addedLights });
    }).catch((error: unknown) => {
      this.collision.removeScope(collisionScope);
      console.warn(`[World] procedural island ${id} failed to load`, error);
    }).finally(() => {
      this.pendingIslands.delete(id);
    });
  }

  private unloadIsland(id: StreamedIslandId): void {
    const loaded = this.streamedIslands.get(id);
    if (!loaded) return;
    loaded.root.removeFromParent();
    loaded.terrain.removeFromParent();
    this.disposeObjectTree(loaded.root);
    loaded.terrain.geometry.dispose();
    (loaded.terrain.material as THREE.Material).dispose();
    for (const light of loaded.nightLights) {
      const index = this.nightLights.indexOf(light);
      if (index >= 0) this.nightLights.splice(index, 1);
    }
    this.collision.removeScope(`island:${id}`);
    this.islandDetailRoots.delete(id);
    this.streamedIslands.delete(id);
  }

  private disposeObjectTree(root: THREE.Object3D): void {
    const sharedTextures = new Set<THREE.Texture>(Object.values(this.textures));
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material || material === this.nightMaterial) continue;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture && !sharedTextures.has(value)) value.dispose();
        }
        material.dispose();
      }
    });
  }

  // ------------------------------------------------------------------
  // พื้นเกาะ: MeshStandardMaterial + splatting ทราย/หญ้า/หิน ใน shader
  // ------------------------------------------------------------------
  private buildTerrain(island: IslandDefinition): THREE.Mesh {
    const size = island.radius * 2.4;
    const segments = island.id === 'starter-island'
      ? this.graphics.terrainSegments
      : Math.max(48, Math.floor(this.graphics.terrainSegments * 0.72));
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const worldX = pos.getX(i) + island.center.x;
      const worldZ = pos.getZ(i) + island.center.z;
      pos.setY(i, island.heightAt(worldX, worldZ));
    }
    geo.computeVertexNormals();

    // น้ำหนัก splat ต่อ vertex: x=ทราย y=หญ้า z=หิน (จากความสูง + ความชัน)
    const normal = geo.attributes.normal;
    const splat = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i);
      const slope = 1 - normal.getY(i); // 0 = ราบ, มากขึ้น = ชัน
      let sand = THREE.MathUtils.smoothstep(1.1 - h, 0, 1.1); // ต่ำ = ทราย
      let rock = THREE.MathUtils.smoothstep(slope, 0.12, 0.3); // ชัน = หิน
      rock = Math.max(rock, THREE.MathUtils.smoothstep(h, 3.6, 4.6)); // ยอดสูง = หิน
      sand *= 1 - rock;
      let grass = Math.max(0, 1 - sand - rock);
      const sum = sand + grass + rock;
      splat[i * 3] = sand / sum;
      splat[i * 3 + 1] = grass / sum;
      splat[i * 3 + 2] = rock / sum;
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));

    const t = this.textures;
    for (const tex of [t.grassColor, t.grassNormal]) tex.repeat.set(TERRAIN_TILE, TERRAIN_TILE);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x66a45b,
      map: t.grassColor,
      normalMap: t.grassNormal,
      roughness: 1,
      metalness: 0,
      normalScale: new THREE.Vector2(0.72, 0.72),
      envMapIntensity: 0.34,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSandMap = { value: t.sandColor };
      shader.uniforms.uRockMap = { value: t.rockColor };
      shader.uniforms.uSandNormal = { value: t.sandNormal };
      shader.uniforms.uRockNormal = { value: t.rockNormal };

      shader.vertexShader =
        'attribute vec3 splat;\nvarying vec3 vSplat;\nvarying float vTerrainHeight;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\tvSplat = splat;\n\tvTerrainHeight = transformed.y;',
        );

      shader.fragmentShader =
        'varying vec3 vSplat;\nvarying float vTerrainHeight;\n' +
        'uniform sampler2D uSandMap;\nuniform sampler2D uRockMap;\n' +
        'uniform sampler2D uSandNormal;\nuniform sampler2D uRockNormal;\n' +
        shader.fragmentShader
          .replace(
            '#include <map_fragment>',
            `
	vec2 rockUv = vMapUv * 0.55;
	vec4 splatColor = texture2D( uSandMap, vMapUv ) * vSplat.x
		+ texture2D( map, vMapUv ) * vSplat.y
		+ texture2D( uRockMap, rockUv ) * vSplat.z;
	diffuseColor *= splatColor;
	float macroShade = sin( vMapUv.x * 0.19 ) * cos( vMapUv.y * 0.17 );
	diffuseColor.rgb *= 0.965 + macroShade * 0.035;
	float wetShore = ( 1.0 - smoothstep( -0.2, 0.5, vTerrainHeight ) ) * vSplat.x;
	diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.68, 0.79, 0.82 ), wetShore * 0.58 );
`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `
	vec3 splatN = texture2D( uSandNormal, vNormalMapUv ).xyz * vSplat.x
		+ texture2D( normalMap, vNormalMapUv ).xyz * vSplat.y
		+ texture2D( uRockNormal, vNormalMapUv * 0.55 ).xyz * vSplat.z;
	vec3 mapN = splatN * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            // ทรายแห้งด้าน แต่แนวชายฝั่งเปียกสะท้อนแสงมากขึ้นโดยไม่เพิ่ม texture
            `float terrainRoughness = dot( vSplat, vec3( 1.0, 0.95, 0.82 ) );
	float roughnessFactor = mix( terrainRoughness, 0.48, wetShore );`,
          );
    };

    const terrain = new THREE.Mesh(geo, mat);
    terrain.name = `PF_TERRAIN_${island.id.toUpperCase()}`;
    terrain.position.set(island.center.x, 0, island.center.z);
    terrain.receiveShadow = this.graphics.shadows;
    return terrain;
  }
}
