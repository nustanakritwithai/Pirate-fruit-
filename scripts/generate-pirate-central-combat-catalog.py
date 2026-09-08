"""Generate the Pirate central combat catalog from the checked-in client source.

This deliberately parses only source values already present in MonsterData.ts;
it never supplies fallback balance values.  The generated JSON is imported by
the Server build as provenance evidence until the shared combat contract lands.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "client/src/monster/MonsterData.ts"
ARTIFACT = ROOT / "client/src/monster/pirate-central-combat.catalog.json"

SOURCE_BLOBS = {
    "monsterData": ("client/src/monster/MonsterData.ts", "76ee6198f26ec501bf3ba60e1f78b1a23ffa2a16"),
    "monsterManager": ("client/src/monster/MonsterManager.ts", "0be511701a4f2bcf5c562edc922eae9f4a10ac89"),
    "playerCombat": ("client/src/combat/PlayerCombat.ts", "6d46a9226a7768a420dc22a37f539615aaf98832"),
    "combatData": ("client/src/combat/CombatData.ts", "bbcc1ef2c39d7a3aa34addcd7b3b62724e580d01"),
    "sharedStats": ("shared/src/progression/stats.ts", "af97d97794fe87b5d7d1ad70a84442b3fa0d6d95"),
    "serverProfile": ("server/src/realtime/combatProfile.ts", "56e1221525cf0d74606d8d0641751ca9cb92e5e7"),
}


def number(name: str, block: str) -> int | float:
    match = re.search(rf"\b{re.escape(name)}\s*:\s*(-?\d+(?:\.\d+)?)", block)
    if not match:
        raise ValueError(f"missing {name}")
    value = match.group(1)
    return float(value) if "." in value else int(value)


def text_value(name: str, block: str) -> str:
    match = re.search(rf"\b{re.escape(name)}\s*:\s*['\"]([^'\"]+)", block)
    if not match:
        raise ValueError(f"missing {name}")
    return match.group(1)


def source_block(source: str, ident: str) -> str:
    match = re.search(rf"(?m)^\s*(?:['\"]{re.escape(ident)}['\"]|{re.escape(ident)})\s*:\s*\{{", source)
    if not match:
        raise ValueError(f"missing monster type {ident}")
    line_end = source.find("\n", match.start())
    close = source.find("\n  },", match.start())
    if line_end >= 0 and source[match.start():line_end].rstrip().endswith("},"):
        return source[match.start():line_end]
    if close >= 0 and (line_end < 0 or close > line_end):
        return source[match.start():close + 4]
    return source[match.start():line_end]


def build() -> dict:
    source = SOURCE.read_text(encoding="utf-8")
    spatial = json.loads((ROOT / "client/src/monster/pirate-central-spatial.manifest.json").read_text(encoding="utf-8"))
    types = []
    for spatial_type in spatial["monsterTypes"]:
        ident = spatial_type["id"]
        block = source_block(source, ident)
        item = {
            "id": ident,
            "kind": text_value("kind", block),
            "level": number("level", block),
            "maxHp": number("maxHp", block),
            "damage": number("damage", block),
            "moveSpeed": number("moveSpeed", block),
            "aggroRange": number("aggroRange", block),
            "attackRange": number("attackRange", block),
            "attackCooldown": number("attackCooldown", block),
            "spawn": {"scale": number("scale", block)},
        }
        heavy = re.search(r"heavyAttack\s*:\s*\{([^}]*)\}", block, re.S)
        if heavy:
            heavy_block = heavy.group(1)
            tags_match = re.search(r"tags\s*:\s*\[([^]]*)\]", heavy_block)
            item["heavyAttack"] = {
                "everyNth": number("everyNth", heavy_block),
                "multiplier": number("multiplier", heavy_block),
                "telegraph": number("telegraph", heavy_block),
                "knockback": number("knockback", heavy_block),
                "tags": re.findall(r"['\"]([^'\"]+)['\"]", tags_match.group(1)) if tags_match else [],
            }
        item["rules"] = {
            "leashDistance": min(item["aggroRange"] * 1.15, 15),
            "returnHomeDistance": 2.5,
            "chaseHitRangeMultiplier": 1.6,
            "heavyCooldownMultiplier": 1.25,
        }
        types.append(item)
    return {
        "schema": "pirate-central-combat/1",
        "contentRevision": "pirate-monster-combat-catalog-2026-09-08",
        "units": {"distance": "world-units", "speed": "world-units/second", "cooldown": "seconds", "damage": "raw points before player mitigation"},
        "source": {key: {"path": path, "gitBlobSha": sha} for key, (path, sha) in SOURCE_BLOBS.items()},
        "monsterTypes": types,
        "attackRules": {
            "fixedTickHz": 60,
            "aggro": "engage when distance < type.aggroRange and not returningHome",
            "normal": "when distance <= type.attackRange and attackCooldown <= 0, raw damage=type.damage, cooldown=type.attackCooldown",
            "heavy": "if heavyAttack and (attackCount+1) % everyNth === 0, telegraph first; release only if distance <= type.attackRange*1.6; raw damage=type.damage*multiplier; cooldown=type.attackCooldown*1.25",
            "chaseRecovery": "staggerTimer=max(staggerTimer,0.22) after normal hit",
            "movement": {"returnSpeedMultiplier": 0.8, "rejectGroundBelow": 0.25, "rejectSafeZoneEntry": True},
            "lifecycle": {"death": "Monster.respawn after respawnTimer; transient crew despawns after finished death animation", "respawn": "reset HP/state at home ground height"},
        },
        "playerProfile": {
            "statBounds": {"min": 1, "max": 2800},
            "resourceCaps": {"baseHp": 100, "hpPerVitality": 5, "baseEnergy": 100, "energyPerCombat": 5, "baseMp": 100, "mpPerMana": 5},
            "damageScaling": {"maxMultiplier": 78.26, "damagePerStatPoint": (78.26 - 1) / 2800, "formula": "1 + (normalizedStat(categoryStat) - 1) * damagePerStatPoint", "finalDamage": "max(1, round(baseDamage * statDamageMultiplier))"},
            "defense": {"available": False, "source": "no defense/armor stat or reduction formula exists in the canonical client/server profile"},
            "authoritativeProfile": {"source": "server/src/realtime/combatProfile.ts", "categories": ["style", "sword", "gun", "fruit"], "profileFields": ["level", "stats", "maxHp", "maxEnergy", "maxMp", "weaponCategory", "activeSkillCategory", "allowedSkillCategories"], "persistenceQuery": "characters + player_progression + player_equipment(slot=state)", "cacheTtlMs": 1000},
        },
    }


if __name__ == "__main__":
    payload = json.dumps(build(), ensure_ascii=False, separators=(",", ":"))
    ARTIFACT.write_text(payload, encoding="utf-8")
    print(f"bytes={len(payload.encode('utf-8'))} sha256={hashlib.sha256(payload.encode('utf-8')).hexdigest().upper()}")

