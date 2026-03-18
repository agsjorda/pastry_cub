import { Scene } from "phaser";
import { HEADER_CONFIG } from "../../config/GameConfig";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import { startAnimation } from "../../utils/SpineAnimationHelper";
import { ICharacterLike } from "./ICharacterLike";

export class Animals implements ICharacterLike {
	private readonly scene: Scene;
	private readonly container: Phaser.GameObjects.Container;
	private readonly getFrameImage: () => Phaser.GameObjects.Image | undefined;
	private readonly spineKey: string;
	private readonly retryDelayMs: number;
	private readonly depth: number;

	/** All pooled spines (created once, reused). */
	private allSpines: any[] = [];
	/** Spines currently on the conveyor (moving right). */
	private activeSpines: any[] = [];
	private animalsLaneY: number = 0;
	private animalsLaneLeftX: number = 0;
	private animalsLaneRightX: number = 0;
	private animalsMoveSpeed: number = 0;
	private animalsSpawnGap: number = 0;
	private animalsVisibleCount: number = 0;
	private animalsMoving: boolean = false;
	private animalsMaskGraphics?: Phaser.GameObjects.Graphics;
	private animalsMask?: Phaser.Display.Masks.GeometryMask;

	constructor(
		scene: Scene,
		container: Phaser.GameObjects.Container,
		getFrameImage: () => Phaser.GameObjects.Image | undefined,
		config?: {
			spineKey?: string;
			depth?: number;
			retryDelayMs?: number;
		}
	) {
		this.scene = scene;
		this.container = container;
		this.getFrameImage = getFrameImage;
		this.spineKey = config?.spineKey ?? 'BG_Animals_PC';
		this.depth = config?.depth ?? 1;
		this.retryDelayMs = config?.retryDelayMs ?? 300;
	}

	create(centerXView?: number): void {
		if (!ensureSpineFactory(this.scene, `[Animals] create(${this.spineKey})`) || !this.scene.cache.json.has(this.spineKey)) {
			this.scene.time.delayedCall(this.retryDelayMs, () => this.create(centerXView));
			return;
		}

		try {
			for (const animal of this.allSpines) {
				try { animal?.destroy?.(); } catch {}
			}
			this.allSpines = [];
			this.activeSpines = [];

			this.updateLaneBounds(centerXView);
			this.updateMetrics();

			const baseScale = (this.scene.scale.width / 900) * HEADER_CONFIG.SCENE_FRAME_SCALE * HEADER_CONFIG.ANIMALS_SCALE;
			const poolSize = Math.max(1, HEADER_CONFIG.ANIMALS_POOL_SIZE ?? 10);

			// Create pool: all spines off-screen, invisible, ready to be taken
			for (let i = 0; i < poolSize; i++) {
				const animal = this.scene.add.spine(this.animalsLaneLeftX - 500, this.animalsLaneY, this.spineKey, `${this.spineKey}-atlas`);
				animal.setOrigin(0.5, 0.5);
				animal.setScale(baseScale);
				animal.setDepth(this.depth);
				animal.setVisible(false);
				this.container.add(animal);
				this.allSpines.push(animal);
			}

			// Spawn initial visible count (at least MIN_VISIBLE, up to what fits the lane)
			const toSpawn = Math.min(this.animalsVisibleCount, this.allSpines.length);
			for (let i = 0; i < toSpawn; i++) {
				this.spawnFromPool(this.getIdleAnimalX(i, toSpawn));
			}

			this.updateMask(centerXView);
		} catch (e) {
			console.warn('[Animals] Failed to create animals spines:', e);
		}
	}

	update(deltaMs: number): void {
		if (!this.animalsMoving || this.activeSpines.length === 0) return;

		const dx = (this.animalsMoveSpeed * Math.max(0, deltaMs || 16)) / 1000;
		const toReturn: any[] = [];
		let minActiveX = Number.POSITIVE_INFINITY;
		let minAnyX = Number.POSITIVE_INFINITY;

		for (const animal of this.activeSpines) {
			if (!animal) continue;

			animal.setY(this.animalsLaneY);
			animal.setX((animal.x ?? 0) + dx);
			const x = animal.x ?? 0;
			if (x < minAnyX) minAnyX = x;

			if (x >= this.animalsLaneRightX - 60) {
				animal.setVisible(false);
			}

			const width = this.getAnimalRenderedWidth(animal);
			if (x >= this.animalsLaneRightX + width * 0.35) {
				toReturn.push(animal);
				continue;
			}

			if (x < minActiveX) minActiveX = x;
		}

		// Return to pool and spawn new from pool at the left
		let nextRespawnX = Number.isFinite(minActiveX)
			? minActiveX
			: (Number.isFinite(minAnyX) ? Math.min(minAnyX, this.animalsLaneLeftX) : this.animalsLaneLeftX);

		for (const animal of toReturn) {
			this.returnToPool(animal);
			nextRespawnX -= this.animalsSpawnGap;
			this.spawnFromPool(nextRespawnX);
		}
	}

