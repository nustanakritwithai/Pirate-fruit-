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
import { PlayerCombat } from './combat/PlayerCombat';
import { ItemInventory } from './shop/ItemInventory';
import { DealerShopUI } from './ui/DealerShopUI';
import { ProgressionManager } from './progression/ProgressionManager';
import { QuestManager } from './quest/QuestManager';
import { ProgressionHUD } from './ui/ProgressionHUD';
import { StatsPanel } from './ui/StatsPanel';
import { QuestTracker } from './ui/QuestTracker';
import { RewardFeed } from './ui/RewardFeed';
import { QuestBoard } from './ui/QuestBoard';
import { ProgressionDebugPanel } from './ui/ProgressionDebugPanel';
import { RewardContributionTracker } from './progression/RewardSystem';
import type { Monster } from './monster/Monster';
import { FullscreenManager } from './ui/FullscreenManager';
import { EquipmentVisuals } from './art/EquipmentVisuals';
import { PBRPerformanceMonitor } from './art/PBRPerformanceMonitor';

async function main(): Promise<void> {
  const container = document.getElementById('app')!;

  // เบราว์เซอร์อนุญาต fullscreen หลัง gesture เท่านั้น; gesture แรกของเกมจะขอให้อัตโนมัติ
  new FullscreenManager();

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
  const worldTextures = await loadWorldTextures(
    Math.min(graphics.textureAnisotropy, game.renderer.capabilities.getMaxAnisotropy()),
  );
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
  const progression = new ProgressionManager({ resources: controller });
  // อินเวนทอรีอาวุธ/ผลไม้ + สถานะ SkillLoadout (Phase 7) — ProgressionManager เป็นกระเป๋าเงินร่วม
  const itemInventory = new ItemInventory(progression);

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
  controller.hp = Math.min(controller.hpMax, Math.max(1, saved?.hp ?? controller.hpMax));
  controller.energy = Math.min(
    controller.energyMax,
    Math.max(0, saved?.energy ?? controller.energyMax),
  );
  world.setTimeOfDay(saved?.worldTime ?? 0.31);

  const player = new Player(controller, graphics, game.renderer.capabilities.getMaxAnisotropy());
  await player.load(game.scene);

  const hud = new HUD(controller, game, () => world.dayNight.clockLabel);
  const minimap = new Minimap(controller);
  const saveSystem = new SaveSystem(controller, camera, () => world.timeOfDay);
  const effects = new Effects(game.scene);
  let playerCombat: PlayerCombat | null = null;
  const questManager = new QuestManager(progression, () =>
    playerCombat?.activeItem ?? { itemId: 'basic-brawl', category: 'style', name: 'หมัด' },
  );
  const questBoard = new QuestBoard(questManager, progression);
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
    progression,
  );
  // ร้านสุ่มของดีลเลอร์ (Phase 7) — onChange รีเฟรชชุดสกิลของ PlayerCombat หลัง equip/สุ่ม
  const dealerShop = new DealerShopUI(itemInventory, () => playerCombat?.refreshLoadout());
  const npcManager = new NPCManager(game.scene, input, controller, world.collision, {
    openBoatShop: () => boatManager.openShop(),
    openQuestBoard: () => {
      controller.setControlsEnabled(false);
      questBoard.open(() => controller.setControlsEnabled(true));
    },
    openDealerShop: () => {
      controller.setControlsEnabled(false);
      dealerShop.open(() => controller.setControlsEnabled(true));
    },
  });
  new GraphicsSettings(graphics);

  // ระบบบังคับบนจอสัมผัสแบบ RoV (เฉพาะอุปกรณ์มีจอสัมผัส หรือ ?touch=1)
  let touchControls: TouchControls | null = null;
  if (TouchControls.isTouchDevice()) {
    touchControls = new TouchControls(input);
    input.attachTouch(touchControls);
  }

  // มอนสเตอร์ + ระบบต่อสู้ (Phase 4-5) — callbacks อ้าง playerCombat แบบ late-bind
  const rewardContributions = new RewardContributionTracker<Monster>();
  const monsterManager = new MonsterManager(
    game.scene,
    controller,
    world.collision,
    effects,
    graphics,
    {
      onPlayerHit: (amount) => {
        playerCombat?.notifyDamaged();
        hud.flashDamage();
        // ตัวเลขดาเมจแดงเด้งเหนือหัวผู้เล่น (แยกสีจากเลขทำมอนสเตอร์ที่เป็นเหลือง)
        if (amount > 0) effects.spawnDamageNumber(controller.position, amount, '#ff6b6b');
      },
      modifyIncomingDamage: (attack) =>
        playerCombat?.modifyIncomingDamage(attack) ?? attack.amount,
      onMonsterDamaged: (monster, amount) =>
        effects.spawnDamageNumber(monster.group.position, amount),
      onPlayerDefeated: () => {
        spawnManager.respawn();
        hud.flashDamage();
      },
      onRewardContribution: (monster, damage, killed, source) => {
        const type = monster.type;
        const contribution = rewardContributions.record(
          monster,
          type.id,
          damage,
          killed,
          source,
        );
        if (!contribution) return;
        progression.grantEnemyRewards(
          {
            id: type.id,
            level: type.level,
            isBoss: type.kind === 'boss',
            reward: type.reward,
          },
          contribution,
        );
        const position = monster.group.position;
        progression.events.emit('monster:killed', {
          monsterId: type.id,
          monsterType: type.kind,
          isBoss: type.kind === 'boss',
          position: { x: position.x, y: position.y, z: position.z },
          contribution,
        });
      },
    },
  );
  playerCombat = new PlayerCombat(
    game.scene,
    input,
    controller,
    monsterManager,
    effects,
    touchControls,
    itemInventory.loadout,
    () => itemInventory.save(),
    progression,
  );
  player.bindActionState(() => ({
    combatState: playerCombat?.state ?? 'idle',
    category: playerCombat?.activeItem.category ?? 'style',
    attackProgress: playerCombat ? 1 - playerCombat.attackCooldownFraction : 0,
    hitReactionId: playerCombat?.hitReactionId ?? 0,
    hitReactionAngle: playerCombat?.hitReactionAngle ?? 0,
  }));
  hud.bindGuard(() => playerCombat.guardFraction, () => playerCombat.blocking);
  // debug hook สำหรับเทสต์อัตโนมัติ/ดีบักในเบราว์เซอร์ (อ่านอย่างเดียว)
  (window as unknown as { __combat?: PlayerCombat }).__combat = playerCombat;
  const equipmentVisuals = new EquipmentVisuals(
    player.group,
    () => playerCombat?.activeItem ?? { itemId: 'basic-brawl', category: 'style', name: 'หมัด' },
    player.equipmentSockets,
  );
  const pbrPerformance = new PBRPerformanceMonitor(game);

  const progressionHud = new ProgressionHUD(progression, controller);
  let controlsBeforeStats = true;
  new StatsPanel(progression, (open) => {
    if (open) controlsBeforeStats = controller.inputEnabled;
    controller.setControlsEnabled(open ? false : controlsBeforeStats);
  }, () => playerCombat?.masteryItems ?? [{ itemId: 'combat', category: 'style', name: 'มือเปล่า' }]);
  const questTracker = new QuestTracker(questManager);
  const rewardFeed = new RewardFeed(progression);
  const progressionDebug = new ProgressionDebugPanel(
    progression,
    questManager,
    () => playerCombat!.activeItem,
  );
  progression.events.on('player:level-up', () => {
    effects.spawnShockwave(controller.position, 3.5, 0xffdf74);
  });

  touchControls?.bindCooldowns(
    () =>
      input.controlMode === 'boat'
        ? boatManager.boostCooldownFraction
        : controller.dashCooldownFraction,
    () => playerCombat.attackCooldownFraction,
  );

  // ตกทะเล → กลับ Safe Zone ของหมู่บ้าน ไม่วนเกิดซ้ำในตำแหน่งอันตราย
  controller.onDrown = () => {
    spawnManager.respawn();
  };

  game.add(world);
  game.add(controller);
  game.add(boatManager);
  game.add(player);
  game.add(camera);
  game.add(playerCombat);
  game.add(equipmentVisuals);
  game.add(effects);
  game.add(npcManager);
  game.add(monsterManager);
  game.add(saveSystem);
  game.add(progression);
  game.add(progressionHud);
  game.add(questTracker);
  game.add(rewardFeed);
  game.add(progressionDebug);
  game.add(pbrPerformance);
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
