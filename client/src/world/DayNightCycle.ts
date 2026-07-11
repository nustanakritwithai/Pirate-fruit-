import * as THREE from 'three';
import type { Sky } from 'three/addons/objects/Sky.js';

const DAY_LENGTH_SECONDS = 12 * 60;

/** วงจรเวลาแบบประหยัด: ขยับแสงและ shader เดิม โดยไม่สร้าง environment map ใหม่ทุกเฟรม */
export class DayNightCycle {
  private time = 0.31;
  private applyTimer = 0;
  private readonly dayFog = new THREE.Color(0xcadfeb);
  private readonly duskFog = new THREE.Color(0x9f7780);
  private readonly nightFog = new THREE.Color(0x101d35);
  private readonly daySun = new THREE.Color(0xfff1dc);
  private readonly duskSun = new THREE.Color(0xff9d62);
  private readonly nightSun = new THREE.Color(0x7792bf);

  constructor(
    private sky: Sky,
    private sun: THREE.DirectionalLight,
    private hemisphere: THREE.HemisphereLight,
    private fog: THREE.Fog,
    private nightMaterial: THREE.MeshStandardMaterial,
    private nightLights: THREE.PointLight[],
  ) {
    this.applyLighting();
  }

  get value(): number {
    return this.time;
  }

  get clockLabel(): string {
    const totalMinutes = Math.floor(this.time * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  setTime(value: number): void {
    if (!Number.isFinite(value)) return;
    this.time = ((value % 1) + 1) % 1;
    this.applyLighting();
  }

  update(dt: number): void {
    this.time = (this.time + dt / DAY_LENGTH_SECONDS) % 1;
    this.applyTimer += dt;
    if (this.applyTimer >= 0.08) {
      this.applyTimer = 0;
      this.applyLighting();
    }
  }

  private applyLighting(): void {
    const angle = (this.time - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const sunDirection = new THREE.Vector3(
      Math.cos(angle) * 0.75,
      sunHeight,
      Math.sin(angle * 0.43) * 0.55,
    ).normalize();
    const daylight = THREE.MathUtils.smoothstep(sunHeight, -0.13, 0.22);
    const dusk = Math.max(0, 1 - Math.abs(sunHeight) / 0.28) * (1 - daylight * 0.35);

    this.sky.material.uniforms.sunPosition.value.copy(sunDirection).multiplyScalar(400);
    this.sky.material.uniforms.rayleigh.value = THREE.MathUtils.lerp(0.35, 2.25, daylight);
    this.sky.material.uniforms.turbidity.value = THREE.MathUtils.lerp(8.5, 5.8, daylight);

    this.sun.position.copy(sunDirection).multiplyScalar(130);
    this.sun.intensity = THREE.MathUtils.lerp(0.12, 3, daylight);
    this.sun.color.copy(this.nightSun).lerp(this.daySun, daylight).lerp(this.duskSun, dusk * 0.72);
    this.hemisphere.intensity = THREE.MathUtils.lerp(0.12, 0.42, daylight);

    const fogColor = this.nightFog.clone().lerp(this.dayFog, daylight).lerp(this.duskFog, dusk * 0.5);
    this.fog.color.copy(fogColor);
    this.fog.near = THREE.MathUtils.lerp(70, 115, daylight);
    this.fog.far = THREE.MathUtils.lerp(250, 430, daylight);

    const night = 1 - daylight;
    this.nightMaterial.emissiveIntensity = 0.1 + night * 2.6;
    for (const light of this.nightLights) light.intensity = night * 2.2;
  }
}
