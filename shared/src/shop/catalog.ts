/** Canonical shop catalog shared by browser and Server so rarity cannot be forged. */
export type ShopItemKind = 'sword' | 'gun' | 'fighting-style' | 'fruit';
export type ShopRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';

export interface ShopCatalogEntry {
  kind: ShopItemKind;
  id: string;
  rarity: ShopRarity;
}

export const SHOP_DRAW_COST = 150;
export const SHOP_PROTOCOL_SCHEMA_VERSION = 1;

export const SHOP_RARITY_WEIGHT: Record<ShopRarity, number> = {
  common: 600,
  uncommon: 260,
  rare: 100,
  legendary: 35,
  mythical: 8,
};

const entry = (kind: ShopItemKind, id: string, rarity: ShopRarity): ShopCatalogEntry => ({
  kind,
  id,
  rarity,
});

export const SHOP_GACHA_CATALOG: readonly ShopCatalogEntry[] = [
  entry('sword', 'bisento', 'legendary'),
  entry('sword', 'buddy-sword', 'legendary'),
  entry('sword', 'canvander', 'legendary'),
  entry('sword', 'cursed-dual-katana', 'mythical'),
  entry('sword', 'cutlass', 'common'),
  entry('sword', 'dark-blade', 'mythical'),
  entry('sword', 'dark-dagger', 'legendary'),
  entry('sword', 'dragon-trident', 'rare'),
  entry('sword', 'dragonheart', 'legendary'),
  entry('sword', 'dual-katana', 'common'),
  entry('sword', 'dual-headed-blade', 'rare'),
  entry('sword', 'flail', 'rare'),
  entry('sword', 'fox-lamp', 'legendary'),
  entry('sword', 'gravity-blade', 'rare'),
  entry('sword', 'hallow-scythe', 'mythical'),
  entry('sword', 'iron-mace', 'uncommon'),
  entry('sword', 'katana', 'common'),
  entry('sword', 'koko', 'legendary'),
  entry('sword', 'longsword', 'rare'),
  entry('sword', 'midnight-blade', 'legendary'),
  entry('sword', 'oroshi', 'legendary'),
  entry('sword', 'pipe', 'rare'),
  entry('sword', 'pole-1st-form', 'legendary'),
  entry('sword', 'pole-2nd-form', 'legendary'),
  entry('sword', 'rengoku', 'legendary'),
  entry('sword', 'saber', 'legendary'),
  entry('sword', 'saishi', 'legendary'),
  entry('sword', 'shark-anchor', 'legendary'),
  entry('sword', 'shark-saw', 'uncommon'),
  entry('sword', 'shizu', 'legendary'),
  entry('sword', 'soul-cane', 'rare'),
  entry('sword', 'spikey-trident', 'legendary'),
  entry('sword', 'trident', 'rare'),
  entry('sword', 'triple-dark-blade', 'mythical'),
  entry('sword', 'triple-katana', 'uncommon'),
  entry('sword', 'true-triple-katana', 'mythical'),
  entry('sword', 'tushita', 'legendary'),
  entry('sword', 'twin-hooks', 'uncommon'),
  entry('sword', 'wardens-sword', 'rare'),
  entry('sword', 'yama', 'legendary'),
  entry('gun', 'acidum-rifle', 'rare'),
  entry('gun', 'bazooka', 'legendary'),
  entry('gun', 'bizarre-revolver', 'rare'),
  entry('gun', 'bizarre-rifle', 'rare'),
  entry('gun', 'cannon', 'rare'),
  entry('gun', 'dragonstorm', 'legendary'),
  entry('gun', 'dual-flintlock', 'rare'),
  entry('gun', 'flintlock', 'uncommon'),
  entry('gun', 'kabucha', 'legendary'),
  entry('gun', 'magma-blaster', 'rare'),
  entry('gun', 'musket', 'uncommon'),
  entry('gun', 'refined-flintlock', 'rare'),
  entry('gun', 'refined-musket', 'rare'),
  entry('gun', 'refined-slingshot', 'rare'),
  entry('gun', 'skull-guitar', 'mythical'),
  entry('gun', 'slingshot', 'common'),
  entry('gun', 'venom-bow', 'legendary'),
  entry('fighting-style', 'dark-step', 'legendary'),
  entry('fighting-style', 'electric', 'legendary'),
  entry('fighting-style', 'water-kung-fu', 'legendary'),
  entry('fighting-style', 'death-step', 'legendary'),
  entry('fighting-style', 'electric-claw', 'legendary'),
  entry('fighting-style', 'sharkman-karate', 'legendary'),
  entry('fighting-style', 'dragon-breath', 'legendary'),
  entry('fighting-style', 'superhuman', 'legendary'),
  entry('fighting-style', 'dragon-talon', 'legendary'),
  entry('fighting-style', 'godhuman', 'legendary'),
  entry('fighting-style', 'sanguine-art', 'legendary'),
  entry('fruit', 'rocket', 'common'),
  entry('fruit', 'spin', 'common'),
  entry('fruit', 'blade', 'common'),
  entry('fruit', 'spring', 'common'),
  entry('fruit', 'bomb', 'common'),
  entry('fruit', 'smoke', 'common'),
  entry('fruit', 'spike', 'common'),
  entry('fruit', 'flame', 'uncommon'),
  entry('fruit', 'ice', 'uncommon'),
  entry('fruit', 'sand', 'uncommon'),
  entry('fruit', 'dark', 'uncommon'),
  entry('fruit', 'eagle', 'uncommon'),
  entry('fruit', 'diamond', 'uncommon'),
  entry('fruit', 'light', 'rare'),
  entry('fruit', 'rubber', 'rare'),
  entry('fruit', 'ghost', 'rare'),
  entry('fruit', 'magma', 'rare'),
  entry('fruit', 'quake', 'legendary'),
  entry('fruit', 'buddha', 'legendary'),
  entry('fruit', 'love', 'legendary'),
  entry('fruit', 'creation', 'legendary'),
  entry('fruit', 'spider', 'legendary'),
  entry('fruit', 'sound', 'legendary'),
  entry('fruit', 'phoenix', 'legendary'),
  entry('fruit', 'portal', 'legendary'),
  entry('fruit', 'lightning', 'legendary'),
  entry('fruit', 'pain', 'legendary'),
  entry('fruit', 'blizzard', 'legendary'),
  entry('fruit', 'gravity', 'mythical'),
  entry('fruit', 'mammoth', 'mythical'),
  entry('fruit', 't-rex', 'mythical'),
  entry('fruit', 'dough', 'mythical'),
  entry('fruit', 'shadow', 'mythical'),
  entry('fruit', 'venom', 'mythical'),
  entry('fruit', 'gas', 'mythical'),
  entry('fruit', 'spirit', 'mythical'),
  entry('fruit', 'tiger', 'mythical'),
  entry('fruit', 'yeti', 'mythical'),
  entry('fruit', 'kitsune', 'mythical'),
  entry('fruit', 'control', 'mythical'),
  entry('fruit', 'dragon', 'mythical'),
];

export const SHOP_POTIONS = {
  'potion-hp': { price: 40 },
  'potion-mp': { price: 40 },
} as const;

export type ShopPotionId = keyof typeof SHOP_POTIONS;

export interface ShopPurchaseRequest {
  schemaVersion: typeof SHOP_PROTOCOL_SCHEMA_VERSION;
  idempotencyKey: string;
  action: 'draw' | 'potion';
  potionId?: ShopPotionId;
}

export interface ShopPurchaseResponse {
  ok: true;
  schemaVersion: typeof SHOP_PROTOCOL_SCHEMA_VERSION;
  action: 'draw' | 'potion';
  coins: number;
  item: ShopCatalogEntry | { kind: 'consumable'; id: ShopPotionId; rarity: 'common' };
  quantity: number;
  isNew: boolean;
  idempotentReplay: boolean;
}
