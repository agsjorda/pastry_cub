/**
 * Scatter grid utilities (replaces tmp_backend SymbolDetector.getScatterGrids).
 * Row-major grid: symbols[row][col].
 */

export interface ScatterGridPosition {
  x: number; // column
  y: number; // row
}

/**
 * Find all grid positions where the symbol equals the scatter symbol id.
 * Grid is row-major: symbols[y][x] = symbols[row][col].
 */
export function getScatterGrids(
  symbols: number[][],
  scatterSymbolId: number
): ScatterGridPosition[] {
  const result: ScatterGridPosition[] = [];
  for (let y = 0; y < symbols.length; y++) {
    for (let x = 0; x < (symbols[y]?.length ?? 0); x++) {
      if (symbols[y][x] === scatterSymbolId) {
        result.push({ x, y });
      }
    }
  }
  return result;
}
