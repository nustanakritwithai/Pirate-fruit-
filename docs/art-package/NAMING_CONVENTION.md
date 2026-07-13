# Naming Convention

## Asset Prefix

| Category | Prefix | Example |
|---|---|---|
| Environment | `PF_ENV_` | `PF_ENV_PALM_001` |
| Building | `PF_BUILD_` | `PF_BUILD_HUT_A_001` |
| Character | `PF_CHAR_` | `PF_CHAR_PLAYER_BASE` |
| Monster | `PF_MON_` | `PF_MON_CRAB_001` |
| Boss | `PF_BOSS_` | `PF_BOSS_BLACKBEARD_001` |
| Fruit | `PF_FRUIT_` | `PF_FRUIT_FLAME_001` |
| Boat | `PF_BOAT_` | `PF_BOAT_SLOOP_001` |
| Weapon | `PF_WEAPON_` | `PF_WEAPON_TRAINING_SWORD` |
| UI | `PF_UI_` | `PF_UI_ICON_SWORD` |

ใช้ ASCII uppercase + underscore, ห้ามเว้นวรรค, suffix variant ใช้ `_A`, `_B`; LOD ใช้ `_LOD0`, `_LOD1`, `_LOD2`

## Supporting Files

- Texture: `T_<ASSET>_<MAP>_<SIZE>` เช่น `T_PF_ENV_PALM_BC_1024`
- Map suffix: `BC`, `N`, `R`, `M`, `AO`, `E`, `ORM`
- Material: `M_<ASSET>_<SURFACE>`
- Animation: `A_<CHAR>_<ACTION>` เช่น `A_PF_CHAR_PLAYER_RUN`
- Audio: `SFX_<CATEGORY>_<ACTION>_<VARIANT>` หรือ `MUS_<SCENE>_<VARIANT>`
- Collider: `COL_<ASSET>_<TYPE>`
- Socket: `SOCKET_<PURPOSE>` เช่น `SOCKET_HAND_R`
