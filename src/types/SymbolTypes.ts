/**
 * Symbol Type Definitions
 * Provides proper typing for symbol objects used throughout the game
 */

import { GameObjects } from 'phaser';

/**
 * Base interface for all symbol objects (both Spine and Sprite)
 */
export interface ISymbolObject {
  /** The numeric value/ID of this symbol (0-22) */
  symbolValue: number;
  
  /** X position */
  x: number;
  
  /** Y position */
  y: number;
  
  /** Display width after scaling */
  displayWidth: number;
  
  /** Display height after scaling */
  displayHeight: number;
  
  /** Whether the object has been destroyed */
  destroyed?: boolean;
  
  /** Set visibility */
  setVisible(visible: boolean): this;
  
  /** Set alpha/opacity */
  setAlpha(alpha: number): this;
  
  /** Set position */
  setPosition(x: number, y: number): this;
  
  /** Set depth/z-order */
  setDepth(depth: number): this;
  
  /** Set scale */
  setScale(x: number, y?: number): this;
  
  /** Destroy the object */
  destroy(): void;
}

/**
 * Spine-specific symbol interface
 */
export interface ISpineSymbol extends ISymbolObject {
  /** Spine animation state controller */
  animationState: {
    setAnimation(trackIndex: number, animationName: string, loop: boolean): void;
    addAnimation(trackIndex: number, animationName: string, loop: boolean, delay: number): void;
    clearTracks(): void;
    timeScale: number;
  };
  
  /** Spine skeleton */
  skeleton: {
    data: {
      findAnimation(name: string): any;
    };
  };
  
  /** Scale X */
  scaleX: number;
  
  /** Scale Y */
  scaleY: number;
}

/**
 * Sprite-specific symbol interface
 */
export interface ISpriteSymbol extends ISymbolObject {
  /** Texture information */
  texture: {
    key: string;
  };
  
  /** Set tint color */
  setTint(color: number): this;
  
  /** Clear tint */
  clearTint(): this;
}

/**
 * Union type for any symbol object
 */
export type SymbolObject = ISpineSymbol | ISpriteSymbol;

/**
 * Type guard to check if a symbol is a Spine object
 */
export function isSpineSymbol(symbol: SymbolObject): symbol is ISpineSymbol {
  return 'animationState' in symbol && symbol.animationState !== undefined;
}

/**
 * Type guard to check if a symbol is a Sprite object
 */
export function isSpriteSymbol(symbol: SymbolObject): symbol is ISpriteSymbol {
  return 'texture' in symbol && !('animationState' in symbol);
}

/**
 * Grid position interface
 */
export interface GridPosition {
  /** Column index (0-based) */
  col: number;
  /** Row index (0-based) */
  row: number;
}

/**
 * Scatter grid position (uses x/y naming for backend compatibility)
 */
export interface ScatterGridPosition {
  /** Column index */
  x: number;
  /** Row index */
  y: number;
}

/**
 * Tumble out symbol data from backend
 */
export interface TumbleOutSymbol {
  /** Symbol ID */
  symbol: number;
  /** Count of symbols removed */
  count?: number;
  /** Alternate count field used by some backends */
  size?: number;
  /** Explicit positions for removed symbols (column, row) */
  positions?: Array<[number, number] | { col?: number; row?: number; x?: number; y?: number }>;
  /** Win amount for this symbol cluster */
  win?: number | { base?: number; multiplier?: number; total?: number; amount?: number; value?: number };
}

/**
 * Tumble step data from backend
 */
export interface TumbleStep {
  /** Symbols involved in this tumble */
  symbols: {
    /** New symbols dropping in (per column) */
    in: number[][];
    /** Symbols being removed */
    out: TumbleOutSymbol[];
  };
  /** Total win for this tumble step */
  win: number;
}

/**
 * Symbol configuration for Spine scales
 */
export interface SpineSymbolScaleConfig {
  [symbolId: number]: number;
}

/**
 * Default Spine symbol scales
 */
export const DEFAULT_SPINE_SYMBOL_SCALES: SpineSymbolScaleConfig = {
  0:  0.135,   // Symbol0 (scatter)
  1:  0.035,   // Symbol1
  2:  0.035,   // Symbol2
  3:  0.035,   // Symbol3
  4:  0.135,   // Symbol4
  5:  0.135,   // Symbol5
  6:  0.135,   // Symbol6
  7:  0.135,   // Symbol7
  8:  0.135,   // Symbol8
  9:  0.135,   // Symbol9
  10: 0.135,   // Symbol10 (multiplier)
  11: 0.135,   // Symbol11 (multiplier)
  12: 0.137,   // Symbol12 (wildcard x2)
  13: 0.137,   // Symbol13 (wildcard x3)
  14: 0.137,   // Symbol14 (wildcard x4)
};

/**
 * Check if a symbol is a multiplier symbol (multiplier feature removed; always false)
 */
export function isMultiplierSymbol(symbolId: number): boolean {
  return false;
}

/**
 * Check if a symbol is a scatter symbol
 */
export function isScatterSymbol(symbolId: number): boolean {
  return symbolId === 0;
}