	/** Take a spine from the pool and put it on the conveyor at x. */
	private spawnFromPool(x: number): void {
		const available = this.allSpines.find((s) => !this.activeSpines.includes(s));
		if (!available) return;
		available.setPosition(x, this.animalsLaneY);
		this.assignRandomAnimation(available);
		available.setVisible(true);
		this.activeSpines.push(available);
	}

	/** Remove a spine from the conveyor and return it to the pool. */
	private returnToPool(animal: any): void {
		const idx = this.activeSpines.indexOf(animal);
		if (idx >= 0) this.activeSpines.splice(idx, 1);
		animal.setVisible(false);
		animal.setPosition(this.animalsLaneLeftX - 500, this.animalsLaneY);
	}

	start(): void {
		if (this.allSpines.length === 0) return;
		// Don't reset layout: keep current animals and positions so the middle ones don't
		// appear replaced. Only the ones that exit right get swapped from the pool.
		this.animalsMoving = true;
	}

	stop(): void {
		this.animalsMoving = false;
	}

	resize(centerXView?: number): void {
		if (this.allSpines.length === 0) return;

		this.updateLaneBounds(centerXView);
		this.updateMetrics();

		const scale = (this.scene.scale.width / 900) * HEADER_CONFIG.SCENE_FRAME_SCALE * HEADER_CONFIG.ANIMALS_SCALE;
		for (const animal of this.allSpines) {
			if (!animal) continue;
			animal.setScale(scale);
			animal.setY(this.animalsLaneY);
		}
		this.updateMask(centerXView);

		if (!this.animalsMoving) {
			this.layoutForStart();
		}
	}

	destroy(): void {
		this.stop();
		this.clearMaskFromAnimals();
		for (const animal of this.allSpines) {
			try { animal?.destroy?.(); } catch {}
		}
		this.allSpines = [];
		this.activeSpines = [];
		try { this.animalsMask?.destroy(); } catch {}
		this.animalsMask = undefined;
		try { this.animalsMaskGraphics?.destroy(); } catch {}
		this.animalsMaskGraphics = undefined;
	}

	private getAnimationCycle(): string[] {
		const seed = [HEADER_CONFIG.ANIMALS_LEFT_ANIMATION, HEADER_CONFIG.ANIMALS_RIGHT_ANIMATION];
		const extras = ['Bear', 'Elephant', 'Giraffe', 'Gorri', 'Tiger', 'Hippo', 'Wolf'];
		const out: string[] = [];
		for (const name of [...seed, ...extras]) {
			if (!name || out.includes(name)) continue;
			out.push(name);
		}
		return out.length > 0 ? out : ['Bear'];
	}

	private assignRandomAnimation(animal: any): void {
		const cycle = this.getAnimationCycle();
		const pick = cycle[Math.floor(Math.random() * cycle.length)] ?? cycle[0];
		startAnimation(animal, {
			animationName: pick,
			loop: true,
			trackIndex: 0,
			logWhenMissing: true,
			fallbackToFirstAvailable: true
		});
	}

	private updateLaneBounds(centerXView?: number): void {
		const viewCenter = centerXView ?? (this.scene.cameras?.main ? this.scene.cameras.main.centerX : this.scene.scale.width * 0.5);
		const frameImage = this.getFrameImage();
		const frameBounds = this.getFrameBounds(frameImage);
		const frameX = frameBounds ? (frameBounds.x + frameBounds.width * 0.5) : (viewCenter + HEADER_CONFIG.SCENE_FRAME_OFFSET_X);
		const frameWidth = frameBounds ? frameBounds.width : this.scene.scale.width * 0.7;
		const frameTopY = frameBounds ? frameBounds.y : HEADER_CONFIG.SCENE_FRAME_OFFSET_Y;
		const inset = Math.max(8, frameWidth * 0.02);

		this.animalsLaneLeftX = frameX - frameWidth * 0.5 + inset;
		this.animalsLaneRightX = frameX + frameWidth * 0.5 - inset;
		this.animalsLaneY = frameTopY + HEADER_CONFIG.ANIMALS_OFFSET_Y;
	}

	private updateMetrics(): void {
		const laneWidth = Math.max(120, this.animalsLaneRightX - this.animalsLaneLeftX);
		const estimatedAnimalWidth = this.getEstimatedAnimalWidth();
		const minSpacing = Math.max(
			70,
			this.scene.scale.width * 0.08,
			estimatedAnimalWidth * 1.05
		);
		const minVisible = Math.max(1, HEADER_CONFIG.ANIMALS_MIN_VISIBLE ?? 3);
		this.animalsVisibleCount = Math.max(minVisible, Math.floor(laneWidth / minSpacing));
		this.animalsSpawnGap = laneWidth / this.animalsVisibleCount;
		this.animalsMoveSpeed = Math.max(80, this.animalsSpawnGap * 2.2);
	}

