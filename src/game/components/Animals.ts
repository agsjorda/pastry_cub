import { Scene } from "phaser";
import { HEADER_CONFIG } from "../../config/GameConfig";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import { startAnimation } from "../../utils/SpineAnimationHelper";
import { ICharacterLike } from "./ICharacterLike";

type AnimalSpine = any;

export class Animals implements ICharacterLike {
	private static readonly MAX_ANIMAL_STEP_MS = 50;
	private static readonly MASK_RIGHT_INSET_PX = 55;

	private readonly scene: Scene;
	private readonly container: Phaser.GameObjects.Container;
	private readonly getFrameImage: () => Phaser.GameObjects.Image | undefined;
	private readonly spineKey: string;
	private readonly retryDelayMs: number;
	private readonly depth: number;
	private animalsViewportContainer?: Phaser.GameObjects.Container;

	/** All pooled spines (created once, reused). */
	private allSpines: AnimalSpine[] = [];
	/** Spines currently on the conveyor (moving right). */
	private activeSpines: AnimalSpine[] = [];
	private animalsLaneY: number = 0;
	private animalsLaneLeftX: number = 0;
	private animalsLaneRightX: number = 0;
	private animalsMoveSpeed: number = 0;
	private animalsSpawnGap: number = 0;
	private animalsVisibleCount: number = 0;
	private animalsMoving: boolean = false;
	private frozenMovementLaneLeftX: number | null = null;
	private frozenMovementLaneRightX: number | null = null;
	private frozenMovementLaneY: number | null = null;
	private frozenMovementSpawnGap: number | null = null;
	private frozenMovementSpeed: number | null = null;
	private frozenMovementScale: number | null = null;
	private frozenMovementFrameRect: Phaser.Geom.Rectangle | null = null;
	private frozenMovementMaskRect: Phaser.Geom.Rectangle | null = null;
	private animalsMaskGraphics?: Phaser.GameObjects.Graphics;
	private animalsMask?: Phaser.Display.Masks.GeometryMask;
	private motionSuspended: boolean = false;
	private visibilityListener?: () => void;
	private blurListener?: () => void;
	private focusListener?: () => void;

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
			this.clearAllSpines();
			this.ensureViewportContainer();
			this.bindActivityListeners();
			this.updateLaneBounds(centerXView);
			this.updateMetrics();
			this.createPool();
			this.spawnInitialVisibleAnimals();

