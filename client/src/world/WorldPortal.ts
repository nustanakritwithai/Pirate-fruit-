import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';
import type { CharacterController } from '../player/CharacterController';
import type { SaveData } from '../save/SaveSystem';

export interface WorldPortalConfig {
  readonly id: 'pocket-monster' | 'living-world';
  readonly x: number;
  readonly z: number;
  readonly triggerRadius: number;
  readonly safeArrival: {
    readonly x: number;
    readonly z: number;
    readonly heading: number;
  };
  readonly name: string;
  readonly destination: string;
  readonly title: string;
  readonly subtitle: string;
  readonly primaryColor: number;
  readonly secondaryColor: number;
  readonly coreColor: number;
  readonly pedestalColor: number;
  readonly pedestalEmissive: number;
}

export const POCKET_MONSTER_WORLD_PORTAL: WorldPortalConfig = Object.freeze({
  id: 'pocket-monster',
  x: 7,
  z: 15,
  triggerRadius: 2.25,
  safeArrival: Object.freeze({ x: 7, z: 11.5, heading: 0 }),
  name: 'pocket-monster-world-portal',
  destination: 'pocket-monster',
  title: 'POCKET MONSTER',
  subtitle: 'ENTER PORTAL',
  primaryColor: 0x2ddcff,
  secondaryColor: 0xfbc824,
  coreColor: 0x0e7490,
  pedestalColor: 0x134e4a,
  pedestalEmissive: 0x0f766e,
});

export const LIVING_WORLD_PORTAL: WorldPortalConfig = Object.freeze({
  id: 'living-world',
  x: -7,
  z: 15,
  triggerRadius: 2.25,
  safeArrival: Object.freeze({ x: -7, z: 11.5, heading: 0 }),
  name: 'living-world-portal',
  destination: 'living-world',
  title: 'LIVING WORLD',
  subtitle: 'ENTER PORTAL',
  primaryColor: 0xfb83fc,
  secondaryColor: 0x38bf78,
  coreColor: 0x7c2dd2,
  pedestalColor: 0x431547,
  pedestalEmissive: 0x9a36f2,
});

export const WORLD_PORTALS: readonly WorldPortalConfig[] = Object.freeze([
  POCKET_MONSTER_WORLD_PORTAL,
  LIVING_WORLD_PORTAL,
]);

export function isInsideWorldPortal(
  position: Pick<SaveData, 'x' | 'z'>,
  portal: WorldPortalConfig,
): boolean {
  const dx = position.x - portal.x;
  const dz = position.z - portal.z;
  return dx * dx + dz * dz <= portal.triggerRadius * portal.triggerRadius;
}

/**
 * A portal is deliberately disarmed until the player has been observed outside it.
 * This prevents a restored position inside the trigger from bouncing to the prior world.
 */
export class WorldPortalEntryGate {
  private observedOutside = false;
  private wasInside = false;

  update(inside: boolean): boolean {
    if (!inside) this.observedOutside = true;
    const shouldEnter = inside && this.observedOutside && !this.wasInside;
    this.wasInside = inside;
    return shouldEnter;
  }
}

/** Move a stale portal save to the matching, known-safe approach point. */
export function resolveSafePortalArrival(saved: SaveData | null): SaveData | null {
  if (!saved) return null;
  const portal = WORLD_PORTALS.find((candidate) => isInsideWorldPortal(saved, candidate));
  if (!portal) return saved;

  return {
    ...saved,
    x: portal.safeArrival.x,
    z: portal.safeArrival.z,
    heading: portal.safeArrival.heading,
  };
}

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function createPortalLabel(config: WorldPortalConfig): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(3, 20, 31, 0.88)';
    context.strokeStyle = colorCss(config.secondaryColor);
    context.lineWidth = 8;
    context.beginPath();
    context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 46);
    context.fill();
    context.stroke();
    context.fillStyle = '#f8fafc';
    context.font = '800 50px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(config.title, canvas.width / 2, canvas.height / 2 - 12);
    context.fillStyle = colorCss(config.primaryColor);
    context.font = '700 27px sans-serif';
    context.fillText(config.subtitle, canvas.width / 2, canvas.height / 2 + 43);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const label = new Sprite(material);
  label.position.set(0, 3.45, 0);
  label.scale.set(6.3, 1.32, 1);
  label.renderOrder = 100;
  return label;
}

export class WorldPortal {
  readonly group = new Group();

  private readonly ring: Mesh<TorusGeometry, MeshBasicMaterial>;
  private readonly core: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly entryGate = new WorldPortalEntryGate();
  private elapsed = 0;

  constructor(
    scene: Scene,
    private readonly controller: CharacterController,
    heightAt: (x: number, z: number) => number,
    private readonly onEnter: () => void,
    private readonly config: WorldPortalConfig = POCKET_MONSTER_WORLD_PORTAL,
  ) {
    const groundY = heightAt(config.x, config.z);
    this.group.name = config.name;
    this.group.position.set(config.x, groundY + 2.35, config.z);
    this.group.userData.presentationOnly = true;
    this.group.userData.combatAuthority = false;
    this.group.userData.destination = config.destination;

    this.ring = new Mesh(
      new TorusGeometry(2.05, 0.18, 16, 72),
      new MeshBasicMaterial({ color: config.primaryColor, toneMapped: false }),
    );
    this.group.add(this.ring);

    const innerRing = new Mesh(
      new TorusGeometry(1.72, 0.07, 12, 64),
      new MeshBasicMaterial({ color: config.secondaryColor, toneMapped: false }),
    );
    innerRing.position.z = 0.03;
    this.group.add(innerRing);

    this.core = new Mesh(
      new CircleGeometry(1.82, 64),
      new MeshBasicMaterial({
        color: config.coreColor,
        transparent: true,
        opacity: 0.38,
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.core.position.z = 0.06;
    this.group.add(this.core);

    const pedestal = new Mesh(
      new BoxGeometry(3.5, 0.48, 1.25),
      new MeshStandardMaterial({
        color: config.pedestalColor,
        emissive: config.pedestalEmissive,
        emissiveIntensity: 0.24,
        roughness: 0.62,
        metalness: 0.35,
      }),
    );
    pedestal.position.y = -2.22;
    this.group.add(pedestal);

    const light = new PointLight(config.primaryColor, 3.2, 16, 2);
    light.position.set(0, 0.6, 1);
    this.group.add(light);
    this.group.add(createPortalLabel(config));
    scene.add(this.group);
  }

  update(dt: number): void {
    this.elapsed += Math.min(dt, 0.1);
    this.ring.rotation.z = this.elapsed * 0.55;
    const pulse = 1 + Math.sin(this.elapsed * 3.4) * 0.06;
    this.core.scale.setScalar(pulse);
    this.core.material.opacity = 0.3 + Math.sin(this.elapsed * 3.4) * 0.09;

    if (this.entryGate.update(isInsideWorldPortal(this.controller.position, this.config))) {
      this.onEnter();
    }
  }
}
