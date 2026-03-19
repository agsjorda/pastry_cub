import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameStateManager } from "../../managers/GameStateManager";
import { gameEventManager, GameEventType } from "../../event/EventManager";
import { ensureSpineFactory } from "../../utils/SpineGuard";
import {
	GRID_CENTER_Y_RATIO,
	GRID_CENTER_Y_OFFSET_PX,
	TIMING_CONFIG,
} from "../../config/GameConfig";
import { startAnimation, stopAnimation } from "../../utils/SpineAnimationHelper";

export class BonusBackground {
	private bonusContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private bonusBg: any = null; // Spine animation object
	private bonusBgCover: Phaser.GameObjects.Image | null = null;
	private scene: Scene | null = null;
	private conveyorSpines: any[] = []; // 7 columns of BG_Conveyor_PC - one behind each reel (same as normal)
	private conveyorScene: Scene | null = null;
	/** Offset (px) for conveyor position. Positive X = right, positive Y = down. */
	public conveyorOffsetX: number = 0;
	public conveyorOffsetY: number = 60;
	/** Vertical scale multiplier for conveyor. < 1 = shorter, 1 = same as width. */
	public conveyorScaleY: number = 0.85;
	/** Horizontal scale multiplier to eliminate gaps. > 1 = overlap. Increase if gaps remain. */
	public conveyorOverlapScaleX: number = 1.15;
	private boundPlayConveyor = () => this.playConveyorAnimation();
	private boundStopConveyor = () => this.stopConveyorAnimation();
	private boundPlayConveyorForColumns = (data?: unknown) => this.playConveyorForColumns((data as { columns?: number[] })?.columns ?? []);
	private boundStopConveyorForColumns = (data?: unknown) => this.stopConveyorForColumns((data as { columns?: number[] })?.columns ?? []);

