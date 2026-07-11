import { Game } from './engine/Game';
import { Input } from './engine/Input';
import { World, heightAt } from './world/World';
import { CharacterController } from './player/CharacterController';
import { Player } from './player/Player';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { HUD } from './ui/HUD';
import { SaveSystem } from './save/SaveSystem';

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
  const world = new World(game.scene);

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
  const saveSystem = new SaveSystem(controller, camera);

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

  game.add(controller);
  game.add(player);
  game.add(camera);
  game.add(saveSystem);
  game.add({ update: () => hud.update() });

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
