import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from '../world/Collision';
import { DialogueUI } from '../ui/DialogueUI';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import { STARTER_NPCS, type NPCDefinition } from './NPCData';

const INTERACTION_RANGE = 4.2;

interface NPCInstance {
  definition: NPCDefinition;
  group: THREE.Group;
  visual: THREE.Group;
}

function makeNameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(5,18,26,.78)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 368, 80, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,219,126,.65)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = '700 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff1bd';
  ctx.fillText(name, 192, 49);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.9, 0.98, 1);
  sprite.position.y = 3.55;
  return sprite;
}

function makeNPC(definition: NPCDefinition, y: number): NPCInstance {
  const group = new THREE.Group();
  group.position.set(definition.x, y, definition.z);
  const visual = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: definition.color, roughness: 0.82 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98f68, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x27231f, roughness: 0.92 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.54, 1.35, 8), cloth);
  body.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), skin);
  head.position.y = 2.55;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.58, 0.18, 10), dark);
  hat.position.y = 2.88;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.34), dark);
    leg.position.set(side * 0.22, 0.48, 0);
    visual.add(leg);
  }
  visual.add(body, head, hat);
  visual.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = true;
  });
  group.add(visual, makeNameSprite(definition.name));
  return { definition, group, visual };
}

/** NPC Phase 2: ค้นหาตัวใกล้สุด หันหาผู้เล่น และเปิดบทสนทนา */
export class NPCManager {
  private readonly npcs: NPCInstance[];
  private readonly prompt = new InteractionPrompt();
  private readonly dialogue = new DialogueUI();
  private time = 0;
  private reopenCooldown = 0;

  constructor(
    scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    collision: CollisionSystem,
  ) {
    this.npcs = STARTER_NPCS.map((definition) => {
      const npc = makeNPC(definition, collision.heightAt(definition.x, definition.z));
      scene.add(npc.group);
      collision.addCollider({
        x: definition.x,
        z: definition.z,
        radius: 0.48,
        minY: npc.group.position.y,
        maxY: npc.group.position.y + 3,
      });
      return npc;
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.reopenCooldown = Math.max(0, this.reopenCooldown - dt);
    if (this.dialogue.isOpen) {
      this.prompt.hide();
      return;
    }

    const player = this.controller.position;
    let nearest: NPCInstance | null = null;
    let nearestDistance = INTERACTION_RANGE;
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      npc.visual.position.y = Math.sin(this.time * 1.35 + i) * 0.025;
      const dx = player.x - npc.group.position.x;
      const dz = player.z - npc.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 7) {
        const target = Math.atan2(dx, dz);
        let difference = target - npc.group.rotation.y;
        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;
        npc.group.rotation.y += difference * Math.min(1, dt * 4.5);
      }
      if (distance < nearestDistance) {
        nearest = npc;
        nearestDistance = distance;
      }
    }

    if (!nearest) {
      this.prompt.hide();
      this.input.consumeInteract();
      return;
    }
    this.prompt.show(nearest.definition.name);
    const requested = this.input.consumeInteract() || this.prompt.consumeRequested();
    if (!requested || this.reopenCooldown > 0) return;

    this.prompt.hide();
    this.controller.setControlsEnabled(false);
    const definition = nearest.definition;
    this.dialogue.open(
      { name: definition.name, role: definition.role, pages: definition.dialogue },
      () => {
        this.controller.setControlsEnabled(true);
        this.reopenCooldown = 0.45;
      },
    );
  }
}
