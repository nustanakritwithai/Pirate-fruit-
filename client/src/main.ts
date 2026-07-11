import { Game } from './engine/Game';
import { Input } from './engine/Input';
import { World, heightAt } from './world/World';
import { loadWorldTextures } from './world/textures';
import { CharacterController } from './player/CharacterController';
import { Player } from './player/Player';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { TouchControls } from './ui/TouchControls';
import { Effects } from './effects/Effects';
import { SaveSystem } from './save/SaveSystem';

const ATTACK_COOLDOWN = 0.5;

async function main(): Promise<void> {
  const container = document.getElementById('app')!;

  // หน้าจอโหลดชั่วคราวระหว่างรอโมเดล
  const loading = document.createElement('div');
  loading.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#fff;font-size:20px;background:#06121f;z-index:100;';
  loading.textContent = 'กำลังโหลดเกม...';
  document.body.appendChild(loading);

  const game = new Game(container);
  const input = new Input(game.renderer.domElement);
  const worldTextures = await loadWorldTextures();
  const world = new World(game.scene, game.renderer, worldTextures);

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

  // จุดเกิด: โหลดจากเซฟเดิมถ้ามี ไม่งั้นเกิดกลางเกาะ
  const saved = SaveSystem.load();
  if (saved) {
    controller.teleport(saved.x, Math.max(saved.y, heightAt(saved.x, saved.z)), saved.z);
    controller.heading = saved.heading ?? 0;
    camera.yaw = saved.cameraYaw ?? 0;
  } else {
    controller.teleport(0, heightAt(0, 0), 0);
  }

  const player = new Player(controller);
  await player.load(game.scene);

  const hud = new HUD(controller, game);
  const minimap = new Minimap(controller);
  const saveSystem = new SaveSystem(controller, camera);
  const effects = new Effects(game.scene);

  // โจมตีพื้นฐาน (placeholder — ดาเมจจริงมาใน Phase 5)
  let attackCooldown = 0;
  const combat = {
    update(dt: number) {
      attackCooldown = Math.max(0, attackCooldown - dt);
      if (input.consumeAttack() && attackCooldown === 0) {
        attackCooldown = ATTACK_COOLDOWN;
        effects.spawnSlash(controller.position, controller.heading);
      }
    },
  };

  // ระบบบังคับบนจอสัมผัสแบบ RoV (เฉพาะอุปกรณ์มีจอสัมผัส หรือ ?touch=1)
  let touchControls: TouchControls | null = null;
  if (TouchControls.isTouchDevice()) {
    touchControls = new TouchControls(input);
    input.attachTouch(touchControls);
    touchControls.bindCooldowns(
      () => controller.dashCooldownFraction,
      () => attackCooldown / ATTACK_COOLDOWN,
    );
  }

  // ตกทะเล → กลับจุดเซฟล่าสุด (หรือกลางเกาะ) และโดนหักเลือดนิดหน่อย
  controller.onDrown = () => {
    const spawn = saveSystem.lastSpawn();
    if (spawn && heightAt(spawn.x, spawn.z) > 0) {
      controller.teleport(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
    } else {
      controller.teleport(0, heightAt(0, 0), 0);
    }
    controller.hp = Math.max(1, controller.hp - 5);
  };

  game.add(world);
  game.add(controller);
  game.add(player);
  game.add(camera);
  game.add(combat);
  game.add(effects);
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
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f66">โหลดเกมไม่สำเร็จ — ดูรายละเอียดใน console</div>`,
  );
});
