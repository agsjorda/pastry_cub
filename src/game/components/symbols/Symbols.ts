/**
 * Symbols - Main orchestrator class for the symbol grid system
 * 
 * This class maintains the same public API as the original implementation
 * but delegates to specialized modules for cleaner organization.
 * 
 * Architecture:
 * - SymbolGrid: Manages the 2D grid of symbols
 * - SymbolFactory: Creates symbol objects (Spine/PNG)
 * - SymbolAnimations: Handles animations and tweens
 * - SymbolOverlay: Manages overlays and win text
 * - SymbolMarker: Bonus multiplier cell markers (x1, x2, ... x128)
 * - FreeSpinController: Manages free spin autoplay
 * 
 * For new code, prefer importing specific modules directly:
 * @example
 * import { SymbolGrid } from './symbols';
 */

import { Game } from '../../scenes/Game';
import { setSpeed } from '../GameData';
import { ScatterAnimationManager } from '../../../managers/ScatterAnimationManager';
import { getScatterGrids } from '../../../utils/scatterGrid';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';
import {
  SLOT_ROWS,
  SLOT_COLUMNS,
  DELAY_BETWEEN_SPINS,
  REEL_DROP_DURATION_MULTIPLIER,
  MIN_SCATTER_FOR_BONUS,
  MIN_SCATTER_FOR_RETRIGGER,
  SCATTER_SYMBOL_ID,
  INITIAL_SYMBOLS,
  SYMBOL_CONFIG,
  DEPTH_WINNING_SYMBOL,
  DEPTH_WIN_LINES,
  WIN_TEXT_SCALE_BONUS,
  SCATTER_ANIMATION_SCALE,
  SCATTER_GATHER_SCALE,
  SCATTER_RETRIGGER_SCALE,
  SCATTER_GATHER_DURATION_MS,
  SCATTER_SHRINK_DURATION_MS,
  SCATTER_MOVE_DURATION_MS,
  SHOW_WIN_BORDER_SYMBOLS,
  WIN_BORDER_LINE_WIDTH,
  BONUS_MULTIPLIER_LAYOUT,
} from '../../../config/GameConfig';
import { SoundEffectType } from '../../../managers/AudioManager';
import { normalizeAreaToGameConfig } from '../../../utils/GridTransform';
import { startAnimationWithEntry } from '../../../utils/SpineAnimationHelper';
import {
  findClusters,
  getHighCountSymbolsFromOuts,
  getOutCount,
  getOutWin,
  getTumbleTotal,
  getTotalWinFromSlot,
  getTotalWinFromFreespinOnly,
  getTotalCountFromOuts,
  getSpinTotalFromSpinData,
  getSpinTotalWithFallback,
  QUALIFYING_CLUSTER_COUNT,
} from '../Spin';

// Import new modular components
import { SymbolGrid } from './SymbolGrid';
import { SymbolAnimations } from './SymbolAnimations';
import { SymbolFactory, resolveSymbolAnimationName } from './SymbolFactory';
import { SymbolOverlay } from './SymbolOverlay';
import { SymbolMarker } from './SymbolMarker';
import { FreeSpinController } from './FreeSpinController';
import type {
  SymbolObject,
  GridPosition,
  SpinMockData,
  PendingFreeSpinsData,
  PendingScatterRetrigger,
} from './types';

/**
 * Main Symbols class - orchestrates the symbol grid system
 * 
 * This class maintains backward compatibility with the original API
 * while using the new modular architecture internally.
 */
export class Symbols {
  // Scale for the single Symbol0 (merge symbol) Spine object. Adjust as needed.
  public static MERGE_SYMBOL0_SPINE_SCALE: number = 0.2; // Set to previous PNG scale or adjust manually
  // Scale for the explosion VFX (independent from merge symbol scale).
  public static EXPLOSION_VFX_SCALE: number = 0.05;
  // Scale for the explosion VFX used with merge_symbol0.
  public static MERGE_EXPLOSION_VFX_SCALE: number = 0.2;
 
  // ============================================================================
  // STATIC PROPERTIES (Backward Compatibility)
  // ============================================================================

  public static FILLER_COUNT: number = SYMBOL_CONFIG.FILLER_COUNT;
  private static readonly MERGE_SYMBOL0_SCALE: number = 0.5;

  // ============================================================================
  // INTERNAL MODULES
  // ============================================================================

  private grid!: SymbolGrid;
  private animationsModule!: SymbolAnimations;
  private factory!: SymbolFactory;
  private overlayModule!: SymbolOverlay;
  private symbolMarker!: SymbolMarker;
  private freeSpinController!: FreeSpinController;

  // ============================================================================
  // LEGACY PUBLIC PROPERTIES (Maintained for backward compatibility)
  // ============================================================================

  public reelCount: number = 0;
  public scene!: Game;
  public scatterAnimationManager: ScatterAnimationManager;
  public currentSpinData: any = null;
  public isBuyFeatureTransitionComplete: boolean = false;

  // Expose grid properties for backward compatibility
  /** Show or hide the red debug border around the reel container */
  public setReelBorderVisible(visible: boolean): void {
    this.grid.setReelBorderVisible(visible);
  }

  public get container(): Phaser.GameObjects.Container {
    return this.grid?.container;
  }
  public get displayWidth(): number {
    return this.grid?.displayWidth ?? 62;
  }
  public get displayHeight(): number {
    return this.grid?.displayHeight ?? 62;
  }
  public get horizontalSpacing(): number {
    return this.grid?.horizontalSpacing ?? 9;
  }
  public get verticalSpacing(): number {
    return this.grid?.verticalSpacing ?? 4;
  }
  public get slotX(): number {
    return this.grid?.slotX ?? 0;
  }
  public get slotY(): number {
    return this.grid?.slotY ?? 0;
  }
  public get totalGridWidth(): number {
    return this.grid?.totalGridWidth ?? 0;
  }
  public get totalGridHeight(): number {
    return this.grid?.totalGridHeight ?? 0;
  }

  // Symbol arrays - delegate to grid
  public get symbols(): any[][] {
    return this.grid?.getSymbolsArray() ?? [];
  }
  public set symbols(value: any[][]) {
    this.grid?.setSymbolsArray(value);
  }
  public get newSymbols(): any[][] {
    return this.grid?.getNewSymbolsArray() ?? [];
  }
  public set newSymbols(value: any[][]) {
    this.grid?.setNewSymbolsArray(value);
  }
  public get currentSymbolData(): number[][] | null {
    return this.grid?.getSymbolData() ?? null;
  }
  public set currentSymbolData(value: number[][] | null) {
    this.grid?.setSymbolData(value);
  }

  // ============================================================================
  // STATE TRACKING
  // ============================================================================

  private hadWinsInCurrentItem: boolean = false;
  private scatterRetriggerAnimationInProgress: boolean = false;
  private pendingScatterRetrigger: PendingScatterRetrigger | null = null;
  private pendingSymbol0Retrigger: { symbol0Grids: GridPosition[] } | null = null;
  private transitionBzOverlay: any | null = null;
  private transitionBzWinPromise: Promise<void> | null = null;
  private transitionBzWinResolve: (() => void) | null = null;
  private radialLightPromise: Promise<void> | null = null;
  private mergedScatterSymbols: SymbolObject[] | null = null;
  private mergeLeadSymbol: SymbolObject | null = null;
  private scatterResetInProgress: boolean = false;
  private dialogListenerSetup: boolean = false;
  private scatterResetHandledForBonusStart: boolean = false;
  private freeSpinItemIndex: number = 0;
  // Cached total win calculated before freespin dialog is shown (buy feature / scatter trigger)
  private cachedTotalWin: number = 0;
  private skipReelDropsActive: boolean = false;
  private skipReelDropsPending: boolean = false;
  private skipHitbox?: Phaser.GameObjects.Zone;
  private skipTumblesActive: boolean = false;
  private tumbleInProgress: boolean = false;
  private reelDropInProgress: boolean = false;
  private tumbleDropInProgress: boolean = false;
  // Column-major snapshots used to validate cluster checks at WIN_STOP.
  private clusterWinGridSnapshots: number[][][] = [];
  private readonly skipTweenTimeScale: number = 1;
  private explosionVfxInProgress: number = 0;
  // Tracks whether the persistent bonus multiplier grid has been initialized for the current bonus session (so retriggers don't reset it).
  private bonusGridInitializedForSession: boolean = false;
  /** Win border graphics (scene layer) for SHOW_WIN_BORDER_SYMBOLS - cleared on new spin */
  private winBorderGraphics: Phaser.GameObjects.Graphics[] = [];

  // Free spin autoplay state - delegate to controller
  public get freeSpinAutoplayActive(): boolean {
    return this.freeSpinController?.isActive ?? false;
  }
  public set freeSpinAutoplayActive(value: boolean) {
    // Legacy setter - controller manages this internally
  }

  /**
   * Get immutable copies of cluster-check grid snapshots captured during the current spin.
   * Snapshot format is column-major: grid[col][row].
   */
  public getClusterWinGridSnapshots(): number[][][] {
    return this.clusterWinGridSnapshots.map((grid) => grid.map((col) => [...col]));
  }

  /**
   * Clear cached cluster-check snapshots.
   */
  public clearClusterWinGridSnapshots(): void {
    this.clusterWinGridSnapshots = [];
  }

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor() {
    this.scatterAnimationManager = ScatterAnimationManager.getInstance();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the symbols system
   */
  public create(scene: Game): void {
    this.scene = scene;

    // Initialize modules
    this.grid = new SymbolGrid(scene);
    this.animationsModule = new SymbolAnimations(
      scene,
      this.grid.displayWidth,
      this.grid.displayHeight
    );
    this.overlayModule = new SymbolOverlay(scene);
    this.symbolMarker = new SymbolMarker(scene);
    this.symbolMarker.setLayout({
      displayWidth: this.grid.displayWidth,
      displayHeight: this.grid.displayHeight,
      slotX: this.grid.slotX,
      slotY: this.grid.slotY,
      totalGridWidth: this.grid.totalGridWidth,
      totalGridHeight: this.grid.totalGridHeight,
      horizontalSpacing: this.grid.horizontalSpacing,
      verticalSpacing: this.grid.verticalSpacing,
      numCols: SLOT_COLUMNS,
      numRows: SLOT_ROWS,
      offsetX: BONUS_MULTIPLIER_LAYOUT.offsetX,
      offsetY: BONUS_MULTIPLIER_LAYOUT.offsetY,
      scale: BONUS_MULTIPLIER_LAYOUT.scale,
    });
    this.factory = new SymbolFactory(
      scene,
      this.animationsModule,
      this.grid.displayWidth,
      this.grid.displayHeight,
      this.grid.container,
      this.overlayModule
    );
    this.freeSpinController = new FreeSpinController(scene);

    // Set up controller callbacks
    this.freeSpinController.setCallbacks({
      onResetScatterSymbols: () => this.resetScatterSymbolsToGrid(),
      onShowCongratsDialog: () => this.showCongratsDialogAfterDelay(),
      onSetTurboMode: (enabled) => this.setTurboMode(enabled),
      getCurrentSpinData: () => this.currentSpinData,
    });

    // Set up event listeners
    this.setupSpinEventListener();
    this.setupDialogEventListeners();
    this.freeSpinController.setupEventListeners();

    // Listen for START event
    gameEventManager.on(GameEventType.START, () => {
      console.log('[Symbols] START event received, creating initial symbols...');
      this.createInitialSymbols();
    });

    // Listen for SPIN_DATA_RESPONSE
    gameEventManager.on(GameEventType.SPIN_DATA_RESPONSE, async (data: any) => {
      console.log('[Symbols] SPIN_DATA_RESPONSE received');
      if (!data.spinData?.slot?.area) {
        console.error('[Symbols] Invalid SpinData received - missing slot.area');
        return;
      }
      this.currentSpinData = data.spinData;
      await this.processSpinData(data.spinData);
    });

    // Listen for REELS_STOP
    gameEventManager.on(GameEventType.REELS_STOP, () => {
      console.log('[Symbols] REELS_STOP event received');
      if (this.scatterAnimationManager?.isAnimationInProgress()) {
        console.log('[Symbols] REELS_STOP during scatter bonus - not triggering new spin');
        return;
      }
    });

    // Listen for reset
    this.scene.events.on('resetFreeSpinState', () => {
      console.log('[Symbols] resetFreeSpinState received');
      this.freeSpinController.reset();
      this.dialogListenerSetup = false;
    });

    // Create overlay
    this.overlayModule.createOverlayRect(this.grid.getGridBounds());
    this.createSkipHitbox();

    // Initialize / reset persistent bonus multipliers on bonus start & bonus end.
    // Only reset once per bonus session; retriggers should preserve the grid.
    this.scene.events.on('setBonusMode', (isBonus: boolean) => {
      if (isBonus) {
        if (!this.bonusGridInitializedForSession) {
          this.symbolMarker.reset();
          this.bonusGridInitializedForSession = true;
        }
      } else {
        this.symbolMarker.reset();
        this.bonusGridInitializedForSession = false;
      }
    });
  }

  // ============================================================================
  // SPIN EVENT HANDLING
  // ============================================================================

  private setupSpinEventListener(): void {
    gameEventManager.on(GameEventType.SPIN, () => {
      console.log('[Symbols] Spin event detected, ensuring clean state');

      if (gameStateManager.isShowingWinDialog && gameStateManager.isAutoPlaying) {
        console.log('[Symbols] Autoplay SPIN blocked - win dialog showing');
        return;
      }

      if (this.scatterAnimationManager?.isAnimationInProgress()) {
        console.log('[Symbols] WARNING: SPIN during scatter bonus');
        return;
      }

      this.scatterRetriggerAnimationInProgress = false;
      this.ensureCleanSymbolState();
      this.hideWinningOverlay();
      this.resetSymbolDepths();
      this.restoreSymbolVisibility();
    });
  }

  private setupDialogEventListeners(): void {
    // Enable symbols after dialog
    this.scene.events.on('enableSymbols', () => this.handleEnableSymbolsAfterDialog());

    // Scatter bonus activated
    this.scene.events.on('scatterBonusActivated', (data: PendingFreeSpinsData) => {
      this.handleScatterBonusActivated(data);
    });

    // Scatter bonus completed
    this.scene.events.on('scatterBonusCompleted', () => this.handleScatterBonusCompleted());

    // WIN_STOP - handle Symbol0 and scatter retriggers
    // Defer by 150ms so win dialogs, explosions, and BONUS_TOTAL_WIN_SHOWN run first.
    // Flow during bonus: win → explosion → win dialogs → Symbol0/scatter win anims → FreeSpinRetri_BZ → continue
    gameEventManager.on(GameEventType.WIN_STOP, () => {
      if (this.hasPendingSymbol0Retrigger()) {
        this.scene.time.delayedCall(150, () => void this.handleWinStopSymbol0Retrigger());
      } else if (this.hasPendingScatterRetrigger()) {
        this.scene.time.delayedCall(150, () => void this.handleWinStopScatterRetrigger());
      }
    });

    // WIN_DIALOG_CLOSED
    gameEventManager.on(GameEventType.WIN_DIALOG_CLOSED, () => this.handleWinDialogClosed());

  }

  private handleEnableSymbolsAfterDialog(): void {
    const sceneAny = this.scene as any;
    const skipScatterReset = !!sceneAny?.__skipScatterResetOnNextEnableSymbols;
    this.grid.restoreVisibility();
    this.resetSymbolsState();
    if (skipScatterReset) {
      this.resetSymbol0ScalesOnGrid();
      this.startSymbol0ScalePin(1000);
      return;
    }
    if (gameStateManager.isBonus) {
      this.scatterResetHandledForBonusStart = true;
      return;
    }
  }

  private handleScatterBonusActivated(data: PendingFreeSpinsData): void {
    this.freeSpinItemIndex = 0;
    this.freeSpinController.setPendingFreeSpinsData(data);
  }

  private handleScatterBonusCompleted(): void {
    this.restoreSymbolVisibility();
    this.ensureScatterSymbolsVisible();
    let dialogShowing = false;
    try {
      const gameSceneAny: any = this.scene as any;
      const dialogs = gameSceneAny?.dialogs;
      dialogShowing = !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing());
    } catch { /* ignore */ }
    const resetImmediate = dialogShowing || gameStateManager.isShowingWinDialog;
    let resetPromise: Promise<void> = Promise.resolve();
    if (this.scatterResetHandledForBonusStart) {
      this.scatterResetHandledForBonusStart = false;
    } else {
      resetPromise = this.resetScatterSymbolsToGrid(resetImmediate).catch((e) => {
        console.warn('[Symbols] Failed to reset scatter symbol scale after bonus dialog:', e);
      });
    }

    if (this.dialogListenerSetup) {
      return;
    }
    this.dialogListenerSetup = true;

    if (dialogShowing || gameStateManager.isShowingWinDialog) {
      this.scene.events.once('dialogAnimationsComplete', () => this.triggerAutoplayAfterScatterReset(resetPromise));
    } else {
      this.triggerAutoplayAfterScatterReset(resetPromise);
    }
  }

  private triggerAutoplayAfterScatterReset(resetPromise: Promise<void>): void {
    resetPromise.finally(() => {
      this.scene.time.delayedCall(1000, () => {
        this.freeSpinController.triggerAutoplay();
      });
    });
  }

  private async handleWinStopScatterRetrigger(): Promise<void> {
    if (!(gameStateManager.isBonus && this.pendingScatterRetrigger?.scatterGrids)) {
      return;
    }
    const retrigger = this.pendingScatterRetrigger;

    try {
      await this.waitForAnimationsAndTumblesToFinish();
      await this.waitForWinDialogsToFinish();
    } catch { }

    const storedGrids = retrigger.scatterGrids ?? [];
    this.pendingScatterRetrigger = null;
    this.scatterRetriggerAnimationInProgress = true;
    try {
      const liveGrids = this.getLiveScatterGrids();
      const gridsToUse = liveGrids.length > 0 ? liveGrids : storedGrids;
      if (liveGrids.length === 0 && storedGrids.length > 0) {
        console.warn('[Symbols] getLiveScatterGrids() empty on retrigger - using stored scatter positions (grid may have been cleared early)');
      }
      await this.playScatterRetriggerSequence(gridsToUse);
      // Clearing/resetting scatter symbols after retrigger is disabled for now
      gameEventManager.emit(GameEventType.SCATTER_RETRIGGER_ANIMATION_COMPLETE);
    } catch (e) {
      console.warn('[Symbols] Retrigger sequence failed:', e);
      gameEventManager.emit(GameEventType.SCATTER_RETRIGGER_ANIMATION_COMPLETE);
    }

    try {
      (this.scene as any).__skipScatterResetOnNextEnableSymbols = true;
      this.applyRetriggerDialogAndCount('Scatter');
    } catch (e) {
      console.warn('[Symbols] Failed to show retrigger dialog:', e);
      this.scatterRetriggerAnimationInProgress = false;
    }

    this.scene.events.once('dialogAnimationsComplete', () => {
      this.scatterRetriggerAnimationInProgress = false;
      // Always play Symbol0 win animation if retrigger occurs
      if (this.pendingSymbol0Retrigger) {
        void this.handleWinStopSymbol0Retrigger();
      } else {
        this.resumeAutoplayAfterRetriggerDialog();
        this.freeSpinController.waitForAllDialogsToCloseThenResume();
      }
      this.scene.time.delayedCall(0, () => {
        (this.scene as any).__skipScatterResetOnNextEnableSymbols = false;
      });
    });
  }

  private async handleWinStopSymbol0Retrigger(): Promise<void> {
    if (!(gameStateManager.isBonus && this.pendingSymbol0Retrigger?.symbol0Grids)) {
      return;
    }
    (this.scene as any).__skipScatterResetOnNextEnableSymbols = true;

    const retrigger = this.pendingSymbol0Retrigger;

    try {
      await this.waitForAnimationsAndTumblesToFinish();
      await this.waitForWinDialogsToFinish();
    } catch { }

    this.pendingSymbol0Retrigger = null;
    this.scatterRetriggerAnimationInProgress = true;

    try {
      const symbol0Grids = retrigger.symbol0Grids;
      await this.playSymbol0RetriggerSequence(symbol0Grids);
      // Clearing/resetting Symbol0 symbols after retrigger is disabled for now
      gameEventManager.emit(GameEventType.SYMBOL0_RETRIGGER_ANIMATION_COMPLETE);
    } catch (e) {
      console.warn('[Symbols] Symbol0 retrigger sequence failed:', e);
      gameEventManager.emit(GameEventType.SYMBOL0_RETRIGGER_ANIMATION_COMPLETE);
    }

    try {
      this.applyRetriggerDialogAndCount('Symbol0');
    } catch (e) {
      console.warn('[Symbols] Failed to show Symbol0 retrigger dialog:', e);
      this.scatterRetriggerAnimationInProgress = false;
    }

    this.scene.events.once('dialogAnimationsComplete', () => {
      this.scatterRetriggerAnimationInProgress = false;
      this.resumeAutoplayAfterRetriggerDialog();
      this.freeSpinController.waitForAllDialogsToCloseThenResume();
      this.scene.time.delayedCall(0, () => {
        (this.scene as any).__skipScatterResetOnNextEnableSymbols = false;
      });
    });
  }

