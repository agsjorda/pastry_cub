/**
 * Symbols Module - Barrel Export
 * 
 * This module contains all the refactored components for the symbol grid system.
 * Import from this file to access all symbol-related functionality.
 * 
 * @example
 * import { Symbols, SymbolGrid, SymbolMultiplier } from './symbols';
 */

// Main Symbols class (backward compatibility)
export { Symbols } from './Symbols';

// Core modules
export { SymbolGrid } from './SymbolGrid';
export { SymbolAnimations } from './SymbolAnimations';
export { SymbolFactory } from './SymbolFactory';
export { SymbolOverlay } from './SymbolOverlay';
export { SymbolMultiplier } from './SymbolMultiplier';
export type { SymbolMultiplierLayout } from './SymbolMultiplier';

// Specialized controllers
export { FreeSpinController } from './FreeSpinController';

// Types (for TypeScript consumers)
export type {
  GridPosition,
  CellPosition,
  SpinMockData,
  SymbolObject,
  SpineAnimationState,
  SpineTrackEntry,
  SpineAnimationListener,
  SpineSkeleton,
  TumbleOut,
  TumbleData,
  RemovalMask,
  SpinData,
  FreeSpinData,
  FreeSpinItem,
  PendingFreeSpinsData,
  PendingScatterRetrigger,
  OverlayRestoreEntry,
  GridBounds,
  GridConfig,
  SymbolPositionConfig,
  FirstWinCallback,
  SymbolIteratorCallback,
} from './types';
