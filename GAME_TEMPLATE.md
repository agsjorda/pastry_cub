# GAME_TEMPLATE.md - Template Maintenance Guide

This file is the project guide for cloning this game into future titles.
Use this document for all game-specific replacement points (assets, values, text, and rules).

## 1. Quick Clone Checklist

Update in this order:

1. `src/config/GameBranding.ts` for game name and preloader copy.
2. `src/config/AssetConfig.ts` for asset keys and paths.
3. `public/assets/...` files for all replacement art and audio.
4. `src/config/GameConfig.ts` for rules and tuning.
5. `src/game/components/Spin.ts` for paytable math.
6. `src/game/components/MenuTabs/HelpScreen.ts` for player-facing rules text.
7. `public/fake_spin_data.json` and `src/backend/GameAPI.ts` for demo/local data consistency.

## 2. What To Change

### Branding and preloader copy

File: `src/config/GameBranding.ts`

- `CLOCK_DISPLAY_NAME`
- `GAME_DISPLAY_NAME`
- `CLOCK_DISPLAY_CONFIG`
- `PRELOADER_BRANDING`

### Assets and layout

- `src/config/AssetConfig.ts` for key/path mapping
- `src/config/GameConfig.ts` for layout, grid, tuning, thresholds, animation/depth values

### Paytables and win rules

File: `src/game/components/Spin.ts`

- `SYMBOL_PAYTABLE`
- `SCATTER_PAYTABLE`
- `QUALIFYING_CLUSTER_COUNT`
- `CLUSTER_PAY_SYMBOLS`
- `SCATTER_SYMBOL_ID`

### Help and paytable UI copy

File: `src/game/components/MenuTabs/HelpScreen.ts`

- Rule text
- Payout labels
- Scatter and free-spin text

## 3. What Not To Change (Template Boundaries)

- `src/backend/` is shared template backend integration; do not rework API shapes for skinning.
- `src/event/EventManager.ts` event contracts are shared; do not rename/remove core events casually.
- `src/managers/` should remain API-compatible; tune behavior via config first.
- `src/game/scenes/Game.ts` should keep the scene flow unless the new game truly requires structural changes.

## 4. Image Replacement Map

| What | Replace Files In | Controlled By |
| --- | --- | --- |
| Main background and overlays | `public/assets/portrait/high/background/` and `public/assets/portrait/low/background/` | `src/config/AssetConfig.ts` -> `getBackgroundAssets()` |
| Bonus background | `public/assets/portrait/high/bonus_background/` | `src/config/AssetConfig.ts` -> `getBonusBackgroundAssets()` |
| Header art | `public/assets/portrait/high/header/` | `src/config/AssetConfig.ts` -> `getHeaderAssets()` |
| Symbol Spine art (scatter + regular) | `public/assets/symbols/high/pastry_cub_symbols/Symbol0_PC.*` through `Symbol7_PC.*` | `src/config/AssetConfig.ts` -> `getSymbolAssets()` |
| Static symbol icons (help/paytable) | `public/assets/symbols/high/pastry_cub_symbols/statics/symbol0.png` through `symbol7.png` | `src/config/AssetConfig.ts` -> `getSymbolAssets()` |
| Bonus marker images | `public/assets/symbols/high/pastry_cub_symbols/multiplier_symbols/x1.webp` ... `x128.webp` | `src/config/GameConfig.ts` and `src/config/AssetConfig.ts` |
| Dialog Spine assets | `public/assets/portrait/high/dialogs/` | `src/config/AssetConfig.ts` dialog mapping |
| Buttons and controller icons | `public/assets/controller/portrait/high/` and `public/assets/controller/portrait/low/` | `src/config/AssetConfig.ts` -> `getButtonAssets()` |
| Audio | `public/assets/sounds/` | `src/config/AssetConfig.ts` and `src/managers/AudioManager.ts` |

Notes:
- Keep asset keys stable unless you intentionally update every consumer.
- If file names change, update `AssetConfig.ts` mappings first.

## 5. Gameplay Value Replacement Map

