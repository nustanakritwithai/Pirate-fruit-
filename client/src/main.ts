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
import { NavalCombat } from './boat/NavalCombat';
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
import { parseEconomyDocument } from './trade/living/LivingTradePersistence';
import { initializeRemoteTrade } from './trade/RemoteTradeClient';
import { initializeRemoteQuest } from './quest/RemoteQuestClient';
import { RemoteQuestSync } from './quest/RemoteQuestSync';
import { initializeRemoteMonster } from './monster/RemoteMonsterClient';
import { RemoteMonsterSync } from './monster/RemoteMonsterSync';
import { initializeRemoteProgression, reconcileProgression } from './progression/RemoteProgressionClient';
import { initializeRealtime } from './realtime/RealtimeClient';
import { RemotePlayers } from './realtime/RemotePlayers';
import { EconomyDebugPanel } from './trade/living/EconomyDebugPanel';
import { TradeShopUI } from './ui/TradeShopUI';
import { TradeRouteHint } from './ui/TradeRouteHint';
import { EconomyMobileHUD } from './ui/EconomyMobileHUD';
import { EconomyPanel } from './ui/EconomyPanel';
import { subscribePlayerEconomyEvents, classifyPlayerEventPriority } from './trade/living/PlayerEconomyEvents';
import type { ClassifiedEconomyEvent } from './trade/living/EconomyEventClassifier';
import { CargoHUD } from './ui/CargoHUD';
import { preloadPirateGameAssets } from './art/PirateAssetLibrary';
import { initializeGamePersistence } from './persistence/GamePersistence';
import {
  getRemoteSession,
  initializeRemoteSession,
  recoverRemoteSession,
} from './session/RemoteSession';
import { REMOTE_ECONOMY_TICK_INTERVAL_MS } from '@pirate-fruit/shared';
import { ServerStatusBadge } from './ui/ServerStatusBadge';

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

  // Establish identity first when staged remote sessions are enabled. Failure remains non-blocking.
  const initialSession = await initializeRemoteSession();
  // Hydrate save repositories once before gameplay objects read their synchronous storage view.
  const persistence = await initializeGamePersistence();
  const serverStatus = (
    persistence.requestedMode === 'remote'
    || persistence.requestedEconomyMode === 'remote'
  ) ? new ServerStatusBadge() : null;
  let reconnecting = initialSession.mode === 'offline';
  const renderServerStatus = (): void => {
    serverStatus?.update({
      session: getRemoteSession().mode,
      save: persistence.activeMode,
      economy: persistence.activeEconomyMode,
      reconnecting,
      saveFallbackReason: persistence.readSaveFallbackReason(),
    });
  };
  persistence.subscribeStatus(renderServerStatus);
  renderServerStatus();
  const graphics = loadGraphicsProfile();
  const game = new Game(container, graphics);
  const input = new Input(game.renderer.domElement);
  const [worldTextures] = await Promise.all([
    loadWorldTextures(
      Math.min(graphics.textureAnisotropy, game.renderer.capabilities.getMaxAnisotropy()),
    ),
    preloadPirateGameAssets(),
  ]);
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
  const progression = new ProgressionManager({
    resources: controller,
    storage: persistence.storage,
  });
  // อินเวนทอรีอาวุธ/ผลไม้ + สถานะ SkillLoadout (Phase 7) — ProgressionManager เป็นกระเป๋าเงินร่วม
  // mastery ต่อชิ้นจริงขับการปลดล็อกสกิล (Blox Fruits): grind ไอเทมนั้น ๆ เพื่อปลด X/C/ไม้ตาย
  const itemInventory = new ItemInventory(
    progression,
    (id) => progression.getMasteryLevel(id),
    persistence.storage,
  );

  const spawnManager = new SpawnManager(controller, world.collision);

  // โหลดตำแหน่งเดิมเฉพาะจุดที่ยังปลอดภัย ไม่งั้นกลับจุดเกิดกลางหมู่บ้าน
  const saved = SaveSystem.load(persistence.storage);
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
    persistence.storage,
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
    persistence.storage,
  );
  const tradeManager = new TradeManager(
    progression,
    boatManager.selectedBoatId ?? 'training-dinghy',
    undefined,
    persistence.storage,
  );
  tradeManager.living.setServerReadOnly(persistence.activeEconomyMode === 'remote');
  // S8: Server ตัดสินซื้อ/ขายเมื่อ VITE_ENABLE_TRADE_SERVER เปิด + session online
  // (null = โหมด local เดิมทุกประการ — flag ปิดใน production จนกว่าจะ verify)
  tradeManager.setRemoteExecutor(initializeRemoteTrade());
  // S10: Server ตัดสินสถานะเควสต์+รางวัลเมื่อ VITE_ENABLE_QUEST_SERVER เปิด + session online
  // (null = โหมด local เดิมทุกประการ — flag ปิดใน production จนกว่าจะ verify)
  const remoteQuest = initializeRemoteQuest();
  if (remoteQuest) {
    const questSync = new RemoteQuestSync(remoteQuest, questManager);
    questManager.setRemoteSync(questSync);
    void questSync.reconcile();
  }
  // S11: Server ตัดสินรางวัลการฆ่ามอนสเตอร์เมื่อ VITE_ENABLE_MONSTER_SERVER เปิด
  // + session online (null = แจกรางวัล local เดิม — flag ปิดใน production จนกว่าจะ verify)
  const remoteMonster = initializeRemoteMonster();
  if (remoteMonster) {
    const monsterSync = new RemoteMonsterSync(remoteMonster, progression);
    progression.setRemoteEnemyRewarder((enemy, contribution) =>
      monsterSync.enqueueKill(enemy, contribution));
  }
  // S12: level/exp ทางการมาจาก Server — บูตแล้วเทียบ ถ้า Server นำหน้าเติมส่วนต่างเข้า local
  const remoteProgression = initializeRemoteProgression();
  if (remoteProgression) void reconcileProgression(remoteProgression, progression);
  const tradeShop = new TradeShopUI(tradeManager);
  const tradeRouteHint = new TradeRouteHint();
  const economyDebug = new EconomyDebugPanel(tradeManager.living);
  const economyHud = new EconomyMobileHUD(tradeManager);
  persistence.subscribeStatus((event) => {
    if (event.scope === 'economy') {
      tradeManager.living.setServerReadOnly(event.mode === 'remote');
    }
    economyHud.notifyStatus(event.message, event.mode === 'local');
  });
  const economyPanel = new EconomyPanel(tradeManager, () => islandManager.activeIsland);
  economyHud.bindPanel(
    economyPanel,
    () => {
      controller.setControlsEnabled(false);
      economyPanel.open(() => controller.setControlsEnabled(true));
    },
    () => {
      controller.setControlsEnabled(false);
      economyPanel.openAlerts(() => controller.setControlsEnabled(true));
    },
  );
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

  subscribePlayerEconomyEvents((event) => {
    const priority = classifyPlayerEventPriority(event.type);
    if (priority === 'silent') return;
    const classified: ClassifiedEconomyEvent = {
      id: `player-${event.tick}-${event.type}`,
      priority: priority === 'critical' ? 'critical' : 'medium',
      kind: 'quest',
      mergeKey: `player:${event.type}`,
      message: event.message.slice(0, 30),
      fullMessage: event.message,
      icon: priority === 'critical' ? '⚠️' : '📦',
      commodityId: event.commodityId,
      createdAt: Date.now(),
      toastEligible: true,
      isAlert: priority === 'critical',
    };
    economyHud.ingestPlayerEvent(classified);
  });

  let livingTickAccum = 0;
  let remotePollAccum = 0;
  let remotePollInFlight = false;
  const refreshEconomyViews = (): void => {
    tradeRouteHint.refresh();
    tradeShop.refresh();
    economyDebug.refresh();
    economyPanel.refresh();
  };
  const pollRemoteEconomy = (): void => {
    if (remotePollInFlight) return;
    remotePollInFlight = true;
    void persistence.refreshEconomy()
      .then((state) => {
        const world = state?.world ? parseEconomyDocument(state.world) : null;
        if (!world) return;
        tradeManager.living.replaceState(world);
        tradeManager.living.setServerReadOnly(persistence.activeEconomyMode === 'remote');
        refreshEconomyViews();
      })
      .finally(() => {
        remotePollInFlight = false;
      });
  };
  // S9: Server push โลกเศรษฐกิจผ่าน WebSocket — ระหว่างเชื่อมอยู่หยุด poll 5 วิ
  // (WS หลุด/ปิด flag = กลับไป poll เดิมอัตโนมัติ ไม่มีช่วงมืด)
  // S13: ผู้เล่นคนอื่นบนเกาะเดียวกัน (เปิดด้วย VITE_ENABLE_MULTIPLAYER) — แสดงผลล้วน
  const multiplayerEnabled = import.meta.env.VITE_ENABLE_MULTIPLAYER === 'true'
    || import.meta.env.VITE_ENABLE_MULTIPLAYER === '1';
  const remotePlayers = multiplayerEnabled
    ? new RemotePlayers(game.scene, islandManager.activeIsland)
    : null;
  if (remotePlayers) game.add(remotePlayers);
  const realtime = initializeRealtime({
    onEconomy: (state) => {
      const world = state?.world ? parseEconomyDocument(state.world) : null;
      if (!world) return;
      persistence.storage.replaceEconomySnapshot({ schemaVersion: state.schemaVersion, world: state.world });
      tradeManager.living.replaceState(world);
      tradeManager.living.setServerReadOnly(true);
      refreshEconomyViews();
    },
    onResync: () => pollRemoteEconomy(),
    onAnnouncement: (message, level) => economyHud.notifyStatus(message, level === 'warning'),
    onPresence: (snapshot) => remotePlayers?.applyPresence(snapshot),
    onPresenceLeave: (playerId) => remotePlayers?.remove(playerId),
  });
  realtime?.start();
  // debug/E2E hook (อ่าน+ส่ง move ตรง ๆ ได้) — ให้ browser-smoke ปั๊ม presence
  // จากฝั่ง Node ได้แน่นอน โดยไม่พึ่ง setInterval ในหน้าเว็บที่ headless throttle
  (window as unknown as { __realtime?: typeof realtime }).__realtime = realtime;
  // S13: รายงานตำแหน่งตัวเองให้ Server relay ทุก 100ms ผ่าน setInterval —
  // จงใจไม่ผูกกับ game loop (rAF) เพราะแท็บพื้นหลังโดน throttle จน presence ไม่ไหล
  if (realtime && multiplayerEnabled) {
    setInterval(() => {
      remotePlayers?.setIsland(islandManager.activeIsland);
      if (!realtime.connected) return;
      const position = controller.position;
      const onBoat = boatManager.riderState !== 'off';
      realtime.sendMove({
        islandId: islandManager.activeIsland,
        x: position.x,
        y: position.y,
        z: position.z,
        heading: controller.heading,
        onBoat,
        boatId: onBoat ? boatManager.selectedBoatId ?? undefined : undefined,
      });
    }, 100);
  }
  game.add({
    update: (dt: number) => {
      const elapsedMs = dt * 1000;
      if (persistence.requestedEconomyMode === 'remote' && !realtime?.connected) {
        remotePollAccum += elapsedMs;
        if (remotePollAccum >= REMOTE_ECONOMY_TICK_INTERVAL_MS) {
          remotePollAccum = 0;
          pollRemoteEconomy();
        }
      }
      if (persistence.activeEconomyMode === 'local') {
        livingTickAccum += elapsedMs;
        if (livingTickAccum >= LIVING_TICK_INTERVAL_MS) {
          livingTickAccum = 0;
          tradeManager.living.tick();
          refreshEconomyViews();
        }
      } else {
        // The Server owns time while online; never run a second browser economy tick.
        livingTickAccum = 0;
      }
      economyHud.update(dt, {
        shopOpen: tradeShop.isOpen,
        panelOpen: economyPanel.isOpen,
        islandId: islandManager.activeIsland,
      });
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

  // ใช้ state ของปุ่มชุดเดียวกันทุกอุปกรณ์: มือถือได้จอยเต็มชุด ส่วน Desktop ได้ Combat HUD
  // แบบย่อพร้อมคีย์ลัด/วงแหวน/เวลาคูลดาวน์ โดยไม่สร้างโซนสัมผัสดักเมาส์ทั้งจอ
  const touchControls = new TouchControls(input);
  input.attachTouch(touchControls);

  // คีย์ลัดใช้ยา (Z/X + ปุ่มมือถือ) + แถบ quickslot
  hotkeyManager = new HotkeyManager(
    input,
    controller,
    itemInventory,
    touchControls,
    touchControls.usesTouchLayout,
  );
  // กระเป๋าเก็บของ (ปุ่ม 🎒 / คีย์ B) — ติดตั้ง/กิน/จัดยาลงช่องลัด
  let controlsBeforeInv = true;
  new InventoryUI(
    itemInventory,
    () => {
      playerCombat?.refreshLoadout();
      hotkeyManager?.refresh();
      controller.setDevilFruitUser(playerCombat?.hasDevilFruit ?? false);
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

  // Naval Combat (เรือ Phase 2-3) — เรือโจรสลัด AI + ปืนใหญ่ + Boarding
  const navalCombat = new NavalCombat(
    game.scene,
    input,
    controller,
    world.collision,
    boatManager,
    monsterManager,
    itemInventory,
    effects,
    progression,
    worldTextures,
    graphics,
    (message) => touchControls?.notify(message),
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
    navalCombat,
    () => camera.yaw,
  );
  controller.setDevilFruitUser(playerCombat.hasDevilFruit);
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
  (window as unknown as { __naval?: NavalCombat }).__naval = navalCombat;
  (window as unknown as { __monsters?: MonsterManager }).__monsters = monsterManager;
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
  touchControls?.bindCannonCooldown(() => navalCombat.playerFireCooldownFraction);
  navalCombat.onCannonArmed = (side) => touchControls?.setCannonArmed(side);

  // ตกทะเล → กลับ Safe Zone ของหมู่บ้าน ไม่วนเกิดซ้ำในตำแหน่งอันตราย
  controller.onDrown = () => {
    spawnManager.respawn();
  };

  game.add(world);
  game.add(islandManager);
  game.add(controller);
  game.add(boatManager);
  game.add(navalCombat);
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

  // Run synchronous gameplay serializers before draining the debounced remote queue.
  // Local mirrors are updated first, so a browser that cannot finish network I/O still
  // retains the latest recoverable save.
  window.addEventListener('pagehide', () => {
    saveSystem.save();
    progression.save();
    itemInventory.save();
    void persistence.flush();
  });

  // A sleeping Render Free instance must not leave this browser permanently Local.
  // Once the HttpOnly session succeeds, serialize the Local mirror and reload once;
  // the normal bootstrap then performs the guarded one-time Remote migration.
  if (initialSession.mode === 'offline' && persistence.requestedMode === 'remote') {
    void recoverRemoteSession({
      attempts: 5,
      maxDelayMs: 15_000,
      requestTimeoutMs: 70_000,
    }).then(async (recovered) => {
      if (recovered.mode === 'online') {
        saveSystem.save();
        progression.save();
        itemInventory.save();
        await persistence.flush().catch(() => undefined);
        window.location.reload();
        return;
      }
      reconnecting = false;
      renderServerStatus();
    });
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
