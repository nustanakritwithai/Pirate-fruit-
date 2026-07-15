import * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import { ISLANDS } from '../island/IslandRegistry';

export const WATER_LEVEL = 0;
/** ขนาดทะเลที่เดินเรือได้จริง — เผื่อพื้นที่สำหรับ sea event และเรือระดับสูง */
export const OCEAN_SIZE = 1600;
export const SEA_BOUNDARY = OCEAN_SIZE * 0.44;

/** สูตรคลื่น CPU สำหรับระบบเรือใน Phase 3 ให้ตรงกับคลื่นภาพโดยประมาณ */
export function getWaveHeight(x: number, z: number, time: number): number {
  return (
    Math.sin(x * 0.065 + time * 0.72) * 0.09 +
    Math.sin(z * 0.095 - time * 0.58) * 0.065
  );
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  private readonly time = { value: 0 };

  constructor(waterNormal: THREE.Texture, graphics: GraphicsProfile) {
    waterNormal.repeat.set(42, 42);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x0a526c,
      roughness: 0.2,
      metalness: 0,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.72, 0.72),
      envMapIntensity: graphics.tier === 'low' ? 0.68 : 0.98,
      clearcoat: graphics.tier === 'low' ? 0.12 : 0.52,
      clearcoatRoughness: 0.16,
    });
    const time = this.time;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uOceanTime = time;
      shader.uniforms.uIslandCenters = {
        value: ISLANDS.map((island) => new THREE.Vector2(island.center.x, island.center.z)),
      };
      shader.uniforms.uIslandRadii = { value: ISLANDS.map((island) => island.radius) };
      shader.vertexShader =
        'uniform float uOceanTime;\nvarying vec3 vOceanWorld;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.y += sin( position.x * 0.065 + uOceanTime * 0.72 ) * 0.09;
          transformed.y += sin( position.z * 0.095 - uOceanTime * 0.58 ) * 0.065;
          vOceanWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
        );
      shader.fragmentShader =
        `uniform float uOceanTime;\nuniform vec2 uIslandCenters[${ISLANDS.length}];\n` +
        `uniform float uIslandRadii[${ISLANDS.length}];\nvarying vec3 vOceanWorld;\n` +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float shallow = 0.0;
            float foamBand = 0.0;
            for ( int islandIndex = 0; islandIndex < ${ISLANDS.length}; islandIndex++ ) {
              float oceanDistance = length( vOceanWorld.xz - uIslandCenters[islandIndex] );
              shallow = max( shallow, 1.0 - smoothstep( uIslandRadii[islandIndex] - 4.0, uIslandRadii[islandIndex] + 45.0, oceanDistance ) );
              foamBand = max( foamBand, 1.0 - smoothstep( 0.0, 5.0, abs( oceanDistance - ( uIslandRadii[islandIndex] - 3.0 ) ) ) );
            }
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.08, 0.50, 0.58 ), shallow * 0.48 );
            float foamNoise = 0.55 + 0.45 * sin( vOceanWorld.x * 0.33 + vOceanWorld.z * 0.27 + uOceanTime );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.74, 0.90, 0.88 ), foamBand * foamNoise * 0.38 );`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `vec3 w1 = texture2D( normalMap, vNormalMapUv + vec2( uOceanTime * 0.012, uOceanTime * 0.009 ) ).xyz;
            vec3 w2 = texture2D( normalMap, vNormalMapUv * 0.63 - vec2( uOceanTime * 0.010, uOceanTime * 0.007 ) ).xyz;
            vec3 mapN = normalize( ( w1 + w2 ) - 1.0 );
            mapN.xy *= normalScale;
            normal = normalize( tbn * mapN );`,
          );
    };

    const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, graphics.waterSegments, graphics.waterSegments);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.receiveShadow = false;
  }

  update(dt: number): void {
    this.time.value += dt;
  }
}