  private resumeAutoplayAfterRetriggerDialog(): void {
    try {
      gameStateManager.isAutoPlaying = true;
      gameStateManager.isAutoPlaySpinRequested = true;
      if (this.scene?.gameData) this.scene.gameData.isAutoPlaying = true;
    } catch { }
  }

  private isSymbol0(symbol: any): boolean {
    if (!symbol || symbol.destroyed) return false;
    const val = symbol?.symbolValue;
    return val === 0 || symbol?.texture?.key === 'symbol_0';
  }

  private applySymbol0Scale(symbol: any, targetX: number, targetY: number): void {
    try {
      if (typeof symbol?.setScale === 'function') {
        symbol.setScale(targetX, targetY);
      } else {
        symbol.scaleX = targetX;
        symbol.scaleY = targetY;
      }
    } catch { /* ignore */ }
  }

  /** Restore Symbol0 scales from __symbol0ScaleBeforeWin (captured before retrigger win anim). */
  private resetSymbol0ScalesOnGrid(): void {
    const fallbackScale = this.getSpineSymbolScale(0);
    this.grid.forEachSymbol((symbol) => {
      if (!this.isSymbol0(symbol)) return;
      const s = symbol as any;
      const stored = s.__symbol0ScaleBeforeWin as { scaleX: number; scaleY: number } | undefined;
      const scaleX = stored?.scaleX ?? Number(s.scaleX);
      const scaleY = stored?.scaleY ?? Number(s.scaleY);
      const targetX = isFinite(scaleX) && scaleX > 0 ? scaleX : fallbackScale;
      const targetY = isFinite(scaleY) && scaleY > 0 ? scaleY : fallbackScale;
      try {
        this.scene.tweens.killTweensOf(symbol);
        if (s.__overlayImage) this.scene.tweens.killTweensOf(s.__overlayImage);
      } catch { /* ignore */ }
      try {
        if (typeof s.skeleton?.setToSetupPose === 'function') s.skeleton.setToSetupPose();
      } catch { /* ignore */ }
      this.applySymbol0Scale(symbol, targetX, targetY);
    });
  }

  /** Re-apply Symbol0 scales every frame for durationMs to override Spine/tweens that change scale after dialog close. */
  private startSymbol0ScalePin(durationMs: number): void {
    const endTime = this.scene.time.now + durationMs;
    const listener = () => {
      if (this.scene.time.now >= endTime) {
        this.scene.events.off('postupdate', listener);
        return;
      }
      this.grid.forEachSymbol((symbol) => {
        if (!this.isSymbol0(symbol)) return;
        const stored = (symbol as any).__symbol0ScaleBeforeWin as { scaleX: number; scaleY: number } | undefined;
        if (!stored) return;
        this.applySymbol0Scale(symbol, stored.scaleX, stored.scaleY);
      });
    };
    this.scene.events.on('postupdate', listener);
  }

  private async playSymbol0RetriggerSequence(symbol0Grids: GridPosition[]): Promise<void> {
    if (!symbol0Grids.length) return;

    const winAnimName = 'Symbol0_PC_win';
    const idleAnimName = 'Symbol0_PC_idle';

    const animationPromises = symbol0Grids.map((grid) => {
      return new Promise<void>((resolve) => {
        try {
          let symbol: any = this.grid.getSymbol(grid.x, grid.y);

          if (!symbol || (symbol as any).destroyed) {
            console.warn(`[Symbols] Symbol0 at (${grid.x}, ${grid.y}) not found or destroyed`);
            resolve();
            return;
          }

          // Capture scale before win animation so we can restore it after dialog closes
          const scaleX = Number((symbol as any).scaleX);
          const scaleY = Number((symbol as any).scaleY);
          const capturedScale = (isFinite(scaleX) && scaleX > 0 && isFinite(scaleY) && scaleY > 0)
            ? { scaleX, scaleY }
            : null;

          // Ensure Symbol0 is a Spine symbol so it can play win/idle animations.
          let animState = (symbol as any).animationState;
          if (!animState?.setAnimation) {
            try {
              const spineKey = `symbol_${SCATTER_SYMBOL_ID}_sugar_spine`;
              const spineAtlasKey = `${spineKey}-atlas`;
              if (typeof (this.scene.add as any).spine === 'function') {
                const x = symbol.x;
                const y = symbol.y;
                const prevScaleX = Number((symbol as any).scaleX);
                const prevScaleY = Number((symbol as any).scaleY);
                try { symbol.destroy?.(); } catch { }
                const spineSymbol = (this.scene.add as any).spine(x, y, spineKey, spineAtlasKey);
                if (spineSymbol) {
                  spineSymbol.setOrigin?.(0.5, 0.5);
                  try { (spineSymbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch { }
                  // Preserve the previous symbol's scale to avoid a visible scale-pop during retrigger.
                  // Only fit as a fallback when previous scale is unavailable.
                  try {
                    if (isFinite(prevScaleX) && prevScaleX > 0 && isFinite(prevScaleY) && prevScaleY > 0) {
                      spineSymbol.setScale?.(prevScaleX, prevScaleY);
                    } else {
                      this.animationsModule.fitSpineToSymbolBox(spineSymbol);
                    }
                  } catch {
                    try { this.animationsModule.fitSpineToSymbolBox(spineSymbol); } catch { }
                  }
                  if (capturedScale) (spineSymbol as any).__symbol0ScaleBeforeWin = capturedScale;
                  symbol = spineSymbol;
                  this.grid.setSymbol(grid.x, grid.y, symbol);
                  try { this.container.add(spineSymbol); } catch { }
                  animState = (symbol as any).animationState;
                }
              }
            } catch { }
          } else if (capturedScale) {
            (symbol as any).__symbol0ScaleBeforeWin = capturedScale;
          }

          if (!animState?.setAnimation) {
            console.warn(`[Symbols] Symbol0 at (${grid.x}, ${grid.y}) has no animation state`);
            resolve();
            return;
          }

          let finished = false;
          let listenerRef: any = null;
          let timeoutId: Phaser.Time.TimerEvent | null = null;

          const cleanup = () => {
            if (finished) return;
            finished = true;

            // Remove listener
            try {
              if (animState.removeListener && listenerRef) {
                animState.removeListener(listenerRef);
              }
            } catch { }

            // Clear timeout
            try {
              if (timeoutId) {
                timeoutId.destroy();
                timeoutId = null;
              }
            } catch { }

            // Set to idle
            try {
              if (animState.setAnimation && !symbol.destroyed) {
                animState.setAnimation(0, idleAnimName, true);
              }
            } catch { }

            resolve();
          };

          // Add completion listener
          try {
            if (animState.addListener) {
              listenerRef = {
                complete: (entry: any) => {
                  try {
                    if (!entry || entry.animation?.name !== winAnimName) return;
                  } catch { }
                  cleanup();
                }
              };
              animState.addListener(listenerRef);
            }
          } catch (e) {
            console.warn(`[Symbols] Failed to add listener for Symbol0 at (${grid.x}, ${grid.y}):`, e);
          }

          // Play win animation
          try {
            animState.setAnimation(0, winAnimName, false);
          } catch (e) {
            console.warn(`[Symbols] Failed to play win animation for Symbol0 at (${grid.x}, ${grid.y}):`, e);
            cleanup();
            return;
          }

          // Safety timeout (2s - shorter for faster recovery)
          timeoutId = this.scene.time.delayedCall(2000, () => {
            console.warn(`[Symbols] Symbol0 animation timeout at (${grid.x}, ${grid.y})`);
            cleanup();
          });
        } catch (e) {
          console.warn(`[Symbols] Error in Symbol0 animation at (${grid.x}, ${grid.y}):`, e);
          resolve();
        }
      });
    });

    await Promise.all(animationPromises);
  }

  private getLiveSymbol0Grids(): GridPosition[] {
    const positions: GridPosition[] = [];
    if (!this.symbols || !Array.isArray(this.symbols)) return positions;

    for (let col = 0; col < this.symbols.length; col++) {
      if (!Array.isArray(this.symbols[col])) continue;
      for (let row = 0; row < this.symbols[col].length; row++) {
        const symbol = this.symbols[col][row];
        if (!symbol || (symbol as any).destroyed) continue;
        const symbolValue = (symbol as any)?.symbolValue;
        if (symbolValue === 0) {
          positions.push({ x: col, y: row });
        }
      }
    }
    return positions;
  }

  private applyRetriggerDialogAndCount(logLabel: string): void {
    const retriggerInfo = this.freeSpinController?.getRetriggerIncrementFromSpinData?.(this.currentSpinData) ?? {
      added: 0,
      spinsLeft: 0
    };
    const spinsLeftFromSpinData = Math.max(0, retriggerInfo.spinsLeft);
    const retriggerSpins = Math.max(0, retriggerInfo.added);
    this.freeSpinController?.setSpinsRemaining?.(spinsLeftFromSpinData);
    try {
      this.scene?.events?.emit('fakeDataRetriggerComputed', {
        nextSpinsLeft: spinsLeftFromSpinData,
        added: retriggerSpins
      });
    } catch { }
    this.scatterAnimationManager?.showRetriggerFreeSpinsDialog(retriggerSpins);
  }

  private countSymbol0InArea(area: number[][]): number {
    let count = 0;
    if (!Array.isArray(area)) return count;

    for (let col = 0; col < area.length; col++) {
      if (!Array.isArray(area[col])) continue;
      for (let row = 0; row < area[col].length; row++) {
        if (area[col][row] === 0) {
          count++;
        }
      }
    }
    return count;
  }

  private handleWinDialogClosed(): void {
    console.log('[Symbols] WIN_DIALOG_CLOSED');
    gameStateManager.isShowingWinDialog = false;

    if (gameStateManager.isBonusFinished) {
      this.showCongratsDialogAfterDelay();
      gameStateManager.isBonusFinished = false;
    }
  }

  // ============================================================================
  // PUBLIC METHODS (Backward Compatibility API)
  // ============================================================================

  public setPendingScatterRetrigger(scatterGrids: GridPosition[]): void {
    this.pendingScatterRetrigger = { scatterGrids };
    try {
      if (gameStateManager.isBonusFinished) {
        console.log('[Symbols] Retrigger scheduled - clearing isBonusFinished flag');
      }
      gameStateManager.isBonusFinished = false;
    } catch { /* ignore */ }
  }

  public hasPendingScatterRetrigger(): boolean {
    return !!(this.pendingScatterRetrigger?.scatterGrids?.length);
  }

  public isScatterRetriggerAnimationInProgress(): boolean {
    return this.scatterRetriggerAnimationInProgress;
  }

  public setPendingSymbol0Retrigger(symbol0Grids: GridPosition[]): void {
    this.pendingSymbol0Retrigger = { symbol0Grids };
  }

  public hasPendingSymbol0Retrigger(): boolean {
    return !!(this.pendingSymbol0Retrigger?.symbol0Grids?.length);
  }

  public isSymbol0RetriggerAnimationInProgress(): boolean {
    return this.scatterRetriggerAnimationInProgress && !!this.pendingSymbol0Retrigger;
  }

  public setFreeSpinAutoplaySpinsRemaining(spinsRemaining: number): void {
    this.freeSpinController.setSpinsRemaining(spinsRemaining);
  }

  public get freeSpinAutoplaySpinsRemaining(): number {
    return this.freeSpinController?.getSpinsRemaining() ?? 0;
  }

  public getSpineSymbolScale(symbolValue: number): number {
    return this.animationsModule.getSpineSymbolScale(symbolValue);
  }

  public restoreSymbolVisibility(): void {
    this.grid.restoreVisibility();
  }

  public stopAllSpineAnimations(): void {
    this.animationsModule.stopAllSpineAnimations(this.symbols);
  }

  public stopAllSymbolAnimations(): void {
    this.animationsModule.stopAllSymbolAnimations(this.symbols, this.container);
  }

  public ensureScatterSymbolsVisible(): void {
    const scatters = this.grid.findScatterSymbols();
    for (const pos of scatters) {
      const symbol = this.grid.getSymbol(pos.x, pos.y);
      if (symbol?.setVisible) {
        symbol.setVisible(true);
      }
    }
    console.log(`[Symbols] Made ${scatters.length} scatter symbols visible`);
  }

  public requestSkipReelDrops(): void {
    if (this.skipReelDropsActive || this.skipReelDropsPending) {
      return;
    }
    this.skipReelDropsPending = true;
    this.skipReelDropsActive = true;
    this.accelerateActiveSymbolTweens(2.5);
  }

  public requestSkipTumbles(): void {
    if (this.skipTumblesActive) {
      return;
    }
    this.skipTumblesActive = true;
    this.accelerateActiveSymbolTweens(2.5);
  }

  public clearSkipReelDrops(): void {
    this.skipReelDropsActive = false;
    this.skipReelDropsPending = false;
  }

  public clearSkipTumbles(): void {
    this.skipTumblesActive = false;
  }

  public isSkipReelDropsActive(): boolean {
    return !!this.skipReelDropsActive;
  }

  public async forceScatterResetImmediate(): Promise<void> {
    try {
      this.restoreSymbolVisibility();
      this.forceAllSymbolsVisible();
      await this.resetScatterSymbolsToGrid(true);
    } catch (e) {
      console.warn('[Symbols] Failed to force immediate scatter reset:', e);
    }
  }

  public forceAllSymbolsVisible(): void {
    this.grid.forceAllVisible();
  }

  public resetSymbolsState(): void {
    this.grid.forEachSymbol((symbol) => {
      if (symbol && symbol.active !== false) {
        if (typeof (symbol as any).clearTint === 'function') {
          (symbol as any).clearTint();
        }
        if (typeof (symbol as any).setBlendMode === 'function') {
          (symbol as any).setBlendMode(Phaser.BlendModes.NORMAL);
        }
        if (typeof symbol.setAlpha === 'function') {
          symbol.setAlpha(1);
        }
      }
    });
  }

  public resumeIdleAnimationsForAllSymbols(): void {
    this.animationsModule.resumeIdleAnimationsForAllSymbols(this.symbols);
  }

  public hasCurrentWins(): boolean {
    return this.overlayModule.isOverlayVisible();
  }

  public showWinningOverlay(): void {
    this.overlayModule.showOverlay();
  }

  public hideWinningOverlay(): void {
    this.overlayModule.hideOverlay();
    // Clear any win border graphics from the scene
    for (const g of this.winBorderGraphics) {
      try {
        if (g && g.destroy) g.destroy();
      } catch { /* ignore */ }
    }
    this.winBorderGraphics = [];
  }

  public moveWinningSymbolsToFront(data: SpinMockData): void {
    if (!data.wins?.allMatching?.size) return;

    for (const grids of data.wins.allMatching.values()) {
      for (const grid of grids) {
        const symbol = this.grid.getSymbol(grid.x, grid.y);
        if (symbol && !symbol.destroyed) {
          this.overlayModule.moveSymbolToFront(symbol, this.container);
        }
      }
    }
  }

  public resetSymbolDepths(): void {
    this.grid.resetSymbolDepths();
  }

  public moveScatterSymbolsToFront(data: SpinMockData, scatterGrids: GridPosition[]): void {
    for (const grid of scatterGrids) {
      const symbol = this.grid.getSymbol(grid.x, grid.y);
      if (symbol) {
        this.overlayModule.moveSymbolToFront(symbol, this.container);
      }
    }
  }

  public startScatterAnimationSequence(mockData: any): void {
    console.log('[Symbols] Starting scatter animation sequence');
    // Cache total win from the trigger spin data so TotalW_BZ uses the buy-feature freeSpin data
    if (this.cachedTotalWin <= 0) {
      this.cachedTotalWin = this.calculateTotalWinFromSpinData();
      console.log(`[Symbols] Cached total win before freespin dialog: ${this.cachedTotalWin}`);
    }
    this.hideWinningOverlay();
    const scatterRevealDelay = gameStateManager.isBuyFeatureSpin ? 0 : 300;
    this.scatterAnimationManager?.setConfig({ scatterRevealDelay });
    this.scatterAnimationManager?.playScatterAnimation(mockData);
  }

  public hideAllSymbols(): void {
    this.grid.hideAll();
  }

  public hideScatterSymbols(scatterGrids: GridPosition[]): void {
    for (const grid of scatterGrids) {
      const symbol = this.grid.getSymbol(grid.x, grid.y);
      if (symbol?.setVisible) {
        symbol.setVisible(false);
      }
    }
  }

  public setTurboMode(isEnabled: boolean): void {
    console.log(`[Symbols] Turbo mode ${isEnabled ? 'enabled' : 'disabled'}`);
  }

  public ensureSymbolsVisibleAfterAutoplayStop(): void {
    this.grid.forceAllVisible();
    this.hideWinningOverlay();
  }

  public isFreeSpinAutoplayActive(): boolean {
    return this.freeSpinController.isActive;
  }

  public async processSpinData(spinData: any): Promise<void> {
    console.log('[Symbols] Processing spin data');

    if (!spinData?.slot?.area) {
      console.error('[Symbols] Invalid SpinData');
      return;
    }

    // Always use grid size from GameConfig so the grid never changes to 6x5 or other sizes
    spinData.slot.area = normalizeAreaToGameConfig(spinData.slot.area);
    const items = spinData?.slot?.freeSpin?.items ?? spinData?.slot?.freespin?.items;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && Array.isArray(item.area)) {
          item.area = normalizeAreaToGameConfig(item.area);
        }
      }
    }

    this.currentSpinData = spinData;
    this.hadWinsInCurrentItem = false;

    // Clear previous state
    this.scatterAnimationManager?.clearScatterSymbols();
    this.ensureCleanSymbolState();
    this.resetSymbolsState();
    this.hideWinningOverlay();

    // Only reset depths if we have symbols
    if (this.symbols && this.symbols.length > 0 && this.symbols[0] && this.symbols[0].length > 0) {
      this.resetSymbolDepths();
    }

    this.restoreSymbolVisibility();

    // Process symbols (now always 7x7 from GameConfig)
    const symbols = spinData.slot.area;
    await this.processSpinDataSymbols(symbols, spinData);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createInitialSymbols(): void {
    const initialData = INITIAL_SYMBOLS;
    this.grid.setSymbolData(initialData as number[][]);

    const symbolTotalWidth = this.displayWidth + this.horizontalSpacing;
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const startX = this.slotX - this.totalGridWidth * 0.5;
    const startY = this.slotY - this.totalGridHeight * 0.5;

    const rowCount = initialData.length;
    const colCount = initialData[0].length;

    const symbolsArray: SymbolObject[][] = [];

    for (let col = 0; col < colCount; col++) {
      const rows: SymbolObject[] = [];
      for (let row = 0; row < rowCount; row++) {
        // Center the symbols by adding half width/height
        const x = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
        const y = startY + row * symbolTotalHeight + symbolTotalHeight * 0.5;
        const value = initialData[row][col];
        const created = this.factory.createSugarOrPngSymbol(value, x, y, 1);
        rows.push(created);
      }
      symbolsArray.push(rows);
    }

    // Set the whole array at once
    this.symbols = symbolsArray;

    console.log('[Symbols] Initial symbols created');
  }

  private ensureCleanSymbolState(): void {
    this.grid.forEachSymbol((symbol) => {
      try {
        const winBorder = (symbol as any).__winBorder;
        if (winBorder && winBorder.destroy && !winBorder.destroyed) {
          winBorder.destroy();
          (symbol as any).__winBorder = null;
        }
      } catch { /* ignore */ }
      if ((symbol as any).animationState) {
        try {
          const pausedInfo = (symbol as any).__pausedMultiplierWin;
          if (pausedInfo) {
            const animState = (symbol as any).animationState;
            if (animState.clearTracks) animState.clearTracks();
            const base = pausedInfo?.base;
            if (base && animState.setAnimation) {
              animState.setAnimation(0, `${base}_Idle`, true);
            }
            delete (symbol as any).__pausedMultiplierWin;
          } else if ((symbol as any).animationState.clearTracks) {
            (symbol as any).animationState.clearTracks();
          }
        } catch { /* ignore */ }
      }
    });
  }

  private getLiveScatterGrids(): GridPosition[] {
    return this.grid.findScatterSymbols();
  }

  private isScatterSymbol(symbol: SymbolObject): boolean {
    return (symbol as any)?.symbolValue === SCATTER_SYMBOL_ID || symbol.texture?.key === 'symbol_0';
  }

  private getScatterBaseScaleData(symbol: SymbolObject, scatterFallbackScale: number): {
    baseScaleX: number;
    baseScaleY: number;
    hasBaseScale: boolean;
    shouldClampBaseScale: boolean;
  } {
    const baseScaleX = Number((symbol as any).__scatterBaseScaleX);
    const baseScaleY = Number((symbol as any).__scatterBaseScaleY);
    const hasBaseScale = isFinite(baseScaleX) && isFinite(baseScaleY) && baseScaleX > 0 && baseScaleY > 0;
    const shouldClampBaseScale = isFinite(scatterFallbackScale)
      && scatterFallbackScale > 0
      && hasBaseScale
      && baseScaleX > scatterFallbackScale * 1.6;
    return {
      baseScaleX,
      baseScaleY,
      hasBaseScale,
      shouldClampBaseScale
    };
  }

