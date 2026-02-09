# Refactor Plan: Grouping & Readability (No Behavior Change)

This plan groups related logic and improves readability and scalability **without changing any current functionality**. Each phase can be done incrementally.

**PACKAGE_5 template:** For using this codebase as a template for other games, see [GAME_TEMPLATE.md](GAME_TEMPLATE.md). Per-game branding lives in `config/GameBranding.ts`; the backend folder is unchanged.

---

## 1. Game scene: break up `create()` and group event listeners

**Current:** [Game.ts](src/game/scenes/Game.ts) has a long `create()` (hundreds of lines) and many `EventBus.on` / `gameEventManager.on` calls in one place.

**Goal:** Same behavior; easier to read and navigate.

| Action | Description |
|--------|-------------|
| **Extract creation phases** | Split `create()` into small private methods called in order, e.g. `createFadeAndResize()`, `createHeaderAndBackground()`, `createCharactersAndClock()`, `createBonusLayers()`, `createSymbolsAndWinTracker()`, `createAudio()`, `createDialogsAndScatter()`, `createBetAndAutoplayOptions()`, `createSlotController()`, `createFreeRoundAndScatterAnticipation()`, `createFinalizeAndFadeIn()`. Each method does one clear block of the current `create()`. |
| **Group event registration** | Move all `EventBus.on` and `gameEventManager.on` from `create()` into 2–3 dedicated setup methods, e.g. `setupEventBusListeners()` (spin, menu, bet-options, autoplay, amplify) and `setupGameEventListeners()` (WIN_STOP, WIN_START, REELS_STOP, REELS_START, dialogAnimationsComplete, SPIN, AUTO_START). Call these at the end of `create()` (or from `createFinalizeAndFadeIn()`). |
| **Optional: Win flow helper** | Extract the WIN_STOP handler body (totalWin resolution, character animation, `checkAndShowWinDialog`, demo balance, balance update) into a private method e.g. `onWinStop(data: any): void`. `create()` / `setupGameEventListeners()` then only registers `gameEventManager.on(GameEventType.WIN_STOP, (d) => this.onWinStop(d))`. |

**Result:** `create()` becomes a short, ordered list of phase calls + listener setup; win and reel logic stay in one place and are easier to test later.

---

## 2. Config: group by domain (optional file split or sections)

**Current:** [GameConfig.ts](src/config/GameConfig.ts) holds branding, preloader, scene layout, grid, symbols, timing, win thresholds, animation, depths, etc. in one file.

**Goal:** Single source of truth; easier to find and change related values.

| Option A – Keep one file, add sections | Add clear section comments and optional sub-exports, e.g. `GameConfigBranding`, `GameConfigPreloader`, `GameConfigScene`, `GameConfigGrid`, `GameConfigSymbols`, `GameConfigTiming`, `GameConfigWin`, `GameConfigAnimation`. Re-export everything from `GameConfig` so existing imports still work. |
| Option B – Split into domain files | Create e.g. `config/GameConfigBranding.ts`, `GameConfigLayout.ts`, `GameConfigTiming.ts`, `GameConfigWin.ts`, `GameConfigSymbols.ts`, and a single `GameConfig.ts` that re-exports all. Update imports gradually (or keep barrel re-exports so most call sites stay `from '../../config/GameConfig'`). |

**Recommendation:** Start with **Option A** (sections + optional named groups). Split files only if the single file becomes hard to navigate.

---

## 3. Types: single source of truth for spin/tumble/grid

**Current:** `TumbleOut` (and related shapes) exist in both [Spin.ts](src/game/components/Spin.ts) and [symbols/types.ts](src/game/components/symbols/types.ts). `GridArea` is in Spin. Symbols and WinTracker use tumble/out types from different places.

**Goal:** One canonical definition per type; no behavior change.

| Action | Description |
|--------|-------------|
| **Choose canonical module** | Prefer **`game/components/Spin.ts`** (or a small `game/types/SpinTypes.ts`) for: `GridArea`, `TumbleOut`, `Tumble`, `TumbleResult`, `Cluster`, `EvaluateGridResult`. These are used for win/tumble evaluation and backend data interpretation. |
| **Re-export from symbols** | In [symbols/types.ts](src/game/components/symbols/types.ts) (or [symbols/index.ts](src/game/components/symbols/index.ts)) re-export `TumbleOut` (and any overlapping types) from Spin so existing `from './symbols'` / `from './symbols/types'` imports keep working. Deprecate or remove the duplicate definition in symbols/types once all usages point to Spin. |
| **Keep symbol-specific types in symbols** | Leave `SymbolObject`, `SpineAnimationState`, `GridPosition`, `CellPosition`, `TumbleData` (full backend tumble payload), `SpinData`, `FreeSpinData`, etc. in symbols/types or index. Only spin-evaluation / paytable types live in Spin (or SpinTypes). |

