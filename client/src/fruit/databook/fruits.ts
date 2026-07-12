import type { DevilFruitDefinition } from '../types';

/** Databook ผลไม้ทั้งหมด 41 ชนิด (ตาม Blox Fruits ปัจจุบัน) */
export const DEVIL_FRUITS: readonly DevilFruitDefinition[] = [
  {
    "id": "rocket",
    "name": "Rocket",
    "nameTh": "จรวด",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Rocket",
    "rarity": "common",
    "type": "natural",
    "price": 5000,
    "robux": 50,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "rocket-base-z",
        "rocket-base-x",
        "rocket-base-c",
        "rocket-base-f"
      ]
    },
    "skillIds": [
      "rocket-base-z",
      "rocket-base-x",
      "rocket-base-c",
      "rocket-base-f"
    ]
  },
  {
    "id": "spin",
    "name": "Spin",
    "nameTh": "หมุน",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Spin",
    "rarity": "common",
    "type": "natural",
    "price": 7500,
    "robux": 75,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "spin-base-z",
        "spin-base-x",
        "spin-base-c",
        "spin-base-f"
      ]
    },
    "skillIds": [
      "spin-base-z",
      "spin-base-x",
      "spin-base-c",
      "spin-base-f"
    ]
  },
  {
    "id": "blade",
    "name": "Blade",
    "nameTh": "ใบมีด",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Blade",
    "rarity": "common",
    "type": "natural",
    "price": 30000,
    "robux": 100,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "blade-base-m1",
        "blade-base-z",
        "blade-base-x",
        "blade-base-c",
        "blade-base-f"
      ]
    },
    "skillIds": [
      "blade-base-m1",
      "blade-base-z",
      "blade-base-x",
      "blade-base-c",
      "blade-base-f"
    ]
  },
  {
    "id": "spring",
    "name": "Spring",
    "nameTh": "สปริง",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Spring",
    "rarity": "common",
    "type": "natural",
    "price": 60000,
    "robux": 180,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "spring-base-z",
        "spring-base-x",
        "spring-base-c",
        "spring-base-v",
        "spring-base-f"
      ]
    },
    "skillIds": [
      "spring-base-z",
      "spring-base-x",
      "spring-base-c",
      "spring-base-v",
      "spring-base-f"
    ]
  },
  {
    "id": "bomb",
    "name": "Bomb",
    "nameTh": "ระเบิด",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Bomb",
    "rarity": "common",
    "type": "natural",
    "price": 80000,
    "robux": 220,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "bomb-base-m1",
        "bomb-base-z",
        "bomb-base-x",
        "bomb-base-c",
        "bomb-base-v",
        "bomb-base-f"
      ]
    },
    "skillIds": [
      "bomb-base-m1",
      "bomb-base-z",
      "bomb-base-x",
      "bomb-base-c",
      "bomb-base-v",
      "bomb-base-f"
    ]
  },
  {
    "id": "smoke",
    "name": "Smoke",
    "nameTh": "ควัน",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Smoke",
    "rarity": "common",
    "type": "elemental",
    "price": 100000,
    "robux": 250,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "smoke-base-z",
        "smoke-base-x",
        "smoke-base-c",
        "smoke-base-f"
      ]
    },
    "skillIds": [
      "smoke-base-z",
      "smoke-base-x",
      "smoke-base-c",
      "smoke-base-f"
    ]
  },
  {
    "id": "spike",
    "name": "Spike",
    "nameTh": "หนาม",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Spike",
    "rarity": "common",
    "type": "natural",
    "price": 180000,
    "robux": 380,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "spike-base-z",
        "spike-base-x",
        "spike-base-c",
        "spike-base-v"
      ]
    },
    "skillIds": [
      "spike-base-z",
      "spike-base-x",
      "spike-base-c",
      "spike-base-v"
    ]
  },
  {
    "id": "flame",
    "name": "Flame",
    "nameTh": "ไฟ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Flame",
    "rarity": "uncommon",
    "type": "elemental",
    "price": 250000,
    "robux": 550,
    "hasM1": false,
    "awakeningCost": 14500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "flame-moveset-v1-z",
        "flame-moveset-v1-x",
        "flame-moveset-v1-c",
        "flame-moveset-v1-v",
        "flame-moveset-v1-f"
      ],
      "moveset-v2": [
        "flame-moveset-v2-z",
        "flame-moveset-v2-x",
        "flame-moveset-v2-c",
        "flame-moveset-v2-v",
        "flame-moveset-v2-f"
      ]
    },
    "skillIds": [
      "flame-moveset-v1-z",
      "flame-moveset-v1-x",
      "flame-moveset-v1-c",
      "flame-moveset-v1-v",
      "flame-moveset-v1-f",
      "flame-moveset-v2-z",
      "flame-moveset-v2-x",
      "flame-moveset-v2-c",
      "flame-moveset-v2-v",
      "flame-moveset-v2-f"
    ]
  },
  {
    "id": "ice",
    "name": "Ice",
    "nameTh": "น้ำแข็ง",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Ice",
    "rarity": "uncommon",
    "type": "elemental",
    "price": 350000,
    "robux": 750,
    "hasM1": true,
    "awakeningCost": 14500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "ice-moveset-v1-z",
        "ice-moveset-v1-x",
        "ice-moveset-v1-c",
        "ice-moveset-v1-v"
      ],
      "moveset-v2": [
        "ice-moveset-v2-z",
        "ice-moveset-v2-x",
        "ice-moveset-v2-c",
        "ice-moveset-v2-v",
        "ice-moveset-v2-f"
      ]
    },
    "skillIds": [
      "ice-moveset-v1-z",
      "ice-moveset-v1-x",
      "ice-moveset-v1-c",
      "ice-moveset-v1-v",
      "ice-moveset-v2-z",
      "ice-moveset-v2-x",
      "ice-moveset-v2-c",
      "ice-moveset-v2-v",
      "ice-moveset-v2-f"
    ]
  },
  {
    "id": "sand",
    "name": "Sand",
    "nameTh": "ทราย",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Sand",
    "rarity": "uncommon",
    "type": "elemental",
    "price": 420000,
    "robux": 850,
    "hasM1": false,
    "awakeningCost": 14500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "sand-moveset-v1-z",
        "sand-moveset-v1-x",
        "sand-moveset-v1-c",
        "sand-moveset-v1-v",
        "sand-moveset-v1-f"
      ],
      "moveset-v2": [
        "sand-moveset-v2-z",
        "sand-moveset-v2-x",
        "sand-moveset-v2-c",
        "sand-moveset-v2-v",
        "sand-moveset-v2-f"
      ]
    },
    "skillIds": [
      "sand-moveset-v1-z",
      "sand-moveset-v1-x",
      "sand-moveset-v1-c",
      "sand-moveset-v1-v",
      "sand-moveset-v1-f",
      "sand-moveset-v2-z",
      "sand-moveset-v2-x",
      "sand-moveset-v2-c",
      "sand-moveset-v2-v",
      "sand-moveset-v2-f"
    ]
  },
  {
    "id": "dark",
    "name": "Dark",
    "nameTh": "ความมืด",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Dark",
    "rarity": "uncommon",
    "type": "elemental",
    "price": 500000,
    "robux": 950,
    "hasM1": false,
    "awakeningCost": 14500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "dark-moveset-v1-z",
        "dark-moveset-v1-x",
        "dark-moveset-v1-c",
        "dark-moveset-v1-v"
      ],
      "moveset-v2": [
        "dark-moveset-v2-z",
        "dark-moveset-v2-x",
        "dark-moveset-v2-c",
        "dark-moveset-v2-v",
        "dark-moveset-v2-f"
      ]
    },
    "skillIds": [
      "dark-moveset-v1-z",
      "dark-moveset-v1-x",
      "dark-moveset-v1-c",
      "dark-moveset-v1-v",
      "dark-moveset-v2-z",
      "dark-moveset-v2-x",
      "dark-moveset-v2-c",
      "dark-moveset-v2-v",
      "dark-moveset-v2-f"
    ]
  },
  {
    "id": "eagle",
    "name": "Eagle",
    "nameTh": "นกอินทรี",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Eagle",
    "rarity": "uncommon",
    "type": "beast",
    "price": 550000,
    "robux": 975,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "eagle-moveset-z",
        "eagle-moveset-x",
        "eagle-moveset-c",
        "eagle-moveset-v",
        "eagle-moveset-f"
      ]
    },
    "skillIds": [
      "eagle-moveset-z",
      "eagle-moveset-x",
      "eagle-moveset-c",
      "eagle-moveset-v",
      "eagle-moveset-f"
    ]
  },
  {
    "id": "diamond",
    "name": "Diamond",
    "nameTh": "เพชร",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Diamond",
    "rarity": "uncommon",
    "type": "natural",
    "price": 600000,
    "robux": 1000,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "diamond-moveset-z",
        "diamond-moveset-x",
        "diamond-moveset-c",
        "diamond-moveset-v"
      ]
    },
    "skillIds": [
      "diamond-moveset-z",
      "diamond-moveset-x",
      "diamond-moveset-c",
      "diamond-moveset-v"
    ]
  },
  {
    "id": "light",
    "name": "Light",
    "nameTh": "แสง",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Light",
    "rarity": "rare",
    "type": "elemental",
    "price": 650000,
    "robux": 1100,
    "hasM1": true,
    "awakeningCost": 14500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "light-moveset-v1-z",
        "light-moveset-v1-x",
        "light-moveset-v1-c",
        "light-moveset-v1-v",
        "light-moveset-v1-f"
      ],
      "moveset-v2": [
        "light-moveset-v2-z",
        "light-moveset-v2-x",
        "light-moveset-v2-c",
        "light-moveset-v2-v",
        "light-moveset-v2-f"
      ]
    },
    "skillIds": [
      "light-moveset-v1-z",
      "light-moveset-v1-x",
      "light-moveset-v1-c",
      "light-moveset-v1-v",
      "light-moveset-v1-f",
      "light-moveset-v2-z",
      "light-moveset-v2-x",
      "light-moveset-v2-c",
      "light-moveset-v2-v",
      "light-moveset-v2-f"
    ]
  },
  {
    "id": "rubber",
    "name": "Rubber",
    "nameTh": "ยาง",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Rubber",
    "rarity": "rare",
    "type": "natural",
    "price": 750000,
    "robux": 1200,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "rubber-moveset-z",
        "rubber-moveset-x",
        "rubber-moveset-c",
        "rubber-moveset-v",
        "rubber-moveset-f"
      ],
      "moveset-transformed": [
        "rubber-moveset-transformed-z",
        "rubber-moveset-transformed-x",
        "rubber-moveset-transformed-c",
        "rubber-moveset-transformed-v",
        "rubber-moveset-transformed-f"
      ]
    },
    "skillIds": [
      "rubber-moveset-z",
      "rubber-moveset-x",
      "rubber-moveset-c",
      "rubber-moveset-v",
      "rubber-moveset-f",
      "rubber-moveset-transformed-z",
      "rubber-moveset-transformed-x",
      "rubber-moveset-transformed-c",
      "rubber-moveset-transformed-v",
      "rubber-moveset-transformed-f"
    ]
  },
  {
    "id": "ghost",
    "name": "Ghost",
    "nameTh": "ผี",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Ghost",
    "rarity": "rare",
    "type": "natural",
    "price": 940000,
    "robux": 1275,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "ghost-moveset-z",
        "ghost-moveset-x",
        "ghost-moveset-c",
        "ghost-moveset-v",
        "ghost-moveset-f"
      ]
    },
    "skillIds": [
      "ghost-moveset-z",
      "ghost-moveset-x",
      "ghost-moveset-c",
      "ghost-moveset-v",
      "ghost-moveset-f"
    ]
  },
  {
    "id": "magma",
    "name": "Magma",
    "nameTh": "แมกม่า",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Magma",
    "rarity": "rare",
    "type": "elemental",
    "price": 960000,
    "robux": 1300,
    "hasM1": false,
    "awakeningCost": 14500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "magma-moveset-v1-z",
        "magma-moveset-v1-x",
        "magma-moveset-v1-c",
        "magma-moveset-v1-v",
        "magma-moveset-v1-f"
      ],
      "moveset-v2": [
        "magma-moveset-v2-z",
        "magma-moveset-v2-x",
        "magma-moveset-v2-c",
        "magma-moveset-v2-v",
        "magma-moveset-v2-f"
      ]
    },
    "skillIds": [
      "magma-moveset-v1-z",
      "magma-moveset-v1-x",
      "magma-moveset-v1-c",
      "magma-moveset-v1-v",
      "magma-moveset-v1-f",
      "magma-moveset-v2-z",
      "magma-moveset-v2-x",
      "magma-moveset-v2-c",
      "magma-moveset-v2-v",
      "magma-moveset-v2-f"
    ]
  },
  {
    "id": "quake",
    "name": "Quake",
    "nameTh": "แผ่นดินไหว",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Quake",
    "rarity": "legendary",
    "type": "natural",
    "price": 1000000,
    "robux": 1500,
    "hasM1": false,
    "awakeningCost": 17000,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v2": [
        "quake-moveset-v2-z",
        "quake-moveset-v2-x",
        "quake-moveset-v2-c",
        "quake-moveset-v2-v"
      ]
    },
    "skillIds": [
      "quake-moveset-v2-z",
      "quake-moveset-v2-x",
      "quake-moveset-v2-c",
      "quake-moveset-v2-v"
    ]
  },
  {
    "id": "buddha",
    "name": "Buddha",
    "nameTh": "พระพุทธเจ้า",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Buddha",
    "rarity": "legendary",
    "type": "beast",
    "price": 1200000,
    "robux": 1650,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "buddha-moveset-v1-z",
        "buddha-moveset-v1-x",
        "buddha-moveset-v1-c",
        "buddha-moveset-v1-v"
      ],
      "moveset-v2": [
        "buddha-moveset-v2-z",
        "buddha-moveset-v2-x",
        "buddha-moveset-v2-c",
        "buddha-moveset-v2-v",
        "buddha-moveset-v2-f"
      ]
    },
    "skillIds": [
      "buddha-moveset-v1-z",
      "buddha-moveset-v1-x",
      "buddha-moveset-v1-c",
      "buddha-moveset-v1-v",
      "buddha-moveset-v2-z",
      "buddha-moveset-v2-x",
      "buddha-moveset-v2-c",
      "buddha-moveset-v2-v",
      "buddha-moveset-v2-f"
    ]
  },
  {
    "id": "love",
    "name": "Love",
    "nameTh": "ความรัก",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Love",
    "rarity": "legendary",
    "type": "natural",
    "price": 1300000,
    "robux": 1700,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "love-base-z",
        "love-base-x",
        "love-base-c",
        "love-base-v",
        "love-base-f"
      ]
    },
    "skillIds": [
      "love-base-z",
      "love-base-x",
      "love-base-c",
      "love-base-v",
      "love-base-f"
    ]
  },
  {
    "id": "creation",
    "name": "Creation",
    "nameTh": "การสร้างสรรค์",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Creation",
    "rarity": "legendary",
    "type": "natural",
    "price": 1400000,
    "robux": 1750,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "creation-moveset-z",
        "creation-moveset-x",
        "creation-moveset-c",
        "creation-moveset-v",
        "creation-moveset-f"
      ]
    },
    "skillIds": [
      "creation-moveset-z",
      "creation-moveset-x",
      "creation-moveset-c",
      "creation-moveset-v",
      "creation-moveset-f"
    ]
  },
  {
    "id": "spider",
    "name": "Spider",
    "nameTh": "แมงมุม",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Spider",
    "rarity": "legendary",
    "type": "natural",
    "price": 1500000,
    "robux": 1800,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "spider-base-z",
        "spider-base-x",
        "spider-base-c",
        "spider-base-v",
        "spider-base-f",
        "spider-base-z",
        "spider-base-x",
        "spider-base-c",
        "spider-base-v",
        "spider-base-f"
      ]
    },
    "skillIds": [
      "spider-base-z",
      "spider-base-x",
      "spider-base-c",
      "spider-base-v",
      "spider-base-f",
      "spider-base-z",
      "spider-base-x",
      "spider-base-c",
      "spider-base-v",
      "spider-base-f"
    ]
  },
  {
    "id": "sound",
    "name": "Sound",
    "nameTh": "เสียง",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Sound",
    "rarity": "legendary",
    "type": "natural",
    "price": 1700000,
    "robux": 1900,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "sound-moveset-z",
        "sound-moveset-x",
        "sound-moveset-c",
        "sound-moveset-v",
        "sound-moveset-f",
        "sound-moveset-z",
        "sound-moveset-x",
        "sound-moveset-c",
        "sound-moveset-v",
        "sound-moveset-f"
      ]
    },
    "skillIds": [
      "sound-moveset-z",
      "sound-moveset-x",
      "sound-moveset-c",
      "sound-moveset-v",
      "sound-moveset-f",
      "sound-moveset-z",
      "sound-moveset-x",
      "sound-moveset-c",
      "sound-moveset-v",
      "sound-moveset-f"
    ]
  },
  {
    "id": "phoenix",
    "name": "Phoenix",
    "nameTh": "ฟีนิกซ์",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Phoenix",
    "rarity": "legendary",
    "type": "beast",
    "price": 1800000,
    "robux": 2000,
    "hasM1": false,
    "awakeningCost": 18500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "phoenix-moveset-v1-z",
        "phoenix-moveset-v1-x",
        "phoenix-moveset-v1-c",
        "phoenix-moveset-v1-v",
        "phoenix-moveset-v1-f",
        "phoenix-moveset-v1-z",
        "phoenix-moveset-v1-x",
        "phoenix-moveset-v1-c",
        "phoenix-moveset-v1-v"
      ],
      "moveset-v2": [
        "phoenix-moveset-v2-z",
        "phoenix-moveset-v2-x",
        "phoenix-moveset-v2-c",
        "phoenix-moveset-v2-v",
        "phoenix-moveset-v2-f",
        "phoenix-moveset-v2-z",
        "phoenix-moveset-v2-x",
        "phoenix-moveset-v2-c",
        "phoenix-moveset-v2-v",
        "phoenix-moveset-v2-f"
      ]
    },
    "skillIds": [
      "phoenix-moveset-v1-z",
      "phoenix-moveset-v1-x",
      "phoenix-moveset-v1-c",
      "phoenix-moveset-v1-v",
      "phoenix-moveset-v1-f",
      "phoenix-moveset-v1-z",
      "phoenix-moveset-v1-x",
      "phoenix-moveset-v1-c",
      "phoenix-moveset-v1-v",
      "phoenix-moveset-v2-z",
      "phoenix-moveset-v2-x",
      "phoenix-moveset-v2-c",
      "phoenix-moveset-v2-v",
      "phoenix-moveset-v2-f",
      "phoenix-moveset-v2-z",
      "phoenix-moveset-v2-x",
      "phoenix-moveset-v2-c",
      "phoenix-moveset-v2-v",
      "phoenix-moveset-v2-f"
    ]
  },
  {
    "id": "portal",
    "name": "Portal",
    "nameTh": "พอร์ทัล",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Portal",
    "rarity": "legendary",
    "type": "natural",
    "price": 1900000,
    "robux": 2000,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "base": [
        "portal-base-m1",
        "portal-base-z",
        "portal-base-x",
        "portal-base-c",
        "portal-base-v",
        "portal-base-f"
      ]
    },
    "skillIds": [
      "portal-base-m1",
      "portal-base-z",
      "portal-base-x",
      "portal-base-c",
      "portal-base-v",
      "portal-base-f"
    ]
  },
  {
    "id": "lightning",
    "name": "Lightning",
    "nameTh": "สายฟ้า",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Lightning",
    "rarity": "legendary",
    "type": "elemental",
    "price": 2100000,
    "robux": 2100,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "lightning-moveset-z",
        "lightning-moveset-x",
        "lightning-moveset-c",
        "lightning-moveset-v",
        "lightning-moveset-f"
      ]
    },
    "skillIds": [
      "lightning-moveset-z",
      "lightning-moveset-x",
      "lightning-moveset-c",
      "lightning-moveset-v",
      "lightning-moveset-f"
    ]
  },
  {
    "id": "pain",
    "name": "Pain",
    "nameTh": "ความเจ็บปวด",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Pain",
    "rarity": "legendary",
    "type": "natural",
    "price": 2300000,
    "robux": 2200,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [
      "Pain Meter",
      "Last Stand",
      "Pain Ghosts"
    ],
    "movesets": {
      "moveset": [
        "pain-moveset-z",
        "pain-moveset-x",
        "pain-moveset-c",
        "pain-moveset-v",
        "pain-moveset-f"
      ]
    },
    "skillIds": [
      "pain-moveset-z",
      "pain-moveset-x",
      "pain-moveset-c",
      "pain-moveset-v",
      "pain-moveset-f"
    ]
  },
  {
    "id": "blizzard",
    "name": "Blizzard",
    "nameTh": "พายุหิมะ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Blizzard",
    "rarity": "legendary",
    "type": "elemental",
    "price": 2400000,
    "robux": 2250,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "blizzard-moveset-z",
        "blizzard-moveset-x",
        "blizzard-moveset-c",
        "blizzard-moveset-v",
        "blizzard-moveset-f"
      ]
    },
    "skillIds": [
      "blizzard-moveset-z",
      "blizzard-moveset-x",
      "blizzard-moveset-c",
      "blizzard-moveset-v",
      "blizzard-moveset-f"
    ]
  },
  {
    "id": "gravity",
    "name": "Gravity",
    "nameTh": "แรงโน้มถ่วง",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Gravity",
    "rarity": "mythical",
    "type": "natural",
    "price": 2500000,
    "robux": 2300,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "gravity-moveset-z",
        "gravity-moveset-x",
        "gravity-moveset-c",
        "gravity-moveset-v",
        "gravity-moveset-f"
      ]
    },
    "skillIds": [
      "gravity-moveset-z",
      "gravity-moveset-x",
      "gravity-moveset-c",
      "gravity-moveset-v",
      "gravity-moveset-f"
    ]
  },
  {
    "id": "mammoth",
    "name": "Mammoth",
    "nameTh": "แมมมอธ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Mammoth",
    "rarity": "mythical",
    "type": "beast",
    "price": 2700000,
    "robux": 2350,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "mammoth-moveset-z",
        "mammoth-moveset-x",
        "mammoth-moveset-c",
        "mammoth-moveset-v",
        "mammoth-moveset-f"
      ],
      "moveset-transformed": [
        "mammoth-moveset-transformed-z",
        "mammoth-moveset-transformed-x",
        "mammoth-moveset-transformed-c",
        "mammoth-moveset-transformed-v",
        "mammoth-moveset-transformed-f"
      ]
    },
    "skillIds": [
      "mammoth-moveset-z",
      "mammoth-moveset-x",
      "mammoth-moveset-c",
      "mammoth-moveset-v",
      "mammoth-moveset-f",
      "mammoth-moveset-transformed-z",
      "mammoth-moveset-transformed-x",
      "mammoth-moveset-transformed-c",
      "mammoth-moveset-transformed-v",
      "mammoth-moveset-transformed-f"
    ]
  },
  {
    "id": "t-rex",
    "name": "T-Rex",
    "nameTh": "ไทแรนโนซอรัส",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/T-Rex",
    "rarity": "mythical",
    "type": "beast",
    "price": 2700000,
    "robux": 2350,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "t-rex-moveset-z",
        "t-rex-moveset-x",
        "t-rex-moveset-c",
        "t-rex-moveset-v",
        "t-rex-moveset-f"
      ],
      "moveset-transformed": [
        "t-rex-moveset-transformed-z",
        "t-rex-moveset-transformed-x",
        "t-rex-moveset-transformed-c",
        "t-rex-moveset-transformed-v",
        "t-rex-moveset-transformed-f"
      ]
    },
    "skillIds": [
      "t-rex-moveset-z",
      "t-rex-moveset-x",
      "t-rex-moveset-c",
      "t-rex-moveset-v",
      "t-rex-moveset-f",
      "t-rex-moveset-transformed-z",
      "t-rex-moveset-transformed-x",
      "t-rex-moveset-transformed-c",
      "t-rex-moveset-transformed-v",
      "t-rex-moveset-transformed-f"
    ]
  },
  {
    "id": "dough",
    "name": "Dough",
    "nameTh": "แป้งโด",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Dough",
    "rarity": "mythical",
    "type": "elemental",
    "price": 2800000,
    "robux": 2400,
    "hasM1": false,
    "awakeningCost": 18500,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-v1": [
        "dough-moveset-v1-z",
        "dough-moveset-v1-x",
        "dough-moveset-v1-c",
        "dough-moveset-v1-v",
        "dough-moveset-v1-f"
      ],
      "moveset-v2": [
        "dough-moveset-v2-m1",
        "dough-moveset-v2-z",
        "dough-moveset-v2-x",
        "dough-moveset-v2-c",
        "dough-moveset-v2-v",
        "dough-moveset-v2-f"
      ]
    },
    "skillIds": [
      "dough-moveset-v1-z",
      "dough-moveset-v1-x",
      "dough-moveset-v1-c",
      "dough-moveset-v1-v",
      "dough-moveset-v1-f",
      "dough-moveset-v2-m1",
      "dough-moveset-v2-z",
      "dough-moveset-v2-x",
      "dough-moveset-v2-c",
      "dough-moveset-v2-v",
      "dough-moveset-v2-f"
    ]
  },
  {
    "id": "shadow",
    "name": "Shadow",
    "nameTh": "เงา",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Shadow",
    "rarity": "mythical",
    "type": "natural",
    "price": 2900000,
    "robux": 2425,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "shadow-moveset-z",
        "shadow-moveset-x",
        "shadow-moveset-c",
        "shadow-moveset-v",
        "shadow-moveset-f"
      ]
    },
    "skillIds": [
      "shadow-moveset-z",
      "shadow-moveset-x",
      "shadow-moveset-c",
      "shadow-moveset-v",
      "shadow-moveset-f"
    ]
  },
  {
    "id": "venom",
    "name": "Venom",
    "nameTh": "พิษ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Venom",
    "rarity": "mythical",
    "type": "natural",
    "price": 3000000,
    "robux": 2450,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset-transformed": [
        "venom-moveset-transformed-z",
        "venom-moveset-transformed-x",
        "venom-moveset-transformed-c",
        "venom-moveset-transformed-v",
        "venom-moveset-transformed-f"
      ]
    },
    "skillIds": [
      "venom-moveset-transformed-z",
      "venom-moveset-transformed-x",
      "venom-moveset-transformed-c",
      "venom-moveset-transformed-v",
      "venom-moveset-transformed-f"
    ]
  },
  {
    "id": "gas",
    "name": "Gas",
    "nameTh": "ก๊าซ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Gas",
    "rarity": "mythical",
    "type": "elemental",
    "price": 3200000,
    "robux": 2500,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "gas-moveset-z",
        "gas-moveset-x",
        "gas-moveset-c",
        "gas-moveset-v",
        "gas-moveset-f",
        "gas-moveset-z",
        "gas-moveset-x",
        "gas-moveset-c",
        "gas-moveset-v",
        "gas-moveset-f"
      ]
    },
    "skillIds": [
      "gas-moveset-z",
      "gas-moveset-x",
      "gas-moveset-c",
      "gas-moveset-v",
      "gas-moveset-f",
      "gas-moveset-z",
      "gas-moveset-x",
      "gas-moveset-c",
      "gas-moveset-v",
      "gas-moveset-f"
    ]
  },
  {
    "id": "spirit",
    "name": "Spirit",
    "nameTh": "วิญญาณ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Spirit",
    "rarity": "mythical",
    "type": "natural",
    "price": 3400000,
    "robux": 2550,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "spirit-moveset-m1",
        "spirit-moveset-z",
        "spirit-moveset-x",
        "spirit-moveset-c",
        "spirit-moveset-v",
        "spirit-moveset-f"
      ]
    },
    "skillIds": [
      "spirit-moveset-m1",
      "spirit-moveset-z",
      "spirit-moveset-x",
      "spirit-moveset-c",
      "spirit-moveset-v",
      "spirit-moveset-f"
    ]
  },
  {
    "id": "tiger",
    "name": "Tiger",
    "nameTh": "เสือ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Tiger",
    "rarity": "mythical",
    "type": "beast",
    "price": 5000000,
    "robux": 3000,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "tiger-moveset-z",
        "tiger-moveset-x",
        "tiger-moveset-c",
        "tiger-moveset-v",
        "tiger-moveset-f",
        "tiger-moveset-z",
        "tiger-moveset-x",
        "tiger-moveset-c",
        "tiger-moveset-v",
        "tiger-moveset-f",
        "tiger-moveset-z",
        "tiger-moveset-x",
        "tiger-moveset-c",
        "tiger-moveset-v",
        "tiger-moveset-f"
      ]
    },
    "skillIds": [
      "tiger-moveset-z",
      "tiger-moveset-x",
      "tiger-moveset-c",
      "tiger-moveset-v",
      "tiger-moveset-f",
      "tiger-moveset-z",
      "tiger-moveset-x",
      "tiger-moveset-c",
      "tiger-moveset-v",
      "tiger-moveset-f",
      "tiger-moveset-z",
      "tiger-moveset-x",
      "tiger-moveset-c",
      "tiger-moveset-v",
      "tiger-moveset-f"
    ]
  },
  {
    "id": "yeti",
    "name": "Yeti",
    "nameTh": "เยติ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Yeti",
    "rarity": "mythical",
    "type": "beast",
    "price": 5000000,
    "robux": 3000,
    "hasM1": false,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "yeti-moveset-z",
        "yeti-moveset-x",
        "yeti-moveset-c",
        "yeti-moveset-v",
        "yeti-moveset-f"
      ],
      "moveset-transformed": [
        "yeti-moveset-transformed-z",
        "yeti-moveset-transformed-x",
        "yeti-moveset-transformed-c",
        "yeti-moveset-transformed-v",
        "yeti-moveset-transformed-f"
      ]
    },
    "skillIds": [
      "yeti-moveset-z",
      "yeti-moveset-x",
      "yeti-moveset-c",
      "yeti-moveset-v",
      "yeti-moveset-f",
      "yeti-moveset-transformed-z",
      "yeti-moveset-transformed-x",
      "yeti-moveset-transformed-c",
      "yeti-moveset-transformed-v",
      "yeti-moveset-transformed-f"
    ]
  },
  {
    "id": "kitsune",
    "name": "Kitsune",
    "nameTh": "คิตสึเนะ",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Kitsune",
    "rarity": "mythical",
    "type": "beast",
    "price": 8000000,
    "robux": 4000,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "kitsune-moveset-z",
        "kitsune-moveset-x",
        "kitsune-moveset-c",
        "kitsune-moveset-v",
        "kitsune-moveset-f"
      ],
      "moveset-transformed": [
        "kitsune-moveset-transformed-z",
        "kitsune-moveset-transformed-x",
        "kitsune-moveset-transformed-c",
        "kitsune-moveset-transformed-v",
        "kitsune-moveset-transformed-f"
      ]
    },
    "skillIds": [
      "kitsune-moveset-z",
      "kitsune-moveset-x",
      "kitsune-moveset-c",
      "kitsune-moveset-v",
      "kitsune-moveset-f",
      "kitsune-moveset-transformed-z",
      "kitsune-moveset-transformed-x",
      "kitsune-moveset-transformed-c",
      "kitsune-moveset-transformed-v",
      "kitsune-moveset-transformed-f"
    ]
  },
  {
    "id": "control",
    "name": "Control",
    "nameTh": "คอนโทรล",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Control",
    "rarity": "mythical",
    "type": "natural",
    "price": 9000000,
    "robux": 4000,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [
      "Domain Amplification",
      "Maximum Output",
      "Anti-drown Protocol",
      "Slicing Execution"
    ],
    "movesets": {
      "moveset": [
        "control-moveset-z",
        "control-moveset-x",
        "control-moveset-c",
        "control-moveset-f",
        "control-moveset-z",
        "control-moveset-x",
        "control-moveset-c",
        "control-moveset-v",
        "control-moveset-f",
        "control-moveset-z",
        "control-moveset-x",
        "control-moveset-c",
        "control-moveset-v",
        "control-moveset-f"
      ]
    },
    "skillIds": [
      "control-moveset-z",
      "control-moveset-x",
      "control-moveset-c",
      "control-moveset-f",
      "control-moveset-z",
      "control-moveset-x",
      "control-moveset-c",
      "control-moveset-v",
      "control-moveset-f",
      "control-moveset-z",
      "control-moveset-x",
      "control-moveset-c",
      "control-moveset-v",
      "control-moveset-f"
    ]
  },
  {
    "id": "dragon",
    "name": "Dragon",
    "nameTh": "มังกร",
    "wikiUrl": "https://blox-fruits.fandom.com/wiki/Dragon",
    "rarity": "mythical",
    "type": "beast",
    "price": 15000000,
    "robux": 5000,
    "hasM1": true,
    "awakeningCost": null,
    "upgradeCost": null,
    "passives": [],
    "movesets": {
      "moveset": [
        "dragon-moveset-z",
        "dragon-moveset-x",
        "dragon-moveset-c",
        "dragon-moveset-v",
        "dragon-moveset-f",
        "dragon-moveset-z",
        "dragon-moveset-x",
        "dragon-moveset-c",
        "dragon-moveset-v",
        "dragon-moveset-f",
        "dragon-moveset-z",
        "dragon-moveset-x",
        "dragon-moveset-c",
        "dragon-moveset-v",
        "dragon-moveset-f",
        "dragon-moveset-z",
        "dragon-moveset-x",
        "dragon-moveset-c",
        "dragon-moveset-v",
        "dragon-moveset-f"
      ]
    },
    "skillIds": [
      "dragon-moveset-z",
      "dragon-moveset-x",
      "dragon-moveset-c",
      "dragon-moveset-v",
      "dragon-moveset-f",
      "dragon-moveset-z",
      "dragon-moveset-x",
      "dragon-moveset-c",
      "dragon-moveset-v",
      "dragon-moveset-f",
      "dragon-moveset-z",
      "dragon-moveset-x",
      "dragon-moveset-c",
      "dragon-moveset-v",
      "dragon-moveset-f",
      "dragon-moveset-z",
      "dragon-moveset-x",
      "dragon-moveset-c",
      "dragon-moveset-v",
      "dragon-moveset-f"
    ]
  }
] as const;

export const DEVIL_FRUIT_BY_ID: Readonly<Record<string, DevilFruitDefinition>> = Object.fromEntries(
  DEVIL_FRUITS.map((f) => [f.id, f]),
);
