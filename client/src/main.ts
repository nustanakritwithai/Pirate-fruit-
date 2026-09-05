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
import {
  LIVING_WORLD_PORTAL,
  POCKET_MONSTER_WORLD_PORTAL,
  WorldPortal,
  resolveSafePortalArrival,
} from './world/WorldPortal';
import { NPCManager } from './npc/NPCManager';
import { BoatManager } from './boat/BoatManager';
import { NavalCombat } from './boat/NavalCombat';
import { BoatWorldClient } from './boat/BoatWorldClient';
import { MonsterManager } from './monster/MonsterManager';
import { PlayerCombat } from './combat/PlayerCombat';
import { ItemInventory } from './shop/ItemInventory';
import { initializeRemoteShop } from './shop/RemoteShopClient';
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
import {
  PocketMonsterParentPresence,
  createBrowserParentPresenceHost,
  resolvePocketMonsterParentOrigin,
} from './realtime/PocketMonsterParentPresence';
import { SharedMonsterClient, resolveSharedMonsterPlayerDamage } from './monster/SharedMonsterClient';
import { EconomyDebugPanel } from './trade/living/EconomyDebugPanel';
import { TradeShopUI } from './ui/TradeShopUI';
import { TradeRouteHint } from './ui/TradeRouteHint';
import { EconomyMobileHUD } from './ui/EconomyMobileHUD';
import { EconomyPanel } from './ui/EconomyPanel';
import { subscribePlayerEconomyEvents, classifyPlayerEventPriority } from './trade/living/PlayerEconomyEvents';
import type { ClassifiedEconomyEvent } from './trade/living/EconomyEventClassifier';
import { CargoHUD } from './ui/CargoHUD';
import { initializeGamePersistence } from './persistence/GamePersistence';
import {
  getRemoteSession,
  initializeRemoteSession,
  recoverRemoteSession,
  refreshRemoteSession,
  resolveRemoteApiUrl,
} from './session/RemoteSession';
import { runCharacterGate } from './session/CharacterGate';
import {
  REMOTE_ECONOMY_TICK_INTERVAL_MS,
  PVP_MELEE_RANGE,
  PVP_SKILL_RANGE,
  WORLD_MONSTER_MELEE_RANGE,
  WORLD_MONSTER_SKILL_RANGE,
  type CombatStatCategory,
} from '@pirate-fruit/shared';
import { ServerStatusBadge } from './ui/ServerStatusBadge';
import {
  AudioRuntimeBridge,
  AudioSettingsUI,
  createAudioManager,
} from './audio';
import type { OnboardingDirector } from './onboarding/OnboardingDirector';
import { createAuthoritativeResyncHandler } from './realtime/AuthoritativeResync';
import {
  fetchRuntimeFeatures,
  resolveSharedMonsterMode,
  shouldSuppressLocalMonsters,
} from './realtime/RuntimeFeatures';

