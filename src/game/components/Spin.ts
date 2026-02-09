/**
 * Spin - Centralized spin mechanics and win matching for cluster pays
 *
 * Contains:
 * - Paytables (symbol and scatter)
 * - Qualifying cluster threshold (8+)
 * - Cluster detection from grid (4-connected)
 * - Win calculation from grid (cluster pays + scatter)
 * - Helpers to interpret backend tumble/out data
 */

import { SLOT_COLUMNS, SCATTER_FREE_SPINS, MAX_WIN_MULTIPLIER } from '../../config/GameConfig';

/** Minimum matching symbol count to qualify as a winning cluster (win dialog, WinTracker, high-count animation) */
export const QUALIFYING_CLUSTER_COUNT = 5;

/** Regular pay symbols (1-7). Cluster pays apply only to these. */
export const CLUSTER_PAY_SYMBOLS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Scatter symbol ID (pays by total count anywhere on grid) */
export const SCATTER_SYMBOL_ID = 0;

/** Valid symbol payout counts (5 through 15) */
export const SYMBOL_PAY_COUNTS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

// -----------------------------------------------------------------------------
// PAYTABLES (bet multipliers; win = multiplier * bet)
// -----------------------------------------------------------------------------

/** Symbol paytable: symbol -> count -> bet multiplier. Counts 5–15. */
export const SYMBOL_PAYTABLE: Record<number, Record<number, number>> = {
  1: { 5: 1.0, 6: 1.5, 7: 1.75, 8: 2.0, 9: 2.5, 10: 5.0, 11: 7.5, 12: 15.0, 13: 35.0, 14: 70.0, 15: 150.0 },
  2: { 5: 0.75, 6: 1.0, 7: 1.25, 8: 1.5, 9: 2.0, 10: 4.0, 11: 6.0, 12: 12.5, 13: 30.0, 14: 60.0, 15: 100.0 },
  3: { 5: 0.5, 6: 0.75, 7: 1.0, 8: 1.25, 9: 1.5, 10: 3.0, 11: 4.5, 12: 10.0, 13: 20.0, 14: 40.0, 15: 60.0 },
  4: { 5: 0.4, 6: 0.5, 7: 0.75, 8: 1.0, 9: 1.25, 10: 2.0, 11: 3.0, 12: 5.0, 13: 10.0, 14: 20.0, 15: 40.0 },
  5: { 5: 0.3, 6: 0.4, 7: 0.5, 8: 0.75, 9: 1.0, 10: 1.5, 11: 2.5, 12: 3.5, 13: 8.0, 14: 15.0, 15: 30.0 },
  6: { 5: 0.25, 6: 0.3, 7: 0.4, 8: 0.5, 9: 0.75, 10: 1.25, 11: 2.0, 12: 3.0, 13: 6.0, 14: 12.0, 15: 25.0 },
  7: { 5: 0.2, 6: 0.25, 7: 0.3, 8: 0.4, 9: 0.5, 10: 1.0, 11: 1.5, 12: 2.5, 13: 5.0, 14: 10.0, 15: 20.0 },
};

/** Scatter: count -> bet multiplier. Per PACKAGE_5 spec, scatter pays FS only; cash multiplier kept for backward compat. */
export const SCATTER_PAYTABLE: Record<number, number> = {
  3: 0, 4: 0, 5: 0, 6: 0, 7: 0, // Scatter awards FS via SCATTER_FREE_SPINS, not cash
};

/** Get free spins awarded for scatter count (3–7). Uses GameConfig.SCATTER_FREE_SPINS. */
export function getScatterFreeSpins(count: number): number {
  return SCATTER_FREE_SPINS[count] ?? 0;
}

/** Get symbol payout multiplier for a given count (before bet). Returns 0 if below qualifying count. */
export function getSymbolPayoutMultiplier(symbol: number, count: number): number {
  if (count < QUALIFYING_CLUSTER_COUNT) return 0;
  const row = SYMBOL_PAYTABLE[symbol];
  if (!row) return 0;
  return row[count] ?? 0;
}

/** Get scatter payout multiplier for a given scatter count (before bet). */
export function getScatterPayoutMultiplier(count: number): number {
  return SCATTER_PAYTABLE[count] ?? 0;
}

