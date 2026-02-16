import { Scene } from "phaser";
import { HEADER_CONFIG } from "../../config/GameConfig";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import { getAvailableAnimations, startAnimation } from "../../utils/SpineAnimationHelper";
import { ICharacterLike } from "./ICharacterLike";

export interface JimboyCharacterConfig {
	assetKey: string;
	depth?: number;
	scale?: number;
	preferredAnimations?: string[];
	animationTransforms?: Record<string, { x?: number; y?: number }>;
	basePositionProvider?: (scene: Scene, centerXView?: number) => { x: number; y: number };
	baseScaleProvider?: (scene: Scene) => number;
}

export interface JimboyRandomAnimationOptions {
	loop?: boolean;
	autoRepeat?: boolean;
	minDelayMs?: number;
	maxDelayMs?: number;
	hideBetweenPlays?: boolean;
}

export class JimboyCharacter implements ICharacterLike {
	public static readonly DEFAULT_NORMAL_SCALE: number = 14;
	public static readonly DEFAULT_BONUS_SCALE: number = 8;
	public static readonly DEFAULT_NORMAL_PREFERRED_ANIMATIONS: string[] = ['animation1', 'animation2', 'animation3'];
	public static readonly DEFAULT_BONUS_PREFERRED_ANIMATIONS: string[] = ['animation1', 'animation2', 'animation3', 'animation4'];
	public static readonly DEFAULT_NORMAL_TRANSFORMS: Record<string, { x?: number; y?: number }> = {
		animation1: { x: 0, y: 5 }, // middle
		animation2: { x: 30, y: 5 }, // right
		animation3: { x: -30, y: 5 } // left
	};
	public static readonly DEFAULT_BONUS_TRANSFORMS: Record<string, { x?: number; y?: number }> = {
		animation1: { x: 0, y: -20 }, // right
		animation2: { x: 0, y: -20 }, // left
		animation3: { x: -35, y: 220 }, // top
		animation4: { x: 0, y: -300 } // bottom
	};

	private scene: Scene;
	private spine: any = null;
	private readonly assetKey: string;
	private readonly depth: number;
	private readonly scale: number;
	private readonly preferredAnimations: string[];
	private readonly animationTransforms: Record<string, { x?: number; y?: number }>;
	private readonly basePositionProvider?: (scene: Scene, centerXView?: number) => { x: number; y: number };
	private readonly baseScaleProvider?: (scene: Scene) => number;
	private currentAnimationName: string | null = null;
	private randomPlayTimer: Phaser.Time.TimerEvent | null = null;
	private randomHideTimer: Phaser.Time.TimerEvent | null = null;

	constructor(scene: Scene, config: JimboyCharacterConfig) {
		this.scene = scene;
		this.assetKey = config.assetKey;
		this.depth = config.depth ?? 9502;
		this.scale = config.scale ?? JimboyCharacter.DEFAULT_NORMAL_SCALE;
		this.preferredAnimations = config.preferredAnimations ?? JimboyCharacter.DEFAULT_NORMAL_PREFERRED_ANIMATIONS;
		this.animationTransforms = config.animationTransforms ?? JimboyCharacter.DEFAULT_NORMAL_TRANSFORMS;
		this.basePositionProvider = config.basePositionProvider;
		this.baseScaleProvider = config.baseScaleProvider;
	}

	create(centerXView?: number): boolean {
		if (!ensureSpineFactory(this.scene, `[JimboyCharacter] create(${this.assetKey})`)) {
			return false;
		}
		if (!this.scene.cache.json.has(this.assetKey)) {
			return false;
		}
		this.destroy();
		try {
			const pos = this.getBasePosition(centerXView);
			this.spine = this.scene.add.spine(pos.x, pos.y, this.assetKey, `${this.assetKey}-atlas`);
			this.spine.setOrigin(0.5, 0.5);
			this.spine.setDepth(this.depth);
			this.playRandomAnimation({ autoRepeat: true, loop: false, hideBetweenPlays: false });
			return true;
		} catch (e) {
			console.warn(`[JimboyCharacter] Failed to create ${this.assetKey}:`, e);
			this.spine = null;
			return false;
		}
	}

	playRandomAnimation(options: boolean | JimboyRandomAnimationOptions = { autoRepeat: true, loop: false }): boolean {
		if (!this.spine) return false;
		const normalized = this.normalizeRandomOptions(options);
		if (normalized.autoRepeat) {
			this.startRandomAnimationLoop(normalized);
			return true;
		}
		this.stopRandomAnimationLoop();
		const pick = this.pickRandomAnimationName();
		return this.playAnimation(pick, normalized.loop);
	}

	playAnimation(animationName: string, loop: boolean = true): boolean {
		if (!this.spine) return false;
		this.currentAnimationName = animationName;
		const resolved = startAnimation(this.spine, {
			animationName,
			loop,
			trackIndex: 0,
			logWhenMissing: true,
			fallbackToFirstAvailable: true
		});
		this.applyTransform();
		return !!resolved;
	}

	resize(centerXView?: number): void {
		this.applyTransform(centerXView);
	}

	setVisible(visible: boolean): void {
		try { this.spine?.setVisible?.(visible); } catch {}
	}

