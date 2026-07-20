# O1 Guided Adventure

## Purpose

O1 teaches a new player how to move, fight, accept quests, use inventory and stats, shop, summon a boat, board it and sail. It is a presentation-only observer. Combat, quest, progression, economy, monster, multiplayer and boat authority remain unchanged.

## Rollout flag

```bash
VITE_ENABLE_ONBOARDING=false
```

The default is `false`. Do not enable it on Render production without approval. With the flag off:

- `OnboardingDirector` is not constructed.
- no onboarding DOM, Three.js geometry, timers or localStorage writes are created;
- its lazy JavaScript chunk is not requested;
- gameplay and all production flags behave exactly as before.

With the flag on, the chunk is imported only after the game has initialized. There are no image, texture, GLB, font, music or SFX assets in O1.

## Player experience

The guided adventure contains 18 data-driven steps:

1. welcome;
2. movement;
3. camera;
4. jump;
5. dash;
6. Safe Zone;
7. find the quest NPC;
8. accept a quest;
9. defeat a monster;
10. inventory;
11. stats;
12. potion shop;
13. harbor and boat shop;
14. summon a boat;
15. board the deck;
16. take the helm;
17. sail;
18. completion.

A DOM arrow and a single procedural `RingGeometry` beacon mark nearby targets. The card displays distance, supports previous/pause, and strengthens its hint after 20 seconds without progress. Reduced-motion preferences disable the pulse animation.

New saves and Level 1–3 characters auto-start when the flag is enabled. Existing characters can press `❔ คู่มือ` or `H`, then choose **เริ่มบทสอนใหม่**. The handbook covers controls, combat, quests, progression, inventory, shops, boats, trade, islands, multiplayer and PK/Safe Zone.

## Completion signals

The director reads existing state only:

- displacement, camera yaw, ground height and dash cooldown;
- visibility of existing quest/shop/inventory/stats UI;
- active quest state;
- progression event bus notifications for monster kill and quest events;
- active boat, deck/helm state and boat displacement.

Signals are baselined when a step begins, so an event emitted earlier or replayed during reconnect cannot complete a later step accidentally. O1 does not submit combat, rewards, purchases, quests, movement or boat commands.

## Persistence and privacy

Progress is stored under `pirate-fruit:onboarding-v1` through the existing storage abstraction. It is separate from local/remote gameplay saves. Pause, completion and “do not show automatically” persist. Restart replaces only onboarding progress.

No analytics or personal data are added.

## Mobile smoke test

1. Build with `VITE_ENABLE_ONBOARDING=true` on a staging deployment.
2. Open a fresh private browser at 360 × 800 and 412 × 915.
3. Confirm the card does not cover the movement joystick, attack buttons, HUD, quest tracker, inventory or stats controls.
4. Complete movement, camera, jump and dash.
5. Follow the waypoint to the quest NPC, accept a quest and defeat one monster.
6. Open inventory, stats and the potion shop.
7. Open the boat shop, summon a boat, board, take the helm and sail 12 metres.
8. Pause, reload, resume, finish, reload and confirm it does not auto-open again.
9. Press `H` or `❔ คู่มือ`, restart the guide and verify reduced-motion mode.

Also test with the server or WebSocket disconnected: local movement/UI steps and the handbook remain usable, while authority-dependent steps wait for the real game event and never fabricate success.

## Rollback

1. Set `VITE_ENABLE_ONBOARDING=false`.
2. Rebuild the Static Site.
3. Do not delete gameplay saves or `pirate-fruit:onboarding-v1`.
4. All combat, quest, economy, monster, multiplayer and boat systems continue without the director.

A director construction or update failure must not be allowed to mutate gameplay authority. For production rollout, enable on staging first and inspect mobile layout and bundle requests before changing the production flag.
