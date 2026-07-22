import * as THREE from 'three';
import type { GraphicsProfile } from './GraphicsQuality';

export interface Updatable {
  update(dt: number): void;
}

/**
 * แกนกลางของเกม: renderer, scene, กล้อง และ game loop
 * ใช้ fixed timestep สำหรับ logic เพื่อให้ฟิสิกส์เสถียรทุกเฟรมเรต
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private updatables: Updatable[] = [];
  private clock = new THREE.Clock();
  private accumulator = 0;
  /** logic ทำงานที่ 60 ครั้ง/วินาทีเสมอ */
  private readonly fixedDt = 1 / 60;
  /** กัน spiral of death: เครื่องช้าไม่ควรไล่คำนวณเฟรมย้อนหลังไม่สิ้นสุด */
  private readonly maxSubSteps = 5;

  /** ค่า FPS เฉลี่ยสำหรับแสดงบน HUD */
  fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(container: HTMLElement, readonly graphics: GraphicsProfile) {
    THREE.ColorManagement.enabled = true;
    this.renderer = new THREE.WebGLRenderer({
      antialias: graphics.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // มือถือจำกัด pixel ratio ต่ำลง — จอ retina x3 แพงเกินจำเป็น
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, graphics.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = graphics.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = graphics.exposure;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  get triangles(): number {
    return this.renderer.info.render.triangles;
  }

  add(updatable: Updatable): void {
    this.updatables.push(updatable);
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    // จำกัด dt กันกรณีสลับแท็บแล้วเวลาโดดไกล
    const frameDt = Math.min(this.clock.getDelta(), 0.25);
    this.accumulator = Math.min(
      this.accumulator + frameDt,
      this.fixedDt * this.maxSubSteps * 3,
    );

    let subSteps = 0;
    while (this.accumulator >= this.fixedDt && subSteps < this.maxSubSteps) {
      for (const u of this.updatables) u.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
      subSteps++;
    }
    // Keep the bounded remainder for the next few frames. A lag spike catches
    // up gradually instead of silently deleting movement/cooldown time.

    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
