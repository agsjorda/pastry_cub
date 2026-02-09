/**
 * Game Configuration Constants
 * Centralized configuration for the slot game.
 * PACKAGE_5 template: per-game branding lives in GameBranding.ts; edit that file for a new game.
 */

import { PRELOADER_BRANDING } from './GameBranding';

// Re-export branding so existing imports from GameConfig still work
export { CLOCK_DISPLAY_NAME, GAME_DISPLAY_NAME, CLOCK_DISPLAY_CONFIG } from './GameBranding';

/** WinTracker position and icon size (symbol win strip) */
export const WIN_TRACKER_LAYOUT = {
  /** Vertical offset from base position (negative = up, positive = down) */
  offsetY: -115,
  /** Scale of symbol icons in the strip */
  iconScale: 0.02,
} as const;

// =============================================================================
// PRELOADER / LOADING SCREEN (structure + branding from GameBranding)
// =============================================================================
export const PRELOADER_CONFIG = {
  /** Background color (hex) for loading screen */
  BACKGROUND_COLOR: 0x10161d,
  /** Vertical offset modifier added to max-win and other elements */
  VERTICAL_OFFSET_MODIFIER: 10,
  /** Progress bar padding in pixels */
  PROGRESS_BAR_PADDING: 3,
  /** Loading frame: Y offset from screen center */
  LOADING_FRAME_OFFSET_Y: 345,
  /** Loading frame: scale multiplier applied after cover-fit */
  LOADING_FRAME_SCALE_MODIFIER: 0.04,
  TAGLINE: PRELOADER_BRANDING.TAGLINE,
  WEBSITE: PRELOADER_BRANDING.WEBSITE,
  MAX_WIN: PRELOADER_BRANDING.MAX_WIN,
  /** Press-to-play button: Y position as ratio of screen height */
  BUTTON_Y_RATIO: 0.77,
  /** Spin button rotation animation duration (ms) */
  SPIN_BUTTON_ROTATION_DURATION_MS: 5000,
  /** Character 1 (left): position ratios and scale */
  CHARACTER_1: { X_RATIO: 0.23, Y_RATIO: 0.61, SCALE: 0.2 },
  /** Character 2 (right): position ratios and scale */
  CHARACTER_2: { X_RATIO: 0.75, Y_RATIO: 0.52, SCALE: 0.3 },
  /** Delay (ms) before creating characters after create() */
  CHARACTER_CREATE_DELAY_MS: 100,
  /** Fullscreen button: base margin and icon scale (multiplied by assetScale at runtime) */
  FULLSCREEN_MARGIN_BASE: 16,
  FULLSCREEN_ICON_SCALE_BASE: 1.5,
} as const;

// =============================================================================
// GAME SCENE (main play scene)
// =============================================================================
/** Physics world height = scale.height - this offset */
export const GAME_SCENE_PHYSICS_BOTTOM_OFFSET = 220;
/** Fade-in from black duration (ms) */
export const GAME_SCENE_FADE_IN_DURATION_MS = 1000;
/** Character positions and scale in main game (left/right of reels) */
export const GAME_SCENE_CHARACTER_1 = { X_RATIO: 0.42, Y_RATIO: 0.27, SCALE: 0.1, DEPTH: 100 };
export const GAME_SCENE_CHARACTER_2 = { X_RATIO: 0.65, Y_RATIO: 0.24, SCALE: 0.13, DEPTH: 100 };

// =============================================================================
// GRID CONFIGURATION
// =============================================================================
export const SLOT_COLUMNS: number = 7; // number of columns (vertical reels)
export const SLOT_ROWS: number = 7; // number of rows (horizontal)

// =============================================================================
// SYMBOL CONFIGURATION
// =============================================================================
export const SCATTER_SYMBOL: number[] = [0];
export const SCATTER_SYMBOL_ID: number = 0;
/** Regular pay symbols (cluster pays) */
export const NORMAL_SYMBOLS: number[] = [1, 2, 3, 4, 5, 6, 7];
/** Multiplier bomb symbols (15 symbols: IDs 8–22) */
export const MULTIPLIER_SYMBOLS: number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export const ALL_SYMBOLS: number[] = [...SCATTER_SYMBOL, ...NORMAL_SYMBOLS, ...MULTIPLIER_SYMBOLS];

/** Maps multiplier symbol IDs (8–22) to their numeric multiplier values (2×–500×) */
export const MULTIPLIER_VALUES: Record<number, number> = {
  8: 2,
  9: 3,
  10: 4,
  11: 5,
  12: 6,
  13: 8,
  14: 10,
  15: 12,
  16: 15,
  17: 20,
  18: 25,
  19: 50,
  20: 100,
  21: 250,
  22: 500,
};

