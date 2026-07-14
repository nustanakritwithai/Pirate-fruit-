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
import { getPotion } from './PotionData';

const STORAGE_KEY = 'pirate-fruit:items-v1';
/** จำนวนช่องลัดใช้ยา */
export const QUICKSLOT_COUNT = 2;

interface InventoryData {
  coins: number;
  ownedSwords: string[];
  ownedGuns: string[];
  ownedStyles: string[];
  ownedFruits: string[];
  /** ยา/ของกิน: potionId → จำนวน */
  consumables: Record<string, number>;
  /** ช่องลัดใช้ยา (potionId ต่อช่อง, null = ว่าง) — ยาว QUICKSLOT_COUNT */
  quickslots: (string | null)[];
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

  // ---------- ยา/ของกิน (consumable) ----------

  getConsumableCount(id: string): number {
    return this.data.consumables[id] ?? 0;
  }

  /** รายการยาที่มี (นับ >0) — คืน {id, count} */
  listConsumables(): { id: string; count: number }[] {
    return Object.entries(this.data.consumables)
      .filter(([id, n]) => getPotion(id) && n > 0)
      .map(([id, count]) => ({ id, count }));
  }

  /** ซื้อยา 1 ขวด — คืน false ถ้าเหรียญไม่พอ/ไม่มียานี้ */
  buyPotion(id: string): boolean {
    const potion = getPotion(id);
    if (!potion) return false;
    if (this.coins < potion.price) return false;
    if (this.wallet) {
      if (!this.wallet.spendCoins(potion.price, `potion:${id}`)) return false;
    } else {
      this.data.coins -= potion.price;
    }
    this.data.consumables[id] = this.getConsumableCount(id) + 1;
    this.save();
    return true;
  }

  /** ใช้ยา 1 ขวด — คืน false ถ้าไม่มี */
  useConsumable(id: string): boolean {
    if (this.getConsumableCount(id) <= 0) return false;
    this.data.consumables[id] -= 1;
    this.save();
    return true;
  }

  // ---------- ช่องลัด (quickslot) ----------

  getQuickslot(slot: number): string | null {
    return this.data.quickslots[slot] ?? null;
  }

  get quickslots(): readonly (string | null)[] {
    return this.data.quickslots;
  }

  /** จัดยาลงช่องลัด (id=null = เอาออก) */
  assignQuickslot(slot: number, id: string | null): void {
    if (slot < 0 || slot >= QUICKSLOT_COUNT) return;
    if (id !== null && !getPotion(id)) return;
    this.data.quickslots[slot] = id;
    this.save();
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
      consumables: {},
      quickslots: new Array(QUICKSLOT_COUNT).fill(null),
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
        consumables: sanitizeConsumables(parsed.consumables),
        quickslots: sanitizeQuickslots(parsed.quickslots),
        loadout,
      };
    } catch {
      return base;
    }
  }
}

/** ตรวจ consumables ที่โหลดมา (potion id ต้องมีจริง, จำนวนเป็นเลขบวก) */
function sanitizeConsumables(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [id, n] of Object.entries(value as Record<string, unknown>)) {
    if (getPotion(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) {
      out[id] = Math.floor(n);
    }
  }
  return out;
}

/** ตรวจ quickslots (ยาว QUICKSLOT_COUNT, แต่ละช่องเป็น potion id ที่มีจริง หรือ null) */
function sanitizeQuickslots(value: unknown): (string | null)[] {
  const slots: (string | null)[] = new Array(QUICKSLOT_COUNT).fill(null);
  if (Array.isArray(value)) {
    for (let i = 0; i < QUICKSLOT_COUNT; i++) {
      const v = value[i];
      if (typeof v === 'string' && getPotion(v)) slots[i] = v;
    }
  }
  return slots;
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
