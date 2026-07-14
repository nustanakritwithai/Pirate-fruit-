import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { CollisionSystem } from '../world/Collision';
import { DialogueUI } from '../ui/DialogueUI';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import { ALL_NPCS, type NPCDefinition } from './NPCData';
import { createHumanoidVisual } from '../art/CharacterVisuals';
import { ProceduralCharacterAnimator } from '../animation/ProceduralCharacterAnimator';

const INTERACTION_RANGE = 4.2;

interface NPCInstance {
  definition: NPCDefinition;
  group: THREE.Group;
  animator: ProceduralCharacterAnimator;
}

export interface NPCActions {
  openBoatShop?: (definition: NPCDefinition) => void;
  openQuestBoard?: () => void;
  openDealerShop?: () => void;
  openTradeShop?: (definition: NPCDefinition) => void;
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
  const character = createHumanoidVisual({
    clothColor: definition.color,
    accentColor: definition.action === 'boat-shop' ? 0xb58a4d : 0x6b3d56,
    skinColor: 0xc98f68,
    pirate: definition.action === 'boat-shop',
  });
  visual.add(character.group);
  group.add(visual, makeNameSprite(definition.name));
  const phase = Math.abs(Math.sin(definition.x * 12.9898 + definition.z * 78.233)) * Math.PI * 2;
  return {
    definition,
    group,
    animator: new ProceduralCharacterAnimator(character.rig, phase),
  };
}

/** NPC Phase 2: ค้นหาตัวใกล้สุด หันหาผู้เล่น และเปิดบทสนทนา */
export class NPCManager {
  private readonly npcs: NPCInstance[];
  private readonly prompt = new InteractionPrompt();
  private readonly dialogue = new DialogueUI();
  private reopenCooldown = 0;

  constructor(
    scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    collision: CollisionSystem,
    private actions: NPCActions = {},
  ) {
    this.npcs = ALL_NPCS.map((definition) => {
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
    this.reopenCooldown = Math.max(0, this.reopenCooldown - dt);
    const player = this.controller.position;
    let nearest: NPCInstance | null = null;
    let nearestDistance = INTERACTION_RANGE;
    for (const npc of this.npcs) {
      const dx = player.x - npc.group.position.x;
      const dz = player.z - npc.group.position.z;
      const distance = Math.hypot(dx, dz);
      npc.group.visible = distance < 125;
      if (!npc.group.visible) continue;
      npc.animator.update(dt, distance < INTERACTION_RANGE + 0.8 ? 'talk' : 'idle');
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

    if (this.dialogue.isOpen) {
      this.prompt.hide();
      return;
    }
    if (!this.controller.inputEnabled) {
      this.prompt.hide();
      if (this.input.controlMode === 'player') this.input.consumeInteract();
      return;
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
    const action = definition.action === 'boat-shop' && this.actions.openBoatShop
      ? () => this.actions.openBoatShop!(definition)
      : definition.action === 'quest-board'
        ? this.actions.openQuestBoard
        : definition.action === 'dealer-shop'
          ? this.actions.openDealerShop
          : definition.action === 'trade-shop' && this.actions.openTradeShop
            ? () => this.actions.openTradeShop!(definition)
            : undefined;
    const actionLabel = definition.action === 'boat-shop'
      ? '⚓ เปิดอู่เรือ'
      : definition.action === 'quest-board'
        ? '📜 ดูภารกิจ'
        : definition.action === 'dealer-shop'
          ? '🎴 เปิดร้านสุ่ม'
          : definition.action === 'trade-shop'
            ? '🏪 เปิดตลาดเทรด'
            : undefined;
    this.dialogue.open(
      {
        name: definition.name,
        role: definition.role,
        pages: definition.dialogue,
        actionLabel: action ? actionLabel : undefined,
        onAction: action,
      },
      () => {
        this.controller.setControlsEnabled(true);
        this.reopenCooldown = 0.45;
      },
    );
  }
}
