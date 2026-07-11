import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CollisionSystem } from './Collision';
import { scatterProps } from './props';
import type { WorldTextures } from './textures';
import { isTouchDevice } from '../engine/device';

export const ISLAND_RADIUS = 60;
export const WATER_LEVEL = 0;

/** จำนวนรอบ tiling ของ texture พื้นบนเกาะ */
const TERRAIN_TILE = 34;

/**
 * ความสูงของพื้นเกาะที่จุด (x, z) — เป็นสูตรล้วนๆ จึงใช้ร่วมกัน
 * ระหว่างการสร้าง mesh และการเช็คชนพื้นได้โดยไม่ต้องยิง ray
 */
export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const t = THREE.MathUtils.clamp(1 - d / ISLAND_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t); // smoothstep: 1 กลางเกาะ → 0 ที่ขอบ
  const hills =
    Math.sin(x * 0.15) * Math.cos(z * 0.12) * 1.1 +
    Math.sin(x * 0.05 + z * 0.07) * 1.6 +
    Math.cos(x * 0.03 - z * 0.05) * 0.9;
  // ขอบเกาะลาดจมลงใต้น้ำเล็กน้อยให้เกิดหาดทราย
  return falloff * (3.2 + hills) - 0.9;
}

/**
 * โลกของเกมแบบ Mobile Realistic PBR:
 * - ท้องฟ้าจำลองบรรยากาศจริง (Sky) + environment map จาก PMREM ให้ทุกวัสดุ
 * - พื้นเกาะ texture splatting 3 ชั้น (ทราย/หญ้า/หิน) ตามความสูง+ความชัน
 * - น้ำทะเล normal map เคลื่อนไหว 2 ชั้น (ไม่ใช้ planar reflection — ประหยัด GPU มือถือ)
 */
export class World {
  readonly collision: CollisionSystem;

  /** uniform เวลาสำหรับคลื่นน้ำ อัปเดตทุกเฟรม */
  private waterTime = { value: 0 };

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    private textures: WorldTextures,
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

    // environment map จากท้องฟ้า — ทำครั้งเดียว ให้แสงสะท้อน/ambient กับวัสดุ PBR ทุกชิ้น
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky);
    scene.environment = pmrem.fromScene(envScene).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    scene.add(sky); // เอากลับมาแสดงในฉากหลัก

    scene.fog = new THREE.Fog(0xcadfeb, 110, 420);

    // ---------- แสงอาทิตย์ (เงา) ----------
    const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
    sun.position.copy(sunDir).multiplyScalar(130);
    sun.castShadow = true;
    const shadowRes = isTouchDevice() ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowRes, shadowRes);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // แสงฟุ้งจากฟ้า/พื้นเบาๆ เสริม env map
    scene.add(new THREE.HemisphereLight(0xbdd8ee, 0x51624c, 0.35));

    // ---------- พื้นเกาะ + ทะเล ----------
    scene.add(this.buildTerrain());
    scene.add(this.buildWater());

    // ---------- ต้นไม้ หิน ลัง ----------
    scatterProps(scene, this.collision, heightAt, ISLAND_RADIUS, textures);
  }

  /** อัปเดตคลื่นน้ำ (เรียกจาก game loop) */
  update(dt: number): void {
    this.waterTime.value += dt;
  }

  // ------------------------------------------------------------------
  // พื้นเกาะ: MeshStandardMaterial + splatting ทราย/หญ้า/หิน ใน shader
  // ------------------------------------------------------------------
  private buildTerrain(): THREE.Mesh {
    const size = ISLAND_RADIUS * 2.4;
    const segments = 140;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
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
      map: t.grassColor,
      normalMap: t.grassNormal,
      roughness: 1,
      metalness: 0,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSandMap = { value: t.sandColor };
      shader.uniforms.uRockMap = { value: t.rockColor };
      shader.uniforms.uSandNormal = { value: t.sandNormal };
      shader.uniforms.uRockNormal = { value: t.rockNormal };

      shader.vertexShader =
        'attribute vec3 splat;\nvarying vec3 vSplat;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n\tvSplat = splat;',
        );

      shader.fragmentShader =
        'varying vec3 vSplat;\n' +
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
            // ทรายด้านสุด หญ้ารองลงมา หินเงาขึ้นนิด
            'float roughnessFactor = dot( vSplat, vec3( 1.0, 0.95, 0.82 ) );',
          );
    };

    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    return terrain;
  }

  // ------------------------------------------------------------------
  // ทะเล: normal map 2 ชั้นเลื่อนสวนกัน + แสงสะท้อนจาก env map
  // ------------------------------------------------------------------
  private buildWater(): THREE.Mesh {
    const waterNormal = this.textures.waterNormal;
    waterNormal.repeat.set(48, 48);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x0d3d57,
      roughness: 0.14,
      metalness: 0,
      transparent: true,
      opacity: 0.93,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
    });

    const time = this.waterTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.fragmentShader =
        'uniform float uTime;\n' +
        shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `
	vec3 w1 = texture2D( normalMap, vNormalMapUv + vec2( uTime * 0.012, uTime * 0.009 ) ).xyz;
	vec3 w2 = texture2D( normalMap, vNormalMapUv * 0.63 - vec2( uTime * 0.010, uTime * 0.007 ) ).xyz;
	vec3 mapN = normalize( ( w1 + w2 ) - 1.0 );
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
`,
        );
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(600, 48), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    return water;
  }
}
