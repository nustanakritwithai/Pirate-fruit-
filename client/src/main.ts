import { Game } from './engine/Game';
import { Input } from './engine/Input';
import { World } from './world/World';
import { loadWorldTextures } from './world/textures';
import { CharacterController } from './player/CharacterController';
import { Player } from './player/Player';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { TouchControls } from './ui/TouchControls';
import { Effects } from './effects/Effects';
import { SaveSystem } from './save/SaveSystem';
import { loadGraphicsProfile } from './engine/GraphicsQuality';
import { GraphicsSettings } from './ui/GraphicsSettings';
import { SpawnManager } from './world/SpawnManager';
import { NPCManager } from './npc/NPCManager';
import { BoatManager } from './boat/BoatManager';
import { MonsterManager } from './monster/MonsterManager';

const ATTACK_COOLDOWN = 0.5;

async function main(): Promise<void> {
  const container = document.getElementById('app')!;

  // หน้าจอโหลดชั่วคราวระหว่างรอโมเดล
  const loading = document.createElement('div');
  loading.className = 'game-loading';
  loading.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#fff;font-size:20px;background:#06121f;z-index:100;';
  loading.textContent = 'กำลังโหลดเกม...';
  document.body.appendChild(loading);

  const graphics = loadGraphicsProfile();
  const game = new Game(container, graphics);
  const input = new Input(game.renderer.domElement);
  const worldTextures = await loadWorldTextures();
  const world = new World(game.scene, game.renderer, worldTextures, graphics);

  const camera: ThirdPersonCamera = new ThirdPersonCamera(
    game.camera,
    input,
    () => controller.position,
  );
  const controller: CharacterController = new CharacterController(
    input,
    world.collision,
    () => camera.yaw,
  );

  const spawnManager = new SpawnManager(controller, world.collision);

  // โหลดตำแหน่งเดิมเฉพาะจุดที่ยังปลอดภัย ไม่งั้นกลับจุดเกิดกลางหมู่บ้าน
  const saved = SaveSystem.load();
  if (saved && spawnManager.isSafeSavedPosition(saved)) {
    controller.teleport(
      saved.x,
      Math.max(saved.y, world.collision.heightAt(saved.x, saved.z)),
      saved.z,
    );
    controller.heading = saved.heading ?? 0;
    camera.yaw = saved.cameraYaw ?? 0;
  } else {
    spawnManager.teleportToDefault();
  }
  world.setTimeOfDay(saved?.worldTime ?? 0.31);

  const player = new Player(controller);
  await player.load(game.scene);

  const hud = new HUD(controller, game, () => world.dayNight.clockLabel);
  const minimap = new Minimap(controller);
  const saveSystem = new SaveSystem(controller, camera, () => world.timeOfDay);
  const effects = new Effects(game.scene);
  const boatManager = new BoatManager(
    game.scene,
    input,
    controller,
    camera,
    world.collision,
    worldTextures,
    graphics,
    effects,
    () => spawnManager.respawn(),
  );
  const npcManager = new NPCManager(game.scene, input, controller, world.collision, {
    openBoatShop: () => boatManager.openShop(),
  });
  const monsterManager = new MonsterManager(
    game.scene,
    controller,
    world.collision,
    effects,
    graphics,
    {
      onPlayerHit: () => hud.flashDamage(),
      onPlayerDefeated: () => {
        spawnManager.teleportToDefault();
        controller.hp = controller.hpMax;
        hud.flashDamage();
      },
    },
  );
  new GraphicsSettings(graphics);

  // โจมตีพื้นฐาน (placeholder — ดาเมจจริงมาใน Phase 5)
  let attackCooldown = 0;
  const combat = {
    update(dt: number) {
      attackCooldown = Math.max(0, attackCooldown - dt);
      const requested = input.consumeAttack();
      if (requested && controller.inputEnabled && attackCooldown === 0) {
        attackCooldown = ATTACK_COOLDOWN;
        effects.spawnSlash(controller.position, controller.heading);
        monsterManager.playerAttack(controller.position, controller.heading);
      }
    },
  };

  // ระบบบังคับบนจอสัมผัสแบบ RoV (เฉพาะอุปกรณ์มีจอสัมผัส หรือ ?touch=1)
  let touchControls: TouchControls | null = null;
  if (TouchControls.isTouchDevice()) {
    touchControls = new TouchControls(input);
    input.attachTouch(touchControls);
    touchControls.bindCooldowns(
      () => input.controlMode === 'boat'
        ? boatManager.boostCooldownFraction
        : controller.dashCooldownFraction,
      () => attackCooldown / ATTACK_COOLDOWN,
    );
  }

  // ตกทะเล → กลับ Safe Zone ของหมู่บ้าน ไม่วนเกิดซ้ำในตำแหน่งอันตราย
  controller.onDrown = () => {
    spawnManager.respawn();
  };

  game.add(world);
  game.add(controller);
  game.add(boatManager);
  game.add(player);
  game.add(camera);
  game.add(combat);
  game.add(effects);
  game.add(npcManager);
  game.add(monsterManager);
  game.add(saveSystem);
  game.add({ update: () => hud.update() });
  game.add({ update: () => minimap.update() });
  if (touchControls) {
    const tc = touchControls;
    game.add({ update: () => tc.update() });
  }

  loading.remove();
  game.start();
}

main().catch((err) => {
  console.error('เกมเริ่มไม่สำเร็จ:', err);
  document.querySelector('.game-loading')?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;z-index:110;display:flex;align-items:center;justify-content:center;
      padding:24px;text-align:center;color:#ff9b8e;background:#06121f">
      เปิดเกมไม่สำเร็จ — อุปกรณ์นี้อาจไม่รองรับ WebGL<br>ลองเปิดด้วย Chrome หรือปรับเบราว์เซอร์ให้ใช้ GPU
    </div>`,
  );
});
