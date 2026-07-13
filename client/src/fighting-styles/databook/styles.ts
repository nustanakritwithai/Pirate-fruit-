import type { FightingStyleDefinition } from '../types';

export const FIGHTING_STYLES: readonly FightingStyleDefinition[] = [
  {
    "id": "combat",
    "name": "Combat",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Combat",
    "sea": 1,
    "seaTier": "first-sea",
    "teacher": "",
    "price": 0,
    "skillIds": [
      "combat-z",
      "combat-x"
    ],
    "nameTh": "หมัดทั่วไป"
  },
  {
    "id": "dark-step",
    "name": "Dark Step",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Dark_Step",
    "sea": 123,
    "seaTier": "third-sea",
    "teacher": "Pirate Village",
    "price": 150000,
    "skillIds": [
      "dark-step-z",
      "dark-step-x",
      "dark-step-c",
      "dark-step-v"
    ],
    "nameTh": "ดาร์กสเต็ป"
  },
  {
    "id": "electric",
    "name": "Electric",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Electric",
    "sea": 123,
    "seaTier": "third-sea",
    "teacher": "",
    "price": 0,
    "skillIds": [
      "electric-z",
      "electric-x",
      "electric-c"
    ],
    "nameTh": "อิเล็กทริก"
  },
  {
    "id": "water-kung-fu",
    "name": "Water Kung Fu",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Water_Kung_Fu",
    "sea": 123,
    "seaTier": "third-sea",
    "teacher": "Underwater City",
    "price": 750000,
    "skillIds": [
      "water-kung-fu-z",
      "water-kung-fu-x",
      "water-kung-fu-c"
    ],
    "nameTh": "กังฟูน้ำ"
  },
  {
    "id": "death-step",
    "name": "Death Step",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Death_Step",
    "sea": 23,
    "seaTier": "third-sea",
    "teacher": "Ice Castle",
    "price": 0,
    "skillIds": [
      "death-step-z",
      "death-step-x",
      "death-step-c",
      "death-step-v"
    ],
    "nameTh": "เดธสเต็ป"
  },
  {
    "id": "electric-claw",
    "name": "Electric Claw",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Electric_Claw",
    "sea": 3,
    "seaTier": "third-sea",
    "teacher": "Floating Turtle",
    "price": 0,
    "skillIds": [
      "electric-claw-z",
      "electric-claw-x",
      "electric-claw-c"
    ],
    "nameTh": "กรงเล็บไฟฟ้า"
  },
  {
    "id": "sharkman-karate",
    "name": "Sharkman Karate",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Sharkman_Karate",
    "sea": 23,
    "seaTier": "third-sea",
    "teacher": "Forgotten Island",
    "price": 0,
    "skillIds": [
      "sharkman-karate-z",
      "sharkman-karate-x",
      "sharkman-karate-c"
    ],
    "nameTh": "ชาร์คแมน คาราเต้"
  },
  {
    "id": "dragon-breath",
    "name": "Dragon Breath",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Dragon_Breath",
    "sea": 23,
    "seaTier": "third-sea",
    "teacher": "",
    "price": 0,
    "skillIds": [
      "dragon-breath-z",
      "dragon-breath-x",
      "dragon-breath-c"
    ],
    "nameTh": "ลมหายใจมังกร"
  },
  {
    "id": "superhuman",
    "name": "Superhuman",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Superhuman",
    "sea": 23,
    "seaTier": "third-sea",
    "teacher": "Snow Mountain",
    "price": 3000000,
    "skillIds": [
      "superhuman-z",
      "superhuman-x",
      "superhuman-c"
    ],
    "nameTh": "ซูเปอร์ฮิวแมน"
  },
  {
    "id": "dragon-talon",
    "name": "Dragon Talon",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Dragon_Talon",
    "sea": 3,
    "seaTier": "third-sea",
    "teacher": "Dragon Dojo",
    "price": 0,
    "skillIds": [
      "dragon-talon-z",
      "dragon-talon-x",
      "dragon-talon-c"
    ],
    "nameTh": "กรงเล็บมังกร"
  },
  {
    "id": "godhuman",
    "name": "Godhuman",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Godhuman",
    "sea": 3,
    "seaTier": "third-sea",
    "teacher": "Floating Turtle",
    "price": 5000000,
    "skillIds": [
      "godhuman-z",
      "godhuman-x",
      "godhuman-c"
    ],
    "nameTh": "ก็อดฮิวแมน"
  },
  {
    "id": "sanguine-art",
    "name": "Sanguine Art",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Sanguine_Art",
    "sea": 3,
    "seaTier": "third-sea",
    "teacher": "Tiki Outpost",
    "price": 0,
    "skillIds": [
      "sanguine-art-z",
      "sanguine-art-x",
      "sanguine-art-c"
    ],
    "nameTh": "ศิลปะเลือด"
  }
] as const;

export const FIGHTING_STYLE_BY_ID: Readonly<Record<string, FightingStyleDefinition>> = Object.fromEntries(FIGHTING_STYLES.map((s) => [s.id, s]));
