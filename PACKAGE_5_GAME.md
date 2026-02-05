# PACKAGE_5_GAME – Refactoring Guide

This document maps the **Game Specification Document** to the pastry_cub codebase and provides a step-by-step guide for refactoring the game to match the spec. Use [src/config/GameConfig.ts](src/config/GameConfig.ts) as the **source of truth** for grid and game constants.

---

## Table of Contents

1. [Game Configuration](#1-game-configuration)
2. [Symbols & Payouts](#2-symbols--payouts)
3. [Paylines & Win Detection](#3-paylines--win-detection)
4. [Features & Bonus Mechanics](#4-features--bonus-mechanics)
5. [Multiplier Spots Feature](#5-multiplier-spots-feature)
6. [Free Spins](#6-free-spins)
7. [Bet Limits & UI](#7-bet-limits--ui)
8. [Asset & Naming Conventions](#8-asset--naming-conventions)
9. [Refactoring Checklist](#9-refactoring-checklist)

---

## 1. Game Configuration

| Spec | Current | Target | Where to change |
|------|---------|--------|-----------------|
| **Reels Grid** | 7×7 | 7×7 | Already correct in [GameConfig.ts](src/config/GameConfig.ts) (`SLOT_COLUMNS`, `SLOT_ROWS`) |
| **Paylines** | Legacy winlines (3×5 masks) | Connected H+V, **5+ symbols** | See [§3 Paylines & Win Detection](#3-paylines--win-detection) |
| **Max Win** | — | **2,100× bet** | Add `MAX_WIN_MULTIPLIER = 2100` in GameConfig; enforce/cap in backend and win display |
| **Jackpot** | — | None | No jackpot logic to add; remove any jackpot references if present |
| **Min Bet** | 0.20 | 0.20 | [BetController.ts](src/game/components/controller/BetController.ts) `BET_LEVELS[0]` – already 0.2 |
| **Max Bet** | 150 | 150.00 | `BET_LEVELS` – already 150; ensure backend validates 0.20–150 |
| **Volatility** | — | Low | Documentation / backend tuning only |

**Actions:**

- In [GameConfig.ts](src/config/GameConfig.ts):
  - Add `MAX_WIN_MULTIPLIER: 2100`.
  - Keep `SLOT_COLUMNS = 7`, `SLOT_ROWS = 7` as source of truth; ensure all grid logic (SymbolGrid, Symbols, backend mock data, Data.ts) uses these constants and 7×7 data only.

---

## 2. Symbols & Payouts

### 2.1 Symbol Set (Spec)

- **Symbol 0:** Scatter (FS trigger only per table).
- **Symbols 1–7:** Regular (paytable 3–15 connected symbols).
- **Symbols 8–22:** Multiplier Bombs (2×–500×) – spec “15 Multiplier Bombs”.

### 2.2 Current vs Spec

| Item | Current | Spec |
|------|---------|------|
| Regular symbols | 1–9 | **1–7** |
| Multiplier symbols | 10–22 | **8–22** (15 multiplier bombs) |
| Scatter | 0 | 0 (unchanged) |

### 2.3 Paytable (Spec) – Regular Symbols 1–7

Connected symbols (3–15) pay per table below. Values are **multipliers of bet**.

| Symbol | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|--------|---|---|---|---|---|---|---|----|----|----|----|----|----|
| 1 | - | - | 1.0 | 1.50 | 1.75 | 2.0 | 2.5 | 5.0 | 7.5 | 15.0 | 35.0 | 70.0 | 150.0 |
| 2 | - | - | 0.75 | 1.0 | 1.25 | 1.50 | 2.0 | 4.0 | 6.0 | 12.50 | 30.0 | 60.0 | 100.0 |
| 3 | - | - | 0.50 | 0.75 | 1.0 | 1.25 | 1.5 | 3.0 | 4.5 | 10.0 | 20.0 | 40.0 | 60.0 |
| 4 | - | - | 0.40 | 0.50 | 0.75 | 1.0 | 1.25 | 2.0 | 3.0 | 5.0 | 10.0 | 20.0 | 40.0 |
| 5 | - | - | 0.30 | 0.40 | 0.50 | 0.75 | 1.0 | 1.50 | 2.50 | 3.50 | 8.0 | 15.0 | 30.0 |
| 6 | - | - | 0.25 | 0.30 | 0.40 | 0.50 | 0.75 | 1.25 | 2.0 | 3.0 | 6.0 | 12.0 | 25.0 |
| 7 | - | - | 0.20 | 0.25 | 0.30 | 0.40 | 0.50 | 1.0 | 1.50 | 2.5 | 5.0 | 10.0 | 20.0 |

(– = no pay for that count.)

### 2.4 Scatter (Symbol 0) – Free Spins Only

| Scatters | Free Spins |
|----------|------------|
| 3 | 10 FS |
| 4 | 12 FS |
| 5 | 15 FS |
| 6 | 20 FS |
| 7 | 30 FS |

### 2.5 Files to Update

- **[GameConfig.ts](src/config/GameConfig.ts)**  
  - `NORMAL_SYMBOLS`: change from `[1..9]` to `[1,2,3,4,5,6,7]`.  
  - `MULTIPLIER_SYMBOLS`: change from `[10..22]` to `[8,9,...,22]` (15 ids: 8–22).  
  - Add or reference a **paytable** structure (e.g. symbol → array of multipliers for 3–15 connected), or keep paytable in a dedicated module that GameConfig points to.

- **Paytable / Payout logic**  
  - **[tmp_backend/Payout.ts](src/tmp_backend/Payout.ts)** (and any backend that uses it): replace current payout matrix with spec paytable; index by **connected count 3–15**; only symbols 1–7 use this table; symbols 8–22 use multiplier-bomb values (2×–500×).  
  - **[game/components/symbols/constants.ts](src/game/components/symbols/constants.ts)**: remove or update `SCATTER_PAYOUT_MULTIPLIERS` (scatter no longer pays cash, only FS); add/align any client-side paytable constants with spec.

- **Asset config**  
  - [AssetConfig.ts](src/config/AssetConfig.ts) and any symbol key logic: ensure only **symbol0** (scatter), **symbol1–7** (regular), **symbol8–22** (multiplier bombs) are used; remove references to symbol9 as “regular”.

---

## 3. Paylines & Win Detection

### 3.1 Spec

- **Paylines:** “Connected horizontally and vertically (**5+ symbols**).”  
- So: **cluster pays** on 7×7 grid, with **minimum cluster size 5** (not 3, not 8).

### 3.2 Current

- [GameConfig.ts](src/config/GameConfig.ts): `MIN_CLUSTER_SIZE = 8`.  
- Win detection may still use legacy **WINLINES** (3×5 masks) in [tmp_backend/SymbolDetector.ts](src/tmp_backend/SymbolDetector.ts) and [Data.ts](src/tmp_backend/Data.ts).

### 3.3 Refactor

1. **GameConfig.ts**  
   - Set `MIN_CLUSTER_SIZE = 5`.  
   - Decide whether WINLINES are still used:  
     - If win detection is **cluster-based** (connected H+V), remove or deprecate WINLINES and use a **cluster detection** algorithm (e.g. flood-fill/BFS on 7×7) that respects 5+ symbols.  
     - If backend still uses “winline” indices for compatibility, keep a minimal WINLINES definition that matches 7×7 cluster evaluation (e.g. one mask per cluster or no masks).

2. **Win detection (backend / tmp_backend)**  
   - Replace or extend SymbolDetector (or equivalent) to:  
     - Treat grid as 7×7.  
     - Find all connected regions (horizontal + vertical only, or include diagonals only if spec says so; spec says “horizontally and vertically”).  
     - For each region of size ≥ 5, apply paytable for the symbol type (1–7) and cluster length (5–15); apply multiplier bombs (8–22) per spec.

3. **Data.ts / GameAPI mock data**  
   - All `area` and `symbols` arrays must be **7×7** and use symbol set 0, 1–7, 8–22.

---

## 4. Features & Bonus Mechanics

### 4.1 Tumble Feature (Spec)

- After every spin, winning symbols disappear.  
- Remaining symbols drop; new symbols fill.  
- Repeats until no new winning combinations.  
- All wins accumulated and credited after all tumbles complete.

**Where:** Tumble/cascade logic lives in [Symbols.ts](src/game/components/symbols/Symbols.ts) and related components. Ensure it:  
- Uses 7×7 grid and `MIN_CLUSTER_SIZE = 5`.  
- Runs after each “drop” until no more wins.  
- Credits total win after all tumbles (already typical; verify with backend and WinTracker).

### 4.2 Scatter Mechanic (Spec)

- **3+** scatters trigger Free Spins (not 4+).  
- Buy Bonus: purchase **10–30** free spins.  
- Enhance Bet: increases chance of landing Free Spins.

**Where:**  
- [GameConfig.ts](src/config/GameConfig.ts): set `MIN_SCATTER_FOR_BONUS = 3` (currently 4).  
- [GameConfig.ts](src/config/GameConfig.ts): add scatter → FS mapping: 3→10, 4→12, 5→15, 6→20, 7→30.  
- Buy Feature: [BuyFeature.ts](src/game/components/BuyFeature.ts), [BuyFeatureController](src/game/components/controller/BuyFeatureController.ts), backend – allow buying **10–30** FS (configurable range).  
- Enhance Bet: [AmplifyBetController.ts](src/game/components/controller/AmplifyBetController.ts) / BetController – document or implement “increases chance of FS” (usually backend).

### 4.3 Win Line Examples

- Use reference images (Frame 137.png, Frame 136.png, etc.) to align win-line or cluster highlighting with “connected horizontally and vertically (5+ symbols).”

---

## 5. Multiplier Spots Feature

### 5.1 Spec (Different from Current “Multiplier Symbols”)

- **Winning symbols mark their positions** on the grid.  
- **Repeated wins on the same cell** increase multiplier: **starts at ×2, max ×128**.  
- Multiple marked spots: multipliers **combine**.  
- **Base game:** spots persist through the **tumble sequence**, then **clear when tumbles stop**.  
- **Free Spins:** spots persist for the **entire feature**.

### 5.2 Current vs Spec

- Current: multiplier symbols (e.g. 10–22) that pay a fixed multiplier.  
- Spec: **position-based** “multiplier spots” that **grow** (×2 → ×128) on repeat wins and combine.

### 5.3 Refactor

- **New or extended state:**  
  - Per-cell multiplier spot state: e.g. `Map<cellKey, { multiplier: number }>` (×2–×128).  
  - Persistence rules: base = clear at end of tumble sequence; FS = persist for full feature.

- **Where:**  
  - [WinTracker.ts](src/game/components/WinTracker.ts) (or equivalent) already derives multipliers from grid; extend it to:  
    - Mark winning positions.  
    - Load/save spot multiplier per cell; apply growth (×2 cap at ×128) and combination.  
  - [GameStateManager](src/managers/GameStateManager.ts) or game-scoped state: hold “multiplier spots” for current spin/feature.  
  - Backend/tmp_backend: if server-authoritative, replicate same rules (spot persistence, growth, cap, combination).

- **UI:** Show multiplier spots on the grid (e.g. ×2, ×4, … ×128) and combine when multiple spots contribute to a win.

---

## 6. Free Spins

### 6.1 Spec

| Scatters | Free Spins |
|----------|------------|
| 3 | 10 |
| 4 | 12 |
| 5 | 15 |
| 6 | 20 |
| 7 | 30 |

- Additional scatters during FS award **same** number of extra spins (e.g. 3 scatters again = +10 FS).  
- Special reels during Free Spins.  
- Multiplier spots persist and can keep growing during FS.

### 6.2 Config and Code

- **GameConfig.ts:**  
  - Add constant, e.g. `SCATTER_FREE_SPINS: Record<number, number> = { 3: 10, 4: 12, 5: 15, 6: 20, 7: 30 }`.  
  - Use for both initial trigger and retrigger (same table).

- **BonusHeader / FreeRoundManager / Dialogs:**  
  - Use `SCATTER_FREE_SPINS` for “spins awarded” and “spins remaining” copy.  
  - Ensure retrigger uses same table (e.g. 3 scatters → +10 FS).

- **Backend / GameAPI:**  
  - Free spin outcomes and counts must align with 3–7 scatter counts and 10/12/15/20/30 FS.

---

## 7. Bet Limits & UI

### 7.1 Spec

- **Min Bet:** 0.20  
- **Max Bet:** 150.00  

### 7.2 Current

- [BetController.ts](src/game/components/controller/BetController.ts): `BET_LEVELS` already includes 0.2 and 150.  
- Ensure **all** entry points (BetOptions, Autoplay, Buy Feature, backend) clamp or validate to 0.20–150.00.

### 7.3 UI Elements (Spec)

- Enhance Bet control  
- Buy Feature control  
- Settings Controller  
- Sound Controller  
- Information Display  
- Credit Display  
- Bet Controller  
- Spin Controller  
- Turbo Controller  
- Autoplay Controller  

Map these to existing components (SlotController, BetController, AmplifyBetController, BuyFeature, Menu, BalanceController, etc.) and ensure naming/labels match spec (e.g. “Enhance Bet” vs “Amplify Bet”).

---

## 8. Asset & Naming Conventions

Spec uses `[initials]` placeholders for assets. When integrating final art:

- **Music:** `bonus_bg_[initials]`, `main_bg_[initials]`  
- **SFX:** `scatter_drop_[initials]`, `spin_button_[initials]`, `turbo_drop_[initials]`, `reel_drop_[initials]`, `tumble_explosion_[initials]`, etc.  
- **Symbols:** `symbol0_[initials]` (scatter), `symbol1–7_[initials]` (regular), `symbol8–22_[initials]` (multiplier bombs).  
- **Reels:** `main_reel_[initials]`, `bonus_reel_[initials]`  
- **Dialogs:** `buy_feature_dialog_[initials]`, `enhance_bet_dialog_[initials]`, win dialogs (small/medium/large/super), etc.

**Where:** [AssetConfig.ts](src/config/AssetConfig.ts), Preloader, and any asset keys in components. Keep GameConfig as source of truth for symbol counts (e.g. 7 regular, 15 multiplier bombs, 1 scatter) so asset lists stay in sync.

---

## 9. Refactoring Checklist

Use this as a linear guide; adjust order if you do backend/frontend in parallel.

- [ ] **GameConfig (source of truth)**  
  - [ ] Grid: `SLOT_COLUMNS = 7`, `SLOT_ROWS = 7` (done).  
  - [ ] `MIN_CLUSTER_SIZE = 5`.  
  - [ ] `MIN_SCATTER_FOR_BONUS = 3`.  
  - [ ] `NORMAL_SYMBOLS = [1..7]`, `MULTIPLIER_SYMBOLS = [8..22]`.  
  - [ ] Add `MAX_WIN_MULTIPLIER = 2100`.  
  - [ ] Add `SCATTER_FREE_SPINS = { 3:10, 4:12, 5:15, 6:20, 7:30 }`.  
  - [ ] Add or link paytable for symbols 1–7 (3–15 connected).

- [ ] **Grid & data shape**  
  - [ ] All `area` / `symbols` arrays 7×7 everywhere (Data.ts, GameAPI mocks, SymbolGrid, Symbols).  
  - [ ] WINLINES either removed or replaced by 7×7 cluster logic.

- [ ] **Win detection**  
  - [ ] Cluster detection: connected H+V, min size 5.  
  - [ ] Payout: use new paytable (1–7, 3–15 symbols); multiplier bombs 8–22 (2×–500×).  
  - [ ] Cap total win at 2,100× bet where applicable.

- [ ] **Scatter & Free Spins**  
  - [ ] Trigger at 3+ scatters; award FS from `SCATTER_FREE_SPINS`.  
  - [ ] Retrigger: same table (e.g. 3→+10 FS).  
  - [ ] Buy Bonus: 10–30 FS option.

- [ ] **Multiplier spots**  
  - [ ] Implement position-based spots (×2–×128), growth on repeat wins, combination.  
  - [ ] Base: persist during tumble, clear when tumbles end.  
  - [ ] FS: persist for entire feature.

- [ ] **Tumble**  
  - [ ] Runs until no more wins; uses 5+ cluster rule and 7×7 grid.

- [ ] **Bet limits**  
  - [ ] Validate 0.20–150.00 everywhere (frontend + backend).

- [ ] **UI and copy**  
  - [ ] Enhance Bet, Buy Feature, Settings, Sound, Info, Credit, Bet, Spin, Turbo, Autoplay all present and named per spec.

- [ ] **Assets**  
  - [ ] Symbol set 0, 1–7, 8–22; asset keys and AssetConfig aligned with spec naming.

- [ ] **Tests**  
  - [ ] Update SymbolDetector/Payout/Data tests for 7×7, new symbol set, and cluster pay 5+.

When in doubt, keep [GameConfig.ts](src/config/GameConfig.ts) as the single source of truth for grid size, symbol sets, scatter/FS table, min cluster size, and max win multiplier.