**Result:** Win/tumble types have one definition; symbol and backend shapes stay in symbols; no functional change.

---

## 4. Constants: single source for symbol/cluster/scatter IDs

**Current:** [Spin.ts](src/game/components/Spin.ts) defines `QUALIFYING_CLUSTER_COUNT`, `CLUSTER_PAY_SYMBOLS`, `SCATTER_SYMBOL_ID`; [GameConfig.ts](src/config/GameConfig.ts) has `SCATTER_SYMBOL_ID`, `NORMAL_SYMBOLS`, `MIN_CLUSTER_SIZE`, etc.

**Goal:** No duplicate magic numbers; one place to change rules.

| Action | Description |
|--------|-------------|
| **Document the rule** | Spin = source of truth for **win rules** (qualifying count, cluster pay symbols, scatter ID for pay). GameConfig = source of truth for **grid/layout and asset mapping** (which IDs are normal/multiplier for display and config). |
| **Remove duplicates** | If `SCATTER_SYMBOL_ID` is duplicated, have GameConfig (or AssetConfig) re-export it from Spin, or vice versa, and delete the duplicate. Same for any shared constant (e.g. cluster size) so only one definition exists. |
| **Keep paytables in Spin** | Leave `SYMBOL_PAYTABLE`, `SCATTER_PAYTABLE`, and tier helpers in Spin; they are win logic, not generic config. |

**Result:** Clear ownership (Spin = win rules; GameConfig = layout/display); no behavior change.

---

## 5. Large files: split by responsibility (high impact, do incrementally)

**Current:** [SlotController.ts](src/game/components/controller/SlotController.ts) (~4500 lines), [Symbols.ts](src/game/components/symbols/Symbols.ts) (~4800 lines), [Dialogs.ts](src/game/components/Dialogs.ts) (large), [HelpScreen.ts](src/game/components/MenuTabs/HelpScreen.ts) (~1800 lines).

**Goal:** Same behavior; smaller, focused modules and easier onboarding.

### 5.1 SlotController

| Action | Description |
|--------|-------------|
| **Extract Free Spin display logic** | Move free-spin remaining display, `pendingFreeSpinsData`, `freeSpinDisplayOverride`, `suppressFreeSpinDisplay`, `refreshFreeSpinDisplay`, and related UI text/labels into a new **FreeSpinDisplayController** (or similar). SlotController holds an instance and delegates. All event handling and API usage for “spins left” stay in one place. |
| **Extract Buy Feature flow** | Move buy-feature–specific state (`isBuyFeatureFreeSpinsActive`, `isBuyFeatureControlsLocked`), TotalW_BZ gating, and any buy-feature–only handlers into a **BuyFeatureFlowCoordinator** or extend **BuyFeatureController** so SlotController only wires and calls it. |
| **Keep spin orchestration in SlotController** | Request/response, start/stop spin, balance updates, and wiring of Bet/Autoplay/SpinButton controllers stay in SlotController. |

### 5.2 Symbols

| Action | Description |
|--------|-------------|
| **Extract “spin data flow”** | Move `processSpinData`, `applyTumbles`, and the high-level tumble/retrigger/scatter sequencing into a **SymbolsSpinFlow** (or **TumbleOrchestrator**) class that receives spin data and calls back into Symbols (grid, animations, overlay). Symbols keeps grid, factory, overlay, and scatter/retrigger state; the flow class only sequences steps. |
| **Group by feature in one file** | If you prefer not to add a new file yet, add clear section comments in Symbols.ts: e.g. “// ---- Grid & creation ----”, “// ---- Spin data & tumble flow ----”, “// ---- Scatter / retrigger ----”, “// ---- Multiplier animations ----”, “// ---- Skip / turbo ----”. Move methods so they sit under the right section. |

### 5.3 Dialogs