| Feature | Where To Change |
| --- | --- |
| Grid size | `src/config/GameConfig.ts` -> `SLOT_COLUMNS`, `SLOT_ROWS` |
| Win cluster threshold | `src/config/GameConfig.ts` -> `MIN_CLUSTER_SIZE` and `src/game/components/Spin.ts` -> `QUALIFYING_CLUSTER_COUNT` |
| Scatter trigger / retrigger thresholds | `src/config/GameConfig.ts` -> `MIN_SCATTER_FOR_BONUS`, `MIN_SCATTER_FOR_RETRIGGER` |
| Free spins by scatter count | `src/config/GameConfig.ts` -> `SCATTER_FREE_SPINS` |
| Maximum win cap | `src/config/GameConfig.ts` -> `MAX_WIN_MULTIPLIER` |
| Symbol paytable | `src/game/components/Spin.ts` -> `SYMBOL_PAYTABLE` |
| Big/Mega/Epic/Super thresholds | `src/config/GameConfig.ts` -> `WIN_THRESHOLDS` |
| Symbol size/spacing | `src/config/GameConfig.ts` -> `SYMBOL_CONFIG` |
| Grid position/mask | `src/config/GameConfig.ts` -> `GRID_*` constants |
| Animation timings | `src/config/GameConfig.ts` -> `TIMING_CONFIG`, `ANIMATION_CONFIG`, and related timing constants |
| Debug toggles | `src/config/GameConfig.ts` -> `SHOW_*` flags |

## 6. Bonus Marker (Multiplier Spot) Rules

Current setup uses image tiers through x128.

- Marker image mapping by mark count: `src/config/GameConfig.ts` -> `BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT`
- Marker logic cap: `src/config/GameConfig.ts` -> `BONUS_MULTIPLIER_MAX_VALUE`
- Marker image loading: `src/config/AssetConfig.ts` -> `getSymbolAssets()`
- Marker rendering and progression: `src/game/components/symbols/SymbolMarker.ts`
- Bonus tumble multiplier application: `src/game/components/symbols/Symbols.ts`

If adding tiers (example x256):

1. Add files under `public/assets/symbols/high/pastry_cub_symbols/multiplier_symbols/`.
2. Extend `BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT`.
3. Increase `BONUS_MULTIPLIER_MAX_VALUE`.

## 7. Text and Rules Sync

Always keep player-facing text aligned with mechanics.

- Branding text: `src/config/GameBranding.ts`
- Help/rules text: `src/game/components/MenuTabs/HelpScreen.ts`

If mechanics change, sync these values in copy:
- scatter trigger count
- scatter retrigger count
- free-spin award table
- cluster threshold
- bonus marker and multiplier behavior

## 8. Demo and Backend Data Sync

- Demo payloads: `public/fake_spin_data.json`
- Parsing/normalization: `src/backend/GameAPI.ts`
- Demo state source and helpers: `src/backend/GameAPI.ts` -> `getDemoState()`, `getDemoBalance()`, `updateDemoBalance()`
- Game identifier used in backend/demo spin payloads: `src/backend/GameAPI.ts` -> `GAME_ID` (placeholder value; update per target game integration)

When symbol IDs, grid size, or payout logic changes, verify demo payloads still match expected shape.

Demo mode reference behavior for template ports:
- Enable with `?demo=true` in URL.
- `initializeGame()` should allow demo startup without requiring auth token.
- Demo spin path uses analytics endpoint; normal play uses slots bet endpoint.
- Demo balance is local/mock and should stay in sync with bet deductions and base-game wins.
- History should not call backend in demo mode (show demo-safe empty state/message).
- Demo UI should append `| DEMO` in clock suffix where applicable.
- Demo storage cleanup should remove `demo` from both `localStorage` and `sessionStorage`.

## 9. Required Validation After Template Changes

1. Confirm all assets load without missing-texture warnings.
2. Run a base spin and verify cluster and win text behavior.
3. Trigger bonus and verify marker spots persist only during bonus.
4. Verify marker steps show correct tiers: x1 -> x2 -> x4 -> ... -> x128.
5. Verify help text matches implemented rules.
6. Verify no old-game naming remains in UI copy.

## 10. Update Policy

Whenever a new replace point is introduced (new folder, constant, rule source), update this file in the same PR.