	private getEstimatedAnimalWidth(): number {
		const baseScale = (this.scene.scale.width / 900) * HEADER_CONFIG.SCENE_FRAME_SCALE * HEADER_CONFIG.ANIMALS_SCALE;
		const cachedData = this.scene.cache.json.get(this.spineKey) as { skeleton?: { width?: number } } | undefined;
		const skeletonWidth = Number(cachedData?.skeleton?.width ?? 0);
		const rawWidth = Number.isFinite(skeletonWidth) && skeletonWidth > 0 ? skeletonWidth : 200;
		return Math.max(80, rawWidth * baseScale);
	}

	private getMeasuredAnimalWidth(): number {
		let maxWidth = 0;
		for (const animal of this.allSpines) {
			if (!animal) continue;
			maxWidth = Math.max(maxWidth, this.getAnimalRenderedWidth(animal));
		}
		return maxWidth;
	}

	private getAnimalRenderedWidth(animal: any): number {
		return Math.max(80, ((animal.width as number) || 200) * ((animal.scaleX as number) || 1));
	}

	private updateMask(centerXView?: number): void {
		const frameRect = this.getFrameRect(centerXView);
		if (!frameRect) {
			this.clearMaskFromAnimals();
			return;
		}

		this.ensureMaskGraphics();
		if (this.animalsMaskGraphics && this.animalsMask) {
			this.animalsMaskGraphics.clear();
			this.animalsMaskGraphics.fillStyle(0xffffff, 1);
			this.animalsMaskGraphics.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);

			for (const animal of this.allSpines) {
				if (!animal || !animal.setMask) continue;
				animal.setMask(this.animalsMask);
			}
		}
	}

	private ensureMaskGraphics(): void {
		if (this.animalsMaskGraphics && this.animalsMask) return;
		this.animalsMaskGraphics = this.scene.add.graphics();
		this.animalsMaskGraphics.setVisible(false);
		this.container.add(this.animalsMaskGraphics);
		this.animalsMask = this.animalsMaskGraphics.createGeometryMask();
	}

	private clearMaskFromAnimals(): void {
		for (const animal of this.allSpines) {
			if (!animal || !animal.clearMask) continue;
			animal.clearMask(false);
		}
	}

	private getFrameRect(centerXView?: number): Phaser.Geom.Rectangle | null {
		const frameImage = this.getFrameImage();
		const frameBounds = this.getFrameBounds(frameImage);
		if (frameBounds) {
			return new Phaser.Geom.Rectangle(frameBounds.x, frameBounds.y, frameBounds.width, frameBounds.height);
		}

		if (!this.scene.textures.exists('Header_SceneFrame')) {
			return null;
		}

		const source = this.scene.textures.get('Header_SceneFrame').getSourceImage() as { width?: number; height?: number };
		const sourceWidth = Number(source?.width ?? 0);
		const sourceHeight = Number(source?.height ?? 0);
		if (sourceWidth <= 0 || sourceHeight <= 0) {
			return null;
		}

		const viewCenter = centerXView ?? (this.scene.cameras?.main ? this.scene.cameras.main.centerX : this.scene.scale.width * 0.5);
		const scale = 1;
		const width = sourceWidth * scale;
		const height = sourceHeight * scale;
		const left = viewCenter + HEADER_CONFIG.SCENE_FRAME_OFFSET_X - width * 0.5;
		return new Phaser.Geom.Rectangle(left, HEADER_CONFIG.SCENE_FRAME_OFFSET_Y, width, height);
	}

	private getFrameBounds(frameImage?: Phaser.GameObjects.Image): Phaser.Geom.Rectangle | null {
		if (!frameImage) return null;
		try {
			const b = frameImage.getBounds();
			const x = Number(b?.x ?? 0);
			const y = Number(b?.y ?? 0);
			const width = Math.max(1, Number(b?.width ?? 0));
			const height = Math.max(1, Number(b?.height ?? 0));
			if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)) {
				return new Phaser.Geom.Rectangle(x, y, width, height);
			}
		} catch {}
		return null;
	}

	private layoutForStart(): void {
		// Return all active to pool, then spawn visibleCount from pool at start positions
		for (const animal of [...this.activeSpines]) {
			this.returnToPool(animal);
		}
		const toSpawn = Math.min(this.animalsVisibleCount, this.allSpines.length);
		for (let i = 0; i < toSpawn; i++) {
			this.spawnFromPool(this.getIdleAnimalX(i, toSpawn));
		}
	}

	private getIdleAnimalX(index: number, total: number): number {
		if (total <= 1) return (this.animalsLaneLeftX + this.animalsLaneRightX) * 0.5;
		return this.animalsLaneLeftX + (this.animalsLaneRightX - this.animalsLaneLeftX) * ((index + 0.5) / total);
	}
}
