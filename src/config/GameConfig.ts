/**
 * Game Configuration Constants
 * Centralized configuration for the slot game
 */

// =============================================================================
// BRANDING (clock display name, etc.)
// =============================================================================
/** Name shown beside the clock (top-right) */
export const CLOCK_DISPLAY_NAME = 'DiJoker';
/** Game name shown after the time (e.g. " | Beelze_Bop") */
export const GAME_DISPLAY_NAME = 'Pastry Cub';

/** Clock + branding text position and style (used in Preloader and Game) */
export const CLOCK_DISPLAY_CONFIG = {
  offsetX: 5,
  offsetY: 5,
  fontSize: 16,
  fontFamily: 'poppins-regular',
  color: '#FFFFFF',
  alpha: 0.5,
  depth: 30000,
  scale: 0.7,
  additionalTextOffsetX: 5,
  additionalTextOffsetY: 0,
  additionalTextScale: 0.7,
  additionalTextColor: '#FFFFFF',
  additionalTextFontSize: 16,
  additionalTextFontFamily: 'poppins-regular',
} as const;

/** WinTracker position and icon size (symbol win strip) */
export const WIN_TRACKER_LAYOUT = {
  /** Vertical offset from base position (negative = up, positive = down) */
  offsetY: -115,
  /** Scale of symbol icons in the strip */
  iconScale: 0.02,
} as const;

// =============================================================================
// PRELOADER / LOADING SCREEN
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
  /** Tagline text and position */
  TAGLINE: {
    TEXT: 'PLAY LOUD. WIN WILD. DIJOKER STYLE',
    OFFSET_X: -5,
    OFFSET_Y: 375,
    FONT_SIZE_PX: 14,
  },
  /** Website text and position */
  WEBSITE: {
    TEXT: 'www.dijoker.com',
    OFFSET_Y: 400,
    FONT_SIZE_PX: 14,
  },
  /** "Win up to X" text */
  MAX_WIN: {
    TEXT: 'Win up to 21,000x',
    OFFSET_Y_FROM_CENTER: 145,
    FONT_SIZE_PX: 32,
    BREATHING_DURATION_MS: 800,
    BREATHING_SCALE_FROM: 0.9,
    BREATHING_SCALE_TO: 0.95,
  },
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
export const NORMAL_SYMBOLS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const MULTIPLIER_SYMBOLS: number[] = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export const ALL_SYMBOLS: number[] = [...SCATTER_SYMBOL, ...NORMAL_SYMBOLS, ...MULTIPLIER_SYMBOLS];

/** Maps multiplier symbol IDs (10–22) to their numeric multiplier values */
export const MULTIPLIER_VALUES: Record<number, number> = {
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 6,
  15: 8,
  16: 10,
  17: 12,
  18: 15,
  19: 20,
  20: 25,
  21: 50,
  22: 100,
};

/** Minimum cluster size to trigger a win (connected horizontally and vertically) */
export const MIN_CLUSTER_SIZE: number = 5;

/** Minimum scatter symbols to trigger bonus */
export const MIN_SCATTER_FOR_BONUS: number = 4;

/** Minimum scatter symbols to trigger retrigger during bonus */
export const MIN_SCATTER_FOR_RETRIGGER: number = 3;

/** Payout multipliers for scatter counts: count → bet multiplier */
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
  HORIZONTAL_SPACING: 5,
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
export const GRID_CENTER_Y_OFFSET_PX = -50;

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
  0: 0.135, 1: 0.035, 2: 0.035, 3: 0.035, 4: 0.135, 5: 0.135, 6: 0.135, 7: 0.135, 8: 0.135, 9: 0.135,
  10: 0.135, 11: 0.135, 12: 0.137, 13: 0.137, 14: 0.137,
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
  'Symbol10_BZ': [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
};
