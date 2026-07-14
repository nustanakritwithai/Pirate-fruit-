/**
 * Phase 7 — อินเวนทอรีไอเทม (ดาบ / ปืน / สไตล์ / ผลไม้) + สถานะ SkillLoadout
 * - เริ่มเกมมีแค่สไตล์มือเปล่า 'combat' (หมัด) ไม่มีผลไม้
 * - สุ่มของเพิ่มที่ร้านดีลเลอร์ แล้ว equip เพื่อใช้ชุดสกิลของชิ้นนั้น
 * - ถือ SkillLoadout state จริง (activeSet/equipped/mastery) + persist localStorage
 */

import { SkillLoadout, DEFAULT_SKILL_LOADOUT, type MasteryProvider } from '../combat/SkillLoadout';
import type { SkillLoadoutState } from '../combat/types';
import type { EconomyWallet } from '../progression/ProgressionTypes';
import { getSword } from '../swords/SwordRegistry';
import { getGun } from '../guns/GunRegistry';
import { getFightingStyle } from '../fighting-styles/FightingStyleRegistry';
import { getFruit } from '../fruit/FruitRegistry';
import { DRAW_COST, drawGacha, STARTER_STYLE_ID, type GachaEntry, type ItemKind } from './GachaData';

const STORAGE_KEY = 'pirate-fruit:items-v1';

interface InventoryData {
  coins: number;
  ownedSwords: string[];
  ownedGuns: string[];
  ownedStyles: string[];
  ownedFruits: string[];
  loadout: SkillLoadoutState;
}

export interface DrawResult {
  entry: GachaEntry;
  isNew: boolean;
}

const VALIDATORS: Record<ItemKind, (id: string) => boolean> = {
  sword: (id) => Boolean(getSword(id)),
  gun: (id) => Boolean(getGun(id)),
  'fighting-style': (id) => Boolean(getFightingStyle(id)),
  fruit: (id) => Boolean(getFruit(id)),
};

export class ItemInventory {
  private data: InventoryData;
  readonly loadout: SkillLoadout;

  constructor(
    private wallet?: EconomyWallet,
    /** provider mastery ต่อชิ้นจริง (ProgressionManager) — ขับการปลดล็อกสกิลแบบ Blox Fruits */
    masteryOf?: MasteryProvider,
  ) {
    this.data = this.load();
    this.loadout = new SkillLoadout(this.data.loadout, masteryOf);
  }

  get coins(): number {
    return this.wallet?.coins ?? this.data.coins;
  }

  get drawCost(): number {
    return DRAW_COST;
  }

  ownedOf(kind: ItemKind): readonly string[] {
    return this.listFor(kind);
  }

  owns(kind: ItemKind, id: string): boolean {
    return this.listFor(kind).includes(id);
  }

  /** สุ่ม 1 ครั้ง — คืน null ถ้าเหรียญไม่พอ */
  draw(rng: () => number = Math.random): DrawResult | null {
    if (this.coins < DRAW_COST) return null;
    if (this.wallet) {
      if (!this.wallet.spendCoins(DRAW_COST, 'gacha:draw')) return null;
    } else {
      this.data.coins -= DRAW_COST;
    }
    const entry = drawGacha(rng);
    const list = this.listFor(entry.kind);
    const isNew = !list.includes(entry.id);
    if (isNew) list.push(entry.id);
    this.save();
    return { entry, isNew };
  }

  equip(kind: ItemKind, id: string): boolean {
    if (!this.owns(kind, id)) return false;
    switch (kind) {
      case 'sword':
        this.loadout.equipSword(id);
        break;
      case 'gun':
        this.loadout.equipGun(id);
        break;
      case 'fighting-style':
        this.loadout.equipFightingStyle(id);
        break;
      case 'fruit':
        this.loadout.equipFruit(id);
        break;
    }
    this.save();
    return true;
  }

  /** persist สถานะ (เรียกหลัง toggle ชุดสกิลด้วย) */
  save(): void {
    try {
      this.data.coins = this.coins;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // เล่นต่อได้แม้ storage ปิด แค่ไม่จำ
    }
  }

  private listFor(kind: ItemKind): string[] {
    switch (kind) {
      case 'sword':
        return this.data.ownedSwords;
      case 'gun':
        return this.data.ownedGuns;
      case 'fighting-style':
        return this.data.ownedStyles;
      case 'fruit':
        return this.data.ownedFruits;
    }
  }

  private load(): InventoryData {
    const base: InventoryData = {
      coins: 800,
      ownedSwords: [],
      ownedGuns: [],
      ownedStyles: [STARTER_STYLE_ID],
      ownedFruits: [],
      // mastery มาจาก provider (ProgressionManager) — เริ่มจาก 1 แล้ว grind ปลดสกิล
      loadout: { ...DEFAULT_SKILL_LOADOUT },
    };
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<InventoryData>;
      const filter = (kind: ItemKind, list: unknown): string[] =>
        Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && VALIDATORS[kind](id)) : [];
      const ownedStyles = filter('fighting-style', parsed.ownedStyles);
      if (!ownedStyles.includes(STARTER_STYLE_ID)) ownedStyles.unshift(STARTER_STYLE_ID);
      const loadout: SkillLoadoutState = { ...base.loadout, ...sanitizeLoadout(parsed.loadout) };
      return {
        coins:
          typeof parsed.coins === 'number' && Number.isFinite(parsed.coins)
            ? Math.max(0, Math.floor(parsed.coins))
            : base.coins,
        ownedSwords: filter('sword', parsed.ownedSwords),
        ownedGuns: filter('gun', parsed.ownedGuns),
        ownedStyles,
        ownedFruits: filter('fruit', parsed.ownedFruits),
        loadout,
      };
    } catch {
      return base;
    }
  }
}

/** ตรวจ loadout state ที่โหลดมาให้ปลอดภัย (equipped ต้องมีอยู่จริง) */
function sanitizeLoadout(state: Partial<SkillLoadoutState> | undefined): Partial<SkillLoadoutState> {
  if (!state || typeof state !== 'object') return {};
  const clean: Partial<SkillLoadoutState> = {};
  if (state.activeSet === 'weapon' || state.activeSet === 'fruit') clean.activeSet = state.activeSet;
  if (state.equippedWeaponKind === 'sword' || state.equippedWeaponKind === 'gun' || state.equippedWeaponKind === 'fighting-style') {
    clean.equippedWeaponKind = state.equippedWeaponKind;
  }
  if (typeof state.equippedSwordId === 'string' && getSword(state.equippedSwordId)) clean.equippedSwordId = state.equippedSwordId;
  if (typeof state.equippedGunId === 'string' && getGun(state.equippedGunId)) clean.equippedGunId = state.equippedGunId;
  if (typeof state.equippedFightingStyleId === 'string' && getFightingStyle(state.equippedFightingStyleId)) {
    clean.equippedFightingStyleId = state.equippedFightingStyleId;
  }
  if (typeof state.equippedFruitId === 'string' && getFruit(state.equippedFruitId)) clean.equippedFruitId = state.equippedFruitId;
  if (typeof state.fruitAwakened === 'boolean') clean.fruitAwakened = state.fruitAwakened;
  return clean;
}
