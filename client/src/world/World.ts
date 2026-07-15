import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CollisionSystem } from './Collision';
import { scatterProps } from './props';
import type { WorldTextures } from './textures';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { buildStarterIsland } from '../island/StarterIsland';
import { buildMistJungleIsland } from '../island/MistJungleIsland';
import { buildSunscarDesertIsland } from '../island/SunscarDesertIsland';
import { buildAzureFrostIsland } from '../island/AzureFrostIsland';
import { buildTempestSkyIsland } from '../island/TempestSkyIsland';
import { buildEmberVolcanoIsland } from '../island/EmberVolcanoIsland';
import {
  ISLANDS,
  STARTER_ISLAND_RADIUS,
  worldHeightAt,
} from '../island/IslandRegistry';
import type { IslandDefinition, IslandId } from '../island/IslandTypes';
import { Ocean, SEA_BOUNDARY, WATER_LEVEL } from '../ocean/Ocean';
import { CloudLayer } from './CloudLayer';
import { DayNightCycle } from './DayNightCycle';

export const ISLAND_RADIUS = STARTER_ISLAND_RADIUS;
export { WATER_LEVEL };

/** จำนวนรอบ tiling ของ texture พื้นบนเกาะ */
const TERRAIN_TILE = 34;

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
  private focusProvider: (() => { x: number; z: number }) | null = null;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    private textures: WorldTextures,
    private graphics: GraphicsProfile,
  ) {
    this.collision = new CollisionSystem(heightAt);

    // ---------- ท้องฟ้า (บรรยากาศจริง) ----------
    const sky = new Sky();
    sky.scale.setScalar(450);
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
    for (const island of ISLANDS) scene.add(this.buildTerrain(island));
    this.ocean = new Ocean(textures.waterNormal, graphics);
    scene.add(this.ocean.mesh);

    // ---------- สถานที่หลัก หมู่บ้าน ท่าเรือ หาดฝึก ----------
    const starterIsland = buildStarterIsland(scene, this.collision, textures, graphics);

    // ---------- ธรรมชาติแบบ instancing ----------
    scatterProps(scene, this.collision, heightAt, ISLAND_RADIUS, textures, graphics);

    // ---------- เกาะที่สอง: ป่าดิบชื้น ซากวิหาร และท่าเรือฝั่งตะวันตก ----------
    const mistJungle = buildMistJungleIsland(
      scene,
      this.collision,
      textures,
      graphics,
      starterIsland.nightMaterial,
      starterIsland.nightLights,
    );
    this.islandDetailRoots.set('mist-jungle', mistJungle.root);

    // ---------- เกาะที่สาม: ทะเลทราย เมืองคาราวาน โอเอซิส และพีระมิด ----------
    const sunscarDesert = buildSunscarDesertIsland(
      scene,
      this.collision,
      textures,
      graphics,
      starterIsland.nightMaterial,
      starterIsland.nightLights,
    );
    this.islandDetailRoots.set('sunscar-desert', sunscarDesert.root);

    const azureFrost = buildAzureFrostIsland(scene, this.collision, textures, graphics, starterIsland.nightMaterial, starterIsland.nightLights);
    this.islandDetailRoots.set('azure-frost', azureFrost.root);

    const tempestSky = buildTempestSkyIsland(scene, this.collision, textures, graphics, starterIsland.nightMaterial, starterIsland.nightLights);
    this.islandDetailRoots.set('tempest-sky', tempestSky.root);

    const emberVolcano = buildEmberVolcanoIsland(scene, this.collision, textures, graphics, starterIsland.nightMaterial, starterIsland.nightLights);
    this.islandDetailRoots.set('ember-volcano', emberVolcano.root);

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
    if (focus) this.dayNight.setFocus(focus.x, focus.z);
    this.dayNight.update(dt);
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
    const desert = island.id === 'sunscar-desert';
    const frost = island.id === 'azure-frost';
    const skyIsland = island.id === 'tempest-sky';
    const volcano = island.id === 'ember-volcano';
    const specialGround = desert || frost || skyIsland || volcano;
    const rockyGround = skyIsland || volcano;
    const groundMap = rockyGround ? t.rockColor.clone() : specialGround ? t.sandColor.clone() : t.grassColor;
    const groundNormal = rockyGround ? t.rockNormal.clone() : specialGround ? t.sandNormal.clone() : t.grassNormal;
    if (specialGround) {
      groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
      groundNormal.wrapS = groundNormal.wrapT = THREE.RepeatWrapping;
      groundMap.repeat.set(TERRAIN_TILE, TERRAIN_TILE);
      groundNormal.repeat.set(TERRAIN_TILE, TERRAIN_TILE);
      groundMap.needsUpdate = true;
      groundNormal.needsUpdate = true;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: island.id === 'mist-jungle' ? 0x789b72 : desert ? 0xe2c28e : frost ? 0xdcebef : skyIsland ? 0xc8d7d2 : volcano ? 0x66524b : 0xffffff,
      map: groundMap,
      normalMap: groundNormal,
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