  private resetScatterIdleAnimation(symbol: SymbolObject): void {
    const animState = (symbol as any)?.animationState;
    if (!animState || typeof animState.setAnimation !== 'function') return;
    try {
      const idleName = `Symbol${SCATTER_SYMBOL_ID}_BZ_idle`;
      const entry = animState.setAnimation(0, idleName, true);
      if (entry && typeof (entry as any).timeScale === 'number') {
        (entry as any).timeScale = 1;
      }
      if (typeof animState.timeScale === 'number') {
        animState.timeScale = 1;
      }
    } catch { }
  }

  private getScatterResetTargetScale(
    symbol: SymbolObject,
    immediate: boolean,
    scatterFallbackScale: number,
    baseScaleX: number,
    baseScaleY: number,
    hasBaseScale: boolean,
    shouldClampBaseScale: boolean
  ): { scaleX: number; scaleY: number } {
    let targetScaleX = 1;
    let targetScaleY = 1;
    const animState = (symbol as any)?.animationState;
    if (animState && typeof animState.setAnimation === 'function') {
      this.resetScatterIdleAnimation(symbol);
      if (immediate) {
        try {
          this.animationsModule.fitSpineToSymbolBox(symbol);
        } catch { }
        const fittedX = Number((symbol as any)?.scaleX);
        const fittedY = Number((symbol as any)?.scaleY);
        targetScaleX = isFinite(fittedX) && fittedX > 0 ? fittedX : scatterFallbackScale;
        targetScaleY = isFinite(fittedY) && fittedY > 0 ? fittedY : scatterFallbackScale;
      } else {
        targetScaleX = (!hasBaseScale || shouldClampBaseScale) ? scatterFallbackScale : baseScaleX;
        targetScaleY = (!hasBaseScale || shouldClampBaseScale) ? scatterFallbackScale : baseScaleY;
      }
      return { scaleX: targetScaleX, scaleY: targetScaleY };
    }

    try {
      const baseWidth = (symbol as any).width || this.displayWidth;
      const fallbackScale = baseWidth > 0 ? (this.displayWidth / baseWidth) : 1;
      if (immediate) {
        targetScaleX = fallbackScale;
        targetScaleY = fallbackScale;
      } else {
        targetScaleX = (!hasBaseScale || shouldClampBaseScale) ? fallbackScale : baseScaleX;
        targetScaleY = (!hasBaseScale || shouldClampBaseScale) ? fallbackScale : baseScaleY;
      }
    } catch { }

    return { scaleX: targetScaleX, scaleY: targetScaleY };
  }

  private applyImmediateScatterReset(
    symbol: SymbolObject,
    targetPos: { x: number; y: number },
    targetScaleX: number,
    targetScaleY: number
  ): void {
    try {
      if (typeof (symbol as any).setAlpha === 'function') {
        (symbol as any).setAlpha(1);
      } else if (typeof (symbol as any).alpha === 'number') {
        (symbol as any).alpha = 1;
      }
    } catch { }
    try {
      if (typeof (symbol as any).setScale === 'function') {
        (symbol as any).setScale(targetScaleX, targetScaleY);
      } else {
        (symbol as any).scaleX = targetScaleX;
        (symbol as any).scaleY = targetScaleY;
      }
    } catch { }
    try {
      (symbol as any).x = targetPos.x;
      (symbol as any).y = targetPos.y;
    } catch { }
    try {
      (symbol as any).__scatterBaseScaleX = targetScaleX;
      (symbol as any).__scatterBaseScaleY = targetScaleY;
    } catch { }
  }

  private queueScatterResetTween(
    symbol: SymbolObject,
    targetPos: { x: number; y: number },
    targetScaleX: number,
    targetScaleY: number,
    shrinkDuration: number,
    moveDuration: number,
    tweenPromises: Array<Promise<void>>
  ): void {
    tweenPromises.push(new Promise<void>((resolve) => {
      try {
        if (typeof (symbol as any)?.setAlpha === 'function') {
          (symbol as any).setAlpha(0);
        } else if (typeof (symbol as any)?.alpha === 'number') {
          (symbol as any).alpha = 0;
        }
      } catch { }
      this.scene.tweens.add({
        targets: symbol,
        scaleX: targetScaleX,
        scaleY: targetScaleY,
        x: targetPos.x,
        y: targetPos.y,
        duration: Math.max(shrinkDuration, moveDuration),
        ease: 'Sine.easeInOut',
        onComplete: () => resolve()
      });

      try {
        this.scene.tweens.add({
          targets: symbol,
          alpha: 1,
          duration: Math.max(shrinkDuration, moveDuration),
          ease: 'Sine.easeInOut'
        });
      } catch { }
    }));
  }

  private async resetScatterSymbolsToGrid(immediate: boolean = false): Promise<void> {
    const sceneAny = this.scene as any;
    if (!!sceneAny?.__skipScatterResetOnNextEnableSymbols) {
      sceneAny.__skipScatterResetOnNextEnableSymbols = false;
      return;
    }
    // During bonus free spins, skip scatter reset so no scale tween runs on Symbol0s
    if (gameStateManager.isBonus) {
      return;
    }
    if (!immediate && this.scatterResetInProgress) {
      return;
    }
    if (!immediate) {
      this.scatterResetInProgress = true;
    }
    const tweenPromises: Promise<void>[] = [];
    const shrinkDuration = SCATTER_SHRINK_DURATION_MS;
    const moveDuration = SCATTER_MOVE_DURATION_MS;
    const scatterFallbackScale = this.getSpineSymbolScale(SCATTER_SYMBOL_ID);

    this.grid.forEachSymbol((symbol, col, row) => {
      if (!this.isScatterSymbol(symbol)) return;

      this.scene.tweens.killTweensOf(symbol);

      try {
        this.overlayModule.resetSymbolDepth(symbol, this.container);
      } catch { }

      const targetPos = this.grid.calculateCellPosition(col, row);
      const { baseScaleX, baseScaleY, hasBaseScale, shouldClampBaseScale } =
        this.getScatterBaseScaleData(symbol, scatterFallbackScale);
      const { scaleX: targetScaleX, scaleY: targetScaleY } = this.getScatterResetTargetScale(
        symbol,
        immediate,
        scatterFallbackScale,
        baseScaleX,
        baseScaleY,
        hasBaseScale,
        shouldClampBaseScale
      );

      if (immediate) {
        this.applyImmediateScatterReset(symbol, targetPos, targetScaleX, targetScaleY);
        return;
      }

      this.queueScatterResetTween(
        symbol,
        targetPos,
        targetScaleX,
        targetScaleY,
        shrinkDuration,
        moveDuration,
        tweenPromises
      );
    });

    await Promise.all(tweenPromises);
    if (!immediate) {
      this.scatterResetInProgress = false;
    }
  }