/** Cap win at MAX_WIN_MULTIPLIER × bet (2,100× per spec). */
export function capWinByMaxMultiplier(win: number, bet: number): number {
  if (!Number.isFinite(bet) || bet <= 0) return win;
  const cap = bet * MAX_WIN_MULTIPLIER;
  return Math.min(win, cap);
}

// -----------------------------------------------------------------------------
// CLUSTER DETECTION (4-connected on grid)
// -----------------------------------------------------------------------------

/** Grid is column-major: area[col][row] */
export type GridArea = number[][];

export interface Cluster {
  symbol: number;
  count: number;
  positions: { col: number; row: number }[];
}

/**
 * Find all 4-connected clusters of a pay symbol (1-7) in the grid.
 * Does not include scatter or multiplier symbols in cluster pay.
 */
export function findClusters(area: GridArea): Cluster[] {
  const clusters: Cluster[] = [];
  const cols = Math.min(area?.length ?? 0, SLOT_COLUMNS);
  const visited = new Set<string>();

  function key(c: number, r: number): string {
    return `${c},${r}`;
  }

  function get(c: number, r: number): number {
    const col = area[c];
    if (!Array.isArray(col)) return -1;
    const val = col[r];
    return typeof val === 'number' ? val : -1;
  }

  function dfs(col: number, row: number, symbol: number, positions: { col: number; row: number }[]): void {
    const k = key(col, row);
    if (visited.has(k)) return;
    const v = get(col, row);
    if (v !== symbol) return;
    visited.add(k);
    positions.push({ col, row });
    dfs(col - 1, row, symbol, positions);
    dfs(col + 1, row, symbol, positions);
    dfs(col, row - 1, symbol, positions);
    dfs(col, row + 1, symbol, positions);
  }

  const isClusterSymbol = (s: number) => CLUSTER_PAY_SYMBOLS.includes(s as any);

  for (let c = 0; c < cols; c++) {
    const rows = area[c]?.length ?? 0;
    for (let r = 0; r < rows; r++) {
      const sym = get(c, r);
      if (!isClusterSymbol(sym) || visited.has(key(c, r))) continue;
      const positions: { col: number; row: number }[] = [];
      dfs(c, r, sym, positions);
      if (positions.length >= QUALIFYING_CLUSTER_COUNT) {
        clusters.push({ symbol: sym, count: positions.length, positions });
      }
    }
  }
  return clusters;
}

/**
 * Count total scatter symbols (symbol 0) in the grid.
 */
export function countScatters(area: GridArea): number {
  let n = 0;
  const cols = area?.length ?? 0;
  for (let c = 0; c < cols; c++) {
    const col = area[c];
    if (!Array.isArray(col)) continue;
    for (let r = 0; r < col.length; r++) {
      if (col[r] === SCATTER_SYMBOL_ID) n++;
    }
  }
  return n;
}

// -----------------------------------------------------------------------------
// WIN CALCULATION FROM GRID
// -----------------------------------------------------------------------------

export interface EvaluateGridResult {
  /** Cluster wins (symbol, count, win in currency) */
  outs: TumbleOut[];
  /** Total win (cluster + scatter) in currency */
  totalWin: number;
  /** True if at least one qualifying cluster exists */
  hasCluster: boolean;
}

/**
 * Evaluate a grid and compute cluster pays + scatter pay.
 * @param area Column-major grid area[col][row]
 * @param bet Bet amount (win = multiplier * bet)
 */
export function evaluateGrid(area: GridArea, bet: number): EvaluateGridResult {
  const outs: TumbleOut[] = [];
  let totalWin = 0;

  const clusters = findClusters(area);
  for (const cl of clusters) {
    const mult = getSymbolPayoutMultiplier(cl.symbol, cl.count);
    const win = mult * bet;
    if (win > 0) {
      totalWin += win;
      outs.push({ symbol: cl.symbol, count: cl.count, win });
    }
  }

  const scatterCount = countScatters(area);
  const scatterMult = getScatterPayoutMultiplier(scatterCount);
  if (scatterMult > 0) {
    const win = scatterMult * bet;
    totalWin += win;
    outs.push({ symbol: SCATTER_SYMBOL_ID, count: scatterCount, win });
  }

  const hasCluster = outs.some((o) => (o.count ?? 0) >= QUALIFYING_CLUSTER_COUNT && o.symbol !== SCATTER_SYMBOL_ID);

  return { outs, totalWin, hasCluster };
}

export interface TumbleOut {
  symbol?: number;
  count?: number;
  win?: number;
}

