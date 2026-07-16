import { LOADOUT_ITEMS, type LoadoutCategory, type LoadoutItemDefinition } from './CombatData';
import { gameStorage, type GameStorage } from '../persistence/GameStorage';
import { GAMEPLAY_STORAGE_KEYS } from '../persistence/storageKeys';

const STORAGE_KEY = GAMEPLAY_STORAGE_KEYS.loadout;

/** ลำดับช่องตามสเปก: 1 Style, 2 Sword, 3 Gun, 4 Fruit, 5 Utility */
export const SLOT_ORDER: LoadoutCategory[] = ['style', 'sword', 'gun', 'fruit', 'utility'];

interface LoadoutData {
  slots: Partial<Record<LoadoutCategory, string | null>>;
  activeCategory: LoadoutCategory;
}

/**
 * Loadout 5 ช่องของผู้เล่น — ตอนนี้มีของแค่ style/sword
 * แต่โครงสร้างรองรับ gun/fruit/utility ตั้งแต่ตอนนี้ (Phase 7-8 แค่เติม item + สกิลลง data)
 */
export class Loadout {
  private slots: Record<LoadoutCategory, string | null> = {
    style: 'basic-brawl',
    sword: 'training-sword',
    gun: null,
    fruit: null,
    utility: null,
  };
  private active: LoadoutCategory = 'style';

  constructor(private readonly storage: GameStorage = gameStorage()) {
    this.load();
  }

  get activeCategory(): LoadoutCategory {
    return this.active;
  }

  /** ของในช่องที่ active อยู่ (มีของเสมอ เพราะสลับได้เฉพาะช่องที่มีของ) */
  get activeItem(): LoadoutItemDefinition {
    const id = this.slots[this.active] ?? 'basic-brawl';
    return LOADOUT_ITEMS[id] ?? LOADOUT_ITEMS['basic-brawl'];
  }

  itemIn(category: LoadoutCategory): LoadoutItemDefinition | null {
    const id = this.slots[category];
    return id ? (LOADOUT_ITEMS[id] ?? null) : null;
  }

  equip(category: LoadoutCategory, itemId: string | null): void {
    this.slots[category] = itemId;
    if (category === this.active && !itemId) this.active = 'style';
    this.save();
  }

  /** สลับไปช่องถัดไปที่มีของ (ปุ่ม R / ปุ่มอาวุธมือถือ) */
  cycleActive(): LoadoutItemDefinition {
    const start = SLOT_ORDER.indexOf(this.active);
    for (let i = 1; i <= SLOT_ORDER.length; i++) {
      const category = SLOT_ORDER[(start + i) % SLOT_ORDER.length];
      if (this.slots[category]) {
        this.active = category;
        break;
      }
    }
    this.save();
    return this.activeItem;
  }

  private load(): void {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<LoadoutData>;
      if (data.slots) {
        for (const category of SLOT_ORDER) {
          const id = data.slots[category];
          if (id === null || (typeof id === 'string' && LOADOUT_ITEMS[id])) {
            this.slots[category] = id ?? null;
          }
        }
      }
      if (data.activeCategory && this.slots[data.activeCategory]) {
        this.active = data.activeCategory;
      }
    } catch {
      // ข้อมูลเสีย → ใช้ค่าเริ่มต้น
    }
  }

  private save(): void {
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ slots: this.slots, activeCategory: this.active } satisfies LoadoutData),
      );
    } catch {
      // storage ปิด — เล่นต่อได้ แค่ไม่จำ loadout
    }
  }
}