  private async playScatterRetriggerSequence(scatterGrids: GridPosition[]): Promise<void> {
    if (!scatterGrids.length) return;

    const disableScaling = gameStateManager.isBonus || gameStateManager.isBuyFeatureSpin;

    const spineKey = `symbol_${SCATTER_SYMBOL_ID}_sugar_spine`;
    const spineAtlasKey = `${spineKey}-atlas`;
    const winAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_win`;
    const idleAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_idle`;

    const tweenPromises = scatterGrids.map((grid) => {
      return new Promise<void>((resolve) => {
        let symbol = this.grid.getSymbol(grid.x, grid.y);
        if (!symbol) {
          resolve();
          return;
        }

        // Ensure scatter uses a Spine symbol so the win animation plays.
        const hasSpine = !!((symbol as any).animationState);
        if (!hasSpine) {
          try {
            const x = (symbol as any).x;
            const y = (symbol as any).y;
            try { (symbol as any).destroy?.(); } catch { }
            if (typeof (this.scene.add as any).spine === 'function') {
              const spineSymbol = (this.scene.add as any).spine(x, y, spineKey, spineAtlasKey);
              if (spineSymbol) {
                spineSymbol.setOrigin?.(0.5, 0.5);
                try { (spineSymbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch { }
                this.animationsModule.fitSpineToSymbolBox(spineSymbol);
                this.grid.setSymbol(grid.x, grid.y, spineSymbol);
                try { this.container.add(spineSymbol); } catch { }
                symbol = spineSymbol;
              }
            }
          } catch (e) {
            console.warn('[Symbols] Failed to replace retrigger scatter with Spine:', e);
          }
        } else {
          try { (symbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch { }
        }

        const scaleX = (symbol as any)?.scaleX ?? 1;
        const scaleY = (symbol as any)?.scaleY ?? 1;

          const playWinAnimation = () => {
            const animState = (symbol as any).animationState;
            if (!animState?.setAnimation) {
              resolve();
              return;
            }

            let resolved = false;
            const finish = () => {
              if (resolved) return;
              resolved = true;
              try { animState.setAnimation(0, idleAnimName, true); } catch { /* ignore */ }
              resolve();
            };

            let listener: any = null;
            try {
              listener = {
                complete: (entry: any) => {
                  try {
                    if (entry?.animation?.name !== winAnimName) return;
                  } catch { /* ignore */ }
                  try { animState.removeListener?.(listener); } catch { /* ignore */ }
                  finish();
                }
              };
              animState.addListener?.(listener);
            } catch { /* ignore */ }

            let entry: any = null;
            try {
              entry = animState.setAnimation(0, winAnimName, false);
            } catch {
              finish();
              return;
            }

            // Fallback in case listener doesn't fire.
            try {
              const durationSec = entry?.animation?.duration;
              const durationMs = typeof durationSec === 'number' && isFinite(durationSec)
                ? Math.max(0, Math.round(durationSec * 1000))
                : 2500;
              this.scene.time.delayedCall(durationMs + 100, () => finish());
            } catch {
              this.scene.time.delayedCall(2600, () => finish());
            }
          };

        if (disableScaling) {
          playWinAnimation();
          return;
        }

        this.animationsModule.createScaleTween(
          symbol,
          scaleX * SCATTER_RETRIGGER_SCALE,
          scaleY * SCATTER_RETRIGGER_SCALE,
          300
        ).then(() => {
          playWinAnimation();
        });
      });
    });

    await Promise.all(tweenPromises);
    console.log('[Symbols] Retrigger animation completed');
  }

  /**
   * Total win from current spin data (delegates to Spin).
   */
  private calculateTotalWinFromSpinData(): number {
    try {
      const slot = this.currentSpinData?.slot;
      const totalWin = getTotalWinFromSlot(slot);
      if (totalWin > 0 && typeof (this.currentSpinData?.slot as any)?.totalWin === 'number') {
        console.log(`[Symbols] Using spinData.slot.totalWin: ${totalWin}`);
      }
      return totalWin;
    } catch (e) {
      console.warn('[Symbols] Failed to calculate total win from spinData', e);
      return 0;
    }
  }

  private async showCongratsDialogAfterDelay(): Promise<void> {
    console.log('[Symbols] Showing congrats dialog');

    if (this.hasPendingScatterRetrigger() || this.scatterRetriggerAnimationInProgress) {
      console.log('[Symbols] Retrigger pending/in progress - skipping total win dialog');
      try { gameStateManager.isBonusFinished = false; } catch { }
      return;
    }

    await this.waitForAnimationsAndTumblesToFinish();

    const gameScene = this.scene as any;
    // If a win dialog is active, let it finish before showing total win.
    try {
      const dialogs = gameScene?.dialogs;
      const dialogShowing = dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing();
      const winDialogShowing = dialogShowing && typeof dialogs.isWinDialog === 'function' && dialogs.isWinDialog();
      if (gameStateManager.isShowingWinDialog || winDialogShowing) {
        console.log('[Symbols] Win dialog active - deferring total win dialog until it closes');
        await new Promise<void>((resolve) => {
          this.scene.events.once('dialogAnimationsComplete', () => resolve());
        });
      }
    } catch { }
    if (gameScene.dialogs?.hideDialog && gameScene.dialogs.isDialogShowing()) {
      gameScene.dialogs.hideDialog();
    }

    let totalWin = 0;
    try {
      const bonusHeader = gameScene?.bonusHeader;
      if (bonusHeader?.getCumulativeBonusWin) {
        totalWin = Number(bonusHeader.getCumulativeBonusWin()) || 0;
      }
      if (totalWin === 0 && this.currentSpinData?.slot) {
        totalWin = getTotalWinFromFreespinOnly(this.currentSpinData.slot);
      }
    } catch { /* ignore */ }

    // Get free spin count
    let freeSpinCount = 0;
    try {
      const freespinData = this.currentSpinData?.slot?.freespin || this.currentSpinData?.slot?.freeSpin;
      if (freespinData?.count) {
        freeSpinCount = freespinData.count;
      } else if (freespinData?.items) {
        freeSpinCount = freespinData.items.length;
      }
    } catch { /* ignore */ }

    // Show dialog
    if (gameScene.dialogs?.showTotalWin) {
      gameScene.dialogs.showTotalWin(this.scene, {
        winAmount: totalWin
      });
      console.log(`[Symbols] Total win dialog shown: win=${totalWin}, spins=${freeSpinCount}`);
    } else if (gameScene.dialogs?.showCongrats) {
      gameScene.dialogs.showCongrats(this.scene, {
        winAmount: totalWin,
        freeSpins: freeSpinCount,
      });
      console.log(`[Symbols] Congrats shown: win=${totalWin}, spins=${freeSpinCount}`);
    }
  }

  private getCurrentFreeSpinItem(spinData: any): any | null {
    try {
      const fs = spinData?.slot?.freespin || spinData?.slot?.freeSpin;
      const items = Array.isArray(fs?.items) ? fs.items : [];
      if (!items.length) return null;

      // Prefer matching area when available (most reliable)
      const slotArea = spinData?.slot?.area;
      if (Array.isArray(slotArea)) {
        const areaJson = JSON.stringify(slotArea);
        const match = items.find((item: any) =>
          Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
        );
        if (match) return match;
      }

      // Fake-data mode: use sequential index to avoid returning the wrong item when
      // multiple items share the same spinsLeft value (happens after retriggers).
      try {
        const isFake = !!((this.scene as any)?.slotController?.gameAPI?.isFakeDataEnabled?.());
        if (isFake && this.freeSpinItemIndex < items.length) {
          const item = items[this.freeSpinItemIndex];
          console.log(`[Symbols] Fake data: using item index ${this.freeSpinItemIndex} (spinsLeft: ${item?.spinsLeft})`);
          this.freeSpinItemIndex++;
          return item;
        }
      } catch { }      // Prefer matching by remaining spins when available (current spin = remaining + 1)
      try {
        const rem = this.freeSpinAutoplaySpinsRemaining;
        if (typeof rem === 'number' && rem > 0) {
          const targetB = items.find((item: any) => Number(item?.spinsLeft) === rem + 1);
          if (targetB) return targetB;
          const targetA = items.find((item: any) => Number(item?.spinsLeft) === rem);
          if (targetA) return targetA;
        }
      } catch { }

      // Fallbacks: single item or highest spinsLeft (earliest spin)
      if (items.length === 1) return items[0];
      const withSpinsLeft = items
        .filter((item: any) => typeof item?.spinsLeft === 'number' && item.spinsLeft > 0)
        .sort((a: any, b: any) => b.spinsLeft - a.spinsLeft);
      if (withSpinsLeft.length) return withSpinsLeft[0];

      return items[0];
    } catch {
      return null;
    }
  }

  private async processSpinDataSymbols(symbols: number[][], spinData: any): Promise<void> {
    const freeSpinItem = gameStateManager.isBonus ? this.getCurrentFreeSpinItem(spinData) : null;
    const symbolsToUse = (gameStateManager.isBonus && Array.isArray(freeSpinItem?.area))
      ? freeSpinItem.area
      : symbols;

    // Start each spin with a fresh snapshot set for cluster verification at WIN_STOP.
    this.clearClusterWinGridSnapshots();

    console.log('[Symbols] Processing SpinData symbols:', symbolsToUse);

    // Reset per-item win tracker
    try { this.hadWinsInCurrentItem = false; } catch { }

    // Clear all scatter symbols from previous spin
    if (this.scatterAnimationManager) {
      this.scatterAnimationManager.clearScatterSymbols();
    }

    // Reset symbols and clear previous state before starting new spin
    console.log('[Symbols] Resetting symbols and clearing previous state for new spin');
    this.ensureCleanSymbolState();
    this.resetSymbolsState();

    // Always clear win lines and overlay when a new spin starts
    console.log('[Symbols] Clearing win lines and overlay for new spin');
    this.hideWinningOverlay();

    this.resetSymbolDepths();
    this.restoreSymbolVisibility();

    const slotTumbles = spinData?.slot?.tumbles;
    const bonusTumbles = freeSpinItem?.tumbles;
    const pendingTumbles = (Array.isArray(slotTumbles) && slotTumbles.length > 0)
      ? slotTumbles
      : (Array.isArray(bonusTumbles) ? bonusTumbles : []);

    // Mock data for existing functions (replaces tmp_backend Data)
    const baseDelay = DELAY_BETWEEN_SPINS;
    const adjustedDelay = gameStateManager.isTurbo ?
      baseDelay * TurboConfig.TURBO_SPEED_MULTIPLIER : baseDelay;
    const mockData: SpinMockData = {
      symbols: symbolsToUse,
      balance: 0,
      bet: parseFloat(spinData.bet),
      freeSpins: (
        (spinData?.slot?.freeSpin?.items && Array.isArray(spinData.slot.freeSpin.items))
          ? spinData.slot.freeSpin.items.length
          : (spinData?.slot?.freespin?.count || 0)
      ),
      delayBetweenSpins: adjustedDelay,
    };

    console.log('[Symbols] Setting animation timing:', {
      baseDelay,
      isTurbo: gameStateManager.isTurbo,
      adjustedDelay
    });
    setSpeed(this.scene.gameData, adjustedDelay);

    gameStateManager.isReelSpinning = true;

    // Create and drop new symbols
    this.createNewSymbols(mockData);
    await this.dropReels(mockData);

    // Update symbols after animation
    this.disposeSymbols(this.symbols);
    this.symbols = this.newSymbols;
    this.newSymbols = [];

    // Capture the settled grid after reel drop and before any tumble removals.
    this.captureClusterWinGridSnapshot('postSpinDrop');

    gameStateManager.isReelSpinning = false;

    console.log('[Symbols] SpinData symbols processed successfully - checking for wins and scatter');

    // Apply tumbles if provided by backend
    try {
      if (Array.isArray(pendingTumbles) && pendingTumbles.length > 0) {
        const source = (pendingTumbles === bonusTumbles) ? 'FreeSpin item' : 'SpinData';
        console.log(`[Symbols] Applying ${pendingTumbles.length} tumble step(s) from ${source}`);
        await this.applyTumbles(pendingTumbles);
        console.log('[Symbols] Tumbles applied successfully');
      }
    } catch (e) {
      console.warn('[Symbols] Failed processing tumbles:', e);
    }

    // Check for scatter symbols
    console.log('[Symbols] Checking for scatter symbols...');
    const gridForScatter = this.currentSymbolData ?? symbolsToUse;
    const scatterGrids = getScatterGrids(gridForScatter, SCATTER_SYMBOL_ID);
    console.log('[Symbols] ScatterGrids found:', scatterGrids.length);

    const scatterCount = scatterGrids.length;
    const isRetrigger = gameStateManager.isBonus && scatterCount >= MIN_SCATTER_FOR_RETRIGGER;
    const isTrigger = !gameStateManager.isBonus && scatterCount >= MIN_SCATTER_FOR_BONUS;
    if (isRetrigger || isTrigger) {
      gameStateManager.isScatter = true;

      if (isRetrigger) {
        this.setPendingScatterRetrigger(scatterGrids);
      } else {
        await this.animateScatterSymbols(mockData, scatterGrids);
        this.startScatterAnimationSequence(mockData);
      }
    }

    // Check for Symbol0 retrigger (3+ Symbol0s) using spin data as source of truth.
    // Use the current free spin item's area from spin data to decide; use live grid for positions to animate.
    if (gameStateManager.isBonus) {
      try {
        const areaFromSpinData = (freeSpinItem && Array.isArray(freeSpinItem.area)) ? freeSpinItem.area : null;
        const symbol0CountFromArea = areaFromSpinData ? this.countSymbol0InArea(areaFromSpinData) : 0;
        const symbol0Grids = this.getLiveSymbol0Grids();
        const symbol0CountLive = symbol0Grids.length;
        // Trigger when spin data area has 3+ Symbol0s (what the backend says) and we have at least one to animate.
        const shouldRetrigger = symbol0CountFromArea >= 3 && symbol0Grids.length > 0;
        if (shouldRetrigger) {
          this.setPendingSymbol0Retrigger(symbol0Grids);
          if (this.pendingScatterRetrigger) this.pendingScatterRetrigger = null;
        }
      } catch (e) {
        console.warn('[Symbols] Failed to check for Symbol0 retrigger:', e);
      }
    }

    gameEventManager.emit(GameEventType.REELS_STOP);
    gameEventManager.emit(GameEventType.WIN_STOP);
  }

  public async animateScatterSymbols(data: SpinMockData, scatterGrids: GridPosition[]): Promise<void> {
    if (!scatterGrids.length) {
      console.log('[Symbols] No scatter symbols to animate');
      return;
    }

    console.log(`[Symbols] Animating ${scatterGrids.length} scatter symbols`);
    const disableScaling = gameStateManager.isBonus || gameStateManager.isBuyFeatureSpin;

    let scatterWinNomnomPlayed = false;
    const scatterSymbols: SymbolObject[] = [];
    const spineKey = `symbol_${SCATTER_SYMBOL_ID}_sugar_spine`;
    const spineAtlasKey = `${spineKey}-atlas`;
    const idleAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_idle`;
    const dropAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_drop`;
    const winAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_win`;

    const animationPromises = scatterGrids.map((grid) => {
      return new Promise<void>((resolve) => {
        const col = grid.x;
        const row = grid.y;
        let symbol = this.grid.getSymbol(col, row);
        if (!symbol) {
          resolve();
          return;
        }

        let scatterSymbol: any = symbol;
        const hasSpine = !!(scatterSymbol as any).animationState;

        if (!hasSpine) {
          try {
            const x = scatterSymbol.x;
            const y = scatterSymbol.y;
            try { scatterSymbol.destroy?.(); } catch { }
            if (typeof (this.scene.add as any).spine === 'function') {
              const spineSymbol = (this.scene.add as any).spine(x, y, spineKey, spineAtlasKey);
              if (spineSymbol) {
                spineSymbol.setOrigin?.(0.5, 0.5);
                try { (spineSymbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch { }
                this.animationsModule.fitSpineToSymbolBox(spineSymbol);
                scatterSymbol = spineSymbol;
                this.grid.setSymbol(col, row, scatterSymbol);
                try { this.container.add(spineSymbol); } catch { }
              }
            }
          } catch (e) {
            console.warn('[Symbols] Failed to replace scatter with Spine:', e);
          }
        } else {
          try { (scatterSymbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch { }
        }

        try {
          if ((scatterSymbol as any).parentContainer === this.container) {
            this.overlayModule.moveSymbolToFront(scatterSymbol, this.container);
          } else {
            scatterSymbol.setDepth?.(DEPTH_WINNING_SYMBOL);
          }
        } catch { }

        if (this.scatterAnimationManager) {
          this.scatterAnimationManager.registerScatterSymbol(scatterSymbol);
        }

        const animState = (scatterSymbol as any).animationState;
        if (animState && typeof animState.setAnimation === 'function') {
          try { if (typeof animState.clearTracks === 'function') animState.clearTracks(); } catch { }
          try { animState.setAnimation(0, idleAnimName, true); } catch { }
        }

        scatterSymbols.push(scatterSymbol);

        const scaleX = (scatterSymbol as any)?.scaleX ?? 1;
        const scaleY = (scatterSymbol as any)?.scaleY ?? 1;
        try {
          (scatterSymbol as any).__scatterBaseScaleX = scaleX;
          (scatterSymbol as any).__scatterBaseScaleY = scaleY;
        } catch { }

        if (disableScaling) {
          try {
            if (typeof scatterSymbol.setScale === 'function') {
              scatterSymbol.setScale(scaleX, scaleY);
            } else {
              scatterSymbol.scaleX = scaleX;
              scatterSymbol.scaleY = scaleY;
            }
          } catch { }
          this.scene.time.delayedCall(500, () => resolve());
        } else {
          this.scene.tweens.add({
            targets: scatterSymbol,
            scaleX: scaleX * SCATTER_ANIMATION_SCALE,
            scaleY: scaleY * SCATTER_ANIMATION_SCALE,
            duration: 500,
            ease: 'Power2.easeOut',
            onComplete: () => resolve()
          });
        }
      });
    });

    await Promise.all(animationPromises);

    if (!scatterSymbols.length) {
      return;
    }

    await this.delay(500);

    const winPromises: Promise<void>[] = scatterSymbols.map((symbol: any) => {
      return new Promise<void>((resolve) => {
        try {
          const state = (symbol as any).animationState;
          if (state && typeof state.setAnimation === 'function') {
            let finished = false;
            let listenerRef: any = null;
            try {
              if (typeof state.addListener === 'function') {
                listenerRef = {
                  complete: (entry: any) => {
                    try {
                      if (!entry || entry.animation?.name !== winAnimName) return;
                    } catch { }
                    if (finished) return;
                    finished = true;
                    try { state.setAnimation(0, idleAnimName, true); } catch { }
                    try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch { }
                    resolve();
                  }
                };
                state.addListener(listenerRef);
              }
            } catch { }

            const entry = state.setAnimation(0, winAnimName, false);
            if (entry && typeof (entry as any).timeScale === 'number') {
              const base = (entry as any).timeScale > 0 ? (entry as any).timeScale : 1;
              (entry as any).timeScale = base * 1.3;
            }

            if (!scatterWinNomnomPlayed) {
              scatterWinNomnomPlayed = true;
              try {
                const audio = (window as any)?.audioManager;
                if (audio && typeof audio.playSoundEffect === 'function') {
                  const globalScale = (typeof (gameStateManager as any)?.timeScale === 'number'
                    ? (gameStateManager as any).timeScale || 1
                    : 1);
                  const clampedScale = Math.max(0.5, Math.min(1.25, globalScale));
                  audio.playSoundEffect(SoundEffectType.SCATTER_NOMNOM, clampedScale);
                }
              } catch { }
            }

            this.scene.time.delayedCall(2500, () => {
              if (finished) return;
              finished = true;
              try { state.setAnimation(0, idleAnimName, true); } catch { }
              try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch { }
              resolve();
            });
            return;
          }
        } catch { }
        resolve();
      });
    });

    await Promise.all(winPromises);

    const centerX = this.slotX;
    const centerY = this.slotY;
    const gatherDuration = SCATTER_GATHER_DURATION_MS;

    if (gameStateManager.isBuyFeatureSpin && !this.mergeLeadSymbol) {
      const mergeLeadOffsetMs = 300; // Single Symbol0 appears before merge completes.
      const leadDelay = Math.max(0, gatherDuration - mergeLeadOffsetMs);
      this.scene.time.delayedCall(leadDelay, () => {
        if (!this.scene || this.mergeLeadSymbol) return;
        try {
          // Use createSugarOrPngSymbol to ensure we get a Spine symbol if available
          const lead = this.factory.createSugarOrPngSymbol(SCATTER_SYMBOL_ID, centerX, centerY, 1);
          // Ensure the lead symbol sits above container-managed scatters.
          try {
            if ((lead as any).parentContainer) {
              (lead as any).parentContainer.remove(lead);
              this.scene.children.add(lead);
            }
          } catch { }
          lead.setDepth?.(DEPTH_WINNING_SYMBOL + 500);
          try {
            if (typeof (lead as any).setScale === 'function') {
              (lead as any).setScale(Symbols.MERGE_SYMBOL0_SPINE_SCALE);
            } else {
              (lead as any).scaleX = Symbols.MERGE_SYMBOL0_SPINE_SCALE;
              (lead as any).scaleY = Symbols.MERGE_SYMBOL0_SPINE_SCALE;
            }
          } catch {}
          try {
            if (typeof (lead as any).setAlpha === 'function') {
              (lead as any).setAlpha(0);
            } else if (typeof (lead as any).alpha === 'number') {
              (lead as any).alpha = 0;
            }
          } catch { }
          this.mergeLeadSymbol = lead;
          const mergeLeadEaseMs = 120; // Ease-in duration for the Single Symbol0 lead.
          this.scene.tweens.add({
            targets: lead,
            alpha: 1,
            scaleX: Symbols.MERGE_SYMBOL0_SPINE_SCALE,
            scaleY: Symbols.MERGE_SYMBOL0_SPINE_SCALE,
            duration: mergeLeadEaseMs,
            ease: 'Sine.easeOut',
            onComplete: () => {
              // Play win animation for the single Symbol0 (merge symbol)
              try {
                const animState = (lead as any).animationState;
                if (animState && typeof animState.setAnimation === 'function') {
                  // Slow down animation by half
                  if (animState.timeScale !== undefined) {
                    animState.timeScale = 0.5;
                  }
                  animState.setAnimation(0, 'Symbol0_PC_win', false);
                  // Double the delay since animation is half speed
                  this.scene.time.delayedCall(4000, () => {
                    try { 
                      // Restore normal speed for idle
                      if (animState.timeScale !== undefined) {
                        animState.timeScale = 1.0;
                      }
                      animState.setAnimation(0, 'Symbol0_PC_idle', true); 
                    } catch { }
                  });
                }
              } catch { }
            }
          });
        } catch { }
      });
    }

    const gatherPromises = scatterSymbols.map((symbol: any) => {
      return new Promise<void>((resolve) => {
        let dropCompleted = false;
        let moveCompleted = false;
        let scaleCompleted = false;

        const maybeResolve = () => {
          if (dropCompleted && moveCompleted && scaleCompleted) {
            resolve();
          }
        };

        try {
          const state = (symbol as any)?.animationState;
          const hasDrop = !!(symbol as any)?.skeleton?.data?.findAnimation?.(dropAnimName);
          if (state && hasDrop && typeof state.setAnimation === 'function') {
            let listenerRef: any = null;
            const finishDrop = () => {
              try { state.setAnimation(0, idleAnimName, true); } catch { }
              dropCompleted = true;
              maybeResolve();
            };
            if (state.addListener) {
              listenerRef = {
                complete: (entry: any) => {
                  try {
                    if (!entry || entry.animation?.name !== dropAnimName) return;
                  } catch { }
                  try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch { }
                  finishDrop();
                }
              };
              state.addListener(listenerRef);
            }
            state.setAnimation(0, dropAnimName, false);
            if (!listenerRef) {
              this.scene.time.delayedCall(600, finishDrop);
            }
          } else {
            dropCompleted = true;
          }
        } catch {
          dropCompleted = true;
        }

        try {
          symbol.setDepth?.(DEPTH_WINNING_SYMBOL - 10);
        } catch { }

        const scaleX = (symbol as any)?.scaleX ?? 1;
        const scaleY = (symbol as any)?.scaleY ?? 1;
        if (disableScaling) {
          this.scene.tweens.add({
            targets: symbol,
            x: centerX,
            y: centerY,
            duration: gatherDuration,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              moveCompleted = true;
              scaleCompleted = true;
              maybeResolve();
            }
          });
        } else {
          this.scene.tweens.add({
            targets: symbol,
            x: centerX,
            y: centerY,
            scaleX: scaleX * SCATTER_GATHER_SCALE,
            scaleY: scaleY * SCATTER_GATHER_SCALE,
            duration: gatherDuration,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              moveCompleted = true;
              scaleCompleted = true;
              maybeResolve();
            }
          });
        }
      });
    });

    await Promise.all(gatherPromises);

    await this.buyFeatureTransition(scatterSymbols, winAnimName, idleAnimName);
  }

  private async playTransitionBzWin(scatterSymbols: SymbolObject[]): Promise<void> {
    if (!scatterSymbols.length) {
      return;
    }

    scatterSymbols.forEach((symbol) => {
      if (symbol?.setVisible) {
        symbol.setVisible(false);
      }
    });

    try {
      await this.playTransitionBzWinAnimation();
    } finally {
      this.mergedScatterSymbols = scatterSymbols.slice();

      if (this.transitionBzOverlay) {
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.hideTransitionBzOverlay(400);
        });
      }
    }
  }

  private async playBuyFeatureScatterMerge(
    scatterSymbols: SymbolObject[],
    winAnimName: string,
    idleAnimName: string
  ): Promise<void> {
    const isScatterSymbol = (symbol: SymbolObject | null): boolean => {
      return !!symbol && (symbol as any)?.symbolValue === SCATTER_SYMBOL_ID;
    };

    const targets = scatterSymbols.filter(isScatterSymbol);
    if (!targets.length) {
      return;
    }

    targets.forEach((symbol) => {
      try {
        symbol.setVisible?.(false);
      } catch { }
      try {
        if (typeof (symbol as any).setAlpha === 'function') {
          (symbol as any).setAlpha(0);
        } else if (typeof (symbol as any).alpha === 'number') {
          (symbol as any).alpha = 0;
        }
      } catch { }
    });

    let mergedSymbol: SymbolObject | null = this.mergeLeadSymbol;
    if (!mergedSymbol) {
      try {
        // Use createSugarOrPngSymbol to ensure we get a Spine symbol if available
        mergedSymbol = this.factory.createSugarOrPngSymbol(SCATTER_SYMBOL_ID, this.slotX, this.slotY, 1);
      } catch { }
    }

    const mergeTargetScale = Symbols.MERGE_SYMBOL0_SCALE;
    if (mergedSymbol) {
      try {
        if ((mergedSymbol as any).parentContainer) {
          (mergedSymbol as any).parentContainer.remove(mergedSymbol);
          this.scene.children.add(mergedSymbol);
        }
      } catch { }
      try {
        mergedSymbol.setDepth?.(DEPTH_WINNING_SYMBOL + 500);
      } catch { }
      if (mergedSymbol !== this.mergeLeadSymbol) {
        try {
          if (typeof (mergedSymbol as any).setScale === 'function') {
            (mergedSymbol as any).setScale(Symbols.MERGE_SYMBOL0_SPINE_SCALE);
          } else {
            (mergedSymbol as any).scaleX = Symbols.MERGE_SYMBOL0_SPINE_SCALE;
            (mergedSymbol as any).scaleY = Symbols.MERGE_SYMBOL0_SPINE_SCALE;
          }
        } catch {}
        try {
          if (typeof (mergedSymbol as any).setAlpha === 'function') {
            (mergedSymbol as any).setAlpha(0);
          } else if (typeof (mergedSymbol as any).alpha === 'number') {
            (mergedSymbol as any).alpha = 0;
          }
        } catch { }
      }
    }

    const winDurationMs = 2000;
    const explosionLeadMs = 500;
    const endBeforeExplosionMs = 500;
    const idleDelayMs = Math.max(0, winDurationMs - explosionLeadMs - endBeforeExplosionMs);
    const explosionDurationMs = 1400;
    const hideAfterExplosionMs = 500;
    const explosionStartMs = winDurationMs - explosionLeadMs;
    let explosionDone: Promise<void> | null = null;
    let hideAfterExplosion = false;
    let hideAfterExplosionDelay: Promise<void> | null = null;

    if (mergedSymbol && mergedSymbol !== this.mergeLeadSymbol) {
      await new Promise<void>((resolve) => {
        if (!this.scene) {
          resolve();
          return;
        }
        this.scene.tweens.add({
          targets: mergedSymbol,
          alpha: 1,
          scaleX: Symbols.MERGE_SYMBOL0_SPINE_SCALE,
          scaleY: Symbols.MERGE_SYMBOL0_SPINE_SCALE,
          duration: 260,
          ease: 'Back.Out',
          onComplete: () => {
            // Play win animation for the single Symbol0 (merge symbol)
            try {
              const animState = (mergedSymbol as any).animationState;
              if (animState && typeof animState.setAnimation === 'function') {
                // Slow down animation by half
                if (animState.timeScale !== undefined) {
                  animState.timeScale = 0.5;
                }
                animState.setAnimation(0, 'Symbol0_PC_win', false);
                // Double the delay since animation is half speed
                const doubledIdleDelayMs = idleDelayMs * 2;
                this.scene.time.delayedCall(doubledIdleDelayMs, () => {
                  try { 
                    // Restore normal speed for idle
                    if (animState.timeScale !== undefined) {
                      animState.timeScale = 1.0;
                    }
                    animState.setAnimation(0, 'Symbol0_PC_idle', true); 
                  } catch { }
                });
                // Double explosion timing since animation is half speed
                const doubledExplosionStartMs = explosionStartMs * 2;
                this.scene.time.delayedCall(doubledExplosionStartMs, () => {
                  this.playExplosionVfx(this.slotX, this.slotY, true);
                });
                explosionDone = this.delay(doubledExplosionStartMs + explosionDurationMs);
                hideAfterExplosionDelay = this.delay(doubledExplosionStartMs + hideAfterExplosionMs);
                hideAfterExplosion = true;
              }
            } catch { }
            resolve();
          }
        });
      });
    } else if (mergedSymbol && mergedSymbol === this.mergeLeadSymbol) {
      // Win animation already played when mergeLeadSymbol was first created
      // Just set up explosion timing
      try {
        this.scene.time.delayedCall(explosionStartMs, () => {
          this.playExplosionVfx(this.slotX, this.slotY, true);
        });
        explosionDone = this.delay(explosionStartMs + explosionDurationMs);
        hideAfterExplosionDelay = this.delay(explosionStartMs + hideAfterExplosionMs);
        hideAfterExplosion = true;
      } catch { }
    }

    if (hideAfterExplosionDelay) {
      await hideAfterExplosionDelay;
      if (hideAfterExplosion && mergedSymbol) {
        try { mergedSymbol.setVisible?.(false); } catch { }
        try {
          if (typeof (mergedSymbol as any).setAlpha === 'function') {
            (mergedSymbol as any).setAlpha(0);
          } else if (typeof (mergedSymbol as any).alpha === 'number') {
            (mergedSymbol as any).alpha = 0;
          }
        } catch { }
      }
    }
    if (explosionDone) {
      await explosionDone;
    }
    const singleHoldBeforeFadeMs = hideAfterExplosion ? 0 : 0; // Hold time before the Single Symbol0 fades out.
    await this.delay(singleHoldBeforeFadeMs);

    if (!hideAfterExplosion) {
      const fadeOutStartDelayMs = 200; // Delay before Symbol0 starts fading after explosion begins.
      const singleFadeOutMs = 420; // Fade-out duration for the Single Symbol0.
      // Ease out into the transition.
      const fadeOutPromise = new Promise<void>((resolve) => {
        if (!mergedSymbol || !this.scene) {
          resolve();
          return;
        }
        this.scene.tweens.add({
          targets: mergedSymbol,
          alpha: 0,
          scaleX: mergeTargetScale * 1.02,
          scaleY: mergeTargetScale * 1.02,
          duration: singleFadeOutMs,
          delay: fadeOutStartDelayMs,
          ease: 'Sine.InOut',
          onComplete: () => resolve()
        });
      });
      await fadeOutPromise;
    }

    if (mergedSymbol) {
      try {
        mergedSymbol.setVisible?.(false);
      } catch { }
      try {
        if (typeof (mergedSymbol as any).setAlpha === 'function') {
          (mergedSymbol as any).setAlpha(0);
        } else if (typeof (mergedSymbol as any).alpha === 'number') {
          (mergedSymbol as any).alpha = 0;
        }
      } catch { }
    }

    await this.delay(100);

    try {
      mergedSymbol?.destroy?.();
    } catch { }
    if (mergedSymbol === this.mergeLeadSymbol) {
      this.mergeLeadSymbol = null;
    }
  }

  public async buyFeatureTransition(
    scatterSymbols: SymbolObject[],
    winAnimName: string,
    idleAnimName: string
  ): Promise<void> {
    this.isBuyFeatureTransitionComplete = false;
    // Hide win tracker + win bar text before merge/transition begins
    try {
      const gameScene: any = this.scene as any;
      gameScene?.winTracker?.hideWithFade?.(150);
      gameScene?.header?.hideWinningsDisplay?.();
      gameScene?.bonusHeader?.hideWinningsDisplay?.();
    } catch {}
    await this.playBuyFeatureScatterMerge(scatterSymbols, winAnimName, idleAnimName);
    await this.waitForTransitionBzWinComplete();
    if (this.radialLightPromise) {
      try {
        await this.radialLightPromise;
      } catch { }
      this.radialLightPromise = null;
    }
    this.isBuyFeatureTransitionComplete = true;
    try {
      this.scene.events.emit('buyFeatureTransitionsComplete');
    } catch { }
  }

  private async playTransitionBzWinAnimation(_options: { holdOverlay?: boolean } = {}): Promise<void> {
    this.startTransitionBzTracking();
    this.finishTransitionBzTracking();
  }

  private hideTransitionBzOverlay(delayMs: number = 0): void {
    if (!this.transitionBzOverlay) {
      return;
    }
    const transition = this.transitionBzOverlay;
    const mergedSymbols = this.mergedScatterSymbols;
    const fadeDuration = 600;
    const ensureTransitionVisible = () => {
      try { transition.setVisible?.(true); } catch { }
      try { transition.setAlpha?.(1); } catch { }
      try { (transition as any).alpha = 1; } catch { }
      try {
        const color = transition?.skeleton?.color;
        if (color && typeof color.a === 'number') {
          color.a = 1;
        }
      } catch { }
    };
    const showMergedSymbols = () => {
      if (!mergedSymbols?.length) return;
      mergedSymbols.forEach((symbol) => {
        if (symbol?.setVisible) {
          symbol.setVisible(true);
        }
        if (typeof symbol?.setAlpha === 'function') {
          symbol.setAlpha(0);
        } else if (typeof (symbol as any)?.alpha === 'number') {
          (symbol as any).alpha = 0;
        }
      });
    };

    const complete = () => {
      try { transition.destroy?.(); } catch { }
      if (this.transitionBzOverlay === transition) {
        this.transitionBzOverlay = null;
      }
      if (mergedSymbols?.length) {
        this.scene.tweens.add({
          targets: mergedSymbols,
          alpha: 1,
          duration: fadeDuration,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.mergedScatterSymbols = null;
            this.overlayModule.hideOverlay();
          }
        });
      } else {
        this.mergedScatterSymbols = null;
        this.overlayModule.hideOverlay();
      }
    };

    const finish = () => {
      if (!transition?.active) {
        complete();
        return;
      }
      this.overlayModule.showOverlay();
      ensureTransitionVisible();
      const revealDelay = Math.max(0, fadeDuration - 100);
      const resetDelay = Math.max(0, fadeDuration - 200);
      const fadeState = { alpha: 1 };
      this.scene.tweens.add({
        targets: fadeState,
        alpha: 0,
        duration: fadeDuration,
        ease: 'Sine.easeInOut',
        onStart: () => {
          if (resetDelay > 0) {
            this.scene.time.delayedCall(resetDelay, () => {
              this.resetScatterSymbolsToGrid();
            });
          } else {
            this.resetScatterSymbolsToGrid();
          }
          if (revealDelay > 0) {
            this.scene.time.delayedCall(revealDelay, () => showMergedSymbols());
          } else {
            showMergedSymbols();
          }
        },
        onUpdate: () => {
          const value = Math.max(0, Math.min(1, Number(fadeState.alpha) || 0));
          try { transition.setAlpha?.(value); } catch { }
          try { (transition as any).alpha = value; } catch { }
          try {
            const color = transition?.skeleton?.color;
            if (color && typeof color.a === 'number') {
              color.a = value;
            }
          } catch { }
        },
        onComplete: () => complete()
      });
    };

    if (delayMs > 0) {
      this.scene.time.delayedCall(delayMs, finish);
    } else {
      finish();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene.time.delayedCall(ms, resolve);
    });
  }

  private getSymbolValueFromObject(obj: any): number | null {
    if (!obj) return null;
    const raw = Number((obj as any)?.symbolValue);
    if (!isNaN(raw)) return raw;
    try {
      const key = obj?.texture?.key;
      if (typeof key === 'string') {
        const match = key.match(/symbol_(\d+)/);
        if (match) {
          const parsed = Number(match[1]);
          if (!isNaN(parsed)) return parsed;
        }
      }
    } catch { }
    return null;
  }

  /**
   * Build a cluster-check snapshot from the live symbol objects.
   * Snapshot format is column-major: snapshot[col][row].
   */
  private buildClusterWinGridSnapshotFromSymbols(): number[][] | null {
    try {
      if (!this.symbols || !this.symbols.length || !this.symbols[0]?.length) return null;
      const numCols = this.symbols.length;
      const numRows = this.symbols[0].length;
      const snapshot: number[][] = Array.from(
        { length: numCols },
        () => Array<number>(numRows).fill(-1)
      );

      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          const obj = this.symbols[col]?.[row];
          const val = this.getSymbolValueFromObject(obj);
          if (typeof val === 'number' && !isNaN(val)) {
            snapshot[col][row] = val;
          }
        }
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  private captureClusterWinGridSnapshot(reason: string): void {
    const snapshot = this.buildClusterWinGridSnapshotFromSymbols();
    if (!snapshot) return;
    this.clusterWinGridSnapshots.push(snapshot);
    try {
      const cols = snapshot.length;
      const rows = snapshot[0]?.length ?? 0;
      console.log(`[Symbols] Captured cluster grid snapshot (${reason}): ${cols}x${rows}`);
    } catch { }
  }

  private syncCurrentSymbolDataFromSymbols(): void {
    try {
      if (!this.symbols || !this.symbols.length || !this.symbols[0]?.length) return;
      const numCols = this.symbols.length;
      const numRows = this.symbols[0].length;
      const rowMajor: (number | null)[][] = Array.from({ length: numRows }, () => Array<number | null>(numCols).fill(null));
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          const obj = this.symbols[col]?.[row];
          const val = this.getSymbolValueFromObject(obj);
          if (typeof val === 'number' && !isNaN(val)) {
            rowMajor[row][col] = val;
          }
        }
      }
      this.currentSymbolData = rowMajor as any;
    } catch { }
  }

  private updateSkipTweenTimeScale(): void {
    // no-op; keep for compatibility if referenced elsewhere
  }

  private clearOldSymbolsForSkip(): void {
    if (!this.symbols || this.symbols.length === 0) {
      return;
    }
    for (let col = 0; col < this.symbols.length; col++) {
      const column = this.symbols[col];
      if (!column) continue;
      for (let row = 0; row < column.length; row++) {
        const symbol: any = column[row];
        if (!symbol || symbol.destroyed) {
          continue;
        }
        const overlayObj: any = (symbol as any)?.__overlayImage;
        try { this.scene.tweens.killTweensOf(symbol); } catch { }
        try { if (overlayObj) this.scene.tweens.killTweensOf(overlayObj); } catch { }
        try { this.destroySymbolOverlays(symbol); } catch { }
        try { if (!symbol.destroyed) symbol.destroy(); } catch { }
        try { if (overlayObj && !overlayObj.destroyed) overlayObj.destroy(); } catch { }
        column[row] = null as any;
      }
    }
  }

  private delayOrSkip(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const total = Math.max(0, Number(ms) || 0);
      if (total === 0 || this.skipReelDropsActive || this.skipReelDropsPending) {
        resolve();
        return;
      }
      const start = Date.now();
      const tick = () => {
        if (this.skipReelDropsActive || this.skipReelDropsPending) {
          resolve();
          return;
        }
        const elapsed = Date.now() - start;
        if (elapsed >= total) {
          resolve();
          return;
        }
        this.scene.time.delayedCall(16, tick);
      };
      tick();
    });
  }

  private accelerateActiveSymbolTweens(timeScale: number): void {
    const scale = Math.max(1, Number(timeScale) || 1);
    const accel = (obj: any) => {
      try {
        const tweens = this.scene.tweens.getTweensOf(obj) as any[];
        if (Array.isArray(tweens)) {
          for (const t of tweens) {
            try { (t as any).timeScale = scale; } catch { }
          }
        }
      } catch { }
    };
    try {
      if (this.symbols) {
        for (let c = 0; c < this.symbols.length; c++) {
          const col = this.symbols[c];
          if (!Array.isArray(col)) continue;
          for (let r = 0; r < col.length; r++) {
            const obj = col[r];
            if (obj) accel(obj);
          }
        }
      }
    } catch { }
    try {
      if (this.newSymbols) {
        for (let c = 0; c < this.newSymbols.length; c++) {
          const col = this.newSymbols[c];
          if (!Array.isArray(col)) continue;
          for (let r = 0; r < col.length; r++) {
            const obj = col[r];
            if (obj) accel(obj);
          }
        }
      }
    } catch { }
    try {
      const list: any[] = (this.container as any)?.list || [];
      for (const child of list) accel(child);
    } catch { }
  }

  /**
   * Create a zone over the symbol grid for skip input. Only taps on the grid trigger skip;
   * taps on controller buttons (spin, autoplay, bet, etc.) do not.
   */
  private createSkipHitbox(): void {
    try {
      try { this.skipHitbox?.destroy(); } catch {}
      const zone = this.scene.add.zone(
        this.slotX,
        this.slotY,
        this.totalGridWidth,
        this.totalGridHeight
      ).setOrigin(0.5, 0.5);
      zone.setDepth(20);
      zone.disableInteractive();

      zone.on('pointerdown', () => {
        try {
          if (this.tumbleInProgress) return;
          if (gameStateManager.isShowingWinDialog) return;
          if (gameStateManager.isTurbo) return;
          if (gameStateManager.isReelSpinning && this.reelDropInProgress) {
            this.requestSkipReelDrops();
          }
        } catch {}
      });

      this.skipHitbox = zone;

      const enable = () => {
        try { this.updateSkipHitboxGeometry(); } catch {}
        if (gameStateManager.isTurbo || gameStateManager.isShowingWinDialog) {
          try { this.skipHitbox?.disableInteractive(); } catch {}
        } else {
          try { this.skipHitbox?.setInteractive({ useHandCursor: false }); } catch {}
        }
      };
      const disable = () => {
        try { this.skipHitbox?.disableInteractive(); } catch {}
      };

      gameEventManager.on(GameEventType.REELS_START, enable);
      gameEventManager.on(GameEventType.REELS_STOP, disable);
      const onTurboOn = () => { try { this.skipHitbox?.disableInteractive(); } catch {} };
      const onTurboOff = () => { try { if (gameStateManager.isReelSpinning) enable(); } catch {} };
      gameEventManager.on(GameEventType.TURBO_ON, onTurboOn);
      gameEventManager.on(GameEventType.TURBO_OFF, onTurboOff);

      this.scene.events.once('shutdown', () => {
        try { gameEventManager.off(GameEventType.REELS_START, enable); } catch { }
        try { gameEventManager.off(GameEventType.REELS_STOP, disable); } catch { }
        try { gameEventManager.off(GameEventType.TURBO_ON, onTurboOn); } catch { }
        try { gameEventManager.off(GameEventType.TURBO_OFF, onTurboOff); } catch { }
        try { this.skipHitbox?.destroy(); this.skipHitbox = undefined; } catch {}
      });
    } catch {}
  }

  private updateSkipHitboxGeometry(): void {
    try {
      if (!this.skipHitbox) return;
      this.skipHitbox.setPosition(this.slotX, this.slotY);
      try { (this.skipHitbox as any).setSize(this.totalGridWidth, this.totalGridHeight); } catch {}
    } catch {}
  }

  private async expandTransitionToCoverAndFade(
    transition: any,
    scaleDurationMs: number = 1000,
    fadeDurationMs: number = 300
  ): Promise<void> {
    if (!transition || !this.scene) return;
    const rawWidth = Number(transition.width) || 1;
    const rawHeight = Number(transition.height) || 1;
    const coverScale = Math.max(
      this.scene.scale.width / rawWidth,
      this.scene.scale.height / rawHeight
    ) * 3;
    const currentScaleX = Number(transition.scaleX) || 1;
    const currentScaleY = Number(transition.scaleY) || 1;
    const targetScale = Math.max(coverScale, currentScaleX, currentScaleY);
    const runLinear = (durationMs: number, onUpdate: (t: number) => void): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (durationMs <= 0) {
          onUpdate(1);
          resolve();
          return;
        }
        let elapsed = 0;
        const handler = (_time: number, delta: number) => {
          elapsed += delta;
          const t = Math.min(1, elapsed / durationMs);
          onUpdate(t);
          if (t >= 1) {
            this.scene.events.off('update', handler);
            resolve();
          }
        };
        this.scene.events.on('update', handler);
      });
    };

    const startScaleX = currentScaleX;
    const startScaleY = currentScaleY;
    // Start the radial light at the beginning of the fade so symbols never peek through.
    const lightStartMs = Math.max(0, scaleDurationMs);
    this.radialLightPromise = this.delay(lightStartMs).then(async () => {
      try {
        const dialogs: any = (this.scene as any)?.dialogs;
        if (dialogs?.playRadialLightTransition) {
          await dialogs.playRadialLightTransition({
            durationMs: 1200,
            centerX: this.scene.scale.width * 0.5,
            centerY: this.scene.scale.height * 0.5
          });
        }
      } catch (e) {
        console.warn('[Symbols] Radial light transition failed:', e);
      }
    });
    await runLinear(scaleDurationMs, (t) => {
      const nextScaleX = startScaleX + (targetScale - startScaleX) * t;
      const nextScaleY = startScaleY + (targetScale - startScaleY) * t;
      transition.scaleX = nextScaleX;
      transition.scaleY = nextScaleY;
    });

    const startAlpha = (typeof transition.alpha === 'number') ? transition.alpha : 1;
    await runLinear(fadeDurationMs, (t) => {
      const nextAlpha = startAlpha * (1 - t);
      try { transition.setAlpha?.(nextAlpha); } catch { }
      try { (transition as any).alpha = nextAlpha; } catch { }
      try {
        const color = transition?.skeleton?.color;
        if (color && typeof color.a === 'number') {
          color.a = nextAlpha;
        }
      } catch { }
    });
  }

  private startTransitionBzTracking(): void {
    this.transitionBzWinPromise = new Promise<void>((resolve) => {
      this.transitionBzWinResolve = resolve;
    });
  }

  private finishTransitionBzTracking(): void {
    if (this.transitionBzWinResolve) {
      this.transitionBzWinResolve();
    }
    this.transitionBzWinResolve = null;
    this.transitionBzWinPromise = null;
  }

  private async waitForTransitionBzWinComplete(timeoutMs: number = 5000): Promise<void> {
    if (!this.transitionBzWinPromise) {
      return;
    }
    try {
      await Promise.race([
        this.transitionBzWinPromise,
        this.delay(timeoutMs)
      ]);
    } catch { }
  }

  public startPreSpinDrop(): void {
    // Immediately destroy all old symbols when a new spin starts
    // This prevents symbols from lingering on screen if the spin button is pressed quickly
    console.log('[Symbols] startPreSpinDrop: clearing old symbols immediately');
    
    if (!this.symbols || this.symbols.length === 0) {
      return;
    }

    let destroyedCount = 0;
    for (let col = 0; col < this.symbols.length; col++) {
      const column = this.symbols[col];
      if (!Array.isArray(column)) continue;
      
      for (let row = 0; row < column.length; row++) {
        const symbol = column[row];
        if (symbol && !(symbol as any).destroyed) {
          // Kill any active tweens on this symbol
          try {
            this.scene.tweens.killTweensOf(symbol);
          } catch { }
          
          // Destroy the symbol and its overlay if it exists
          try {
            const overlayObj = (symbol as any)?.__overlayImage;
            if (overlayObj && !overlayObj.destroyed) {
              overlayObj.destroy();
            }
            symbol.destroy();
            destroyedCount++;
          } catch { }
        }
      }
    }
    
    console.log(`[Symbols] startPreSpinDrop destroyed ${destroyedCount} old symbols immediately`);
  }

  // Helper methods for symbol processing
  private createNewSymbols(data: SpinMockData): void {
    // Clear old new symbols
    this.disposeSymbols(this.newSymbols);

    const symbolTotalWidth = this.displayWidth + this.horizontalSpacing;
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const adjY = this.scene.scale.height * -1.0;
    const startX = this.slotX - this.totalGridWidth * 0.5;
    const startY = this.slotY - this.totalGridHeight * 0.5 + adjY;

    let symbols = data.symbols;
    console.log('[Symbols] Creating new symbols (column-major):', symbols);

    // Update current symbol data for reset purposes (store as row-major for tumble logic)
    try {
      const colCount = symbols.length;
      const rowCount = colCount > 0 ? symbols[0].length : 0;
      const rowMajor: number[][] = [];
      for (let row = 0; row < rowCount; row++) {
        rowMajor[row] = [];
        for (let col = 0; col < colCount; col++) {
          // Invert vertical order: SpinData area is bottom->top; row 0 is top visually
          rowMajor[row][col] = symbols[col][rowCount - 1 - row];
        }
      }
      this.currentSymbolData = rowMajor;
    } catch {
      this.currentSymbolData = symbols;
    }

    const newSymbolsArray: SymbolObject[][] = [];

    for (let col = 0; col < symbols.length; col++) {
      const column = symbols[col];
      const rows: SymbolObject[] = [];

      for (let row = 0; row < column.length; row++) {
        // Center the symbols by adding half width/height
        const x = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
        const y = startY + row * symbolTotalHeight + symbolTotalHeight * 0.5;

        // Invert vertical order for display
        const value = symbols[col][symbols[col].length - 1 - row];

        const created = this.factory.createSugarOrPngSymbol(value, x, y, 1);
        rows.push(created);
      }

      newSymbolsArray.push(rows);
    }

    // Set the whole array at once
    this.newSymbols = newSymbolsArray;
  }

  private async dropReels(data: SpinMockData): Promise<void> {
    this.reelDropInProgress = true;

    const numCols = this.symbols?.length ?? SLOT_COLUMNS;
    const isTurbo = !!this.scene.gameData?.isTurbo;
    if (this.skipReelDropsPending) {
      this.skipReelDropsPending = false;
      this.skipReelDropsActive = true;
    }
    const isSkip = this.skipReelDropsActive || this.skipReelDropsPending;

    // Drop symbols column by column - each column drops all its rows vertically at the same time
    if (isSkip) {
      const bonusPreDropDelay = gameStateManager.isBonus
        ? (this.scene.gameData.winUpDuration * 2)
        : 0.5;
      const preDelay = bonusPreDropDelay * 0.2;
      const colDelay = this.scene.gameData.dropReelsDelay * 0.2;

      for (let col = 0; col < numCols; col++) {
        const startDelay = col === 0 ? preDelay : colDelay;
        await this.delay(startDelay);
        console.log(`[Symbols] Processing column ${col}/${numCols - 1}`);
        await this.dropOldSymbols(col);
        await this.dropNewSymbols(col, false);
      }

      console.log('[Symbols] All reels completed');
      this.clearSkipReelDrops();
      this.reelDropInProgress = false;
    } else {
      const reelPromises: Promise<void>[] = [];

      for (let col = 0; col < numCols; col++) {
        const bonusPreDropDelay = gameStateManager.isBonus
          ? (this.scene.gameData.winUpDuration * 2)
          : 0.5;

        const colDelayFactor = isTurbo ? 0 : 1;
        const startDelay = bonusPreDropDelay +
          (this.scene.gameData.dropReelsDelay * col * colDelayFactor);

        const p = (async () => {
          await this.delayOrSkip(startDelay);
          await this.dropOldSymbols(col);
          await this.dropNewSymbols(col, false);
        })();
        reelPromises.push(p);
      }

      try {
        await Promise.all(reelPromises);
        this.clearSkipReelDrops();
      } finally {
        this.reelDropInProgress = false;
      }
    }

    // Turbo mode: play turbo drop sound effect
    if (isTurbo && (window as any).audioManager) {
      try {
        (window as any).audioManager.playSoundEffect(SoundEffectType.TURBO_DROP);
      } catch (e) {
        console.warn('[Symbols] Failed to play turbo drop sound effect:', e);
      }
    }
  }

  private async dropOldSymbols(colIndex: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.symbols || this.symbols.length === 0) {
        resolve();
        return;
      }

      const column = this.symbols[colIndex];
      if (!column || column.length === 0) {
        resolve();
        return;
      }

      let completedAnimations = 0;
      const totalAnimations = column.length;
      const isSkip = this.skipReelDropsActive || this.skipReelDropsPending;
      const DROP_DISTANCE = this.totalGridHeight * 2;
      const dropDuration = Math.max(200, (this.scene.gameData?.dropDuration ?? 500) * (isSkip ? 0.3 : 1));

      // During scatter transitions, immediately dispose symbols without animation
      // to avoid conflicts with special transition sequences
      // NOTE: Removed isBuyFeatureSpin check to allow first bonus spin to animate normally
      const shouldSkipAnimation = gameStateManager.isScatter ||
                                   this.scatterRetriggerAnimationInProgress;

      if (shouldSkipAnimation) {
        for (let row = 0; row < column.length; row++) {
          const symbol = column[row];
          if (symbol && !(symbol as any).destroyed) {
            try {
              const baseObj: any = symbol as any;
              const overlayObj: any = baseObj?.__overlayImage;
              // Kill tweens immediately without delay
              try { this.scene.tweens.killTweensOf(baseObj); } catch {}
              try { if (overlayObj) this.scene.tweens.killTweensOf(overlayObj); } catch {}
              // Destroy immediately
              try { if (!baseObj.destroyed) baseObj.destroy(); } catch {}
              try { if (overlayObj && !overlayObj.destroyed) overlayObj.destroy(); } catch {}
            } catch (e) {
              // Silently ignore errors during fast cleanup
            }
          }
        }
        // Resolve immediately without any delay
        resolve();
        return;
      }

      for (let row = 0; row < column.length; row++) {
        const symbol = column[row];
        if (!symbol || (symbol as any).destroyed) {
          completedAnimations++;
          if (completedAnimations === totalAnimations) resolve();
          continue;
        }

        const baseObj: any = symbol as any;
        const overlayObj: any = baseObj?.__overlayImage;

        if (typeof baseObj.y !== 'number' || !isFinite(baseObj.y)) {
          console.warn(`[Symbols] Symbol at col ${colIndex}, row ${row} has invalid position, destroying immediately`);
          try {
            this.scene.tweens.killTweensOf(baseObj);
            if (overlayObj) this.scene.tweens.killTweensOf(overlayObj);
            if (!baseObj.destroyed) baseObj.destroy();
            if (overlayObj && !overlayObj.destroyed) overlayObj.destroy();
          } catch { }
          completedAnimations++;
          if (completedAnimations === totalAnimations) {
            resolve();
          }
          continue;
        }

        // CRITICAL: Kill any existing tweens on this symbol before animating
        // This prevents conflicts with retrigger animations or other running tweens
        try {
          this.scene.tweens.killTweensOf(baseObj);
          if (overlayObj) {
            this.scene.tweens.killTweensOf(overlayObj);
          }
        } catch (e) {
          console.warn(`[Symbols] Failed to kill tweens for symbol at col ${colIndex}, row ${row}:`, e);
        }

        const tweenTargets: any = overlayObj ? [baseObj, overlayObj] : baseObj;

        this.scene.tweens.add({
          targets: tweenTargets,
          y: `+= ${DROP_DISTANCE}`,
          duration: dropDuration,
          ease: Phaser.Math.Easing.Linear,
          onComplete: () => {
            try {
              if (!baseObj.destroyed) baseObj.destroy();
              if (overlayObj && !overlayObj.destroyed) overlayObj.destroy();
            } catch { }
            completedAnimations++;
            if (completedAnimations === totalAnimations) resolve();
          }
        });
      }

      // Safety timeout in case some tweens don't complete
      const timeoutDuration = dropDuration * 2;
      this.scene.time.delayedCall(timeoutDuration, () => {
        if (completedAnimations < totalAnimations) {
          console.log(`[Symbols] Cleanup: symbols at col ${colIndex} didn't complete, force-destroying`);
          for (let row = 0; row < column.length; row++) {
            const symbol = column[row];
            if (symbol && !(symbol as any).destroyed) {
              try {
                const baseObj: any = symbol as any;
                const overlayObj: any = baseObj?.__overlayImage;
                this.scene.tweens.killTweensOf(baseObj);
                if (overlayObj) this.scene.tweens.killTweensOf(overlayObj);
                if (!baseObj.destroyed) baseObj.destroy();
                if (overlayObj && !overlayObj.destroyed) overlayObj.destroy();
              } catch (e) {
                console.warn(`[Symbols] Failed to force-destroy symbol at col ${colIndex}, row ${row}:`, e);
              }
            }
          }
          resolve();
        }
      });
    });
  }

  private async dropNewSymbols(colIndex: number, extendDuration: boolean = false): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.newSymbols || this.newSymbols.length === 0) {
        resolve();
        return;
      }

      const column = this.newSymbols[colIndex];
      if (!column || column.length === 0) {
        resolve();
        return;
      }

      let completedAnimations = 0;
      const totalAnimations = column.length;
      const isSkip = this.skipReelDropsActive || this.skipReelDropsPending;
      const dropDuration = Math.max(200, (this.scene.gameData?.dropDuration ?? 500) * (isSkip ? 0.3 : 0.9) * REEL_DROP_DURATION_MULTIPLIER);

      console.log(`[Symbols] dropNewSymbols col ${colIndex}: ${totalAnimations} rows`);

      for (let row = 0; row < column.length; row++) {
        const symbol = column[row];
        const targetY = this.getYPos(row);
        const baseObj: any = symbol as any;
        const overlayObj: any = (baseObj as any)?.__overlayImage;
        const tweenTargets: any = overlayObj ? [baseObj, overlayObj] : baseObj;

        try { this.playDropAnimationIfAvailable(symbol); } catch { }
        if (!this.scene.gameData.isTurbo && (window as any).audioManager) {
          (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
        }
        this.scene.tweens.add({
          targets: tweenTargets,
          y: targetY,
          duration: dropDuration,
          ease: Phaser.Math.Easing.Linear,
          onComplete: () => {
            completedAnimations++;
            if (completedAnimations === totalAnimations) resolve();
          }
        });
      }
    });
  }

  private getYPos(index: number): number {
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const startY = this.slotY - this.totalGridHeight * 0.5;
    return startY + index * symbolTotalHeight + symbolTotalHeight * 0.5;
  }

  private playDropAnimationIfAvailable(obj: any): void {
    if (!obj) return;
    const animState = (obj as any)?.animationState;
    if (!animState?.setAnimation) return;

    try {
      const value = (obj as any)?.symbolValue;
      if (value === undefined || value === null) return;

      const skelData = (obj as any)?.skeleton?.data;
      const baseValue = value;
      const dropAnimName = resolveSymbolAnimationName(skelData, baseValue, 'drop') ?? `Symbol${baseValue}_BZ_drop`;
      const idleAnimName = resolveSymbolAnimationName(skelData, baseValue, 'idle') ?? `Symbol${baseValue}_BZ_idle`;

      animState.setAnimation(0, dropAnimName, false);
      animState.addAnimation(0, idleAnimName, true, 0);
    } catch (e) {
      console.warn('[Symbols] Failed to play drop animation:', e);
    }
  }

  private disposeSymbols(symbols: any[][]): void {
    if (!symbols || symbols.length === 0) return;

    for (let i = 0; i < symbols.length; i++) {
      const column = symbols[i];
      if (!column) continue;

      for (let j = 0; j < column.length; j++) {
        const symbol = column[j];
        if (!symbol) continue;

        try {
          this.scene.tweens.killTweensOf(symbol);
          if (!symbol.destroyed && symbol.destroy) {
            symbol.destroy();
          }
        } catch (e) {
          console.warn('[Symbols] Error disposing symbol:', e);
        }
      }
    }
  }

  /**
   * Sugar Rush-style bonus multiplier resolution for the current tumble:
   * - Use existing sticky cell multipliers on winning sugar cells for the current tumble multiplier.
   * - Then advance those winning sugar cells to their next tier for subsequent tumbles.
   * - First hit is a marker only; active multipliers start at x2 and can grow up to x128.
   * - Final multiplier is additive sum of contributing cell values, with minimum x1.
   */
  private computeAndAdvanceBonusTumbleMultiplier(removeMask: boolean[][]): number {
    if (!gameStateManager.isBonus || !removeMask?.length) {
      return 1;
    }

    const numCols = removeMask.length;
    const numRows = removeMask[0]?.length ?? 0;
    const winningSugarCells: Array<{ col: number; row: number }> = [];
    let contributingSum = 0;

    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        if (!removeMask[col]?.[row]) continue;
        const value = this.currentSymbolData?.[row]?.[col];
        const isSugarSymbol = typeof value === 'number' && value >= 1 && value <= 7;
        if (!isSugarSymbol) continue;

        winningSugarCells.push({ col, row });
        const existing = this.symbolMarker.getCellContribution(col, row);
        if (existing > 0) {
          contributingSum += existing;
        }
      }
    }

    for (const cell of winningSugarCells) {
      this.symbolMarker.markCell(cell.col, cell.row);
    }

    const multiplier = contributingSum > 0 ? contributingSum : 1;
    try {
      console.log('[Symbols] Bonus tumble multiplier', {
        multiplier,
        contributingSum,
        winningSugarCells: winningSugarCells.length
      });
    } catch { }

    return multiplier;
  }

  // Tumble processing methods
  private async applyTumbles(tumbles: any[]): Promise<void> {
    let cumulativeWin = 0;
    let tumbleIndex = 0;
    this.tumbleInProgress = true;
    this.clearSkipTumbles();

    try {
      for (const tumble of tumbles) {
        tumbleIndex++;
        const currentTumbleIndex = tumbleIndex;
        await this.applySingleTumble(tumble, currentTumbleIndex, (tumbleWin: number) => {
        // Track cumulative wins
        try {
          cumulativeWin += tumbleWin;
          if (cumulativeWin > 0) {
            gameEventManager.emit(GameEventType.TUMBLE_WIN_PROGRESS, { cumulativeWin } as any);
          }
        } catch { }

        // Play tumble sound effect
        try {
          const am = (window as any)?.audioManager;
          if (am && typeof am.playSymbolWinByTumble === 'function') {
            am.playSymbolWinByTumble(currentTumbleIndex);
          }
        } catch { }
        });
      }

      try {
        gameEventManager.emit(GameEventType.TUMBLE_SEQUENCE_DONE, { totalWin: cumulativeWin } as any);
      } catch { }
    } finally {
      this.tumbleInProgress = false;
      this.clearSkipTumbles();
    }
  }

  private async applySingleTumble(tumble: any, tumbleIndex: number, onFirstWinComplete?: (tumbleTotal: number) => void): Promise<void> {
    const self = this;
    const disableScaling = gameStateManager.isBonus || gameStateManager.isBuyFeatureSpin;
    const skipTumble = this.skipTumblesActive;
    // Keep currentSymbolData in sync with live grid to avoid removal mismatches
    this.syncCurrentSymbolDataFromSymbols();
    this.captureClusterWinGridSnapshot(`beforeTumble#${tumbleIndex}`);
    const outs = (tumble?.symbols?.out || []) as any[];
    const ins = (tumble?.symbols?.in || []) as number[][]; // per real column (x index)

    // If this tumble removes any symbols, it represents a win event during this item
    let anyRemoval = false;
    try {
      anyRemoval = Array.isArray(outs) && outs.some(o => getOutCount(o) > 0);
      if (anyRemoval) { (self as any).hadWinsInCurrentItem = true; }
    } catch { }

    if (!self.symbols || !self.symbols.length || !self.symbols[0] || !self.symbols[0].length) {
      console.warn('[Symbols] applySingleTumble: Symbols grid not initialized');
      return;
    }
    this.tumbleDropInProgress = true;

    // Grid orientation: self.symbols[col][row]
    const numCols = self.symbols.length;
    const numRows = self.symbols[0].length;

    // Match manual drop timings and staggering for visual consistency
    const MANUAL_STAGGER_MS: number = (self.scene?.gameData?.tumbleStaggerMs ?? 100);

    try {
      const totalOutRequested = getTotalCountFromOuts(outs);
      const totalInProvided = (Array.isArray(ins) ? ins.flat().length : 0);
      console.log('[Symbols] Tumble payload:', {
        outs,
        insColumns: Array.isArray(ins) ? ins.map((col, idx) => ({ col: idx, count: Array.isArray(col) ? col.length : 0 })) : [],
        totals: { totalOutRequested, totalInProvided }
      });
    } catch { }

    // Build a removal mask per cell
    // removeMask[col][row]
    const removeMask: boolean[][] = Array.from({ length: numCols }, () => Array<boolean>(numRows).fill(false));

    const highCountSymbols = getHighCountSymbolsFromOuts(outs);
    const clusterCellKey = (col: number, row: number): string => `${col},${row}`;

    // Validate removals against the live grid: only symbols that belong to an
    // actual qualifying cluster (5+ connected) can be removed for this tumble.
    const validClusterCellsBySymbol: { [key: number]: Set<string> } = {};
    try {
      const colMajorGrid: number[][] = Array.from({ length: numCols }, () => Array<number>(numRows).fill(-1));
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          const value = self.currentSymbolData?.[row]?.[col];
          if (typeof value === 'number' && !isNaN(value)) {
            colMajorGrid[col][row] = value;
          }
        }
      }

      const clusters = findClusters(colMajorGrid);
      for (const cluster of clusters) {
        if (!validClusterCellsBySymbol[cluster.symbol]) {
          validClusterCellsBySymbol[cluster.symbol] = new Set<string>();
        }
        const bucket = validClusterCellsBySymbol[cluster.symbol];
        for (const pos of cluster.positions) {
          bucket.add(clusterCellKey(pos.col, pos.row));
        }
      }
    } catch (e) {
      console.warn('[Symbols] Failed deriving valid cluster cells for tumble:', e);
    }

    // Apply explicit removal positions from tumble outs (if provided)
    const preMarkedByCol: number[] = Array.from({ length: numCols }, () => 0);
    const preMarkedByOut: number[] = Array.from({ length: outs.length }, () => 0);
    const parseOutPositions = (raw: any): Array<{ col: number; row: number }> => {
      if (!Array.isArray(raw)) return [];
      const list: Array<{ col: number; row: number }> = [];
      for (const entry of raw) {
        let col: number | undefined;
        let row: number | undefined;
        if (Array.isArray(entry)) {
          col = Number(entry[0]);
          row = Number(entry[1]);
        } else if (entry && typeof entry === 'object') {
          col = Number((entry as any).col ?? (entry as any).x);
          row = Number((entry as any).row ?? (entry as any).y);
        }
        if (Number.isFinite(col) && Number.isFinite(row)) {
          list.push({ col: col as number, row: row as number });
        }
      }
      return list;
    };
    const resolveOutPositions = (out: any): Array<{ col: number; row: number }> => {
      const raw = parseOutPositions(out?.positions);
      if (raw.length === 0) return [];
      const inBounds = raw.filter(p => p.col >= 0 && p.col < numCols && p.row >= 0 && p.row < numRows);
      if (inBounds.length === 0) return [];
      const symbol = Number(out?.symbol);
      if (self.currentSymbolData && Number.isFinite(symbol)) {
        let matchRaw = 0;
        let matchConverted = 0;
        for (const p of inBounds) {
          const rawRow = p.row;
          const convRow = numRows - 1 - p.row;
          if (self.currentSymbolData[rawRow]?.[p.col] === symbol) matchRaw++;
          if (self.currentSymbolData[convRow]?.[p.col] === symbol) matchConverted++;
        }
        const useRaw = matchRaw > matchConverted;
        return inBounds.map(p => ({ col: p.col, row: useRaw ? p.row : (numRows - 1 - p.row) }));
      }
      // Default: incoming positions are bottom-based (row 0 = bottom)
      return inBounds.map(p => ({ col: p.col, row: numRows - 1 - p.row }));
    };
    outs.forEach((out, idx) => {
      const requestedCount = getOutCount(out);
      const targetSymbol = Number(out?.symbol);
      if (gameStateManager.isBonus && targetSymbol === SCATTER_SYMBOL_ID) return;
      if (!Number.isFinite(requestedCount) || requestedCount < QUALIFYING_CLUSTER_COUNT) {
        if (requestedCount > 0) {
          console.warn('[Symbols] Ignoring out.positions below qualifying cluster count', {
            targetSymbol,
            requestedCount
          });
        }
        return;
      }
      const positions = resolveOutPositions(out);
      if (!positions.length) return;
      const validSet = validClusterCellsBySymbol[targetSymbol];
      if (!validSet || validSet.size === 0) {
        console.warn('[Symbols] Ignoring out.positions for non-cluster symbol during tumble', { targetSymbol, count: positions.length });
        return;
      }
      let markedForOut = 0;
      for (const p of positions) {
        if (p.col < 0 || p.col >= numCols || p.row < 0 || p.row >= numRows) continue;
        const liveSymbol = self.currentSymbolData?.[p.row]?.[p.col];
        if (liveSymbol !== targetSymbol) continue;
        if (!validSet.has(clusterCellKey(p.col, p.row))) continue;
        if (!removeMask[p.col][p.row]) {
          removeMask[p.col][p.row] = true;
          preMarkedByCol[p.col] += 1;
          markedForOut += 1;
        }
      }
      preMarkedByOut[idx] = markedForOut;
    });

    // Build position indices by symbol from validated cluster cells only.
    const positionsBySymbol: { [key: number]: Array<{ col: number; row: number }> } = {};
    let sequenceIndex = 0; // ensures 1-by-1 ordering across columns left-to-right
    for (const symbolKey of Object.keys(validClusterCellsBySymbol)) {
      const symbol = Number(symbolKey);
      const set = validClusterCellsBySymbol[symbol];
      if (!set || set.size === 0) continue;
      positionsBySymbol[symbol] = [];
      for (const key of set) {
        const [colRaw, rowRaw] = key.split(',');
        const col = Number(colRaw);
        const row = Number(rowRaw);
        if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
        if (col < 0 || col >= numCols || row < 0 || row >= numRows) continue;
        positionsBySymbol[symbol].push({ col, row });
      }
    }
    // Sort each symbol's positions top-to-bottom (row asc), then left-to-right (col asc)
    Object.keys(positionsBySymbol).forEach(k => {
      positionsBySymbol[Number(k)].sort((a, b) => a.row - b.row || a.col - b.col);
    });

    // Determine per-column incoming counts
    const insCountByCol: number[] = Array.from({ length: numCols }, (_, c) => (Array.isArray(ins?.[c]) ? ins[c].length : 0));
    let targetRemovalsPerCol: number[] = insCountByCol.map((n, c) => Math.max(0, n - (preMarkedByCol[c] || 0)));

    // Helper to pick and mark a position for a symbol in a preferred column
    function pickAndMark(symbol: number, preferredCol: number | null): boolean {
      const list = positionsBySymbol[symbol] || [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (removeMask[p.col][p.row]) continue; // already marked
        if (preferredCol !== null && p.col !== preferredCol) continue;
        removeMask[p.col][p.row] = true;
        // Remove from list for efficiency
        list.splice(i, 1);
        return true;
      }
      return false;
    }

    // First pass: satisfy per-column targets using outs composition
    for (let outIndex = 0; outIndex < outs.length; outIndex++) {
      const out = outs[outIndex];
      const requestedCount = getOutCount(out);
      let remaining = Math.max(0, requestedCount - (preMarkedByOut[outIndex] || 0));
      const targetSymbol = Number(out?.symbol);
      if (isNaN(remaining) || isNaN(targetSymbol) || remaining <= 0) continue;
      if (!Number.isFinite(requestedCount) || requestedCount < QUALIFYING_CLUSTER_COUNT) continue;
      // In bonus, never remove Symbol0 (scatter) so 3+ can trigger retrigger; no clearing.
      if (gameStateManager.isBonus && targetSymbol === SCATTER_SYMBOL_ID) continue;
      const validSet = validClusterCellsBySymbol[targetSymbol];
      if (!validSet || validSet.size === 0) {
        console.warn('[Symbols] Ignoring non-cluster out during tumble', { targetSymbol, requestedCount: remaining });
        continue;
      }
      // Try to allocate removals in columns that expect incoming symbols first
      while (remaining > 0) {
        let allocated = false;
        for (let col = 0; col < numCols && remaining > 0; col++) {
          if (targetRemovalsPerCol[col] <= 0) continue;
          if (pickAndMark(targetSymbol, col)) {
            targetRemovalsPerCol[col]--;
            remaining--;
            allocated = true;
          }
        }
        if (!allocated) break; // proceed to second pass
      }
      // Second pass: allocate any remainder anywhere
      while (remaining > 0) {
        if (pickAndMark(targetSymbol, null)) {
          remaining--;
        } else {
          console.warn('[Symbols] Not enough matching symbols in grid to satisfy tumble outs for symbol', targetSymbol);
          break;
        }
      }
    }

    // Compute active columns (have removals or incoming) for conveyor animation
    const removedPerCol: number[] = Array.from({ length: numCols }, () => 0);
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        if (removeMask[col][row]) removedPerCol[col]++;
      }
    }
    const totalRemovedCells = removedPerCol.reduce((sum, n) => sum + n, 0);
    anyRemoval = totalRemovedCells > 0;
    const tumbleActiveColumns = Array.from({ length: numCols }, (_, c) => c).filter(
      (c) => insCountByCol[c] > 0 || removedPerCol[c] > 0
    );
    // Debug: per-column removal vs incoming
    try {
      console.log('[Symbols] Tumble per-column removal vs incoming:', removedPerCol.map((r, c) => ({ col: c, removed: r, incoming: insCountByCol[c] })));
    } catch { }

    // Debug: report which cells are marked for removal per symbol
    try {
      const removedBySymbol: { [key: number]: Array<{ col: number; row: number }> } = {};
      let totalRemoved = 0;
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (removeMask[col][row]) {
            const val = self.currentSymbolData?.[row]?.[col];
            const key = typeof val === 'number' ? val : -1;
            if (!removedBySymbol[key]) removedBySymbol[key] = [];
            removedBySymbol[key].push({ col, row });
            totalRemoved++;
          }
        }
      }
      console.log('[Symbols] Tumble removal mask summary:', { totalRemoved, removedBySymbol });
    } catch { }

    const bonusTumbleMultiplier = this.computeAndAdvanceBonusTumbleMultiplier(removeMask);

    // Optional: draw red borders around winning symbols for visualization (scene layer, use grid cell position)
    if (SHOW_WIN_BORDER_SYMBOLS && self.grid) {
      const borderThickness = WIN_BORDER_LINE_WIDTH;
      const borderColor = 0xff0000;
      const w = self.displayWidth ?? 62;
      const h = self.displayHeight ?? 62;
      const halfW = w / 2;
      const halfH = h / 2;
      let borderCount = 0;
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (!removeMask[col][row]) continue;
          const obj = self.symbols[col]?.[row];
          try {
            if (obj && (obj as any).__winBorder) {
              const prev = (obj as any).__winBorder;
              if (prev.destroy && !prev.destroyed) prev.destroy();
              (obj as any).__winBorder = null;
            }
            const pos = self.grid.calculateCellPosition(col, row);
            const g = self.scene.add.graphics();
            g.lineStyle(borderThickness, borderColor, 1);
            g.strokeRect(-halfW, -halfH, w, h);
            g.setPosition(pos.x, pos.y);
            g.setDepth(DEPTH_WIN_LINES + 1);
            g.setScrollFactor(1);
            self.scene.add.existing(g);
            self.winBorderGraphics.push(g);
            if (obj) (obj as any).__winBorder = g;
            borderCount++;
          } catch (e) {
            console.warn('[Symbols] Win border draw failed for', col, row, e);
          }
        }
      }
      if (borderCount > 0) console.log('[Symbols] Drew', borderCount, 'win borders (SHOW_WIN_BORDER_SYMBOLS)');
    }

    // Attach ONE win text per winning symbol value, prioritizing columns 2–5 (1–4 zero-based)
    if (!skipTumble) try {
      // Build removal positions by symbol value
      const positionsForSymbol: { [key: number]: Array<{ col: number; row: number }> } = {};
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (!removeMask[col][row]) continue;
          const val = self.currentSymbolData?.[row]?.[col];
          if (typeof val !== 'number') continue;
          if (!positionsForSymbol[val]) positionsForSymbol[val] = [];
          positionsForSymbol[val].push({ col, row });
        }
      }
      // Map of per-symbol win amount from outs
      const winBySymbol: { [key: number]: number } = {};
      for (const out of outs as any[]) {
        const s = Number((out as any)?.symbol);
        const w = getOutWin(out);
        if (!isNaN(s) && !isNaN(w) && w > 0) winBySymbol[s] = w;
      }
      const tumbleWin = Number((tumble as any)?.win || 0);
      // Choose one position per winning symbol and display text
      let winTrackerShown = false;
      for (const keyStr of Object.keys(positionsForSymbol)) {
        const sym = Number(keyStr);
        const list = positionsForSymbol[sym] || [];
        if (!list.length) continue;
        // Prioritize columns 1..4 (2–5 human)
        const priority = list.filter(p => p.col >= 1 && p.col <= 4);
        const pool = priority.length ? priority : list;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const obj = self.symbols[pick.col][pick.row];
        if (!obj) continue;
        const baseAmount = (winBySymbol[sym] !== undefined) ? winBySymbol[sym] : (tumbleWin > 0 ? tumbleWin : 0);
        const amount = (gameStateManager.isBonus && bonusTumbleMultiplier > 1)
          ? (baseAmount * bonusTumbleMultiplier)
          : baseAmount;
        if (amount <= 0) continue;
        // Remove any previous win text on this symbol
        try {
          const prev: any = (obj as any).__winText;
          if (prev && prev.destroy && !prev.destroyed) prev.destroy();
        } catch { }
        // Delay win text to appear ~0.8s after the win animation is triggered
        const baseX = obj.x;
        const baseY = obj.y;
        self.scene.time.delayedCall(800, () => {
          // If scene or container is gone, skip
          try {
            if (!self || !self.scene || !self.container) return;
          } catch { return; }
          // Show WinTracker once at the same moment win text appears
          try {
            if (!winTrackerShown) {
              winTrackerShown = true;
              const wt = (self.scene as any)?.winTracker;
              if (wt) {
                // Announce win start here so coins and listeners sync with text timing
                try { gameEventManager.emit(GameEventType.WIN_START); } catch { }
                // Show only the current tumble's wins
                try {
                  const originalOutsArr = Array.isArray((tumble as any)?.symbols?.out) ? (tumble as any).symbols.out : [];
                  const outsArr = (gameStateManager.isBonus && bonusTumbleMultiplier > 1)
                    ? originalOutsArr.map((out: any) => {
                      const baseWin = getOutWin(out);
                      if (!Number.isFinite(baseWin) || baseWin <= 0) return out;
                      const scaledWin = Number((baseWin * bonusTumbleMultiplier).toFixed(2));
                      const rawWin = out?.win;
                      if (rawWin && typeof rawWin === 'object') {
                        const nextWin = { ...(rawWin as any) };
                        nextWin.total = scaledWin;
                        if (!Number.isFinite(Number(nextWin.base))) nextWin.base = baseWin;
                        nextWin.multiplier = bonusTumbleMultiplier;
                        return { ...out, win: nextWin };
                      }
                      return { ...out, win: scaledWin };
                    })
                    : originalOutsArr;
                  if (typeof wt.showPagedForTumble === 'function') {
                    wt.showPagedForTumble(outsArr, self.currentSpinData || null, 2, 1200, 200);
                  } else {
                    wt.showForTumble(outsArr, self.currentSpinData || null);
                  }
                } catch {
                  wt.updateFromSpinData(self.currentSpinData || null);
                  wt.showLatest();
                }
                // Do not auto-hide WinTracker here; it will persist until a new spin starts,
                // at which point the Game scene explicitly clears it.
              }
            }
          } catch { }
          // Create and place text (smaller scale during bonus)
          const winTextScale = gameStateManager.isBonus ? WIN_TEXT_SCALE_BONUS : 1;
          const txt = this.overlayModule.createWinText(amount, baseX, baseY, this.displayHeight, false, winTextScale);
          try { txt.setDepth(700); } catch { }
          self.container.add(txt);
          try { (obj as any).__winText = txt; } catch { }
          // Animate: single pop on appear, then rise and fade
          try {
            const baseSX = (txt as any)?.scaleX ?? 1;
            const baseSY = (txt as any)?.scaleY ?? 1;
            self.scene.tweens.add({
              targets: txt,
              scaleX: baseSX * 1.12,
              scaleY: baseSY * 1.12,
              duration: 160,
              yoyo: true,
              repeat: 0,
              ease: Phaser.Math.Easing.Cubic.Out,
            });
          } catch { }
          try {
            const rise = Math.max(8, Math.round(self.displayHeight * 0.25));
            const holdDuration = Math.max(1000, (self.scene?.gameData?.winUpDuration || 700) + 0);
            const fadeDuration = Math.max(600, (self.scene?.gameData?.winUpDuration || 700) + 0);
            self.scene.tweens.chain({
              targets: txt,
              tweens: [
                {
                  y: txt.y - rise,
                  duration: holdDuration,
                  ease: Phaser.Math.Easing.Cubic.Out,
                },
                {
                  alpha: 0,
                  duration: fadeDuration,
                  ease: Phaser.Math.Easing.Cubic.Out,
                  onComplete: () => {
                    try {
                      if (txt && (txt as any).destroy && !(txt as any).destroyed) (txt as any).destroy();
                      if (obj && (obj as any).__winText === txt) (obj as any).__winText = null;
                    } catch { }
                  }
                }
              ]
            });
          } catch { }
        });
      }
    } catch { }

    // Short delay before playing win animations on cluster win (then win anim → destroy → tumble)
    if (anyRemoval && !skipTumble) {
      const gd = self.scene?.gameData as { clusterWinPreAnimDelayMs?: number } | undefined;
      const preAnimDelayMs = gd?.clusterWinPreAnimDelayMs ?? 400;
      await this.delay(preAnimDelayMs);
    }

    // Animate removal: for high-count sugar symbols (1..7), play SW_Win before destroy; otherwise fade out
    const removalPromises: Promise<void>[] = [];
    const STAGGER_MS = 50; // match drop sequence stagger (shortened)
    // Track first win animation notification (we now trigger on animation start for better SFX sync)
    let firstWinNotified = false;
    const baseTumbleTotal = getTumbleTotal(tumble);
    const effectiveTumbleTotal = (gameStateManager.isBonus && bonusTumbleMultiplier > 1)
      ? Number((baseTumbleTotal * bonusTumbleMultiplier).toFixed(2))
      : baseTumbleTotal;
    function notifyFirstWinIfNeeded() {
      if (!firstWinNotified) {
          firstWinNotified = true;
        console.log(`[Symbols] notifyFirstWinIfNeeded called for tumble index: ${tumbleIndex} (first win animation started)`);
        try {
          if (typeof onFirstWinComplete === 'function') {
            onFirstWinComplete(effectiveTumbleTotal);
          }
        } catch { }
      }
    }

    if (skipTumble) {
      try {
        if (effectiveTumbleTotal > 0 || anyRemoval) {
          notifyFirstWinIfNeeded();
        }
      } catch { }
      
      // Turbo: play win animation first (at turbo speed), then hide/destroy
      const removalPromises: Promise<void>[] = [];
      const TurboConfig = (window as any)?.TurboConfig || { TURBO_SPEED_MULTIPLIER: 0.25 };
      const speedMultiplier = TurboConfig.TURBO_SPEED_MULTIPLIER || 0.25;
      const animationDuration = Math.max(100, (self.scene?.gameData?.winUpDuration || 400) * speedMultiplier);
      const winAnimHoldMs = Math.max(80, animationDuration);

      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (!removeMask[col][row]) continue;
          const obj = self.symbols[col][row];
          if (obj) {
            removalPromises.push(new Promise<void>((resolve) => {
              try {
                const value = self.currentSymbolData?.[row]?.[col];
                const isSugarWin = typeof value === 'number' && value >= 1 && value <= 7;
                const skeletonData = (obj as any)?.skeleton?.data;
                const sugarWinAnim = isSugarWin && skeletonData ? resolveSymbolAnimationName(skeletonData, value, 'win') : null;
                const canPlaySugarWin = !!(sugarWinAnim && obj.animationState && obj.animationState.setAnimation);

                if (canPlaySugarWin) {
                  // Play win animation first, then destroy after turbo-speed hold
                  let completed = false;
                  const finish = () => {
                    if (completed) return;
                    completed = true;
                    this.clearSymbolCell(obj, col, row);
                    resolve();
                  };
                  try {
                    if (typeof obj.setDepth === 'function') obj.setDepth(DEPTH_WINNING_SYMBOL);
                    if (obj.animationState.clearTracks) obj.animationState.clearTracks();
                    this.setSymbolWinDrawOrderSymbolInsideBox(obj);
                    if (obj.animationState.addListener) {
                      const listener = {
                        complete: (entry: any) => {
                          try {
                            if (!entry || entry.animation?.name !== sugarWinAnim) return;
                          } catch { }
                          finish();
                        }
                      } as any;
                      obj.animationState.addListener(listener);
                    }
                    const entry = startAnimationWithEntry(obj, {
                      animationName: sugarWinAnim as string,
                      loop: false,
                      logWhenMissing: false
                    })?.entry;
                    const timeScale = (self.scene?.gameData as { symbolWinAnimTimeScale?: number })?.symbolWinAnimTimeScale ?? 1;
                    if (entry && typeof (entry as any).timeScale === 'number' && timeScale > 0) (entry as any).timeScale = timeScale;
                    // Safety fallback only: wait for animation to finish (duration scales with timeScale)
                    const animDurationSec = (entry as any)?.animation?.duration;
                    const safetyMs = animDurationSec != null
                      ? (animDurationSec * 1000) / Math.max(0.1, timeScale) + 1500
                      : Math.max(3000, winAnimHoldMs * 4);
                    self.scene.time.delayedCall(safetyMs, () => finish());
                  } catch { }
                } else {
                  // No win animation: fast fade then destroy
                  self.scene.tweens.killTweensOf(obj);
                  const tweenTargets: any = this.getSymbolTweenTargets(obj);
                  self.scene.tweens.add({
                    targets: tweenTargets,
                    alpha: 0,
                    duration: animationDuration,
                    ease: Phaser.Math.Easing.Cubic.In,
                    onComplete: () => {
                      this.clearSymbolCell(obj, col, row);
                      resolve();
                    }
                  });
                }
              } catch {
                this.clearSymbolCell(obj, col, row);
                resolve();
              }
            }));
          }
        }
      }
      
      await Promise.all(removalPromises);
    } else {
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (removeMask[col][row]) {
            const obj = self.symbols[col][row];
            if (obj) {
              removalPromises.push(new Promise<void>((resolve) => {
              const value = self.currentSymbolData?.[row]?.[col];
              const isSugarWin = typeof value === 'number' && value >= 1 && value <= 7;
              const skeletonData = (obj as any)?.skeleton?.data;
              const sugarWinAnim = isSugarWin && skeletonData ? resolveSymbolAnimationName(skeletonData, value, 'win') : null;
              const canPlaySugarWin = !!(sugarWinAnim && obj.animationState && obj.animationState.setAnimation);

              const startRemoval = () => {
                try {
                  notifyFirstWinIfNeeded();
                  if (canPlaySugarWin) {
                    try {
                      if (typeof obj.setDepth === 'function') obj.setDepth(DEPTH_WINNING_SYMBOL);
                      if (obj.animationState.clearTracks) obj.animationState.clearTracks();
                      this.setSymbolWinDrawOrderSymbolInsideBox(obj);
                    } catch { }
                    const winAnim = sugarWinAnim as string;
                    let completed = false;
                    try {
                      if (obj.animationState.addListener) {
                        const listener = {
                          complete: (entry: any) => {
                            try {
                              if (!entry || entry.animation?.name !== winAnim) return;
                            } catch { }
                            if (completed) return; completed = true;
                            this.clearSymbolCell(obj, col, row);
                            resolve();
                          }
                        } as any;
                        obj.animationState.addListener(listener);
                      }
                      const animEntry = startAnimationWithEntry(obj, {
                        animationName: winAnim,
                        loop: false,
                        logWhenMissing: false
                      })?.entry;
                      const timeScale = (self.scene?.gameData as { symbolWinAnimTimeScale?: number })?.symbolWinAnimTimeScale ?? 1;
                      if (animEntry && typeof (animEntry as any).timeScale === 'number' && timeScale > 0) (animEntry as any).timeScale = timeScale;
                      console.log(`[Symbols] Playing win animation "${winAnim}" for tumble index: ${tumbleIndex}`);
                      // Match bonus game: no scale-up during symbol win animation (disableScaling is true in bonus; same behavior for normal so win anim looks correct).
                      // Safety fallback only: destroy after animation would have finished (duration / timeScale + buffer). Primary is animation complete event.
                      const animDurationSec = (animEntry as any)?.animation?.duration;
                      const safetyMs = animDurationSec != null
                        ? (animDurationSec * 1000) / Math.max(0.1, timeScale) + 1500
                        : (self.scene.gameData.winUpDuration + 700) / Math.max(0.1, timeScale) + 1000;
                      self.scene.time.delayedCall(safetyMs, () => {
                        if (completed) return; completed = true;
                        this.clearSymbolCell(obj, col, row);
                        resolve();
                      });
                    } catch {
                      try { self.scene.tweens.killTweensOf(obj); } catch { }
                      const tweenTargets: any = this.getSymbolTweenTargets(obj);
                      self.scene.tweens.add({
                        targets: tweenTargets,
                        alpha: 0,
                        duration: self.scene.gameData.winUpDuration,
                        ease: Phaser.Math.Easing.Cubic.In,
                        onComplete: () => {
                          this.clearSymbolCell(obj, col, row);
                          resolve();
                        }
                      });
                    }
                  } else {
                    try { self.scene.tweens.killTweensOf(obj); } catch { }
                    const tweenTargets: any = this.getSymbolTweenTargets(obj);
                    self.scene.tweens.add({
                      targets: tweenTargets,
                      alpha: 0,
                      duration: self.scene.gameData.winUpDuration,
                      ease: Phaser.Math.Easing.Cubic.In,
                      onComplete: () => {
                        this.clearSymbolCell(obj, col, row);
                        resolve();
                      }
                    });
                  }
                } catch {
                  this.clearSymbolCell(obj, col, row);
                  resolve();
                }
              };

              startRemoval();
            }));
            } else {
              self.symbols[col][row] = null as any;
              if (self.currentSymbolData && self.currentSymbolData[row]) {
                (self.currentSymbolData[row] as any)[col] = null;
              }
            }
          }
        }
      }
    }

    await Promise.all(removalPromises);
    try {
      if (!firstWinNotified) {
        if (effectiveTumbleTotal > 0 || anyRemoval) {
          notifyFirstWinIfNeeded();
        }
      }
    } catch { }

    // Start conveyor only when actual tumble movement begins (after win-symbol animations).
    if (tumbleActiveColumns.length > 0) {
      gameEventManager.emit(GameEventType.TUMBLE_COLUMNS_START, { columns: tumbleActiveColumns } as any);
    }

    // Compress each column downwards and compute target indices for remaining symbols
    const symbolTotalHeight = self.displayHeight + self.verticalSpacing;
    const startY = self.slotY - self.totalGridHeight * 0.5;

    // Prepare a new grid to place references post-compression
    const newGrid: any[][] = Array.from({ length: numCols }, () => Array<any>(numRows).fill(null));
    const compressPromises: Promise<void>[] = [];

    for (let col = 0; col < numCols; col++) {
      const kept: Array<{ obj: any, oldRow: number }> = [];
      for (let row = 0; row < numRows; row++) {
        const obj = self.symbols[col][row];
        if (obj) kept.push({ obj, oldRow: row });
      }
      const bottomStart = numRows - kept.length; // first row index for packed symbols at bottom
      kept.forEach((entry, idx) => {
        const obj = entry.obj;
        const oldRow = entry.oldRow;
        const newRow = bottomStart + idx;
        const targetY = startY + newRow * symbolTotalHeight + symbolTotalHeight * 0.5;
        newGrid[col][newRow] = obj;
        // Track updated logical grid coordinates on the symbol
        try { (obj as any).__gridCol = col; (obj as any).__gridRow = newRow; } catch { }
        const needsMove = newRow !== oldRow;
        if (!needsMove || skipTumble) {
          // No movement needed; ensure y is correct and resolve immediately
          try {
            if (typeof obj.setY === 'function') obj.setY(targetY);
            const winTextObj: any = (obj as any)?.__winText;
            if (winTextObj && typeof winTextObj.setY === 'function') winTextObj.setY(targetY);
          } catch { }
          return; // no promise push to avoid waiting on a non-existent tween
        }
        compressPromises.push(new Promise<void>((resolve) => {
          try {
            const tweenTargetsMove: any = this.getSymbolTweenTargets(obj);
            const isTurbo = !!self.scene.gameData?.isTurbo;
            const baseDuration = self.scene.gameData.dropDuration;
            // Use a slightly shorter duration in turbo, but long enough for easing
            // to be visible so the motion doesn't feel rigid.
            const compressionDuration = isTurbo
              ? Math.max(160, baseDuration * 0.6)
              : baseDuration;
            const baseDelayMultiplier = (self.scene?.gameData?.compressionDelayMultiplier ?? 1);
            const colDelay = STAGGER_MS * col * baseDelayMultiplier;
            // In turbo, keep some stagger but reduce it so columns still feel snappy.
            const delay = isTurbo ? colDelay * 0.4 : colDelay;
            self.scene.tweens.add({
              targets: tweenTargetsMove,
              y: targetY,
              delay,
              duration: compressionDuration,
              // In turbo mode, keep motion snappy but smoothly decelerating
              ease: self.scene.gameData?.isTurbo
                ? Phaser.Math.Easing.Cubic.Out
                : Phaser.Math.Easing.Bounce.Out,
              onComplete: () => resolve(),
            });
          } catch { resolve(); }
        }));
      });
    }

    // Overlap-aware drop scheduling: if enabled, start drops during compression; otherwise, drop after compression completes
    const overlapDrops = !skipTumble && !!(self.scene?.gameData?.tumbleOverlapDropsDuringCompression);
    const dropPromises: Promise<void>[] = [];
    const symbolTotalWidth = self.displayWidth + self.horizontalSpacing;
    const startX = self.slotX - self.totalGridWidth * 0.5;
    let totalSpawned = 0;

    if (overlapDrops) {
      // Replace grid immediately so top nulls represent empty slots while compression runs
      self.symbols = newGrid;
      // Update all objects with their current grid coordinates for consistency
      try {
        for (let c = 0; c < numCols; c++) {
          for (let r = 0; r < numRows; r++) {
            const o = self.symbols[c][r];
            if (o) { try { (o as any).__gridCol = c; (o as any).__gridRow = r; } catch { } }
          }
        }
      } catch { }
      // Rebuild currentSymbolData to reflect compressed positions now
      try {
        if (self.currentSymbolData) {
          const rebuilt: (number | null)[][] = Array.from({ length: numRows }, () => Array<number | null>(numCols).fill(null));
          for (let col = 0; col < numCols; col++) {
            const keptValues: number[] = [];
            for (let row = 0; row < numRows; row++) {
              const v = self.currentSymbolData[row]?.[col];
              if (typeof v === 'number') keptValues.push(v);
            }
            const bottomStart = numRows - keptValues.length;
            for (let i = 0; i < keptValues.length; i++) {
              const newRow = bottomStart + i;
              rebuilt[newRow][col] = keptValues[i];
            }
          }
          const finalized: number[][] = rebuilt.map(row => row.map(v => (typeof v === 'number' ? v : 0)));
          self.currentSymbolData = finalized;
        }
      } catch { }

      // Start drops now, while compression tweens are in-flight
      for (let col = 0; col < numCols; col++) {
        const incoming = Array.isArray(ins?.[col]) ? ins[col] : [];
        if (incoming.length === 0) continue;

        let emptyCount = 0;
        for (let row = 0; row < numRows; row++) {
          if (!self.symbols[col][row]) emptyCount++;
          else break;
        }
        const spawnCount = Math.min(emptyCount, incoming.length);
        console.log(`[Symbols] (overlap) Column ${col}: empty=${emptyCount}, incoming=${incoming.length}, spawning=${spawnCount}`);
        for (let j = 0; j < spawnCount; j++) {
          const targetRow = Math.max(0, emptyCount - 1 - j);
          const targetY = startY + targetRow * symbolTotalHeight + symbolTotalHeight * 0.5;
          const xPos = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;

          const srcIndex = Math.max(0, incoming.length - 1 - j);
          const value = incoming[srcIndex];
          const topOfGridCenterY = startY + symbolTotalHeight * 0.5;
          const startYPos = topOfGridCenterY - self.scene.scale.height + (j * symbolTotalHeight);
          const created: any = this.factory.createSugarOrPngSymbol(value, xPos, skipTumble ? targetY : startYPos, 1);

          self.symbols[col][targetRow] = created;
          try { (created as any).__gridCol = col; (created as any).__gridRow = targetRow; } catch { }
          if (self.currentSymbolData && self.currentSymbolData[targetRow]) {
            (self.currentSymbolData[targetRow] as any)[col] = value;
          }

          if (!skipTumble) {
            try { this.animationsModule.playDropAnimation(created); } catch { }
          }

          const DROP_STAGGER_MS = (self.scene?.gameData?.tumbleDropStaggerMs ?? (MANUAL_STAGGER_MS * 0.25));
          const symbolHop = self.scene.gameData.winUpHeight * 0.5;
          const isTurbo = !!self.scene.gameData?.isTurbo;
          dropPromises.push(new Promise<void>((resolve) => {
            if (skipTumble) {
              resolve();
              return;
            }
            try {
              const computedStartDelay = (self.scene?.gameData?.tumbleDropStartDelayMs ?? 0) + (DROP_STAGGER_MS * sequenceIndex);
              const skipPreHop = !!(self.scene?.gameData?.tumbleSkipPreHop);
              const tweensArr: any[] = [];
              if (!skipPreHop) {
                tweensArr.push({
                  delay: computedStartDelay,
                  y: `-= ${symbolHop}`,
                  duration: self.scene.gameData.winUpDuration,
                  ease: Phaser.Math.Easing.Circular.Out,
                });
                tweensArr.push({
                  y: targetY,
                  duration: (self.scene.gameData.dropDuration * 0.9),
                  ease: Phaser.Math.Easing.Linear,
                });
              } else {
                tweensArr.push({
                  delay: computedStartDelay,
                  y: targetY,
                  duration: (self.scene.gameData.dropDuration * 0.9),
                  ease: Phaser.Math.Easing.Linear,
                });
              }
              if (!isTurbo) {
                // Normal mode: include the small post-drop bounce and SFX
                tweensArr.push(
                  {
                    y: `+= ${10}`,
                    duration: self.scene.gameData.dropDuration * 0.05,
                    ease: Phaser.Math.Easing.Linear,
                  },
                  {
                    y: `-= ${10}`,
                    duration: self.scene.gameData.dropDuration * 0.05,
                    ease: Phaser.Math.Easing.Linear,
                    onComplete: () => {
                      try {
                        if (!self.scene.gameData.isTurbo && (window as any).audioManager) {
                          (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                        }
                      } catch { }
                      resolve();
                    }
                  }
                );
              } else {
                // Turbo mode: no post-drop bounce; resolve on the main drop completion
                const last = tweensArr[tweensArr.length - 1];
                const prevOnComplete = last.onComplete;
                last.onComplete = () => {
                  try {
                    if (prevOnComplete) prevOnComplete();
                    // Play tumble sound for every symbol dropped after compression in turbo mode
                    if ((window as any).audioManager) {
                      (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                    }
                  } catch (e) {
                    console.warn('[Symbols] Error playing reel drop sound in turbo mode:', e);
                  }
                  resolve();
                };
              }
              try {
                self.scene.tweens.chain({
                  targets: this.getSymbolTweenTargets(created),
                  tweens: tweensArr
                });
              } catch {
                self.scene.tweens.chain({ targets: created, tweens: tweensArr });
              }
            } catch { resolve(); }
          }));
          sequenceIndex++;
          totalSpawned++;
        }
      }

      // Wait for both compression and drop to finish
      await Promise.all([...compressPromises, ...dropPromises]);
    } else {
      // Default behavior: wait compression, then set grid and drop
      await Promise.all(compressPromises);
      self.symbols = newGrid;
      // Update all objects with their current grid coordinates for consistency
      try {
        for (let c = 0; c < numCols; c++) {
          for (let r = 0; r < numRows; r++) {
            const o = self.symbols[c][r];
            if (o) { try { (o as any).__gridCol = c; (o as any).__gridRow = r; } catch { } }
          }
        }
      } catch { }
      try {
        if (self.currentSymbolData) {
          const rebuilt: (number | null)[][] = Array.from({ length: numRows }, () => Array<number | null>(numCols).fill(null));
          for (let col = 0; col < numCols; col++) {
            const keptValues: number[] = [];
            for (let row = 0; row < numRows; row++) {
              const v = self.currentSymbolData[row]?.[col];
              if (typeof v === 'number') keptValues.push(v);
            }
            const bottomStart = numRows - keptValues.length;
            for (let i = 0; i < keptValues.length; i++) {
              const newRow = bottomStart + i;
              rebuilt[newRow][col] = keptValues[i];
            }
          }
          const finalized: number[][] = rebuilt.map(row => row.map(v => (typeof v === 'number' ? v : 0)));
          self.currentSymbolData = finalized;
        }
      } catch { }

      for (let col = 0; col < numCols; col++) {
        const incoming = Array.isArray(ins?.[col]) ? ins[col] : [];
        if (incoming.length === 0) continue;
        let emptyCount = 0;
        for (let row = 0; row < numRows; row++) {
          if (!self.symbols[col][row]) emptyCount++;
          else break;
        }
        const spawnCount = Math.min(emptyCount, incoming.length);
        console.log(`[Symbols] Column ${col}: empty=${emptyCount}, incoming=${incoming.length}, spawning=${spawnCount}`);
        for (let j = 0; j < spawnCount; j++) {
          const targetRow = Math.max(0, emptyCount - 1 - j);
          const targetY = startY + targetRow * symbolTotalHeight + symbolTotalHeight * 0.5;
          const xPos = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
          const srcIndex = Math.max(0, incoming.length - 1 - j);
          const value = incoming[srcIndex];
          const topOfGridCenterY = startY + symbolTotalHeight * 0.5;
          const startYPos = topOfGridCenterY - self.scene.scale.height + (j * symbolTotalHeight);
          const created: any = this.factory.createSugarOrPngSymbol(value, xPos, skipTumble ? targetY : startYPos, 1);
          self.symbols[col][targetRow] = created;
          try { (created as any).__gridCol = col; (created as any).__gridRow = targetRow; } catch { }
          if (self.currentSymbolData && self.currentSymbolData[targetRow]) {
            (self.currentSymbolData[targetRow] as any)[col] = value;
          }
          if (!skipTumble) {
            try { this.animationsModule.playDropAnimation(created); } catch { }
          }
          const DROP_STAGGER_MS = (self.scene?.gameData?.tumbleDropStaggerMs ?? (MANUAL_STAGGER_MS * 0.25));
          const symbolHop = self.scene.gameData.winUpHeight * 0.5;
          const isTurbo = !!self.scene.gameData?.isTurbo;
          dropPromises.push(new Promise<void>((resolve) => {
            if (skipTumble) {
              resolve();
              return;
            }
            try {
              const computedStartDelay = (self.scene?.gameData?.tumbleDropStartDelayMs ?? 0) + (DROP_STAGGER_MS * sequenceIndex);
              const skipPreHop = !!(self.scene?.gameData?.tumbleSkipPreHop);
              const tweensArr: any[] = [];
              if (!skipPreHop) {
                tweensArr.push({ delay: computedStartDelay, y: `-= ${symbolHop}`, duration: self.scene.gameData.winUpDuration, ease: Phaser.Math.Easing.Circular.Out });
                tweensArr.push({ y: targetY, duration: (self.scene.gameData.dropDuration * 0.9), ease: Phaser.Math.Easing.Linear });
              } else {
                tweensArr.push({ delay: computedStartDelay, y: targetY, duration: (self.scene.gameData.dropDuration * 0.9), ease: Phaser.Math.Easing.Linear });
              }
              if (!isTurbo) {
                // Normal mode: include the small post-drop bounce and SFX
                tweensArr.push(
                  { y: `+= ${10}`, duration: self.scene.gameData.dropDuration * 0.05, ease: Phaser.Math.Easing.Linear },
                  {
                    y: `-= ${10}`,
                    duration: self.scene.gameData.dropDuration * 0.05,
                    ease: Phaser.Math.Easing.Linear,
                    onComplete: () => {
                      try {
                        if (!self.scene.gameData.isTurbo && (window as any).audioManager) {
                          (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                        }
                      } catch { }
                      resolve();
                    }
                  }
                );
              } else {
                // Turbo mode: no post-drop bounce; resolve on the main drop completion
                const last = tweensArr[tweensArr.length - 1];
                const prevOnComplete = last.onComplete;
                last.onComplete = () => {
                  try {
                    if (prevOnComplete) prevOnComplete();
                    // Play tumble sound for every symbol dropped after compression in turbo mode
                    if ((window as any).audioManager) {
                      (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                    }
                  } catch (e) {
                    console.warn('[Symbols] Error playing reel drop sound in turbo mode:', e);
                  }
                  resolve();
                };
              }
              self.scene.tweens.chain({ targets: created, tweens: tweensArr });
            } catch { resolve(); }
          }));
          sequenceIndex++;
          totalSpawned++;
        }
      }
      await Promise.all(dropPromises);
    }

    try {
      const totalOutRequested = getTotalCountFromOuts(outs);
      if (totalOutRequested !== totalSpawned) {
        console.warn('[Symbols] Tumble total mismatch: out.count sum != spawned', {
          totalOutRequested,
          totalSpawned
        });
      } else {
        console.log('[Symbols] Tumble totals OK: removed == spawned', { totalSpawned });
      }
    } catch { }

    // Sync data to match live symbols after compression/drop
    this.syncCurrentSymbolDataFromSymbols();
    this.captureClusterWinGridSnapshot(`afterTumble#${tumbleIndex}`);

    // Check for scatter hits from the updated grid after this tumble (both normal and bonus mode)
    try {
      // Scan the live symbols grid to find actual scatter objects and positions
      const grids: Array<{ x: number; y: number }> = [];
      if (self.symbols && self.symbols.length > 0) {
        for (let col = 0; col < self.symbols.length; col++) {
          const column = self.symbols[col];
          if (!Array.isArray(column)) continue;
          for (let row = 0; row < column.length; row++) {
            const obj: any = column[row];
            if (!obj) continue;
            const isScatter = (obj as any)?.symbolValue === 0 || (obj?.texture?.key === 'symbol_0');
            if (isScatter) grids.push({ x: col, y: row });
          }
        }
      }
      const count = grids.length;

      if (gameStateManager.isBonus) {
        // Bonus mode: check for retrigger (3+ scatters)
        if (count >= MIN_SCATTER_FOR_RETRIGGER) {
          console.log(`[Symbols] Scatter detected during tumble in bonus: ${count} scatter(s)`);
          // Defer retrigger to run after all wins/tumbles/multipliers complete (WIN_STOP)
          if (!(self as any).pendingScatterRetrigger) {
            self.setPendingScatterRetrigger(grids);
          }
        }
      } else {
        // Normal mode: check for scatter trigger (4+ scatters)
        if (count >= MIN_SCATTER_FOR_BONUS && !gameStateManager.isScatter) {
          console.log(`[Symbols] Scatter detected during tumble in normal mode: ${count} scatter(s)`);
          // Mark scatter as detected - the final scatter check after all tumbles will handle the animation
          gameStateManager.isScatter = true;
          console.log('[Symbols] Scatter marked for processing after all tumbles complete');
        }
      }
    } catch (e) {
      console.warn('[Symbols] Failed to evaluate scatter during tumble:', e);
    }

    if (tumbleActiveColumns.length > 0) {
      gameEventManager.emit(GameEventType.TUMBLE_COLUMNS_DONE, { columns: tumbleActiveColumns } as any);
    }
    this.tumbleDropInProgress = false;
  }

  private playExplosionVfx(x: number, y: number, useMergeScale: boolean = false, minDurationMs?: number): void {
    const spineKey = 'Explosion_BZ_VFX';
    const atlasKey = `${spineKey}-atlas`;

    if (!this.scene || typeof (this.scene.add as any).spine !== 'function') {
      return;
    }

    try {
      const cacheJson: any = this.scene.cache.json;
      if (cacheJson && typeof cacheJson.has === 'function' && !cacheJson.has(spineKey)) {
        return;
      }
    } catch { }

    let vfx: any;
    try {
      vfx = (this.scene.add as any).spine(x, y, spineKey, atlasKey);
    } catch {
      return;
    }
    if (!vfx) return;
    this.explosionVfxInProgress += 1;
    let explosionTracked = true;

    try { vfx.setOrigin?.(0.5, 0.5); } catch { }
    try { this.animationsModule.fitSpineToSymbolBox(vfx); } catch { }
    try {
      // Scale explosion size here
      const baseScale = useMergeScale
        ? Symbols.MERGE_EXPLOSION_VFX_SCALE
        : Symbols.EXPLOSION_VFX_SCALE;
      const scale = baseScale * 0.95;
      vfx.setScale(scale, scale);
    } catch { }
    try {
      // Ensure explosion is in front of Symbol0
      vfx.setDepth?.(DEPTH_WINNING_SYMBOL + 1000);
    } catch { }

    const destroyVfx = () => {
      try {
        if (vfx && !vfx.destroyed) vfx.destroy();
      } catch { }
      if (explosionTracked) {
        explosionTracked = false;
        this.explosionVfxInProgress = Math.max(0, this.explosionVfxInProgress - 1);
      }
    };

    try {
      const holdMs = typeof minDurationMs === 'number' && isFinite(minDurationMs)
        ? Math.max(0, minDurationMs)
        : 1200;
      const startTime = (this.scene.time as any)?.now ?? Date.now();
      const animState = vfx.animationState;
      if (animState && typeof animState.setAnimation === 'function') {
        if (animState.clearTracks) animState.clearTracks();
        if (animState.addListener) {
          const listener = {
            complete: (entry: any) => {
              try {
                if (entry?.animation?.name !== 'BZ_Explosion') return;
              } catch { }
              try { animState.removeListener?.(listener); } catch { }
              const elapsed = ((this.scene.time as any)?.now ?? Date.now()) - startTime;
              const remaining = Math.max(0, holdMs - elapsed);
              if (remaining === 0) {
                destroyVfx();
              } else {
                this.scene.time.delayedCall(remaining, destroyVfx);
              }
            }
          };
          animState.addListener(listener);
        }
        animState.setAnimation(0, 'BZ_Explosion', false);
        if (useMergeScale) {
          try {
            const am = (window as any)?.audioManager;
            if (am && typeof am.playSoundEffect === 'function') {
              am.playSoundEffect(SoundEffectType.TUMBLE_BOMB);
            }
          } catch { }
        }
      }
    } catch { }

    const fallbackMs = typeof minDurationMs === 'number' && isFinite(minDurationMs)
      ? Math.max(0, minDurationMs)
      : 1200;
    this.scene.time.delayedCall(fallbackMs, destroyVfx);
  }

  /**
   * Restore Symbol7_PC (and similar) draw order from the asset: slots are defined in JSON as
   * [BoxTB2, Symbol7E1, Symbol7E2, Symbol7, BoxTB1, Top] so the hotdog sits between box parts.
   * We do not override draw order; the skeleton's default order and the win animation's drawOrder
   * timeline are used as exported. Call after clearTracks so setup pose order is applied.
   */
  private setSymbolWinDrawOrderSymbolInsideBox(spineObj: any): void {
    try {
      const sk = spineObj?.skeleton;
      const slots = sk?.slots;
      const order = sk?.drawOrder;
      if (!slots || !order || !Array.isArray(slots) || !Array.isArray(order) || slots.length === 0) return;
      // Restore asset order: drawOrder = copy of slots in default order (BoxTB2, symbol parts, BoxTB1, Top)
      order.length = 0;
      for (let i = 0; i < slots.length; i++) order.push(slots[i]);
    } catch { /* ignore */ }
  }

  private playPreExplosionPulse(target: any, onComplete: () => void): void {
    try {
      if (!this.scene || !target) {
        onComplete();
        return;
      }
      const baseX = (target as any)?.scaleX;
      const baseY = (target as any)?.scaleY;
      const safeBaseX = (typeof baseX === 'number' && isFinite(baseX)) ? baseX : 1;
      const safeBaseY = (typeof baseY === 'number' && isFinite(baseY)) ? baseY : 1;
      const shrinkFactor = 0.85;
      const shrinkDuration = 90;
      const restoreDuration = 110;

      try { this.scene.tweens.killTweensOf(target); } catch { }
      this.scene.tweens.add({
        targets: target,
        scaleX: safeBaseX * shrinkFactor,
        scaleY: safeBaseY * shrinkFactor,
        duration: shrinkDuration,
        ease: Phaser.Math.Easing.Cubic.Out,
        onComplete: () => {
          this.scene.tweens.add({
            targets: target,
            scaleX: safeBaseX,
            scaleY: safeBaseY,
            duration: restoreDuration,
            ease: Phaser.Math.Easing.Cubic.Out,
            onComplete: () => onComplete(),
          });
        }
      });
    } catch {
      try { onComplete(); } catch { }
    }
  }

  /**
   * Get tween targets for a symbol (includes overlay if present)
   */
  private getSymbolTweenTargets(baseObj: any): any {
    try {
      const overlayObj: any = (baseObj as any)?.__overlayImage;
      if (overlayObj) return [baseObj, overlayObj];
    } catch { }
    return baseObj;
  }

  private getSymbolWorldPosition(baseObj: any): { x: number; y: number } | null {
    if (!baseObj) return null;
    let x: number | null = null;
    let y: number | null = null;
    try {
      const matrix = baseObj.getWorldTransformMatrix?.();
      if (matrix && typeof matrix.tx === 'number' && typeof matrix.ty === 'number') {
        x = matrix.tx;
        y = matrix.ty;
      }
    } catch { }
    if (x === null || y === null) {
      const localX = (baseObj as any)?.x;
      const localY = (baseObj as any)?.y;
      if (typeof localX === 'number' && typeof localY === 'number') {
        x = localX;
        y = localY;
      }
    }
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return { x, y };
  }

  private async waitForAnimationsAndTumblesToFinish(maxWaitMs: number = 6000): Promise<void> {
    if (!this.scene) return;
    const isBusy = () =>
      this.scatterRetriggerAnimationInProgress ||
      this.tumbleInProgress ||
      this.reelDropInProgress ||
      this.tumbleDropInProgress ||
      this.explosionVfxInProgress > 0;

    if (!isBusy()) return;

    await new Promise<void>((resolve) => {
      const start = (this.scene.time as any)?.now ?? Date.now();
      const poll = () => {
        const now = (this.scene.time as any)?.now ?? Date.now();
        if (now - start >= maxWaitMs) {
          console.warn('[Symbols] waitForAnimationsAndTumblesToFinish timed out - continuing');
          resolve();
          return;
        }
        if (!isBusy()) {
          resolve();
          return;
        }
        this.scene.time.delayedCall(100, poll);
      };
      poll();
    });
  }

  private async waitForWinDialogsToFinish(maxWaitMs: number = 8000): Promise<void> {
    if (!this.scene) return;
    const gameSceneAny: any = this.scene as any;
    const dialogs = gameSceneAny?.dialogs;
    const isDialogShowing = () =>
      !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing()) ||
      !!gameStateManager.isShowingWinDialog;

    if (!isDialogShowing()) return;

    await new Promise<void>((resolve) => {
      const start = (this.scene.time as any)?.now ?? Date.now();
      const poll = () => {
        const now = (this.scene.time as any)?.now ?? Date.now();
        if (now - start >= maxWaitMs) {
          console.warn('[Symbols] waitForWinDialogsToFinish timed out - continuing');
          resolve();
          return;
        }
        if (!isDialogShowing()) {
          resolve();
          return;
        }
        this.scene.time.delayedCall(100, poll);
      };
      poll();
    });
  }


  /**
   * Destroy overlay image associated with a symbol
   */
  private destroySymbolOverlays(baseObj: any): void {
    try {
      const overlayObj: any = (baseObj as any)?.__overlayImage;
      if (overlayObj && overlayObj.destroy && !overlayObj.destroyed) overlayObj.destroy();
    } catch { }
    try {
      const winTextObj: any = (baseObj as any)?.__winText;
      // Detach from symbol so later cleanup doesn't double-handle it; let its tween onComplete destroy it
      if (winTextObj) { (baseObj as any).__winText = null; }
    } catch { }
    try {
      const winBorder: any = (baseObj as any)?.__winBorder;
      if (winBorder && winBorder.destroy && !winBorder.destroyed) {
        winBorder.destroy();
        (baseObj as any).__winBorder = null;
      }
    } catch { }
  }

  /**
   * Clear a symbol from the grid: destroy overlays, destroy object, null out cell and symbol data.
   * Safe to call multiple times (no-op if already cleared).
   */
  private clearSymbolCell(obj: any, col: number, row: number): void {
    try { this.destroySymbolOverlays(obj); } catch { }
    try { if (obj && typeof obj.destroy === 'function' && !obj.destroyed) obj.destroy(); } catch { }
    try {
      if (this.symbols[col]) this.symbols[col][row] = null as any;
      if (this.currentSymbolData && this.currentSymbolData[row]) (this.currentSymbolData[row] as any)[col] = null;
    } catch { }
  }
}