export interface TumbleSymbols {
  in?: number[][];
  out?: TumbleOut[];
}

export interface Tumble {
  win?: number;
  symbols?: TumbleSymbols;
}

export interface TumbleResult {
  totalWin: number;
  hasCluster: boolean;
}

/**
 * Calculate total win from tumbles and detect if any qualifying cluster (count >= QUALIFYING_CLUSTER_COUNT) exists.
 * Tumble wins only count toward total when the tumble has at least 5 matching adjacent (H+V) symbols.
 * Used for win dialog triggering and total win display.
 */
export function calculateTotalWinFromTumbles(tumbles: Tumble[] | any[]): TumbleResult {
  if (!Array.isArray(tumbles) || tumbles.length === 0) {
    return { totalWin: 0, hasCluster: false };
  }
  let totalWin = 0;
  let hasCluster = false;
  for (const tumble of tumbles) {
    const outs = tumble?.symbols?.out || [];
    const tumbleHasQualifying = Array.isArray(outs) && outs.some((o: any) => (Number(o?.count) || 0) >= QUALIFYING_CLUSTER_COUNT);
    if (tumbleHasQualifying) hasCluster = true;
    const w = Number(tumble?.win || 0);
    if (Number.isFinite(w) && w > 0 && tumbleHasQualifying) {
      totalWin += w;
    }
  }
  return { totalWin, hasCluster };
}

/**
 * Check if any out in the array represents a qualifying cluster (count >= QUALIFYING_CLUSTER_COUNT)
 */
export function hasQualifyingCluster(outs: TumbleOut[] | null | undefined): boolean {
  if (!Array.isArray(outs) || outs.length === 0) return false;
  return outs.some((o) => (Number(o?.count) || 0) >= QUALIFYING_CLUSTER_COUNT);
}

/**
 * Check if a single count qualifies as a winning cluster
 */
export function isQualifyingClusterCount(count: number): boolean {
  return Number.isFinite(count) && count >= QUALIFYING_CLUSTER_COUNT;
}

/**
 * Filter outs to only those that qualify for display (count >= QUALIFYING_CLUSTER_COUNT, win > 0)
 */
export function filterQualifyingOuts(
  outs: TumbleOut[] | null | undefined
): TumbleOut[] {
  if (!Array.isArray(outs) || outs.length === 0) return [];
  return outs.filter((o) => {
    const count = Number(o?.count) || 0;
    const win = Number(o?.win) || 0;
    return (
      Number.isFinite(Number(o?.symbol)) &&
      count >= QUALIFYING_CLUSTER_COUNT &&
      win > 0
    );
  });
}

/**
 * Get set of symbol IDs that have qualifying cluster count in outs (for UI e.g. high-count win animation).
 */
export function getHighCountSymbolsFromOuts(outs: TumbleOut[] | null | undefined): Set<number> {
  const set = new Set<number>();
  if (!Array.isArray(outs) || outs.length === 0) return set;
  for (const o of outs) {
    const c = Number(o?.count || 0);
    const s = Number(o?.symbol);
    if (Number.isFinite(s) && c >= QUALIFYING_CLUSTER_COUNT) set.add(s);
  }
  return set;
}

/**
 * Get total win for a single tumble (tumble.win or sum of symbols.out[].win).
 */
export function getTumbleTotal(tumble: Tumble | any): number {
  const w = Number(tumble?.win ?? 0);
  if (Number.isFinite(w) && w > 0) return w;
  const outs = tumble?.symbols?.out ?? [];
  if (!Array.isArray(outs)) return 0;
  return outs.reduce((sum: number, o: any) => sum + (Number(o?.win) || 0), 0);
}

/**
 * Sum of count from outs (for validation/debug).
 */
export function getTotalCountFromOuts(outs: TumbleOut[] | null | undefined): number {
  if (!Array.isArray(outs) || outs.length === 0) return 0;
  return outs.reduce((s, o) => s + (Number(o?.count) || 0), 0);
}

/**
 * Total win from slot's freespin data only (totalWin or sum of items). Use for bonus/congrats dialog when not using cumulative from header.
 */
export function getTotalWinFromFreespinOnly(slot: any): number {
  if (!slot) return 0;
  const fs = slot.freespin || slot.freeSpin;
  if (!fs) return 0;
  if (typeof fs.totalWin === 'number' && fs.totalWin > 0) return fs.totalWin;
  if (fs.items && Array.isArray(fs.items)) {
    return fs.items.reduce((sum: number, item: any) => sum + (item.totalWin || item.subTotalWin || 0), 0);
  }
  return 0;
}