	registerDebugHelper(globalName: string = 'playJimboyAnimation'): void {
		try {
			const win = window as any;
			win[globalName] = (animationName: string, loop: boolean = true) =>
				this.playAnimation(animationName, loop);
		} catch {}
	}

	registerGlobal(globalName: string = 'Jimboy'): void {
		try {
			const win = window as any;
			win[globalName] = this;
		} catch {}
	}

	stopRandomAnimationLoop(): void {
		try { this.randomPlayTimer?.destroy?.(); } catch {}
		try { this.randomHideTimer?.destroy?.(); } catch {}
		this.randomPlayTimer = null;
		this.randomHideTimer = null;
	}

	destroy(): void {
		this.stopRandomAnimationLoop();
		try { this.spine?.destroy?.(); } catch {}
		this.spine = null;
		this.currentAnimationName = null;
	}

	getSpine(): any {
		return this.spine;
	}

	private getBaseScale(): number {
		if (this.baseScaleProvider) {
			return this.baseScaleProvider(this.scene);
		}
		return (this.scene.scale.width / 900) * HEADER_CONFIG.SCENE_FRAME_SCALE * HEADER_CONFIG.ANIMALS_SCALE;
	}

	private getBasePosition(centerXView?: number): { x: number; y: number } {
		if (this.basePositionProvider) {
			return this.basePositionProvider(this.scene, centerXView);
		}
		const viewX = centerXView ?? (this.scene.cameras?.main ? this.scene.cameras.main.centerX : this.scene.scale.width * 0.5);
		return {
			x: viewX + HEADER_CONFIG.SCENE_FRAME_OFFSET_X,
			y: HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.ANIMALS_OFFSET_Y
		};
	}

	private applyTransform(centerXView?: number): void {
		if (!this.spine) return;
		const base = this.getBasePosition(centerXView);
		const baseScale = this.getBaseScale();
		const transform = this.currentAnimationName ? this.animationTransforms[this.currentAnimationName] : undefined;
		const offsetX = transform?.x ?? 0;
		const offsetY = transform?.y ?? 0;
		this.spine.setPosition(base.x + offsetX, base.y + offsetY);
		this.spine.setScale(baseScale * this.scale);
	}

	private normalizeRandomOptions(options: boolean | JimboyRandomAnimationOptions): Required<JimboyRandomAnimationOptions> {
		if (typeof options === 'boolean') {
			return {
				loop: options,
				autoRepeat: false,
				minDelayMs: 10000,
				maxDelayMs: 30000,
				hideBetweenPlays: false
			};
		}
		const min = Math.max(0, Math.floor(options.minDelayMs ?? 10000));
		const max = Math.max(min, Math.floor(options.maxDelayMs ?? 30000));
		return {
			loop: options.loop ?? false,
			autoRepeat: options.autoRepeat ?? false,
			minDelayMs: min,
			maxDelayMs: max,
			hideBetweenPlays: options.hideBetweenPlays ?? true
		};
	}

	private startRandomAnimationLoop(options: Required<JimboyRandomAnimationOptions>): void {
		this.stopRandomAnimationLoop();
		const runCycle = () => {
			if (!this.spine) return;
			try { this.spine.setVisible(true); } catch {}
			const pick = this.pickRandomAnimationName();
			const played = this.playAnimation(pick, false);
			if (!played) return;

			const animDurationMs = this.getCurrentAnimationDurationMs();
			if (options.hideBetweenPlays) {
				this.randomHideTimer = this.scene.time.delayedCall(animDurationMs, () => {
					try { this.spine?.setVisible(false); } catch {}
				});
			}

			const nextDelay = this.getRandomInt(options.minDelayMs, options.maxDelayMs);
			this.randomPlayTimer = this.scene.time.delayedCall(animDurationMs + nextDelay, () => runCycle());
		};
		runCycle();
	}

	private pickRandomAnimationName(): string {
		if (!this.spine) return this.preferredAnimations[0] ?? 'animation1';
		const available = getAvailableAnimations(this.spine);
		const pool = this.preferredAnimations.filter((name) => available.includes(name));
		let pickPool = pool.length > 0 ? pool : this.preferredAnimations;
		if (pickPool.length > 1 && this.currentAnimationName) {
			const filtered = pickPool.filter((name) => name !== this.currentAnimationName);
			if (filtered.length > 0) {
				pickPool = filtered;
			}
		}
		return pickPool[Math.floor(Math.random() * pickPool.length)] ?? pickPool[0] ?? 'animation1';
	}

	private getCurrentAnimationDurationMs(): number {
		const name = this.currentAnimationName;
		if (!this.spine || !name) return 1200;
		try {
			const byFind = this.spine?.skeleton?.data?.findAnimation?.(name)?.duration;
			if (typeof byFind === 'number' && isFinite(byFind) && byFind > 0) {
				return Math.max(200, Math.floor(byFind * 1000));
			}
			const list = this.spine?.skeleton?.data?.animations;
			if (Array.isArray(list)) {
				const hit = list.find((a: any) => String(a?.name ?? '') === name);
				const dur = hit?.duration;
				if (typeof dur === 'number' && isFinite(dur) && dur > 0) {
					return Math.max(200, Math.floor(dur * 1000));
				}
			}
		} catch {}
		return 1200;
	}

	private getRandomInt(min: number, max: number): number {
		if (max <= min) return min;
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
}