/** Minimum cluster size to trigger a win (connected horizontally and vertically) */
export const MIN_CLUSTER_SIZE: number = 5;

/** Minimum scatter symbols to trigger Free Spins */
export const MIN_SCATTER_FOR_BONUS: number = 3;

/** Minimum scatter symbols to trigger retrigger during bonus */
export const MIN_SCATTER_FOR_RETRIGGER: number = 3;

/** Scatter count → Free Spins awarded (trigger and retrigger use same table) */
export const SCATTER_FREE_SPINS: Record<number, number> = {
  3: 10,
  4: 12,
  5: 15,
  6: 20,
  7: 30,
};

/** Max win cap as multiplier of bet */
export const MAX_WIN_MULTIPLIER: number = 2100;

/** @deprecated Scatter pays FS only per spec; use SCATTER_FREE_SPINS. Kept for backwards compat. */
export const SCATTER_PAYOUT_MULTIPLIERS: Record<number, number> = {
  4: 3,
  5: 5,
  6: 100,
};

// =============================================================================
// SYMBOL DISPLAY CONFIGURATION
// =============================================================================
export const SYMBOL_CONFIG = {
  /** Display width of each symbol in pixels */
  DISPLAY_WIDTH: 60,
  /** Display height of each symbol in pixels */
  DISPLAY_HEIGHT: 60,
  /** Horizontal spacing between symbols */
  HORIZONTAL_SPACING: 6,
  /** Vertical spacing between symbols */
  VERTICAL_SPACING: 4,
  /** Number of filler symbols during reel spin */
  FILLER_COUNT: 20,
} as const;

// =============================================================================
// TIMING CONFIGURATION
// =============================================================================
export const DELAY_BETWEEN_SPINS: number = 2000;
/** Ratio for time between column starts relative to DELAY_BETWEEN_SPINS */
export const DROP_REEL_START_INTERVAL_RATIO: number = 0.08;

export const TIMING_CONFIG = {
  /** Extended duration for scatter anticipation (ms) */
  EXTEND_DURATION_MS: 3000,
  /** Stagger delay between symbols within a column (ms) */
  SYMBOL_STAGGER_MS: 100,
  /** Stagger delay between columns (ms) */
  COLUMN_STAGGER_MS: 50,
  /** Win dialog auto-close delay (ms) */
  WIN_DIALOG_AUTO_CLOSE_MS: 2500,
  /** Grace period before showing congrats dialog (ms) */
  CONGRATS_GRACE_MS: 1200,
} as const;

/**
 * Reel drop vs conveyor sync - adjust these to match symbol fall speed to the conveyor belt.
 * REEL_DROP_DURATION_MULTIPLIER: < 1 = faster symbol drop, > 1 = slower. Default 1.
 * CONVEYOR_ANIMATION_TIME_SCALE: Spine animation speed for conveyor. < 1 = slower belt, > 1 = faster. Default 1.
 */
export const REEL_DROP_DURATION_MULTIPLIER: number = 1;
export const CONVEYOR_ANIMATION_TIME_SCALE: number = 1;

// =============================================================================
// ANIMATION CONFIGURATION
// =============================================================================
export const ANIMATION_CONFIG = {
  /** Multiplier visual scale boost (applied on top of base scale) */
  MULTIPLIER_VISUAL_SCALE: 1.6,
  /** Stagger between triggering multiplier symbols (ms) */
  MULTIPLIER_TRIGGER_STAGGER_MS: 800,
  /** Symbol hop height for drop animation */
  SYMBOL_HOP_HEIGHT: 10,
  /** Symbol bounce after landing */
  SYMBOL_BOUNCE_HEIGHT: 5,
  /** Filler symbol bounce after landing */
  FILLER_BOUNCE_HEIGHT: 40,
} as const;

// =============================================================================
// UI CONFIGURATION
// =============================================================================
export const UI_CONFIG = {
  /** Depth layers for UI elements */
  DEPTH: {
    SYMBOLS: 10,
    SYMBOL_OVERLAY: 500,
    WINNING_SYMBOLS: 501,
    CONTROLLER: 900,
    DIALOGS: 1000,
    COIN_ANIMATION: 800,
  },
  /** Controller button configuration */
  BUTTON: {
    DEFAULT_DEPTH: 10,
    ANIMATION_DEPTH: 11,
    SPIN_ANIMATION_SCALE: 0.435,
    AUTOPLAY_ANIMATION_SCALE: 0.16,
  },
} as const;