			this.updateMask(centerXView);
		} catch (e) {
			console.warn('[Animals] Failed to create animals spines:', e);
		}
	}

	update(deltaMs: number): void {
		if (!this.animalsMoving || this.activeSpines.length === 0 || this.motionSuspended) return;
		this.ensureAnimalMasksAttached();

		const moveSpeed = this.frozenMovementSpeed ?? this.animalsMoveSpeed;
		const effectiveDeltaMs = Math.min(
			Animals.MAX_ANIMAL_STEP_MS,
			Math.max(0, deltaMs || 16)
		);
		const dx = (moveSpeed * effectiveDeltaMs) / 1000;
		const { left: laneLeftX, right: laneRightX } = this.getMovementLaneBounds();
		const laneY = this.frozenMovementLaneY ?? this.animalsLaneY;
		const spawnGap = this.frozenMovementSpawnGap ?? this.animalsSpawnGap;
		const toReturn: any[] = [];
		let minActiveX = Number.POSITIVE_INFINITY;
		let minAnyX = Number.POSITIVE_INFINITY;

		for (const animal of this.activeSpines) {
			if (!animal) continue;

			animal.setY(laneY);
			animal.setX((animal.x ?? 0) + dx);
			const x = animal.x ?? 0;
			if (x < minAnyX) minAnyX = x;

			if (x >= laneRightX - 60) {
				animal.setVisible(false);
			}

			const width = this.getAnimalRenderedWidth(animal);
			if (x >= laneRightX + width * 0.35) {
				toReturn.push(animal);
				continue;
			}

			if (x < minActiveX) minActiveX = x;
		}

		// Return to pool and spawn new from pool at the left
		let nextRespawnX = Number.isFinite(minActiveX)
			? minActiveX
			: (Number.isFinite(minAnyX) ? Math.min(minAnyX, laneLeftX) : laneLeftX);

		for (const animal of toReturn) {
			this.returnToPool(animal);
			nextRespawnX -= spawnGap;
			this.spawnFromPool(nextRespawnX);
		}
	}

	/** Take a spine from the pool and put it on the conveyor at x. */
	private spawnFromPool(x: number): void {
		const available = this.allSpines.find((s) => !this.activeSpines.includes(s));
		if (!available) return;
		available.setPosition(x, this.frozenMovementLaneY ?? this.animalsLaneY);
		this.assignRandomAnimation(available);
		try {
			if (this.animalsMask && typeof available.setMask === 'function') {
				if (typeof available.clearMask === 'function') {
					available.clearMask(false);
				}
				available.setMask(this.animalsMask);
			}
		} catch {}
		available.setVisible(true);
		this.activeSpines.push(available);
	}

	/** Remove a spine from the conveyor and return it to the pool. */
	private returnToPool(animal: any): void {
		const idx = this.activeSpines.indexOf(animal);
		if (idx >= 0) this.activeSpines.splice(idx, 1);
		animal.setVisible(false);
		try { delete (animal as any).__animalsAssignedAnimation; } catch {}
		animal.setPosition(this.getSpawnStartX() - 500, this.frozenMovementLaneY ?? this.animalsLaneY);
	}

	start(): void {
		if (this.allSpines.length === 0) return;
		// Don't reset layout: keep current animals and positions so the middle ones don't
		// appear replaced. Only the ones that exit right get swapped from the pool.
		const currentFrameRect = this.getFrameRect();
		const spawnStartX = this.getSpawnStartX();
		const laneWidth = Math.max(1, this.animalsLaneRightX - this.animalsLaneLeftX);
		this.frozenMovementLaneLeftX = spawnStartX;
		this.frozenMovementLaneRightX = spawnStartX + laneWidth;
		this.frozenMovementLaneY = this.animalsLaneY;
		this.frozenMovementSpawnGap = this.animalsSpawnGap;
		this.frozenMovementSpeed = this.animalsMoveSpeed;
		this.frozenMovementScale = this.getBaseScale();
		this.frozenMovementFrameRect = currentFrameRect
			? new Phaser.Geom.Rectangle(currentFrameRect.x, currentFrameRect.y, currentFrameRect.width, currentFrameRect.height)
			: null;
		const currentMaskRect = this.getMaskRect();
		this.frozenMovementMaskRect = currentMaskRect
			? new Phaser.Geom.Rectangle(currentMaskRect.x, currentMaskRect.y, currentMaskRect.width, currentMaskRect.height)
			: null;
		this.animalsMoving = true;
	}

	stop(): void {
		this.animalsMoving = false;
		this.clearFrozenMovementLane();
		this.frozenMovementMaskRect = null;
	}

	resize(centerXView?: number): void {
		if (this.allSpines.length === 0) return;
		const previousLaneLeftX = this.animalsLaneLeftX;
		const previousLaneRightX = this.animalsLaneRightX;

		if (this.animalsMoving) {
			this.sanitizeMovingAnimals();
			this.applyFrozenMovementTransform();
			this.updateMask(centerXView);
			this.syncActiveVisibilityToMask(centerXView);
			this.scheduleMaskRefresh(centerXView);
			return;
		}

		this.updateLaneBounds(centerXView);
		this.updateMetrics();

		this.applyBaseScaleAndLaneY();
		this.updateMask(centerXView);
		this.syncActiveVisibilityToMask(centerXView);
		this.scheduleMaskRefresh(centerXView);
		this.repositionIdleAnimals(previousLaneLeftX, previousLaneRightX);
	}

	destroy(): void {
		this.stop();
		this.unbindActivityListeners();
		this.clearMaskFromAnimals();
		this.clearAllSpines();
		try { this.animalsMask?.destroy(); } catch {}
		this.animalsMask = undefined;
		try { this.animalsMaskGraphics?.destroy(); } catch {}
		this.animalsMaskGraphics = undefined;
		try { this.animalsViewportContainer?.destroy(); } catch {}
		this.animalsViewportContainer = undefined;
		this.frozenMovementMaskRect = null;
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
		const assigned = (animal as any)?.__animalsAssignedAnimation;
		if (assigned) {
			startAnimation(animal, {
				animationName: assigned,
				loop: true,
				trackIndex: 0,
				logWhenMissing: true,
				fallbackToFirstAvailable: true
			});
			return;
		}

		const cycle = this.getAnimationCycle();
		const pick = cycle[Math.floor(Math.random() * cycle.length)] ?? cycle[0];
		try { (animal as any).__animalsAssignedAnimation = pick; } catch {}
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
		const frameRect = this.getFrameRect(centerXView);
		const frameX = frameRect ? (frameRect.x + frameRect.width * 0.5) : (viewCenter + HEADER_CONFIG.SCENE_FRAME_OFFSET_X);
		const frameWidth = frameRect ? frameRect.width : this.scene.scale.width * 0.7;
		const frameTopY = frameRect ? frameRect.y : (HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_CONTAINER_OFFSET_Y);
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
		const baseScale = this.getBaseScale();
		const cachedData = this.scene.cache.json.get(this.spineKey) as { skeleton?: { width?: number } } | undefined;
		const skeletonWidth = Number(cachedData?.skeleton?.width ?? 0);
		const rawWidth = Number.isFinite(skeletonWidth) && skeletonWidth > 0 ? skeletonWidth : 200;
		return Math.max(80, rawWidth * baseScale);
	}

	private getAnimalRenderedWidth(animal: any): number {
		return Math.max(80, ((animal.width as number) || 200) * ((animal.scaleX as number) || 1));
	}

	private updateMask(centerXView?: number): void {
		const frameRect = this.animalsMoving && this.frozenMovementMaskRect
			? this.frozenMovementMaskRect
			: this.getMaskRect(centerXView);
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
		this.ensureViewportContainer();
		this.animalsMaskGraphics = this.scene.add.graphics();
		this.animalsMaskGraphics.setVisible(false);
		this.animalsViewportContainer?.add(this.animalsMaskGraphics);
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
		const frameLocalRect = this.getFrameLocalRect(frameImage);
		if (frameLocalRect) {
			return frameLocalRect;
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

		const frameScaleX = Math.max(0.01, HEADER_CONFIG.HEADER_SCENE_CONTAINER_SCALE_X);
		const frameScaleY = Math.max(0.01, HEADER_CONFIG.HEADER_SCENE_CONTAINER_SCALE_Y);
		const baseWidth = Math.max(1, this.scene.scale.width * HEADER_CONFIG.SCENE_FRAME_SCALE);
		const baseHeight = Math.max(1, sourceHeight * (baseWidth / sourceWidth));
		const width = baseWidth * frameScaleX;
		const height = baseHeight * frameScaleY;
		const left = -width * 0.5;
		const top = 0;
		return new Phaser.Geom.Rectangle(left, top, width, height);
	}

	private getMaskRect(centerXView?: number): Phaser.Geom.Rectangle | null {
		const frameRect = this.getFrameRect(centerXView);
		if (!frameRect) return null;
		const width = Math.max(1, frameRect.width - Animals.MASK_RIGHT_INSET_PX);
		return new Phaser.Geom.Rectangle(frameRect.x, frameRect.y, width, frameRect.height);
	}

	private getFrameLocalRect(frameImage?: Phaser.GameObjects.Image): Phaser.Geom.Rectangle | null {
		if (!frameImage) return null;
		try {
			const x = Number(frameImage.x ?? 0);
			const y = Number(frameImage.y ?? 0);
			const width = Number(frameImage.displayWidth ?? 0);
			const height = Number(frameImage.displayHeight ?? 0);
			if (
				Number.isFinite(x) &&
				Number.isFinite(y) &&
				Number.isFinite(width) &&
				Number.isFinite(height) &&
				width > 10 &&
				height > 10
			) {
				return new Phaser.Geom.Rectangle(x - width * 0.5, y, width, height);
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
		const spawnStartX = this.getSpawnStartX();
		if (total <= 1) return (spawnStartX + this.animalsLaneRightX) * 0.5;
		return spawnStartX + (this.animalsLaneRightX - spawnStartX) * ((index + 0.5) / total);
	}

	private repositionIdleAnimals(previousLaneLeftX: number, previousLaneRightX: number): void {
		if (this.activeSpines.length === 0) {
			this.layoutForStart();
			return;
		}

		const oldWidth = Math.max(1, previousLaneRightX - previousLaneLeftX);
		const newWidth = Math.max(1, this.animalsLaneRightX - this.animalsLaneLeftX);

		for (const animal of this.activeSpines) {
			if (!animal) continue;
			const oldX = Number(animal.x ?? previousLaneLeftX);
			const normalizedX = (oldX - previousLaneLeftX) / oldWidth;
			animal.setX(this.animalsLaneLeftX + (newWidth * normalizedX));
			animal.setY(this.animalsLaneY);
			animal.setVisible(true);
		}
	}

	private clearAllSpines(): void {
		for (const animal of this.allSpines) {
			try { animal?.destroy?.(); } catch {}
		}
		this.allSpines = [];
		this.activeSpines = [];
		this.clearFrozenMovementLane();
	}

	private createPool(): void {
		this.ensureViewportContainer();
		const baseScale = this.getBaseScale();
		const poolSize = Math.max(1, HEADER_CONFIG.ANIMALS_POOL_SIZE ?? 10);
		for (let i = 0; i < poolSize; i++) {
			const animal = this.scene.add.spine(
				this.animalsLaneLeftX - 500,
				this.animalsLaneY,
				this.spineKey,
				`${this.spineKey}-atlas`
			);
			animal.setOrigin(0.5, 0.5);
			animal.setScale(baseScale);
			animal.setDepth(this.depth);
			animal.setVisible(false);
			this.animalsViewportContainer?.add(animal);
			this.allSpines.push(animal);
		}
	}

	private spawnInitialVisibleAnimals(): void {
		const count = Math.min(this.animalsVisibleCount, this.allSpines.length);
		for (let i = 0; i < count; i++) {
			this.spawnFromPool(this.getIdleAnimalX(i, count));
		}
	}

	private applyBaseScaleAndLaneY(): void {
		const scale = this.getBaseScale();
		for (const animal of this.allSpines) {
			if (!animal) continue;
			animal.setScale(scale);
			animal.setY(this.animalsLaneY);
		}
	}

	private applyFrozenMovementTransform(): void {
		const scale = this.frozenMovementScale ?? this.getBaseScale();
		const laneY = this.frozenMovementLaneY ?? this.animalsLaneY;
		for (const animal of this.allSpines) {
			if (!animal) continue;
			animal.setScale(scale);
			animal.setY(laneY);
		}
	}

	private clearFrozenMovementLane(): void {
		this.frozenMovementLaneLeftX = null;
		this.frozenMovementLaneRightX = null;
		this.frozenMovementLaneY = null;
		this.frozenMovementSpawnGap = null;
		this.frozenMovementSpeed = null;
		this.frozenMovementScale = null;
		this.frozenMovementFrameRect = null;
	}

	private bindActivityListeners(): void {
		if (typeof document === 'undefined' || typeof window === 'undefined') return;
		if (this.visibilityListener || this.blurListener || this.focusListener) return;

		const handleActivityState = () => {
			let shouldSuspend = false;
			try {
				shouldSuspend = document.visibilityState === 'hidden' || (document as any).hidden;
			} catch {}

			this.motionSuspended = shouldSuspend;

			if (!shouldSuspend) {
				this.refreshAfterVisibilityResume();
			}
		};

		this.visibilityListener = handleActivityState;
		this.blurListener = handleActivityState;
		this.focusListener = handleActivityState;

		document.addEventListener('visibilitychange', this.visibilityListener);
		handleActivityState();
	}

	private unbindActivityListeners(): void {
		if (typeof document !== 'undefined' && this.visibilityListener) {
			document.removeEventListener('visibilitychange', this.visibilityListener);
		}
		this.visibilityListener = undefined;
		this.blurListener = undefined;
		this.focusListener = undefined;
		this.motionSuspended = false;
	}

	private refreshAfterVisibilityResume(): void {
		const centerXView = this.scene.cameras?.main ? this.scene.cameras.main.centerX : this.scene.scale.width * 0.5;
		if (this.animalsMoving) {
			this.sanitizeMovingAnimals();
			this.applyFrozenMovementTransform();
			this.updateMask(centerXView);
			this.syncActiveVisibilityToMask(centerXView);
			this.scheduleMaskRefresh(centerXView);
			return;
		}

		const previousLaneLeftX = this.animalsLaneLeftX;
		const previousLaneRightX = this.animalsLaneRightX;
		this.updateLaneBounds(centerXView);
		this.updateMetrics();
		this.applyBaseScaleAndLaneY();
		this.updateMask(centerXView);
		this.syncActiveVisibilityToMask(centerXView);
		this.scheduleMaskRefresh(centerXView);
		this.repositionIdleAnimals(previousLaneLeftX, previousLaneRightX);
	}

	private sanitizeMovingAnimals(): void {
		if (!this.animalsMoving || this.activeSpines.length === 0) return;

		const { left: laneLeftX, right: laneRightX } = this.getMovementLaneBounds();
		const laneY = this.frozenMovementLaneY ?? this.animalsLaneY;
		const spawnGap = Math.max(1, this.frozenMovementSpawnGap ?? this.animalsSpawnGap);
		const minAllowedX = laneLeftX - spawnGap * Math.max(2, this.animalsVisibleCount + 1);
		const maxAllowedX = laneRightX + spawnGap * 2;

		for (const animal of this.activeSpines) {
			if (!animal) continue;
			const rawX = Number(animal.x ?? minAllowedX);
			const nextX = Number.isFinite(rawX)
				? Math.max(minAllowedX, Math.min(maxAllowedX, rawX))
				: minAllowedX;
			animal.setPosition(nextX, laneY);
		}
	}

	private scheduleMaskRefresh(centerXView?: number): void {
		const refreshDelays = [0, 16, 48, 120];
		for (const delayMs of refreshDelays) {
			try {
				this.scene.time.delayedCall(delayMs, () => {
					if (!this.scene || !this.animalsViewportContainer) return;
					this.updateMask(centerXView);
					this.ensureAnimalMasksAttached();
					this.syncActiveVisibilityToMask(centerXView);
				});
			} catch {}
		}
	}

	private ensureAnimalMasksAttached(): void {
		if (!this.animalsMask) return;
		for (const animal of this.activeSpines) {
			if (!animal || typeof animal.setMask !== 'function') continue;
			try {
				const currentMask = (animal as any).mask ?? null;
				if (currentMask !== this.animalsMask) {
					if (typeof animal.clearMask === 'function') {
						animal.clearMask(false);
					}
					animal.setMask(this.animalsMask);
				}
			} catch {}
		}
	}

	private syncActiveVisibilityToMask(centerXView?: number): void {
		const maskRect = this.animalsMoving && this.frozenMovementMaskRect
			? this.frozenMovementMaskRect
			: this.getMaskRect(centerXView);
		if (!maskRect) return;

		const maskLeft = maskRect.x;
		const maskRight = maskRect.x + maskRect.width;
		for (const animal of this.activeSpines) {
			if (!animal) continue;
			const width = this.getAnimalRenderedWidth(animal);
			const halfWidth = width * 0.5;
			const x = Number(animal.x ?? 0);
			const overlapsMask = (x + halfWidth) > maskLeft && (x - halfWidth) < maskRight;
			animal.setVisible(overlapsMask);
		}
	}

	private getMovementLaneBounds(): { left: number; right: number } {
		return {
			left: this.frozenMovementLaneLeftX ?? this.animalsLaneLeftX,
			right: this.frozenMovementLaneRightX ?? this.animalsLaneRightX
		};
	}

	private getBaseScale(): number {
		return (this.scene.scale.width / 900) * HEADER_CONFIG.SCENE_FRAME_SCALE * HEADER_CONFIG.ANIMALS_SCALE;
	}

	private getSpawnStartX(centerXView?: number): number {
		if (this.animalsMoving && this.frozenMovementLaneLeftX != null) {
			this.updateViewportTransform(centerXView);
			return this.frozenMovementLaneLeftX;
		}

		this.updateViewportTransform(centerXView);
		return this.animalsLaneLeftX;
	}

	private ensureViewportContainer(): void {
		if (this.animalsViewportContainer?.scene) return;
		this.animalsViewportContainer = this.scene.add.container(0, 0);
		this.container.add(this.animalsViewportContainer);
		this.updateViewportTransform();
	}

	private updateViewportTransform(centerXView?: number): void {
		if (!this.animalsViewportContainer) return;
		const rect = (this.animalsMoving && this.frozenMovementFrameRect)
			? this.frozenMovementFrameRect
			: this.getFrameRect(centerXView);
		if (!rect) return;
		this.animalsViewportContainer.setPosition(0, 0);
		this.animalsViewportContainer.setSize(rect.width, rect.height);
	}

}
