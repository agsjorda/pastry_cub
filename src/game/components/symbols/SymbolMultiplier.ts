/**
 * SymbolMultiplier - Bonus multiplier markers on the symbol grid
 *
 * Shows per-cell multiplier badges (x1, x2, x4, ... x128) when cells are part of
 * a sugar win during Free Spins. First hit = x1, each subsequent hit doubles up to x128.
 */

import type { Game } from '../../scenes/Game';
import { SLOT_COLUMNS, SLOT_ROWS } from '../../../config/GameConfig';
import { DEPTH_WINNING_SYMBOL } from '../../../config/GameConfig';

export interface SymbolMultiplierLayout {
  displayWidth: number;
  displayHeight: number;
  slotX: number;
  slotY: number;
  totalGridWidth: number;
  totalGridHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  numCols: number;
  numRows: number;
}

/**
 * Manages bonus multiplier cell markers (x1, x2, x4, ... x128) on the symbol grid.
 */
export class SymbolMultiplier {
  private scene: Game | null = null;
  private layout: SymbolMultiplierLayout | null = null;
  private values: number[][] = [];
  private overlays: (Phaser.GameObjects.GameObject | null)[][] = [];

  constructor(scene: Game) {
    this.scene = scene;
    this.ensureState();
  }

  /**
   * Set grid layout for positioning markers. Call when grid is ready or layout changes.
   */
  public setLayout(layout: SymbolMultiplierLayout): void {
    this.layout = layout;
    this.ensureState();
  }

  /**
   * Mark a cell as having been part of a sugar win during bonus.
   * First hit = x1, each subsequent hit doubles up to x128.
   */
  public markCell(col: number, row: number): void {
    if (col < 0 || row < 0) return;
    this.ensureState();
    const cols = this.values.length;
    const rows = this.values[0]?.length ?? 0;
    if (col >= cols || row >= rows) return;

    let current = this.values[col][row] || 0;
    if (current <= 0) {
      current = 1;
    } else {
      let next = current * 2;
      if (next > 128) next = 128;
      current = next;
    }

    this.values[col][row] = current;
    try {
      console.log('[SymbolMultiplier] markCell', { col, row, value: current });
    } catch {}
    this.updateOverlay(col, row, current);
  }

  /**
   * Reset all multiplier state and destroy overlay objects. Call at bonus start (once per session) and bonus end.
   */
  public reset(): void {
    for (let c = 0; c < this.values.length; c++) {
      for (let r = 0; r < this.values[c].length; r++) {
        this.values[c][r] = 0;
        const overlay = this.overlays[c]?.[r];
        if (overlay) {
          try {
            overlay.destroy();
          } catch {}
          this.overlays[c][r] = null;
        }
      }
    }
  }

  private ensureState(): void {
    const cols = this.layout?.numCols ?? SLOT_COLUMNS;
    const rows = this.layout?.numRows ?? SLOT_ROWS;

    if (this.values.length !== cols || this.values[0]?.length !== rows) {
      this.values = Array.from({ length: cols }, () => Array<number>(rows).fill(0));
    }
    if (this.overlays.length !== cols || this.overlays[0]?.length !== rows) {
      this.overlays = Array.from(
        { length: cols },
        () => Array<Phaser.GameObjects.GameObject | null>(rows).fill(null)
      );
    }
  }

  private getTextureKey(value: number): string {
    const table: number[] = [1, 2, 4, 8, 16, 32, 64, 128];
    let target = 1;
    for (const v of table) {
      if (value <= v) {
        target = v;
        break;
      }
      target = v;
    }
    return `bonus_multiplier_x${target}`;
  }

  private updateOverlay(col: number, row: number, value: number): void {
    this.ensureState();
    if (!this.scene || !this.layout) return;
    const cols = this.overlays.length;
    const rows = this.overlays[0]?.length ?? 0;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;

    const L = this.layout;
    const symbolTotalWidth = L.displayWidth + L.horizontalSpacing;
    const symbolTotalHeight = L.displayHeight + L.verticalSpacing;
    const startX = L.slotX - L.totalGridWidth * 0.5;
    const startY = L.slotY - L.totalGridHeight * 0.5;
    const x = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
    const y = startY + row * symbolTotalHeight + symbolTotalHeight * 0.5;

    const existing = this.overlays[col][row] as any;

    if (!existing || !existing.scene) {
      const key = this.getTextureKey(value);
      let overlay: Phaser.GameObjects.GameObject | null = null;

      if (key && this.scene.textures?.exists(key)) {
        const img = this.scene.add.image(x, y, key);
        img.setOrigin(0.5, 0.5);
        try {
          img.setDepth(DEPTH_WINNING_SYMBOL + 5);
        } catch {}
        try {
          const desiredWidth = Math.max(3, L.displayWidth * 0.9);
          const texWidth = Math.max(1, img.width);
          img.setScale(desiredWidth / texWidth);
        } catch {}
        overlay = img;
      } else {
        try {
          const txt = this.scene.add.text(x, y, `x${value}`, {
            fontFamily: 'Poppins-Bold',
            fontSize: `${Math.max(18, Math.round(L.displayHeight * 0.35))}px`,
            color: '#ffff00',
            stroke: '#000000',
            strokeThickness: 4,
          } as any);
          txt.setOrigin(0.5, 0.5);
          try {
            txt.setDepth(DEPTH_WINNING_SYMBOL + 5);
          } catch {}
          overlay = txt;
        } catch {}
      }

      if (!overlay) return;
      this.overlays[col][row] = overlay;

      try {
        (overlay as any).setScale?.(0);
        this.scene.tweens.add({
          targets: overlay,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
          ease: 'Back.easeOut',
        });
      } catch {}
    } else {
      existing.setPosition(x, y);
      try {
        const baseSX = (existing as any).scaleX ?? 1;
        const baseSY = (existing as any).scaleY ?? 1;
        this.scene.tweens.add({
          targets: existing,
          scaleX: baseSX * 1.1,
          scaleY: baseSY * 1.1,
          duration: 140,
          yoyo: true,
          ease: 'Sine.easeInOut',
        });
      } catch {}
    }
  }
}