	// Same layout as normal Background for ControllerNormal_PC (normal-bg-cover)
	private coverHeightPercentOfScene: number = 0.5;
	private coverBottomOffsetPx: number = 0;
	// Same layout as normal: background centered (no offset)
	private bonusBackgroundYOffset: number = 0;
	
	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are loaded centrally through AssetConfig in Preloader
	}

	create(scene: Scene): void {
		
		// Store scene reference
		this.scene = scene;
		
		// Create main container for all bonus background elements
	// Set depth to -1 so it's behind symbols (0-600) and all other game elements
	this.bonusContainer = scene.add.container(0, 0);
	this.bonusContainer.setDepth(-1);
		const assetScale = this.networkManager.getAssetScale();
		

		// Add bonus background elements
		this.createBonusElements(scene, assetScale);
		this.layout(scene);
		
		// Setup bonus mode listener to toggle cover visibility
		this.setupBonusModeListener(scene);
	}

	private createBonusElements(scene: Scene, assetScale: number): void {
		const screenConfig = this.screenModeManager.getScreenConfig();
		
		if (screenConfig.isPortrait) {
			this.createPortraitBonusBackground(scene, assetScale);
		} else {
			this.createLandscapeBonusBackground(scene, assetScale);
		}

		// Create conveyor spines (same as normal Background)
		this.createConveyorSpine(scene, assetScale);
	}

	private createPortraitBonusBackground(scene: Scene, assetScale: number): void {

		// Static bonus background (same as normal: BG-Default / NormalGame.webp)
		if (scene.textures.exists('BG-Default')) {
			this.bonusBg = scene.add.image(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				'BG-Default'
			).setOrigin(0.5, 0.5).setDepth(0);
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			this.bonusBg.setScale(Math.max(scaleX, scaleY));
			this.bonusContainer.add(this.bonusBg);
		}

		// Cover overlay - same layout as normal (ControllerNormal_PC / normal-bg-cover)
		this.bonusBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'normal-bg-cover'
		).setOrigin(0.5, 0).setDepth(850);
		this.bonusBgCover.setVisible(false);
	}

	private createLandscapeBonusBackground(scene: Scene, assetScale: number): void {

		// Static bonus background (same as normal: BG-Default / NormalGame.webp)
		if (scene.textures.exists('BG-Default')) {
			this.bonusBg = scene.add.image(
				scene.scale.width * 0.5,
				scene.scale.height * 0.5,
				'BG-Default'
			).setOrigin(0.5, 0.5).setDepth(0);
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			this.bonusBg.setScale(Math.max(scaleX, scaleY));
			this.bonusContainer.add(this.bonusBg);
		}

		// Cover overlay - same layout as normal (ControllerNormal_PC / normal-bg-cover)
		this.bonusBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'normal-bg-cover'
		).setOrigin(0.5, 0).setDepth(850);
		this.bonusBgCover.setVisible(false);
	}

	private scaleImageToCover(image: Phaser.GameObjects.Image, targetWidth: number, targetHeight: number): void {
		const sourceWidth = image.width;
		const sourceHeight = image.height;
		if (!sourceWidth || !sourceHeight) return;
		const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
		image.setScale(scale);
	}

	private scaleImageToWidth(image: Phaser.GameObjects.Image, targetWidth: number): void {
		const sourceWidth = image.width;
		if (!sourceWidth) return;
		image.setScale(targetWidth / sourceWidth);
	}

	private layout(scene: Scene): void {
		const width = scene.scale.width;
		const height = scene.scale.height;

		if (this.bonusBg) {
			// Apply vertical offset adjustment (see bonusBackgroundYOffset property at top of class)
			const yPosition = (height * 0.5) + this.bonusBackgroundYOffset;
			this.bonusBg.setPosition(width * 0.5, yPosition);
			// Scale spine animation to cover screen
			try {
				const scaleX = width / (this.bonusBg.width || 1);
				const scaleY = height / (this.bonusBg.height || 1);
				const scale = Math.max(scaleX, scaleY);
				this.bonusBg.setScale(scale);
			} catch (e) {
				console.warn('[BonusBackground] Failed to scale bonus bg:', e);
			}
		}

		if (this.bonusBgCover) {
			// Same layout as normal Background (ControllerNormal_PC)
			const pct = Phaser.Math.Clamp(this.coverHeightPercentOfScene, 0, 1);
			const scaleX = this.bonusBgCover.width ? (width / this.bonusBgCover.width * 1.2) : 1;
			const scaleY = this.bonusBgCover.height ? ((height * pct) / this.bonusBgCover.height * 1.15) : 1;
			this.bonusBgCover.setScale(scaleX, scaleY);
			const coverHalfHeight = this.bonusBgCover.displayHeight * 1;
			const y = height - coverHalfHeight - this.coverBottomOffsetPx;
			this.bonusBgCover.setPosition(width * 0.5, y * 1.56);
		}

		// Layout conveyor spines (same as normal Background)
		if (this.conveyorSpines.length > 0) {
			const conveyorRefWidth = 56;
			const conveyorWidth = width / 7;
			const conveyorScaleX = (conveyorWidth / conveyorRefWidth) * this.conveyorOverlapScaleX;
			const conveyorScaleY = conveyorScaleX * this.conveyorScaleY;
			const slotY = height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX;
			for (let col = 0; col < this.conveyorSpines.length; col++) {
				const spine = this.conveyorSpines[col];
				if (!spine) continue;
				const colCenterX = (col + 0.5) * conveyorWidth + this.conveyorOffsetX;
				spine.setPosition(colCenterX, slotY + this.conveyorOffsetY);
				spine.setScale(conveyorScaleX, conveyorScaleY);
			}
		}
	}

	resize(scene: Scene): void {
		if (this.bonusContainer) {
			this.bonusContainer.setSize(scene.scale.width, scene.scale.height);
		}
		this.layout(scene);
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bonusContainer;
	}

	destroy(): void {
		for (const spine of this.conveyorSpines) {
			try {
				if (spine && !spine.destroyed && spine.destroy) {
					spine.destroy();
				}
			} catch (e) {
				console.warn('[BonusBackground] Error destroying conveyor Spine:', e);
			}
		}
		this.conveyorSpines = [];
		this.conveyorScene = null;
		if (this.bonusContainer) {
			this.bonusContainer.destroy();
		}
	}

	/**
	 * Setup listener for bonus mode changes to toggle cover and cloud visibility
	 */
	private setupBonusModeListener(scene: Scene): void {
		// Check if normal-bg-cover asset loaded successfully (same as normal game)
		if (!scene.textures.exists('normal-bg-cover')) {
			console.error('[BonusBackground] normal-bg-cover texture not found! Check AssetConfig and file path.');
		}
		
		// Listen for bonus mode events using scene.events (same as Background.ts)
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			
			if (this.bonusBgCover) {
				this.bonusBgCover.setVisible(isBonus);
			}
			
			// Conveyor visible in both normal and bonus game (same as normal Background)
			for (const spine of this.conveyorSpines) {
				if (spine) spine.setVisible(true);
			}

			// Refresh layout when bonus mode changes (ensures conveyors positioned correctly)
			if (isBonus) {
				this.layout(scene);
			}
		});

		// Listen for showBonusBackground to refresh layout (called after dialog closes)
		scene.events.on('showBonusBackground', () => {
			this.layout(scene);
			// Ensure conveyors are visible
			for (const spine of this.conveyorSpines) {
				if (spine) spine.setVisible(true);
			}
		});

		// Set initial visibility based on current bonus state
		const isBonus = gameStateManager.isBonus;
		
		if (this.bonusBgCover) {
			this.bonusBgCover.setVisible(isBonus);
		}
		
		// Conveyor visible in both normal and bonus game (same as normal Background)
		for (const spine of this.conveyorSpines) {
			if (spine) spine.setVisible(true);
		}
	}

	/**
	 * Create 7 BG_Conveyor_PC spines - one behind each reel column (same as normal Background)
	 */
	private createConveyorSpine(scene: Scene, assetScale: number): void {
		try {
			if (!ensureSpineFactory(scene, '[BonusBackground] createConveyorSpine')) {
				scene.time.delayedCall(250, () => this.createConveyorSpine(scene, assetScale));
				return;
			}
			if (!scene.cache.json.has('BG_Conveyor_PC')) {
				scene.time.delayedCall(500, () => this.createConveyorSpine(scene, assetScale));
				return;
			}

			const width = scene.scale.width;
			const height = scene.scale.height;
			const conveyorRefWidth = 56;
			const conveyorWidth = scene.scale.width / 7;
			const scaleX = (conveyorWidth / conveyorRefWidth) * this.conveyorOverlapScaleX;
			const scaleY = scaleX * this.conveyorScaleY;
			const slotY = height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX;

			for (let col = 0; col < 7; col++) {
				const colCenterX = (col + 0.5) * conveyorWidth + this.conveyorOffsetX;
				const spine = scene.add.spine(
					colCenterX,
					slotY + this.conveyorOffsetY,
					'BG_Conveyor_PC',
					'BG_Conveyor_PC-atlas'
				);
				spine.setOrigin(0.5, 0.5);
				spine.setScale(scaleX, scaleY);
				spine.setDepth(5);
				this.bonusContainer.add(spine);
				this.conveyorSpines.push(spine);
			}

			this.conveyorScene = scene;
			this.setupConveyorSpinListeners(scene);
			scene.time.delayedCall(50, () => this.layout(scene));
		} catch (error) {
			console.error('[BonusBackground] Error creating BG_Conveyor_PC:', error);
			this.conveyorSpines = [];
		}
	}

	private setupConveyorSpinListeners(scene: Scene): void {
		gameEventManager.on(GameEventType.REELS_START, this.boundPlayConveyor);
		gameEventManager.on(GameEventType.REELS_STOP, this.boundStopConveyor);
		gameEventManager.on(GameEventType.TUMBLE_COLUMNS_START, this.boundPlayConveyorForColumns);
		gameEventManager.on(GameEventType.TUMBLE_COLUMNS_DONE, this.boundStopConveyorForColumns);
		scene.events.once('shutdown', () => {
			gameEventManager.off(GameEventType.REELS_START, this.boundPlayConveyor);
			gameEventManager.off(GameEventType.REELS_STOP, this.boundStopConveyor);
			gameEventManager.off(GameEventType.TUMBLE_COLUMNS_START, this.boundPlayConveyorForColumns);
			gameEventManager.off(GameEventType.TUMBLE_COLUMNS_DONE, this.boundStopConveyorForColumns);
		});
	}

	private playConveyorAnimation(): void {
		this.playConveyorForColumns([...Array(this.conveyorSpines.length).keys()]);
	}

	private playConveyorForColumns(columns: number[]): void {
		const staggerMs = gameStateManager.isTurbo ? 0 : TIMING_CONFIG.SYMBOL_STAGGER_MS;
		const colSet = new Set(columns);
		for (let col = 0; col < this.conveyorSpines.length; col++) {
			if (!colSet.has(col)) continue;
			const spine = this.conveyorSpines[col];
			if (!spine?.visible) continue;
			const delayMs = staggerMs * col;
			const startOne = () => {
				startAnimation(spine, 'animation');
			};
			if (delayMs <= 0) {
				startOne();
			} else if (this.conveyorScene) {
				this.conveyorScene.time.delayedCall(delayMs, startOne);
			}
		}
	}

	private stopConveyorAnimation(): void {
		this.stopConveyorForColumns([...Array(this.conveyorSpines.length).keys()]);
	}

	private stopConveyorForColumns(columns: number[]): void {
		const colSet = new Set(columns);
		for (let col = 0; col < this.conveyorSpines.length; col++) {
			if (!colSet.has(col)) continue;
			const spine = this.conveyorSpines[col];
			if (!spine?.visible) continue;
			stopAnimation(spine);
		}
	}
}