| Action | Description |
|--------|-------------|
| **Already improved** | Win dialog logic is in Dialogs (`checkAndShowWinDialog`). Optional: add section comments (e.g. “// ---- Win dialog thresholds & queue ----”, “// ---- Dialog show/hide ----”, “// ---- Per-type show methods ----”) so the file is easier to scan. |

### 5.4 HelpScreen

| Action | Description |
|--------|-------------|
| **Extract payout layout** | Move payout table layout constants and layout-building logic (e.g. column positions, spacing, PAYOUT_RANGES) into a **HelpScreenPayoutLayout** module or a static config object. HelpScreen imports and uses it. |
| **Optional: split tabs** | If HelpScreen has distinct “How to play” vs “Payouts” vs “Settings” sections, consider separate components (e.g. HelpScreenPayouts, HelpScreenHowToPlay) and a small parent that composes tabs; only if it simplifies readability without breaking behavior. |

**Result:** SlotController and Symbols become coordinators; detailed logic lives in smaller, named modules. Dialogs and HelpScreen become easier to navigate.

---

## 6. Managers and game folder layout

**Current:** [managers/](src/managers/) has Audio, Network, GameState, ScatterAnimation, FullScreen, ScreenMode, Version, ResponseTracker. [game/components/](src/game/components/) mixes UI (Header, BetOptions), dialogs, symbols, and controllers.

**Goal:** Clear mental model; no big moves required.

| Action | Description |
|--------|-------------|
| **Document layers** | Add a short **README or comment block** in `game/` and/or `managers/` describing: “Managers = cross-cutting (audio, network, state, scatter animation). Components = scene UI and game flow (controllers, symbols, dialogs, headers).” |
| **Optional grouping** | If you add more features later, consider subfolders like `game/components/ui/` (Header, ClockDisplay, NumberDisplay, BetOptions, AutoplayOptions), `game/components/dialogs/` (Dialogs only or Dialogs + win-dialog helpers), keep `controller/` and `symbols/` as-is. Only do this if it reduces confusion; current flat structure is acceptable. |

**Result:** New contributors know where to look; optional future grouping stays consistent.

---

## 7. Event naming and listener ownership

**Current:** Events like `GameEventType.WIN_STOP`, `dialogAnimationsComplete`, `GameEventType.SPIN` are used from Game, SlotController, Symbols, Dialogs.

**Goal:** Same behavior; clearer ownership and documentation.

| Action | Description |
|--------|-------------|
| **Document event flow** | In [EventManager.ts](src/event/EventManager.ts) or a small **EVENTS.md** in `event/`, list each event, who emits it, and who listens (e.g. “WIN_STOP: emitted by Symbols when tumble win sequence ends; listened by Game for win dialog and balance”). |
| **Keep listeners where they are** | No need to move listeners unless you extract a “win flow” or “reel flow” module; then that module can own the relevant listener and call back into Game/SlotController. |

**Result:** Event contracts are explicit; refactors that touch events are safer.

---

## 8. Suggested order of work

1. **Types & constants (Sections 3 & 4)** – Low risk; removes duplication and clarifies ownership.
2. **Game.ts create() and listeners (Section 1)** – Improves readability quickly; no API change.
3. **Config sections (Section 2 Option A)** – Improves findability without moving imports.
4. **Documentation (Sections 6 & 7)** – README/EVENTS.md and comments; no code structure change.
5. **Large-file splits (Section 5)** – Do one at a time (e.g. FreeSpinDisplayController, then Symbols flow, then HelpScreen layout), with tests or manual checks after each.

---

## Summary table

| Area | Change | Behavior |
|------|--------|----------|
| Game.ts | Extract create() phases + group listeners | Unchanged |
| GameConfig | Sections or split by domain | Unchanged |
| Types | Single source for TumbleOut/GridArea; re-export from symbols | Unchanged |
| Constants | Single source for scatter/cluster IDs | Unchanged |
| SlotController | Extract FreeSpin display + BuyFeature flow | Unchanged |
| Symbols | Extract spin flow or add sections | Unchanged |
| Dialogs / HelpScreen | Sections or extract payout layout | Unchanged |
| Managers / structure | Document; optional subfolders later | Unchanged |
| Events | Document who emits/listens | Unchanged |

All of the above are refactors for **readability and scalability only**; they do not add or remove features.

---

## Implemented (pastry_cub, PACKAGE_5 template)

- **GameBranding.ts** – Per-game branding and preloader copy; GameConfig imports and re-exports. New games edit this file only for names/copy.
- **Game.ts** – `create()` split into phase methods (`createFadeAndResize`, `createHeaderAndBackground`, etc.), `setupEventBusListeners()`, `setupGameEventListeners()`, and `onWinStop()` for WIN_STOP handling.
- **Types** – `TumbleOut` is canonical in Spin.ts; symbols/types.ts re-exports it for compatibility.
- **GAME_TEMPLATE.md** – Checklist and “what to change / what not to change” for new PACKAGE_5 games. Backend folder is not modified.