async function main(): Promise<void> {
  const container = document.getElementById('app')!;

  // A1 audio is presentation-only and defaults off. Even when enabled this construction is
  // inert: AudioContext and music requests begin only after the first explicit player gesture.
  const audio = createAudioManager();
  let audioBridge: AudioRuntimeBridge | null = null;
  let onboarding: OnboardingDirector | null = null;
  if (audio.enabled) {
    audio.bindAutoplayUnlock(document);
    audio.bindUiSounds(document);
    new AudioSettingsUI(audio);
    document.addEventListener('visibilitychange', () => {
      void audio.handleVisibility(document.hidden);
    });
  }

  // เบราว์เซอร์อนุญาต fullscreen หลัง gesture เท่านั้น; gesture แรกของเกมจะขอให้อัตโนมัติ
  new FullscreenManager();

  // หน้าจอโหลดชั่วคราวระหว่างเตรียมโลก
  const loading = document.createElement('div');
  loading.className = 'game-loading';
  loading.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#fff;font-size:20px;background:#06121f;z-index:100;';
  loading.textContent = 'กำลังโหลดเกม...';
  document.body.appendChild(loading);

  // S18: หน้าเลือก/สร้างตัวละคร (MMORPG login) — resolve เมื่อเลือกแล้ว; flag ปิด = ข้ามทันที
  await runCharacterGate();
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
  const worldTextures = await loadWorldTextures(
    Math.min(graphics.textureAnisotropy, game.renderer.capabilities.getMaxAnisotropy()),
  );
  const world = new World(game.scene, game.renderer, worldTextures, graphics);

  const camera: ThirdPersonCamera = new ThirdPersonCamera(
    game.camera,
    input,
    () => controller.position,
    (x, z) => world.collision.heightAt(x, z),
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
  itemInventory.setRemoteExecutor(initializeRemoteShop());

  const spawnManager = new SpawnManager(controller, world.collision);

  const portalTargetOrigin = new URLSearchParams(window.location.search).get('parentOrigin')
    || window.location.origin;
  const pocketMonsterParentOrigin = resolvePocketMonsterParentOrigin(
    window.location.search,
    window.location.origin,
    window.parent !== window,
  );
  const pocketMonsterPortal = new WorldPortal(
    game.scene,
    controller,
    (x, z) => world.collision.heightAt(x, z),
    () => {
      window.parent.postMessage({
        type: 'pocketmonster:world-warp-v1',
        world: 'pocket-monster',
        panel: 'throw',
        source: 'pirate-fruit-portal',
      }, portalTargetOrigin);
    },
    POCKET_MONSTER_WORLD_PORTAL,
  );
  const livingWorldPortal = new WorldPortal(
    game.scene,
    controller,
    (x, z) => world.collision.heightAt(x, z),
    () => {
      window.parent.postMessage({
        type: 'pocketmonster:world-warp-v1',
        world: 'living-world',
        panel: 'human',
        source: 'pirate-fruit-living-portal',
      }, portalTargetOrigin);
    },
    LIVING_WORLD_PORTAL,
  );

  // โหลดตำแหน่งเดิมเฉพาะจุดที่ยังปลอดภัย ไม่งั้นกลับจุดเกิดกลางหมู่บ้าน
  const saved = resolveSafePortalArrival(SaveSystem.load(persistence.storage));
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
  if (saved?.hp !== undefined && saved.hp <= 0) {
    spawnManager.respawn();
    controller.hp = controller.hpMax;
  } else {
    controller.hp = Math.min(controller.hpMax, Math.max(1, saved?.hp ?? controller.hpMax));
  }
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
  boatManager.onSelectionChanged((boatId) => tradeManager.setBoat(boatId));
  // A requested Server economy must never fork into a browser simulation when the
  // network is temporarily unavailable. Keep the last snapshot read-only and poll.
  tradeManager.living.setServerReadOnly(persistence.requestedEconomyMode === 'remote');
  // S8: Server ตัดสินซื้อ/ขายเมื่อ VITE_ENABLE_TRADE_SERVER เปิด + session online
  // (null = โหมด local เดิมทุกประการ — flag ปิดใน production จนกว่าจะ verify)
  tradeManager.setRemoteExecutor(initializeRemoteTrade());
  // S10: Server ตัดสินสถานะเควสต์+รางวัลเมื่อ VITE_ENABLE_QUEST_SERVER เปิด + session online
  // (null = โหมด local เดิมทุกประการ — flag ปิดใน production จนกว่าจะ verify)
  const remoteQuest = initializeRemoteQuest();
  const questSync = remoteQuest ? new RemoteQuestSync(remoteQuest, questManager) : null;
  if (questSync) {
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
  if (questSync || remoteProgression) {
    let reconcileInFlight = false;
    setInterval(() => {
      if (document.hidden || reconcileInFlight) return;
      reconcileInFlight = true;
      void Promise.all([
        questSync?.reconcile(),
        remoteProgression ? reconcileProgression(remoteProgression, progression) : undefined,
      ]).finally(() => { reconcileInFlight = false; });
    }, 60_000);
  }
  if (initialSession.mode === 'online') {
    setInterval(() => { if (!document.hidden) void refreshRemoteSession(); }, 6 * 60 * 60 * 1_000);
    document.addEventListener('visibilitychange', () => {
      const expiresAt = Date.parse(getRemoteSession().session?.expiresAt ?? '');
      if (!document.hidden && Number.isFinite(expiresAt) && expiresAt - Date.now() < 24 * 60 * 60 * 1_000) {
        void refreshRemoteSession();
      }
    });
  }
  const tradeShop = new TradeShopUI(tradeManager);
  const tradeRouteHint = new TradeRouteHint();
  const economyDebug = new EconomyDebugPanel(tradeManager.living);
  const economyHud = new EconomyMobileHUD(tradeManager);
  let requestFreshEconomy = (): void => undefined;
  persistence.subscribeStatus((event) => {
    if (event.scope === 'economy') {
      tradeManager.living.setServerReadOnly(persistence.requestedEconomyMode === 'remote');
    }
    economyHud.notifyStatus(event.message, event.mode === 'local');
  });
  const economyPanel = new EconomyPanel(tradeManager, () => islandManager.activeIsland);
  economyHud.bindPanel(
    economyPanel,
    () => {
      controller.setControlsEnabled(false);
      requestFreshEconomy();
      economyPanel.open(() => controller.setControlsEnabled(true));
    },
    () => {
      controller.setControlsEnabled(false);
      requestFreshEconomy();
      economyPanel.openAlerts(() => controller.setControlsEnabled(true));
    },
  );
  const cargoHud = new CargoHUD(tradeManager);
  cargoHud.refresh();
  tradeRouteHint.bindTradeManager(tradeManager);
  tradeManager.onTransaction((result) => {
    if (!result.ok) {
      audio.play('ui.reject');
      return;
    }
    audio.play('ui.confirm');
    if (!result.action || !result.islandId || !result.commodityId) return;
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
  let remoteSaveRecoveryAccum = 0;
  let remoteSaveRecoveryInFlight = false;
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
        tradeManager.living.setServerReadOnly(persistence.requestedEconomyMode === 'remote');
        refreshEconomyViews();
      })
      .finally(() => {
        remotePollInFlight = false;
      });
  };
  requestFreshEconomy = (): void => {
    if (persistence.requestedEconomyMode === 'remote') pollRemoteEconomy();
  };
  const resyncAuthoritativeState = createAuthoritativeResyncHandler({
    refreshEconomy: pollRemoteEconomy,
    refreshQuest: questSync ? () => questSync.reconcile() : undefined,
    refreshProgression: remoteProgression
      ? () => reconcileProgression(remoteProgression, progression)
      : undefined,
    flushAndRecoverSave: async () => {
      await persistence.flush();
      await persistence.refreshSave();
    },
  });
  // S9: Server push โลกเศรษฐกิจผ่าน WebSocket — ระหว่างเชื่อมอยู่หยุด poll 5 วิ
  // (WS หลุด/ปิด flag = กลับไป poll เดิมอัตโนมัติ ไม่มีช่วงมืด)
  // S13: ผู้เล่นคนอื่นบนเกาะเดียวกัน (เปิดด้วย VITE_ENABLE_MULTIPLAYER) — แสดงผลล้วน
  const multiplayerEnabled = import.meta.env.VITE_ENABLE_MULTIPLAYER === 'true'
    || import.meta.env.VITE_ENABLE_MULTIPLAYER === '1';
  const runtimeFeatures = await fetchRuntimeFeatures(resolveRemoteApiUrl());
  const remotePlayers = (multiplayerEnabled || pocketMonsterParentOrigin !== null)
    ? new RemotePlayers(game.scene, islandManager.activeIsland, () => Date.now(), {
      focus: () => controller.position,
      tier: graphics.tier,
    })
    : null;
  if (remotePlayers) game.add(remotePlayers);
  const pocketMonsterPresence = pocketMonsterParentOrigin && remotePlayers
    ? new PocketMonsterParentPresence({
      targetOrigin: pocketMonsterParentOrigin,
      host: createBrowserParentPresenceHost(),
      remotePlayers,
      getPosition: () => controller.position,
      getHeading: () => controller.heading,
      getIslandId: () => islandManager.activeIsland,
      heightAt: (x, z) => world.collision.heightAt(x, z),
      getActionSnapshot: () => player.sampleActionSnapshot(),
    })
    : null;
  pocketMonsterPresence?.start();
  // S15: PvP — Server เป็นเจ้าของ HP/ดาเมจการต่อสู้ระหว่างผู้เล่น (ต้องเปิด multiplayer ก่อน)
  const pvpEnabled = multiplayerEnabled
    && (import.meta.env.VITE_ENABLE_PVP === 'true' || import.meta.env.VITE_ENABLE_PVP === '1');
  let lastPvpNoticeAt = 0;
  let selfPvpHp: number | null = null;
  let selfPvpDefeated = false;
  const notifyPvp = (message: string) => {
    const now = Date.now();
    if (now - lastPvpNoticeAt < 1_500) return;
    lastPvpNoticeAt = now;
    touchControls?.notify(message);
  };
  // S16: มอนสเตอร์กลาง — Server จำลอง AI/HP/death/respawn (ต้องเปิด multiplayer ก่อน)
  const sharedWorldMonstersEnabled = multiplayerEnabled
    && resolveSharedMonsterMode(
      import.meta.env.VITE_ENABLE_SHARED_WORLD_MONSTERS === 'true'
        || import.meta.env.VITE_ENABLE_SHARED_WORLD_MONSTERS === '1',
      runtimeFeatures,
    );
  const sharedMonsters = sharedWorldMonstersEnabled
    ? new SharedMonsterClient(
        game.scene,
        islandManager.activeIsland,
        (x, z) => world.collision.heightAt(x, z),
      )
    : null;
  if (sharedMonsters) {
    game.add(sharedMonsters);
    // PvE: มอนสเตอร์กลางส่ง attack action แล้ว client รับเฉพาะ hit frame ครั้งเดียว
    game.add({
      update: () => {
        if (selfPvpDefeated) {
          sharedMonsters.collectPlayerHits(controller.position);
          return;
        }
        for (const hit of sharedMonsters.collectPlayerHits(controller.position)) {
          const resolution = resolveSharedMonsterPlayerDamage(
            controller.hp,
            hit.damage,
            (amount) => playerCombat?.modifyIncomingDamage({
              amount,
              unblockable: false,
              knockback: 0,
              sourceX: hit.sourceX,
              sourceZ: hit.sourceZ,
              tags: [],
            }) ?? amount,
          );
          controller.hp = resolution.hp;
          playerCombat?.notifyDamaged();
          hud.flashDamage();
          if (resolution.taken > 0) {
            effects.spawnPlayerDamageNumber(controller.position, Math.round(resolution.taken));
          }
          if (resolution.defeated) {
            audioBridge?.notifyDeath();
            spawnManager.respawn();
            playerCombat?.notifyRespawn();
            globalThis.setTimeout(() => audioBridge?.notifyRespawn(), 900);
            break;
          }
        }
      },
    });
  }
  // S17: boat simulation/render bridge; false keeps the complete S14/local boat path.
  const boatWorldEnabled = multiplayerEnabled
    && (import.meta.env.VITE_ENABLE_BOAT_WORLD === 'true'
      || import.meta.env.VITE_ENABLE_BOAT_WORLD === '1');
  const getSelfCharacterId = () => getRemoteSession().session?.characterId ?? null;
  const sharedMonsterRewardSources = new Map<string, {
    itemId: string;
    category: 'style' | 'sword' | 'gun' | 'fruit' | 'utility';
    name: string;
  }>();
  let selfAudioLifeCycle = 0;
  const boatWorldClient = boatWorldEnabled
    ? new BoatWorldClient(game.scene, getSelfCharacterId, boatManager, worldTextures, graphics, effects)
    : null;
  if (boatWorldClient) game.add(boatWorldClient);
  const realtime = initializeRealtime({
    onEconomy: (state) => {
      const world = state?.world ? parseEconomyDocument(state.world) : null;
      if (!world) return;
      persistence.storage.replaceEconomySnapshot({ schemaVersion: state.schemaVersion, world: state.world });
      tradeManager.living.replaceState(world);
      tradeManager.living.setServerReadOnly(true);
      refreshEconomyViews();
    },
    onResync: resyncAuthoritativeState,
    onAnnouncement: (message, level) => {
      economyHud.notifyStatus(message, level === 'warning');
      audio.play(level === 'warning' ? 'ui.reject' : 'ui.notification');
    },
    onPresence: (snapshot) => {
      // Island transitions can happen between the 100 ms movement ticks. Synchronise
      // the renderer before filtering the incoming authoritative presence frame.
      remotePlayers?.setIsland(islandManager.activeIsland);
      remotePlayers?.applyPresence(snapshot);
    },
    onPresenceLeave: (playerId) => remotePlayers?.remove(playerId),
    onMovementCorrection: (correction) => {
      controller.teleport(correction.x, correction.y, correction.z);
      controller.heading = correction.heading;
      remotePlayers?.setIsland(correction.islandId);
      sharedMonsters?.setIsland(correction.islandId);
      if (correction.reason !== 'initial-anchor') {
        touchControls?.notify(
          correction.reason === 'island'
            ? 'Server ปรับตำแหน่งกลับ — ต้องเดินทางข้ามเกาะด้วยเรือ'
            : 'Server ปรับตำแหน่งกลับให้ตรงกับความเร็วที่อนุญาต',
        );
      }
    },
    // S15: ผล PvP จาก Server (authority) — โดนเราเอง = ปรับหลอดเลือดตาม Server
    onCombatHit: ({ attackerId, targetId, damage, hp, maxHp, knockback }) => {
      audioBridge?.markCombat();
      if (targetId === getSelfCharacterId()) {
        const serverLoss = selfPvpHp === null
          ? Math.max(0, damage)
          : Math.max(0, selfPvpHp - hp);
        selfPvpHp = Math.max(0, Math.min(maxHp, hp));
        const actualDamage = Math.min(controller.hp, serverLoss);
        controller.hp = Math.max(0, controller.hp - actualDamage);
        hud.flashDamage();
        playerCombat?.markCombatActivity();
        playerCombat?.notifyAuthoritativeHit(knockback, controller.hp > 0);
        if (actualDamage > 0) effects.spawnPlayerDamageNumber(controller.position, Math.round(actualDamage));
        audio.play('combat.hit', {
          eventId: `pvp-hit:${attackerId}:${targetId}:${hp}:${damage}`,
          position: controller.position,
        });
      } else {
        remotePlayers?.applyCombatHit(targetId, knockback);
        const at = remotePlayers?.positionOf(targetId);
        if (at) {
          at.y += 2.2;
          effects.spawnDamageNumber(at, damage, attackerId === getSelfCharacterId() ? '#ffe28a' : '#ff8a8a');
          audio.play('combat.hit', {
            eventId: `pvp-hit:${attackerId}:${targetId}:${hp}:${damage}`,
            position: at,
          });
        }
      }
    },
    onCombatDefeat: (playerId) => {
      if (playerId === getSelfCharacterId()) {
        // แพ้ PvP → กลับจุดปลอดภัย (Server จะส่ง respawn คืน HP เต็มตามเวลา)
        selfPvpDefeated = true;
        selfPvpHp = 0;
        controller.hp = 0;
        spawnManager.teleportToCheckpoint();
        hud.flashDamage();
        audioBridge?.notifyDeath(`pvp-defeat:${playerId}:${selfAudioLifeCycle}`);
      } else {
        remotePlayers?.markDefeated(playerId);
      }
    },
    onCombatRespawn: (playerId) => {
      if (playerId === getSelfCharacterId()) {
        selfPvpDefeated = false;
        selfPvpHp = null;
        controller.hp = controller.hpMax;
        playerCombat?.notifyRespawn();
        selfAudioLifeCycle += 1;
        audioBridge?.notifyRespawn(`pvp-respawn:${playerId}:${selfAudioLifeCycle}`);
      } else {
        remotePlayers?.markRespawn(playerId);
      }
    },
    onCombatState: ({ playerId, hp, maxHp, defeated, engaged }) => {
      if (playerId !== getSelfCharacterId() || !engaged) return;
      selfPvpHp = Math.max(0, Math.min(maxHp, hp));
      selfPvpDefeated = defeated;
      controller.hp = defeated
        ? 0
        : Math.max(0, Math.min(
            controller.hpMax,
            Math.round(controller.hpMax * selfPvpHp / Math.max(1, maxHp)),
          ));
      if (defeated) {
        spawnManager.teleportToCheckpoint();
        playerCombat?.notifyDamaged();
      }
    },
    onCombatResult: (result) => {
      if (result.accepted || result.reason === 'cooldown' || result.reason === 'duplicate') return;
      const messages: Record<string, string> = {
        'pvp-disabled': '⚔️ PK ยังไม่เปิดบนเซิร์ฟเวอร์',
        'pvp-level-locked': '⚔️ PvP ปลดล็อกเมื่อผู้เล่นทั้งสองถึงเลเวล 20',
        'presence-required': '⚔️ กำลังซิงก์ตำแหน่ง ลองโจมตีอีกครั้ง',
        'target-unavailable': '⚔️ เป้าหมายหลุดการเชื่อมต่อแล้ว',
        'different-island': '⚔️ เป้าหมายอยู่คนละเกาะ',
        'out-of-range': '⚔️ เป้าหมายอยู่นอกระยะ',
        defeated: '⚔️ ผู้เล่นนี้กำลังรอเกิดใหม่',
        stunned: '⚔️ คุณกำลังติดสตั๊นอยู่',
        'self-target': '⚔️ ไม่สามารถโจมตีตัวเองได้',
      };
      notifyPvp(messages[result.reason ?? ''] ?? '⚔️ Server ปฏิเสธการโจมตี');
    },
    // S16: มอนสเตอร์กลาง — Server เป็นเจ้าของ HP/state; client เรนเดอร์ตาม
    onWorldMonsterSnapshot: (islandId, monsters) => sharedMonsters?.applySnapshot(islandId, monsters),
    onWorldMonsterDelta: (islandId, updates) => {
      sharedMonsters?.applyDelta(islandId, updates);
      if (islandId !== islandManager.activeIsland) return;
      for (const update of updates) {
        if (!update.damage || update.damage <= 0) continue;
        const at = sharedMonsters?.positionOf(update.spawnId);
        if (at) effects.spawnDamageNumber(at, update.damage);
      }
    },
    onWorldMonsterAttack: (attack) => {
      sharedMonsters?.applyAttack(attack, getSelfCharacterId() ?? undefined);
      const position = sharedMonsters?.positionOf(attack.spawnId);
      audio.play('monster.attack', {
        eventId: `world-monster-attack:${attack.attackId}`,
        position,
      });
    },
    onWorldMonsterDead: (spawnId, byId, reward) => {
      const position = sharedMonsters?.positionOf(spawnId);
      sharedMonsters?.markDead(spawnId);
      audio.play('monster.death', { eventId: `world-monster-dead:${spawnId}`, position });
      if (byId !== getSelfCharacterId() || !reward) return;

      const item = sharedMonsterRewardSources.get(spawnId) ?? playerCombat?.activeItem
        ?? { itemId: 'basic-brawl', category: 'style' as const, name: 'หมัด' };
      sharedMonsterRewardSources.delete(spawnId);
      progression.addPlayerExp(reward.playerExp, `shared-monster:${reward.monsterId}`);
      progression.setCoinsFromServer(reward.coinsTotal, `shared-monster:${reward.monsterId}`);
      const mastery = reward.masteryExp > 0
        ? [{ itemId: item.itemId, category: item.category, amount: reward.masteryExp }]
        : [];
      if (reward.masteryExp > 0) {
        progression.addMasteryExp(item.itemId, item.category, reward.masteryExp);
      }
      progression.emitRewardGranted({
        playerExp: reward.playerExp,
        coins: reward.coins,
        mastery,
        multiplier: 1,
      });
      const contribution = {
        enemyId: reward.monsterId,
        totalDamage: 0,
        lastHitItemId: item.itemId,
        lastHitCategory: item.category,
        highestDamageItemId: item.itemId,
        highestDamageCategory: item.category,
        killed: true,
      };
      progression.events.emit('monster:killed', {
        monsterId: reward.monsterId,
        monsterType: reward.monsterId.includes('boss') ? 'boss' : 'normal',
        isBoss: reward.monsterId.includes('boss'),
        position: position ?? { x: controller.position.x, y: controller.position.y, z: controller.position.z },
        contribution,
      });
      progression.save();
    },
    onWorldMonsterRespawn: (monster) => {
      sharedMonsterRewardSources.delete(monster.spawnId);
      sharedMonsters?.applyRespawn(monster);
      audio.play('monster.respawn', {
        eventId: `world-monster-respawn:${monster.spawnId}`,
        position: { x: monster.x, y: world.collision.heightAt(monster.x, monster.z), z: monster.z },
      });
    },
    onBoatSnapshot: (islandId, boats) => boatWorldClient?.applySnapshot(islandId, boats),
    onBoatDelta: (boat) => boatWorldClient?.applyDelta(boat),
    onBoatCannon: (event) => {
      const firedBySelf = event.attackerId === boatManager.activeAuthorityEntityId;
      boatWorldClient?.applyCannon(event, firedBySelf);
      if (!firedBySelf) {
        audio.play('boat.cannon', {
          eventId: `boat-cannon:${event.attackerId}:${event.targetId ?? 'miss'}:${event.x}:${event.z}`,
          position: { x: event.x, y: 0.5, z: event.z },
        });
      }
      if (event.damage > 0) audio.play('boat.hit', {
        eventId: `boat-hit:${event.attackerId}:${event.targetId ?? 'unknown'}:${event.targetHp ?? 'x'}`,
        position: { x: event.x, y: 0.5, z: event.z },
      });
    },
    onBoatSunk: (entityId) => {
      const position = boatWorldClient?.positionOf(entityId);
      boatWorldClient?.markSunk(entityId);
      audio.play('boat.sinking', { eventId: `boat-sunk:${entityId}`, position });
    },
    onBoatRespawn: (boat) => boatWorldClient?.applyRespawn(boat),
    onBoatIntentResult: (result) => {
      boatManager.handleAuthorityResult(result);
      if (!result.accepted) {
        const boatRejectMessages: Record<string, string> = {
          'not-passenger-or-helm-busy': 'พวงมาลัยยังไม่พร้อม กำลังซิงก์สถานะเรือ',
          'board-range-or-state': 'ต้องอยู่ใกล้เรือและรอให้เรือพร้อมก่อน',
          'boat-and-presence-required': 'กำลังซิงก์ตำแหน่งกับ Server ลองอีกครั้ง',
          'not-aboard': 'คุณไม่ได้อยู่บนเรือลำนี้',
          'not-helm': 'คุณยังไม่ได้ถือพวงมาลัย',
          'server-error': 'Server เรือขัดข้องชั่วคราว ลองอีกครั้ง',
        };
        touchControls?.notify(boatRejectMessages[result.reason ?? ''] ?? 'คำสั่งเรือไม่สำเร็จ ลองอีกครั้ง');
      }
    },
  });
  if (realtime && boatWorldEnabled) {
    boatManager.setAuthority({
      connected: () => realtime.connected,
      send: (action, payload) => realtime.sendBoatIntent(action, payload),
    });
  }
  realtime?.start();
  // debug/E2E hook (อ่าน+ส่ง move ตรง ๆ ได้) — ให้ browser-smoke ปั๊ม presence
  // จากฝั่ง Node ได้แน่นอน โดยไม่พึ่ง setInterval ในหน้าเว็บที่ headless throttle
  (window as unknown as { __realtime?: typeof realtime }).__realtime = realtime;
  // S15: characterId ของเราให้ browser-smoke ใช้เป็นเป้าทดสอบ PvP (อ่านอย่างเดียว)
  Object.defineProperty(window, '__characterId', {
    configurable: true,
    get: getSelfCharacterId,
  });
  // S13: รายงานตำแหน่งตัวเองให้ Server relay ทุก 100ms ผ่าน setInterval —
  // จงใจไม่ผูกกับ game loop (rAF) เพราะแท็บพื้นหลังโดน throttle จน presence ไม่ไหล
  if (realtime && multiplayerEnabled) {
    let presenceTick = 0;
    setInterval(() => {
      remotePlayers?.setIsland(islandManager.activeIsland);
      const sharedIslandChanged = sharedMonsters?.setIsland(islandManager.activeIsland) ?? false;
      if (!realtime.connected) return;
      if (sharedIslandChanged) realtime.requestResync();
      const position = controller.position;
      const onBoat = boatManager.riderState !== 'off';
      const locomotion = controller.moveState.swimming
        ? 'swim'
        : controller.moveState.speed > 5
          ? 'run'
          : controller.moveState.speed > 0.1 ? 'walk' : 'idle';
      presenceTick += 1;
      const combatState = playerCombat?.state ?? 'idle';
      const sendAnimation = presenceTick % 2 === 0 || combatState !== 'idle'
        || controller.moveState.dashing || !controller.moveState.onGround;
      realtime.sendMove({
        islandId: islandManager.activeIsland,
        x: position.x,
        y: position.y,
        z: position.z,
        heading: controller.heading,
        onBoat,
        boatId: onBoat ? boatManager.selectedBoatId ?? undefined : undefined,
        locomotion,
        animation: sendAnimation ? {
          combatState,
          category: playerCombat?.activeItem.category ?? 'style',
          onGround: controller.moveState.onGround,
          dashing: controller.moveState.dashing,
          verticalVelocity: controller.verticalSpeed,
          attackProgress: playerCombat ? 1 - playerCombat.attackCooldownFraction : 0,
          hitReactionId: playerCombat?.hitReactionId ?? 0,
          hitReactionAngle: playerCombat?.hitReactionAngle ?? 0,
          skillAnimationProgress: playerCombat?.skillAnimationProgress ?? 1,
          skillAnimationReleaseProgress: playerCombat?.skillAnimationReleaseProgress ?? 0.3,
          skillAnimationType: playerCombat?.skillAnimationType,
          skillAnimationVariant: playerCombat?.skillAnimationVariant ?? 0,
          skillAnimationUltimate: playerCombat?.skillAnimationUltimate ?? false,
          skillAnimationCategory: playerCombat?.skillAnimationCategory ?? 'style',
        } : undefined,
      });
    }, 100);
  }
  game.add({
    update: (dt: number) => {
      const elapsedMs = dt * 1000;
      if (persistence.requestedMode === 'remote' && persistence.activeMode === 'local') {
        remoteSaveRecoveryAccum += elapsedMs;
        if (remoteSaveRecoveryAccum >= 10_000 && !remoteSaveRecoveryInFlight) {
          remoteSaveRecoveryAccum = 0;
          remoteSaveRecoveryInFlight = true;
          void persistence.refreshSave().finally(() => {
            remoteSaveRecoveryInFlight = false;
            renderServerStatus();
          });
        }
      } else {
        remoteSaveRecoveryAccum = 0;
      }
      // A disconnected socket must not turn the old five-second full-world poll
      // back into a gameplay hitch. Poll while the player is actively viewing economy UI.
      const economySurfaceOpen = tradeShop.isOpen || economyPanel.isOpen;
      if (
        persistence.requestedEconomyMode === 'remote'
        && !realtime?.connected
        && economySurfaceOpen
      ) {
        remotePollAccum += elapsedMs;
        if (remotePollAccum >= REMOTE_ECONOMY_TICK_INTERVAL_MS) {
          remotePollAccum = 0;
          pollRemoteEconomy();
        }
      } else {
        remotePollAccum = 0;
      }
      if (persistence.requestedEconomyMode === 'local') {
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
      requestFreshEconomy();
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
    () => playerCombat?.state ?? 'idle',
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
    () => !(
      tradeShop.isOpen
      || dealerShop.isOpen
      || potionShop.isOpen
      || boatManager.shopOpen
      || economyPanel.isOpen
    ),
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
        audioBridge?.markCombat();
        playerCombat?.notifyDamaged();
        hud.flashDamage();
        // ตัวเลขดาเมจแดงเด้งเหนือหัวผู้เล่น (แยกสีจากเลขทำมอนสเตอร์ที่เป็นเหลือง)
        if (amount > 0) effects.spawnPlayerDamageNumber(controller.position, amount);
      },
      modifyIncomingDamage: (attack) =>
        playerCombat?.modifyIncomingDamage(attack) ?? attack.amount,
      onMonsterDamaged: (monster, amount) => {
        effects.spawnDamageNumber(monster.group.position, amount);
        audioBridge?.markCombat();
        audio.play('monster.hit', { position: monster.group.position });
      },
      onMonsterAudioEvent: (event, monster) => {
        audio.play(`monster.${event}`, { position: monster.group.position });
        if (event === 'aggro' || event === 'attack') audioBridge?.markCombat();
      },
      onBossAudioState: (active) => audioBridge?.setBossActive(active),
      onPlayerDefeated: () => {
        spawnManager.respawn();
        playerCombat?.notifyRespawn();
        hud.flashDamage();
        audioBridge?.notifyDeath();
        globalThis.setTimeout(() => audioBridge?.notifyRespawn(), 900);
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
        audio.play('monster.death', { position });
      },
    },
    // S16: เปิด shared world monsters → ปิดมอนสเตอร์ท้องถิ่น (โลกกลางเป็นของ Server)
    shouldSuppressLocalMonsters(sharedWorldMonstersEnabled, realtime !== null),
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
    boatWorldEnabled,
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
  // S15: ต่อ M1/สกิลของผู้เล่นเข้ากับ PvP — หาผู้เล่นคนอื่นในกรวยหน้าแล้วส่ง "เจตนาโจมตี"
  // ให้ Server ตัดสิน (ระยะ/คูลดาวน์/ดาเมจ) — Client ไม่ส่งดาเมจ (กันโกง)
  // S16: และต่อ M1/สกิลเข้ากับมอนสเตอร์กลาง — หาตัวในกรวยหน้าแล้วส่ง "เจตนาตี" ให้ Server ตัดสิน
  if (realtime && (multiplayerEnabled || sharedWorldMonstersEnabled)) {
    const CONE_HALF_ANGLE = Math.PI / 3; // ~120° กรวยหน้า
    playerCombat.onPvpAttack = ({
      origin,
      forwardX,
      forwardZ,
      kind,
      category,
      skillId,
      range: requestedRange,
    }) => {
      if (pvpEnabled && remotePlayers) {
        const range = Math.min(
          kind === 'skill' ? PVP_SKILL_RANGE : PVP_MELEE_RANGE,
          Math.max(0.8, requestedRange),
        );
        const targets = remotePlayers.targetsInCone(origin, forwardX, forwardZ, range, CONE_HALF_ANGLE);
        // Touch users cannot turn as precisely while pressing attack. If nobody
        // is in the forward cone, lock the nearest in-range player and face them.
        const targetId = targets[0]
          ?? (touchControls.usesTouchLayout ? remotePlayers.nearestTargetInRange(origin, range) : null);
        if (targetId) {
          const target = remotePlayers.latestPositionOf(targetId);
          if (target && targets.length === 0) {
            controller.heading = Math.atan2(target.x - origin.x, target.z - origin.z);
          }
          const targetIds = targets.length > 0 ? targets.slice(0, 8) : [targetId];
          const statCategory = category === 'utility'
            ? undefined
            : category as CombatStatCategory;
          for (const id of targetIds) realtime.sendAttack(id, kind, skillId, statCategory);
          playerCombat?.markCombatActivity();
        }
      } else if (multiplayerEnabled && !pvpEnabled) {
        notifyPvp('⚔️ PK ยังไม่เปิดใน build นี้');
      }
    };
    playerCombat.onSharedMonsterAttack = ({
      origin,
      forwardX,
      forwardZ,
      kind,
      category,
      range: requestedRange,
      area,
    }) => {
      if (!sharedMonsters) return;
      const range = Math.min(
        kind === 'skill' ? WORLD_MONSTER_SKILL_RANGE : WORLD_MONSTER_MELEE_RANGE,
        Math.max(0.8, requestedRange),
      );
      const spawnIds = area
        ? sharedMonsters.targetsInRadius(origin, Math.min(range, Math.max(0.5, area)))
        : sharedMonsters.targetsInCone(origin, forwardX, forwardZ, range, CONE_HALF_ANGLE);
      const item = playerCombat?.activeItem;
      if (item) for (const spawnId of spawnIds) sharedMonsterRewardSources.set(spawnId, { ...item });
      realtime.sendMonsterHits(
        spawnIds,
        kind,
        category === 'utility' ? undefined : category as CombatStatCategory,
      );
    };
    if (pvpEnabled) {
      let lastBlocking = false;
      let blockRefresh = 0;
      game.add({
        update: (dt) => {
          blockRefresh += dt;
          const blocking = playerCombat?.blocking ?? false;
          if (blocking === lastBlocking && (!blocking || blockRefresh < 1)) return;
          lastBlocking = blocking;
          blockRefresh = 0;
          realtime.sendCombatBlock(blocking);
        },
      });
    }
  }
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
    audio.play('reward.level-up');
  });
  progression.events.on('player:exp-gained', () => audio.play('reward.exp'));
  progression.events.on('coins:changed', ({ amount }) => {
    if (amount > 0) audio.play('reward.coins');
    dealerShop.refresh();
    potionShop.refresh();
  });
  progression.events.on('quest:progress', () => audio.play('ui.quest-update'));
  progression.events.on('quest:completed', () => audio.play('reward.quest-complete'));

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
  // NavalCombat consumes the broadside input in both local and authoritative
  // modes, so its projectile cooldown is the one the button must display.
  touchControls?.bindCannonCooldown(() => navalCombat.playerFireCooldownFraction);
  navalCombat.onCannonArmed = (side) => touchControls?.setCannonArmed(side);
  navalCombat.onPlayerCannonFired = (side) => boatManager.requestAuthoritativeCannon(side);
  navalCombat.onAudioEvent = (event, position) => {
    audio.play(`boat.${event}`, { position });
  };

  // ตกทะเล → กลับ Safe Zone ของหมู่บ้าน ไม่วนเกิดซ้ำในตำแหน่งอันตราย
  controller.onDrown = () => {
    audio.play('player.drowning');
    audioBridge?.notifyDeath();
    spawnManager.respawn();
    playerCombat?.notifyRespawn();
    globalThis.setTimeout(() => audioBridge?.notifyRespawn(), 900);
  };

  audioBridge = new AudioRuntimeBridge({ audio, controller, boats: boatManager, combat: playerCombat });
  game.add(audioBridge);
  (window as unknown as { __audio?: typeof audio }).__audio = audio;

  const onboardingEnabled = import.meta.env.VITE_ENABLE_ONBOARDING === 'true'
    || import.meta.env.VITE_ENABLE_ONBOARDING === '1';
  if (onboardingEnabled) {
    // Keep the guide out of the initial bundle/request path when the production flag is off.
    const { OnboardingDirector } = await import('./onboarding/OnboardingDirector');
    onboarding = new OnboardingDirector({
      scene: game.scene,
      storage: persistence.storage,
      autoStart: progression.level <= 3,
      heightAt: (x, z) => world.collision.heightAt(x, z),
      snapshot: () => {
        const boat = boatManager.activeBoat;
        return {
          x: controller.position.x,
          y: controller.position.y,
          z: controller.position.z,
          groundY: world.collision.heightAt(controller.position.x, controller.position.z),
          cameraYaw: camera.yaw,
          dashCooldownFraction: controller.dashCooldownFraction,
          islandId: islandManager.activeIsland,
          activeQuest: questManager.getActiveQuest() !== null,
          boatActive: boat !== null,
          boatRiderState: boatManager.riderState,
          boatX: boat?.group.position.x ?? null,
          boatZ: boat?.group.position.z ?? null,
        };
      },
    });
    progression.events.on('monster:killed', () => onboarding?.signal('monster-killed'));
    progression.events.on('quest:accepted', () => onboarding?.signal('quest-accepted'));
    progression.events.on('quest:completed', () => onboarding?.signal('quest-completed'));
    progression.events.on('trade:completed', () => onboarding?.signal('trade-completed'));
    game.add(onboarding);
    (window as unknown as { __onboarding?: OnboardingDirector }).__onboarding = onboarding;
  }

  game.add(world);
  game.add(pocketMonsterPortal);
  game.add(livingWorldPortal);
  game.add(islandManager);
  game.add(controller);
  game.add(boatManager);
  game.add(navalCombat);
  game.add(player);
  game.add(camera);
  game.add(playerCombat);
  if (pocketMonsterPresence) game.add(pocketMonsterPresence);
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
    pocketMonsterPresence?.dispose();
    saveSystem.save();
    progression.save();
    itemInventory.save();
    void persistence.flush();
    void audio.handleVisibility(true);
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
