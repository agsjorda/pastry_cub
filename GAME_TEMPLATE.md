# PACKAGE_5 Game Template

This project is structured as a **template** for slot games using PACKAGE_5. The **backend** (`src/backend/`) is shared and should not be changed when skinning for a new game. Only config and game-specific assets/copy are swapped.

---

## What to change for a new game

### 1. Branding and preloader copy (single file)

**File:** [src/config/GameBranding.ts](src/config/GameBranding.ts)

- **CLOCK_DISPLAY_NAME** – Name beside the clock (e.g. `'DiJoker'`).
- **GAME_DISPLAY_NAME** – Game name in UI (e.g. `'Pastry Cub'`).
- **CLOCK_DISPLAY_CONFIG** – Position, font, color for clock/branding (optional tweaks).
- **PRELOADER_BRANDING** – Tagline, website, “Win up to X” text and positions.

All other code can keep importing from `GameConfig`; GameConfig re-exports these from GameBranding.

### 2. Assets and layout (config)

- **[src/config/AssetConfig.ts](src/config/AssetConfig.ts)** – Asset keys and paths (symbols, audio, atlases, spines). Point to the new game’s assets.
- **[src/config/GameConfig.ts](src/config/GameConfig.ts)** – Grid size, symbol IDs, timing, win thresholds, layout constants, animation/depth. Adjust for the new game’s rules and layout.

### 3. Paytables and win rules (Spin)

- **[src/game/components/Spin.ts](src/game/components/Spin.ts)** – Paytables (`SYMBOL_PAYTABLE`, `SCATTER_PAYTABLE`), `QUALIFYING_CLUSTER_COUNT`, `CLUSTER_PAY_SYMBOLS`, `SCATTER_SYMBOL_ID`. Change these to match the new game’s math; do not change backend request/response shapes.

### 4. Help / paytable screen

- **[src/game/components/MenuTabs/HelpScreen.ts](src/game/components/MenuTabs/HelpScreen.ts)** – Payout table text and layout (symbol counts, multipliers). Keep in sync with Spin paytables and GameConfig.

---

## What not to change

- **src/backend/** – `GameAPI.ts`, `SpinData.ts`. Shared across PACKAGE_5 games; no edits for a new skin.
- **src/game/scenes/Game.ts** – Scene flow, event wiring, and creation phases are template structure. Only adjust if the new game needs different scenes or components.
- **src/event/EventManager.ts** – Event set is shared; don’t remove or rename events that the backend or SlotController rely on.
- **src/managers/** – Shared (e.g. GameStateManager, ScatterAnimationManager). Config they read can change; their APIs should stay.

---

## Structure overview

| Area | Purpose |
|------|--------|
| **config/GameBranding.ts** | Per-game branding and preloader copy (edit for each game). |
| **config/GameConfig.ts** | Layout, grid, timing, win thresholds; re-exports branding. |
| **config/AssetConfig.ts** | Asset keys and paths. |
| **game/components/Spin.ts** | Win rules and paytables (single source for cluster/scatter math). |
| **game/scenes/Game.ts** | Scene create phases + EventBus / GameEvent listeners. |
| **game/components/** | UI: Dialogs, Symbols, controller, Header, etc. |
| **backend/** | Do not modify for new games. |

---

## Quick checklist for a new game

1. Update [GameBranding.ts](src/config/GameBranding.ts) (names, tagline, website, max win text).
2. Update [AssetConfig.ts](src/config/AssetConfig.ts) (paths and keys for the new assets).
3. Update [GameConfig.ts](src/config/GameConfig.ts) (grid, symbols, timing, WIN_THRESHOLDS, layout).
4. Update [Spin.ts](src/game/components/Spin.ts) (paytables, qualifying count, scatter ID if needed).
5. Update [HelpScreen.ts](src/game/components/MenuTabs/HelpScreen.ts) (payout copy and layout to match Spin).
6. Replace assets in `public/` (or wherever the loader points) for the new theme.

No changes are required in `backend/` or in the way Game scene wires components and events.