/**
 * Sum win from paylines array.
 */
export function getTotalWinFromPaylines(paylines: any[] | null | undefined): number {
  if (!Array.isArray(paylines) || paylines.length === 0) return 0;
  let total = 0;
  for (const pl of paylines) {
    const w = Number(pl?.win ?? 0);
    if (Number.isFinite(w)) total += w;
  }
  return total;
}

/**
 * Total win from slot: slot.totalWin, or freespin items sum, or paylines + tumbles.
 */
export function getTotalWinFromSlot(slot: any): number {
  if (!slot) return 0;
  if (typeof slot.totalWin === 'number' && slot.totalWin > 0) return slot.totalWin;

  const freespinData = slot.freespin || slot.freeSpin;
  let itemsSum = 0;
  let hasItems = false;

  if (freespinData?.items && Array.isArray(freespinData.items)) {
    hasItems = true;
    itemsSum = freespinData.items.reduce((sum: number, item: any) => {
      const perSpinTotal =
        (typeof item?.totalWin === 'number' && item.totalWin > 0)
          ? item.totalWin
          : (item?.subTotalWin || 0);
      return sum + perSpinTotal;
    }, 0);
  }

  let totalWin = itemsSum;
  try {
    const mvRaw =
      slot?.freeSpin?.multiplierValue ??
      slot?.freespin?.multiplierValue ??
      freespinData?.multiplierValue ??
      0;
    const multiplierValue = Number(mvRaw) || 0;
    if (multiplierValue > 0) totalWin += multiplierValue;
  } catch {}

  if (!hasItems || itemsSum <= 0) {
    totalWin += getTotalWinFromPaylines(slot.paylines);
    if (Array.isArray(slot.tumbles) && slot.tumbles.length > 0) {
      for (const tumble of slot.tumbles) {
        totalWin += getTumbleTotal(tumble);
      }
    }
  }
  return totalWin;
}

/**
 * Spin total for multiplier logic: current freespin item subTotalWin if in bonus, else paylines + tumbles.
 */
export function getSpinTotalFromSpinData(spinData: any): number {
  let spinTotal = 0;
  try {
    const slot = spinData?.slot;
    const fs = slot?.freespin || slot?.freeSpin;
    if (fs?.items && Array.isArray(fs.items)) {
      const currentItem = fs.items.find((item: any) => Number(item?.spinsLeft) > 0);
      const base = Number(currentItem?.subTotalWin);
      if (Number.isFinite(base) && base > 0) spinTotal = base;
    }
    if (spinTotal === 0 && slot) {
      spinTotal += getTotalWinFromPaylines(slot.paylines);
      if (Array.isArray(slot.tumbles)) {
        for (const t of slot.tumbles) spinTotal += getTumbleTotal(t);
      }
    }
  } catch {}
  return spinTotal;
}

/**
 * Resolve spin total from spin data with fallback: match freespin item by area, then paylines + tumbles.
 */
export function getSpinTotalWithFallback(spinData: any): number {
  try {
    const slotAny = spinData?.slot || {};
    const fs = slotAny?.freespin || slotAny?.freeSpin;
    if (fs?.items && Array.isArray(fs.items)) {
      const currentItem = fs.items.find((item: any) => Number(item?.spinsLeft) > 0);
      const base = Number(currentItem?.subTotalWin);
      if (Number.isFinite(base) && base > 0) return base;
    }
    if (Array.isArray(fs?.items) && Array.isArray(slotAny?.area)) {
      const areaJson = JSON.stringify(slotAny.area);
      const matchItem = fs?.items.find((item: any) =>
        Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
      );
      if (matchItem) {
        const raw = (matchItem as any).totalWin ?? (matchItem as any).subTotalWin ?? 0;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    let total = 0;
    if (Array.isArray(slotAny?.paylines)) {
      for (const pl of slotAny.paylines) {
        const w = Number(pl?.win || 0);
        if (Number.isFinite(w)) total += w;
      }
    }
    if (Array.isArray(slotAny?.tumbles)) {
      for (const t of slotAny.tumbles) {
        const w = Number(t?.win ?? 0);
        if (Number.isFinite(w)) total += w;
      }
    }
    return total;
  } catch {}
  return 0;
}
