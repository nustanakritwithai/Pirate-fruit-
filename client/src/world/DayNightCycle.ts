import * as THREE from 'three';
import type { Sky } from 'three/addons/objects/Sky.js';
import { SEA_BOUNDARY } from '../ocean/Ocean';

const DAY_LENGTH_SECONDS = 12 * 60;

function makeFallbackNightTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#020611');
  gradient.addColorStop(0.55, '#081a34');
  gradient.addColorStop(1, '#193b56');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // lightweight fallback สำหรับ offline/asset load failure — ไม่ให้ท้องฟ้ากลับไปดำสนิท
  let seed = 19072026;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 360; i++) {
    const x = random() * canvas.width;
    const y = 30 + random() * canvas.height * 0.7;
    const radius = 0.35 + random() * 1.35;
    const alpha = 0.35 + random() * 0.65;
    ctx.fillStyle = `rgba(220,238,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const moon = ctx.createRadialGradient(778, 118, 8, 778, 118, 85);
  moon.addColorStop(0, 'rgba(255,245,202,.72)');
  moon.addColorStop(0.18, 'rgba(220,230,255,.25)');
  moon.addColorStop(1, 'rgba(120,165,220,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(690, 30, 180, 180);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

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
  /** พื้นหลังสำรองกลางวัน ป้องกันพื้นที่นอก Sky mesh กลายเป็นดำเมื่ออยู่เกาะปลายแผนที่ */
  private readonly dayBackground = new THREE.Color(0x9fcde8);
  private focusX = 0;
  private focusZ = 0;
  private nightBackground: THREE.Texture | null = makeFallbackNightTexture();

  constructor(
    private scene: THREE.Scene,
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

  /** ใส่ภาพ night sky จาก asset ภายนอก; fallback ยังอยู่จนกว่าโหลดสำเร็จ */
  setNightBackground(texture: THREE.Texture): void {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    this.nightBackground = texture;
    this.applyLighting();
  }

  /** เลื่อนกรอบแสงเงาตามผู้เล่น เพื่อให้เกาะไกลจาก origin ยังมี dynamic shadow คมชัด */
  setFocus(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.focusX = x;
    this.focusZ = z;
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

    this.sun.target.position.set(this.focusX, 0, this.focusZ);
    this.sun.position.copy(sunDirection).multiplyScalar(130);
    this.sun.position.x += this.focusX;
    this.sun.position.z += this.focusZ;
    this.sun.intensity = THREE.MathUtils.lerp(0.12, 3, daylight);
    this.sun.color.copy(this.nightSun).lerp(this.daySun, daylight).lerp(this.duskSun, dusk * 0.72);
    this.hemisphere.intensity = THREE.MathUtils.lerp(0.12, 0.42, daylight);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.14, 0.62, daylight);

    const fogColor = this.nightFog.clone().lerp(this.dayFog, daylight).lerp(this.duskFog, dusk * 0.5);
    this.fog.color.copy(fogColor);
    this.fog.near = THREE.MathUtils.lerp(70, 115, daylight);
    this.fog.far = THREE.MathUtils.lerp(Math.max(420, SEA_BOUNDARY - 160), SEA_BOUNDARY + 90, daylight);

    const night = 1 - daylight;
    const showNightBackground = night > 0.52 && this.nightBackground !== null;
    // ให้มี background ทั้งกลางวันและกลางคืนเสมอ: Sky ยังวาดทับในเวลากลางวัน
    // ส่วนสีฟ้านี้เป็น safety net สำหรับมุมที่ Sky mesh ครอบไม่ถึงเท่านั้น
    this.scene.background = showNightBackground ? this.nightBackground : this.dayBackground;
    this.sky.visible = !showNightBackground;
    this.nightMaterial.emissiveIntensity = 0.1 + night * 2.6;
    for (const light of this.nightLights) light.intensity = night * 2.2;
  }
}