// =============================================================================
// WIN THRESHOLDS (multipliers of bet amount)
// =============================================================================
export const WIN_THRESHOLDS = {
  /** Threshold for "Big Win" dialog */
  BIG_WIN: 20,
  /** Threshold for "Mega Win" dialog */
  MEGA_WIN: 30,
  /** Threshold for "Epic Win" dialog */
  EPIC_WIN: 45,
  /** Threshold for "Super Win" dialog */
  SUPER_WIN: 60,
} as const;

// =============================================================================
// INITIAL / DEMO GRID
// =============================================================================
/** Default symbols shown on game load (row-major: [row][col]). Used for demo/testing. */
export const INITIAL_SYMBOLS: number[][] = [
  [0, 1, 3, 1, 0, 2, 4],
  [1, 5, 2, 5, 2, 4, 3],
  [2, 5, 5, 1, 5, 3, 1],
  [3, 4, 1, 2, 4, 1, 2],
  [4, 2, 0, 3, 1, 5, 4],
  [1, 3, 2, 4, 5, 2, 6],
  [2, 1, 4, 3, 2, 1, 7],
];

// =============================================================================
// SYMBOL GRID LAYOUT (reel position, mask, overlay)
// =============================================================================
/** Reel/grid center: centerX = scene.scale.width * GRID_CENTER_X_RATIO + GRID_CENTER_X_OFFSET_PX */
export const GRID_CENTER_X_RATIO = 0.5;
export const GRID_CENTER_X_OFFSET_PX = -5;
export const GRID_CENTER_Y_RATIO = 0.56;
export const GRID_CENTER_Y_OFFSET_PX = -65;

export const GRID_MASK_PADDING = { left: 14, right: 14, top: 40, bottom: 50 } as const;
export const GRID_MASK_GRADIENT_FADE_HEIGHT = 24;
export const GRID_OVERLAY_PADDING = { x: 9, y: 8, offsetX: 1, offsetY: 0.7 } as const;

// =============================================================================
// SYMBOL ANIMATION TIMING (ms)
// =============================================================================
export const ANIMATION_STAGGER_MS = 50;
export const SCALE_UP_DELAY_MS = 500;
export const WIN_TEXT_DELAY_MS = 800;
export const MULTIPLIER_STAGGER_MS = 800;
export const MULTIPLIER_OVERLAY_DELAY_MS = 250;
export const SCATTER_SHRINK_DURATION_MS = 350;
export const SCATTER_MOVE_DURATION_MS = 500;
export const SCATTER_GATHER_DURATION_MS = 800;
export const OVERLAY_FADE_IN_DURATION_MS = 300;
export const OVERLAY_FADE_OUT_DURATION_MS = 200;

// =============================================================================
// SYMBOL SCALES (Spine/visual tuning)
// =============================================================================
export const SPINE_SYMBOL_SCALES: Record<number, number> = {
  0: 0.135, 1: 0.035, 2: 0.035, 3: 0.035, 4: 0.135, 5: 0.135, 6: 0.135, 7: 0.135,
  8: 0.135, 9: 0.135, 10: 0.135, 11: 0.135, 12: 0.137, 13: 0.137, 14: 0.137, 15: 0.137, 16: 0.137, 17: 0.137, 18: 0.137, 19: 0.137, 20: 0.137, 21: 0.137, 22: 0.137,
};
export const DEFAULT_SPINE_SCALE = 0.6;
export const SPINE_SCALE_ADJUSTMENT = 0.93;
export const SYMBOL_MULTIPLIER_VISUAL_SCALE = 1.2;
export const SCATTER_ANIMATION_SCALE = 1.8;
export const SCATTER_GATHER_SCALE = 2.5;
export const SCATTER_RETRIGGER_SCALE = 1.5;

// =============================================================================
// SYMBOL DEPTH (Z-ordering)
// =============================================================================
export const DEPTH_SYMBOL_DEFAULT = 0;
export const DEPTH_OVERLAY = 500;
export const DEPTH_WINNING_SYMBOL = 600;
export const DEPTH_OVERLAY_CONTAINER = 930;
export const DEPTH_RETRIGGER_SYMBOL = 931;
export const DEPTH_WIN_LINES = 1000;

// =============================================================================
// SYMBOL ASSET MAPPING (spine base name → symbol IDs)
// =============================================================================
export const MULTIPLIER_ANIMATION_BASES: Record<string, number[]> = {
  'Symbol10_BZ': [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
};
