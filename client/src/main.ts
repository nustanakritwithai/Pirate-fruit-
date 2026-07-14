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
import { PotionShopUI } from './ui/PotionShopUI';
import { InventoryUI } from './ui/InventoryUI';
import { HotkeyManager } from './combat/HotkeyManager';
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
import { IslandManager } from './island/IslandManager';
import { TradeManager } from './trade/TradeManager';
import { LIVING_TICK_INTERVAL_MS } from './trade/living/LivingTradeConfig';
import { EconomyDebugPanel } from './trade/living/EconomyDebugPanel';
import { TradeShopUI } from './ui/TradeShopUI';
import { TradeRouteHint } from './ui/TradeRouteHint';
import { EconomyNewsTicker } from './ui/EconomyNewsTicker';
import { CargoHUD } from './ui/CargoHUD';

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
  world.setFocusProvider(() => controller.position);
  const progression = new ProgressionManager({ resources: controller });
  // อินเวนทอรีอาวุธ/ผลไม้ + สถานะ SkillLoadout (Phase 7) — ProgressionManager เป็นกระเป๋าเงินร่วม
  // mastery ต่อชิ้นจริงขับการปลดล็อกสกิล (Blox Fruits): grind ไอเทมนั้น ๆ เพื่อปลด X/C/ไม้ตาย
  const itemInventory = new ItemInventory(progression, (id) => progression.getMasteryLevel(id));

  const spawnManager = new SpawnManager(controller, world.collision);

  // โหลดตำแหน่งเดิมเฉพาะจุดที่ยังปลอดภัย ไม่งั้นกลับจุดเกิดกลางหมู่บ้าน
  const saved = SaveSystem.load();
  if (saved) spawnManager.restoreCheckpoint(saved);
  if (saved && spawnManager.isSafeSavedPosition(saved)) {
    controller.teleport(
      saved.x,
      Math.max(saved.y, world.collision.heightAt(saved.x, saved.z)),
      saved.z,
    );
    controller.heading = saved.heading ?? 0;
    camera.yaw = saved.cameraYaw ?? 0;
  } else {
    spawnManager.teleportToCheckpoint();
  }
  controller.hp = Math.min(controller.hpMax, Math.max(1, saved?.hp ?? controller.hpMax));
  controller.energy = Math.min(
    controller.energyMax,
    Math.max(0, saved?.energy ?? controller.energyMax),
  );
  controller.mp = Math.min(controller.mpMax, Math.max(0, saved?.mp ?? controller.mpMax));
  world.setTimeOfDay(saved?.worldTime ?? 0.31);

  const player = new Player(controller, graphics, game.renderer.capabilities.getMaxAnisotropy());
  await player.load(game.scene);

  const hud = new HUD(controller, game, () => world.dayNight.clockLabel);
  const minimap = new Minimap(controller);
  const saveSystem = new SaveSystem(
    controller,
    camera,
    () => world.timeOfDay,
    () => spawnManager.checkpoint,
  );
  const islandManager = new IslandManager(controller, spawnManager, world.islandDetailRoots);
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
  const tradeManager = new TradeManager(progression, boatManager.selectedBoatId ?? 'training-dinghy');
  const tradeShop = new TradeShopUI(tradeManager);
  const tradeRouteHint = new TradeRouteHint();
  const economyDebug = new EconomyDebugPanel(tradeManager.living);
  const economyNews = new EconomyNewsTicker(tradeManager);
  const cargoHud = new CargoHUD(tradeManager);
  cargoHud.refresh();
  tradeRouteHint.bindTradeManager(tradeManager);
  tradeManager.onTransaction((result) => {
    if (!result.ok || !result.action || !result.islandId || !result.commodityId) return;
    progression.events.emit('trade:completed', {
      action: result.action,
      islandId: result.islandId,
      commodityId: result.commodityId,
      quantity: Math.abs(result.quantityDelta ?? 0),
    });
    cargoHud.refresh();
  });

  let livingTickAccum = 0;
  game.add({
    update: (dt: number) => {
      livingTickAccum += dt * 1000;
      if (livingTickAccum >= LIVING_TICK_INTERVAL_MS) {
        livingTickAccum = 0;
        tradeManager.living.tick();
        tradeRouteHint.refresh();
        tradeShop.refresh();
        economyDebug.refresh();
      }
      economyNews.update(dt, tradeShop.isOpen);
    },
  });
  // ร้านสุ่มของดีลเลอร์ (Phase 7) — onChange รีเฟรชชุดสกิลของ PlayerCombat หลัง equip/สุ่ม
  const dealerShop = new DealerShopUI(itemInventory, () => playerCombat?.refreshLoadout());
  // ร้านยา (พ่อค้าเปา) — ซื้อยาแล้วรีเฟรชช่องลัด ; hotkeyManager สร้างหลัง touchControls (late-bind)
  let hotkeyManager: HotkeyManager | null = null;
  const potionShop = new PotionShopUI(itemInventory, () => hotkeyManager?.refresh());
  const npcManager = new NPCManager(game.scene, input, controller, world.collision, {
    openBoatShop: (npc) => boatManager.openShop(npc.dockId),
    openQuestBoard: () => {
      controller.setControlsEnabled(false);
      questBoard.open(() => controller.setControlsEnabled(true));
    },
    openDealerShop: () => {
      controller.setControlsEnabled(false);
      dealerShop.open(() => controller.setControlsEnabled(true));
    },
    openPotionShop: () => {
      controller.setControlsEnabled(false);
      potionShop.open(() => controller.setControlsEnabled(true));
    },
    openTradeShop: (npc) => {
      controller.setControlsEnabled(false);
      tradeShop.open(npc.islandId, npc.tradeVendorId, () => controller.setControlsEnabled(true));
    },
  });
  new GraphicsSettings(graphics);

  // ระบบบังคับบนจอสัมผัสแบบ RoV (เฉพาะอุปกรณ์มีจอสัมผัส หรือ ?touch=1)
  let touchControls: TouchControls | null = null;
  if (TouchControls.isTouchDevice()) {
    touchControls = new TouchControls(input);
    input.attachTouch(touchControls);
  }

  // คีย์ลัดใช้ยา (Z/X + ปุ่มมือถือ) + แถบ quickslot
  hotkeyManager = new HotkeyManager(
    input,
    controller,
    itemInventory,
    touchControls,
    TouchControls.isTouchDevice(),
  );
  // กระเป๋าเก็บของ (ปุ่ม 🎒 / คีย์ B) — ติดตั้ง/กิน/จัดยาลงช่องลัด
  let controlsBeforeInv = true;
  new InventoryUI(
    itemInventory,
    () => {
      playerCombat?.refreshLoadout();
      hotkeyManager?.refresh();
    },
    (open) => {
      if (open) controlsBeforeInv = controller.inputEnabled;
      controller.setControlsEnabled(open ? false : controlsBeforeInv);
    },
  );

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
    skillAnimationProgress: playerCombat?.skillAnimationProgress ?? 1,
    skillAnimationReleaseProgress: playerCombat?.skillAnimationReleaseProgress ?? 0.3,
    skillAnimationType: playerCombat?.skillAnimationType,
    skillAnimationVariant: playerCombat?.skillAnimationVariant ?? 0,
    skillAnimationUltimate: playerCombat?.skillAnimationUltimate ?? false,
    skillAnimationCategory: playerCombat?.skillAnimationCategory ?? 'style',
  }));
  hud.bindGuard(() => playerCombat.guardFraction, () => playerCombat.blocking);
  // debug hook สำหรับเทสต์อัตโนมัติ/ดีบักในเบราว์เซอร์ (อ่านอย่างเดียว)
  (window as unknown as { __combat?: PlayerCombat }).__combat = playerCombat;
  (window as unknown as { __boat?: BoatManager }).__boat = boatManager;
  const equipmentVisuals = new EquipmentVisuals(
    player.group,
    () => playerCombat?.activeItem ?? { itemId: 'basic-brawl', category: 'style', name: 'หมัด' },
    player.equipmentSockets,
  );
  playerCombat.bindVisualAnchors(equipmentVisuals);
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

  // Mastery ต่อชิ้นขึ้นเลเวล → ถ้าเป็นไอเทมที่ติดตั้งอยู่ รีเฟรชชุดสกิล (อาจปลดท่าใหม่)
  progression.events.on('mastery:level-up', ({ itemId }) => {
    const equipped = playerCombat?.masteryItems.some((it) => it.itemId === itemId);
    if (equipped) playerCombat?.refreshLoadout();
  });
  // ปลดล็อกสกิลใหม่ (mastery ถึงเกณฑ์) → แจ้งเตือน + รีเฟรชปุ่ม
  progression.events.on('skill:unlocked', ({ itemId, skillName }) => {
    const equipped = playerCombat?.masteryItems.some((it) => it.itemId === itemId);
    if (equipped) {
      playerCombat?.refreshLoadout();
      touchControls?.notify(`✨ ปลดล็อกสกิล ${skillName}!`);
    }
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
  game.add(islandManager);
  game.add(controller);
  game.add(boatManager);
  game.add(player);
  game.add(camera);
  game.add(playerCombat);
  game.add(hotkeyManager);
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
  game.add({ update: () => {
    tradeRouteHint.setIsland(islandManager.activeIsland);
    tradeRouteHint.setVisible(!tradeShop.isOpen);
    const boatId = boatManager.selectedBoatId;
    if (boatId) tradeManager.setBoat(boatId);
  } });
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
