import { getBoatDefinition, type BoatUpgradeKind } from './BoatData';
import type { EconomyWallet } from '../progression/ProgressionTypes';

const STORAGE_KEY = 'pirate-fruit:boats-v1';

export interface BoatProgressData {
  coins: number;
  ownedBoatIds: string[];
  selectedBoatId: string | null;
  upgrades: Record<string, { hull: number; cannon: number; sail: number }>;
}

const DEFAULT_PROGRESS: BoatProgressData = {
  coins: 500,
  ownedBoatIds: [],
  selectedBoatId: null,
  upgrades: {},
};

/** เงินและเรือที่เป็นเจ้าของ แยกจากตำแหน่ง autosave เพื่อขยายเป็น inventory ภายหลังได้ */
export class BoatProgress {
  private data: BoatProgressData;

  constructor(private wallet?: EconomyWallet) {
    this.data = this.load();
  }

  get coins(): number {
    return this.wallet?.coins ?? this.data.coins;
  }

  get selectedBoatId(): string | null {
    return this.data.selectedBoatId;
  }

  owns(id: string): boolean {
    return this.data.ownedBoatIds.includes(id);
  }

  upgradeLevel(id: string, kind: BoatUpgradeKind): number {
    return this.data.upgrades[id]?.[kind] ?? 0;
  }

  upgradeCost(id: string, kind: BoatUpgradeKind): number | null {
    const definition = getBoatDefinition(id);
    if (!definition) return null;
    return definition.upgradeCosts?.[kind]?.[this.upgradeLevel(id, kind)] ?? null;
  }

  upgrade(id: string, kind: BoatUpgradeKind): { ok: boolean; message: string } {
    const definition = getBoatDefinition(id);
    if (!definition || !this.owns(id)) return { ok: false, message: 'ต้องเป็นเจ้าของเรือลำนี้ก่อน' };
    const level = this.upgradeLevel(id, kind);
    const costs = definition.upgradeCosts?.[kind] ?? [];
    const price = costs[level];
    if (price === undefined) return { ok: false, message: `${kind === 'hull' ? 'เกราะเรือ' : kind === 'cannon' ? 'ปืนใหญ่' : 'ใบเรือ'} เต็มระดับแล้ว` };
    if (this.coins < price) return { ok: false, message: `ต้องการอีก ${price - this.coins} เหรียญ` };
    if (this.wallet ? !this.wallet.spendCoins(price, `boat-upgrade:${id}:${kind}`) : false) return { ok: false, message: 'เหรียญไม่พอ' };
    if (!this.wallet) this.data.coins -= price;
    const current = this.data.upgrades[id] ?? { hull: 0, cannon: 0, sail: 0 };
    current[kind] = level + 1;
    this.data.upgrades[id] = current;
    this.save();
    return { ok: true, message: `อัปเกรด ${kind === 'hull' ? 'เกราะเรือ' : kind === 'cannon' ? 'ปืนใหญ่' : 'ใบเรือ'} ระดับ ${level + 1} สำเร็จ` };
  }

  getRuntimeDefinition(id: string) {
    const base = getBoatDefinition(id);
    if (!base) return undefined;
    const hull = this.upgradeLevel(id, 'hull');
    const cannon = this.upgradeLevel(id, 'cannon');
    const sail = this.upgradeLevel(id, 'sail');
    return {
      ...base,
      maxHp: Math.round(base.maxHp * (1 + hull * 0.16)),
      cannonsPerSide: (base.cannonsPerSide ?? 0) + cannon,
      maxSpeed: base.maxSpeed * (1 + sail * 0.055),
      acceleration: base.acceleration * (1 + sail * 0.045),
    };
  }

  purchase(id: string): { ok: boolean; message: string } {
    const definition = getBoatDefinition(id);
    if (!definition) return { ok: false, message: 'ไม่พบเรือลำนี้' };
    if (this.owns(id)) {
      this.select(id);
      return { ok: true, message: `เลือก ${definition.name} แล้ว` };
    }
    if (this.coins < definition.price) {
      return { ok: false, message: `ต้องการอีก ${definition.price - this.coins} เหรียญ` };
    }
    if (definition.price > 0) {
      if (this.wallet) {
        if (!this.wallet.spendCoins(definition.price, `boat:${id}`)) {
          return { ok: false, message: 'เหรียญไม่พอ' };
        }
      } else {
        this.data.coins -= definition.price;
      }
    }
    this.data.ownedBoatIds.push(id);
    this.data.selectedBoatId = id;
    this.save();
    return {
      ok: true,
      message: definition.price === 0 ? `รับ ${definition.name} แล้ว` : `ซื้อ ${definition.name} สำเร็จ`,
    };
  }

  select(id: string): boolean {
    if (!this.owns(id)) return false;
    this.data.selectedBoatId = id;
    this.save();
    return true;
  }

  private load(): BoatProgressData {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<BoatProgressData>;
      const owned = Array.isArray(parsed.ownedBoatIds)
        ? parsed.ownedBoatIds.filter((id): id is string => typeof id === 'string' && Boolean(getBoatDefinition(id)))
        : [];
      const selected = typeof parsed.selectedBoatId === 'string' && owned.includes(parsed.selectedBoatId)
        ? parsed.selectedBoatId
        : owned[0] ?? null;
      return {
        coins: typeof parsed.coins === 'number' && Number.isFinite(parsed.coins)
          ? Math.max(0, Math.floor(parsed.coins))
          : DEFAULT_PROGRESS.coins,
        ownedBoatIds: owned,
        selectedBoatId: selected,
        upgrades: parsed.upgrades && typeof parsed.upgrades === 'object' ? parsed.upgrades as BoatProgressData['upgrades'] : {},
      };
    } catch {
      return { ...DEFAULT_PROGRESS, ownedBoatIds: [], upgrades: {} };
    }
  }

  private save(): void {
    try {
      this.data.coins = this.coins;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // เกมยังเล่นต่อได้แม้ storage ถูกปิด
    }
  }
}
