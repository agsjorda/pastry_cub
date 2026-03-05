import { Scene } from 'phaser';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { startAnimation } from '../../../utils/SpineAnimationHelper';

export type GlowEffectMode = 'normal' | 'bonus';

export interface GlowEffectConfig {
	key?: string;
	x?: number;
	y?: number;
	scale?: number;
	depth?: number;
	visible?: boolean;
	loop?: boolean;
	normalAnimation?: string | string[];
	bonusAnimation?: string | string[];
}

export class GlowEffect {
	public static readonly DEFAULT_KEY = 'Glow_Effect_PC';
	public static readonly DEFAULT_NORMAL_ANIMATION = 'Glow_L';
	public static readonly DEFAULT_BONUS_ANIMATION = 'Glow_R';
	// Shared win-bar glow tuning used by Header and BonusHeader.
	public static readonly WIN_BAR_SCALE = 0.06;
	public static readonly WIN_BAR_DEPTH = 9500;
	public static readonly WIN_BAR_SIDE_INSET_X = 18;
	public static readonly WIN_BAR_OFFSET_X = 1;
	public static readonly WIN_BAR_OFFSET_Y = 105;

	private scene: Scene;
	private spine: any = null;
	private mode: GlowEffectMode = 'normal';
	private readonly config: Required<GlowEffectConfig>;

	constructor(scene: Scene, config: GlowEffectConfig = {}) {
		this.scene = scene;
		this.config = {
			key: config.key ?? GlowEffect.DEFAULT_KEY,
			x: config.x ?? 0,
			y: config.y ?? 0,
			scale: config.scale ?? 1,
			depth: config.depth ?? 9500,
			visible: config.visible ?? true,
			loop: config.loop ?? true,
			normalAnimation: config.normalAnimation ?? GlowEffect.DEFAULT_NORMAL_ANIMATION,
			bonusAnimation: config.bonusAnimation ?? GlowEffect.DEFAULT_BONUS_ANIMATION,
		};
	}

	public create(parentContainer?: Phaser.GameObjects.Container, initialMode: GlowEffectMode = 'normal'): boolean {
		if (!ensureSpineFactory(this.scene, '[GlowEffect] create')) return false;
		if (!this.scene.cache.json.has(this.config.key)) {
			console.warn(`[GlowEffect] JSON not in cache for key: ${this.config.key}`);
			return false;
		}

		this.destroy();

		try {
			this.spine = this.scene.add.spine(
				this.config.x,
				this.config.y,
				this.config.key,
				`${this.config.key}-atlas`
			);
			this.spine.setOrigin(0.5, 0.5);
			this.spine.setScale(this.config.scale);
			this.spine.setDepth(this.config.depth);
			this.spine.setVisible(this.config.visible);

			if (parentContainer) {
				parentContainer.add(this.spine);
			}

			this.setMode(initialMode, true);
			return true;
		} catch (e) {
			console.warn('[GlowEffect] Failed to create spine:', e);
			this.spine = null;
			return false;
		}
	}

	public setMode(mode: GlowEffectMode, forceRestart: boolean = false): boolean {
		if (!this.spine) {
			this.mode = mode;
			return false;
		}
		if (!forceRestart && this.mode === mode) return true;

		this.mode = mode;
		const animationName = this.mode === 'bonus'
			? this.config.bonusAnimation
			: this.config.normalAnimation;

		const started = startAnimation(this.spine, {
			animationName,
			trackIndex: 0,
			loop: this.config.loop,
			fallbackToFirstAvailable: true,
			logWhenMissing: true,
		});

		return !!started;
	}

	public show(): void {
		try { this.spine?.setVisible?.(true); } catch {}
	}

	public hide(): void {
		try { this.spine?.setVisible?.(false); } catch {}
	}

	public setVisible(visible: boolean): void {
		try { this.spine?.setVisible?.(visible); } catch {}
	}

	public setPosition(x: number, y: number): void {
		try { this.spine?.setPosition?.(x, y); } catch {}
	}

	public setScale(scale: number): void {
		try { this.spine?.setScale?.(scale); } catch {}
	}

	public setDepth(depth: number): void {
		try { this.spine?.setDepth?.(depth); } catch {}
	}

	public getMode(): GlowEffectMode {
		return this.mode;
	}

	public getSpine(): any {
		return this.spine;
	}

	public destroy(): void {
		try { this.spine?.destroy?.(); } catch {}
		this.spine = null;
	}
}
