import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { gameStateManager } from '../../managers/GameStateManager';
import { CurrencyManager } from './CurrencyManager';
import { HEADER_CONFIG } from '../../config/GameConfig';
import { ensureSpineFactory } from '../../utils/SpineGuard';

export class BonusHeader {
	private bonusHeaderContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private amountText!: Phaser.GameObjects.Text;
	private youWonText!: Phaser.GameObjects.Text;
	private conveyorTopSpine: any = null;
	private currentWinnings: number = 0;
	// Tracks cumulative total during bonus mode by incrementing each spin's subtotal
	private cumulativeBonusWin: number = 0;
	private hasStartedBonusTracking: boolean = false;
		// Seed value from scatter trigger to start cumulative tracking in bonus
	private scatterBaseWin: number = 0;
	// If true, the next bonus spin's total should NOT be added (already seeded).
	private skipNextSpinAccumulation: boolean = false;
	// Track if we've already accumulated this spin's total (prevents double add with WIN_STOP)
	private accumulatedThisSpin: boolean = false;
	private showingTotalWin: boolean = false;
	private scene: Scene | null = null;
	private headerSceneImage?: Phaser.GameObjects.Image;
	private headerSceneFrameImage?: Phaser.GameObjects.Image;
	private headerWinBarImage?: Phaser.GameObjects.Image;
	// Track if we just seeded the win to prevent immediate text overrides
	private justSeededWin: boolean = false;
	// Suppress win bar text while TotalW_BZ dialog is showing
	private suppressWinbarDisplay: boolean = false;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
		console.log(`[BonusHeader] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[BonusHeader] Creating bonus header elements");
		
		// Store scene reference for animations
		this.scene = scene;
		
		// Create main container for all bonus header elements
		this.bonusHeaderContainer = scene.add.container(0, 0).setDepth(9500); // Above controller (900) and background (850)
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[BonusHeader] Creating bonus header with scale: ${assetScale}x`);

		// Add bonus header elements
		this.createBonusHeaderElements(scene, assetScale);
		
		// Set up event listeners for winnings updates (like regular header)
		this.setupWinningsEventListener();

		// Hide win bar text while TotalW_BZ dialog is visible
		this.setupWinbarSuppressionListeners(scene);
		
		// Initialize winnings display - start hidden
		this.initializeWinnings();
	}

	private setupWinbarSuppressionListeners(scene: Scene): void {
		scene.events.on('dialogShown', (dialogType: string) => {
			if (dialogType === 'TotalW_BZ') {
				this.suppressWinbarDisplay = true;
				this.forceHideWinningsDisplay();
				console.log('[BonusHeader] TotalW_BZ shown - suppressing winbar display');
			}
		});
		scene.events.on('hideBonusHeader', () => {
			this.suppressWinbarDisplay = false;
		});
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			if (!isBonus) {
				this.suppressWinbarDisplay = false;
			}
		});
	}

	private createBonusHeaderElements(scene: Scene, assetScale: number): void {
		// Create header images (Scene, WinBar, SceneFrame) - same for portrait and landscape
		this.createHeaderImages(scene);

		const screenConfig = this.screenModeManager.getScreenConfig();
		if (screenConfig.isPortrait) {
			this.createPortraitBonusHeader(scene, assetScale);
		} else {
			this.createLandscapeBonusHeader(scene, assetScale);
		}
	}

	private createHeaderImages(scene: Scene): void {
		const centerX = scene.scale.width * 0.5;
		const centerXView = scene.cameras?.main ? scene.cameras.main.centerX : centerX;

		if (scene.textures.exists('Header_Scene')) {
			const sceneY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_OFFSET_Y;
			this.headerSceneImage = this.createScaledHeaderImage(scene, 'Header_Scene', centerX, sceneY);
			const sceneFrameScale = scene.textures.exists('Header_SceneFrame')
				? (scene.scale.width / scene.textures.get('Header_SceneFrame').getSourceImage().width) * HEADER_CONFIG.SCENE_FRAME_SCALE
				: scene.scale.width / this.headerSceneImage.width;
			this.headerSceneImage.setScale(
				sceneFrameScale * HEADER_CONFIG.HEADER_SCENE_SCALE_X,
				sceneFrameScale * HEADER_CONFIG.HEADER_SCENE_SCALE_Y
			);
			this.bonusHeaderContainer.add(this.headerSceneImage);
		}

		// Conveyor top (same as normal header): at top inside frame, above Header_Scene
		this.createConveyorTopSpine(scene, centerXView);

		if (scene.textures.exists('Header_WinBar')) {
			const frameHeight = this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame');
			const winBarY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + frameHeight + HEADER_CONFIG.WIN_BAR_OFFSET_Y;
			this.headerWinBarImage = this.createScaledHeaderImage(scene, 'Header_WinBar', centerX, winBarY);
			this.headerWinBarImage.setScale((scene.scale.width / this.headerWinBarImage.width) * HEADER_CONFIG.WIN_BAR_SCALE);
			this.bonusHeaderContainer.add(this.headerWinBarImage);
		}
		if (scene.textures.exists('Header_SceneFrame')) {
			this.headerSceneFrameImage = this.createScaledHeaderImage(scene, 'Header_SceneFrame', centerXView, HEADER_CONFIG.SCENE_FRAME_OFFSET_Y);
			this.headerSceneFrameImage.setOrigin(0.5, 0);
			this.headerSceneFrameImage.setScale((scene.scale.width / this.headerSceneFrameImage.width) * HEADER_CONFIG.SCENE_FRAME_SCALE);
			this.headerSceneFrameImage.setPosition(centerXView + HEADER_CONFIG.SCENE_FRAME_OFFSET_X, HEADER_CONFIG.SCENE_FRAME_OFFSET_Y);
			this.headerSceneFrameImage.setDepth(9501);
		}
	}

	private createScaledHeaderImage(scene: Scene, key: string, x: number, y: number): Phaser.GameObjects.Image {
		const img = scene.add.image(x, y, key).setOrigin(0.5, 0);
		const scale = scene.scale.width / img.width;
		img.setScale(scale);
		return img;
	}

	private getHeaderImageDisplayHeight(scene: Scene, key: string): number {
		if (!scene.textures.exists(key)) return 0;
		const texture = scene.textures.get(key).getSourceImage();
		const scale = scene.scale.width / texture.width;
		const scaleMultiplier = key === 'Header_SceneFrame' ? HEADER_CONFIG.SCENE_FRAME_SCALE : 1;
		return texture.height * scale * scaleMultiplier;
	}

	/** Conveyor top spine at the top inside Header_SceneFrame (same as normal header). */
	private createConveyorTopSpine(scene: Scene, centerXView: number): void {
		if (!ensureSpineFactory(scene, '[BonusHeader] createConveyorTopSpine') || !scene.cache.json.has('BG_ConveyorTop_PC')) {
			scene.time.delayedCall(300, () => this.createConveyorTopSpine(scene, centerXView));
			return;
		}
		try {
			const x = centerXView + HEADER_CONFIG.SCENE_FRAME_OFFSET_X;
			const y = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.CONVEYOR_TOP_OFFSET_Y;
			this.conveyorTopSpine = scene.add.spine(x, y, 'BG_ConveyorTop_PC', 'BG_ConveyorTop_PC-atlas');
			this.conveyorTopSpine.setOrigin(0.5, 0);
			const spineRefWidth = 580;
			const scale = (scene.scale.width / spineRefWidth) * HEADER_CONFIG.SCENE_FRAME_SCALE * HEADER_CONFIG.CONVEYOR_TOP_SCALE;
			this.conveyorTopSpine.setScale(scale);
			this.bonusHeaderContainer.add(this.conveyorTopSpine);
		} catch (e) {
			console.warn('[BonusHeader] Failed to create conveyor top spine:', e);
		}
	}

	private playConveyorTopAnimation(): void {
		if (!this.conveyorTopSpine?.animationState) return;
		try {
			const state: any = this.conveyorTopSpine.animationState;
			if (state?.setAnimation) state.setAnimation(0, 'BG_ConveyorTop_PC', true);
		} catch (e) {
			console.warn('[BonusHeader] Failed to play conveyor top animation:', e);
		}
	}

	private stopConveyorTopAnimation(): void {
		if (!this.conveyorTopSpine?.animationState) return;
		try {
			const state: any = this.conveyorTopSpine.animationState;
			if (state?.setEmptyAnimation) state.setEmptyAnimation(0, 0.2);
		} catch (e) {
			console.warn('[BonusHeader] Failed to stop conveyor top animation:', e);
		}
	}

	private createPortraitBonusHeader(scene: Scene, assetScale: number): void {
		console.log("[BonusHeader] Creating portrait bonus header layout");


		// Create winnings text at a stable position (was inside win bar)
		this.createWinBarText(scene, scene.scale.width * 0.5, scene.scale.height * 0.1);
	}

	private createLandscapeBonusHeader(scene: Scene, assetScale: number): void {
		console.log("[BonusHeader] Creating landscape bonus header layout");


		// Create winnings text at a stable position
		this.createWinBarText(scene, scene.scale.width * 0.5, scene.scale.height * 0.18);
	}

	// Depth above RadialLightTransition overlay (20000) so Total win stays visible during candy/radial light
	private static readonly WIN_BAR_DEPTH = 20001;

	private createWinBarText(scene: Scene, x: number, y: number): void {
		// Line 1: "YOU WON"
		this.youWonText = scene.add.text(x, y - 7, 'YOU WON', {
			fontSize: '18px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(BonusHeader.WIN_BAR_DEPTH); // Above radial light overlay (20000)
		// Don't add to container - add directly to scene so depth works correctly

		// Line 2: amount value
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemoInitial = (this.scene as any)?.gameAPI?.getDemoState();
		const prefixInitial = isDemoInitial ? '' : CurrencyManager.getInlinePrefix();
		this.amountText = scene.add.text(x, y + 18, `${prefixInitial}0.00`, {
			fontSize: '24px',
			color: '#00ff00',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(BonusHeader.WIN_BAR_DEPTH); // Above radial light overlay (20000)
		// Don't add to container - add directly to scene so depth works correctly
		
		// Hide by default - only show when bonus is triggered
		this.youWonText.setVisible(false);
		this.amountText.setVisible(false);
	}

	/**
	 * Update the winnings display in the bonus header with scale in animation
	 */
	public updateWinningsDisplay(winnings: number): void {
		if (this.suppressWinbarDisplay) {
			return;
		}
		if (this.amountText && this.youWonText) {
			this.currentWinnings = winnings;
			const formattedWinnings = this.formatCurrency(winnings);
			this.amountText.setText(formattedWinnings);
			
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Show both texts first
			this.youWonText.setVisible(true);
			this.amountText.setVisible(true);
			
			// Check if already visible and scaled
			const isAlreadyVisible = this.youWonText.visible && this.amountText.visible;
			const currentScale = this.youWonText.scaleX;
			const isAlreadyScaled = currentScale > 0.9;
			
			if (isAlreadyVisible && isAlreadyScaled) {
				// Already visible and scaled - do a pulse animation (enlarge then revert)
				if (this.scene) {
					this.scene.tweens.add({
						targets: [this.youWonText, this.amountText],
						scaleX: 1.2,
						scaleY: 1.2,
						duration: 150,
						ease: 'Power2',
						yoyo: true,
						repeat: 0,
						onComplete: () => {
							// Ensure scale is exactly 1 after animation
							this.youWonText.setScale(1);
							this.amountText.setScale(1);
						}
					});
				}
				console.log(`[BonusHeader] Winnings updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
			} else {
				// Not visible or not scaled - do full scale-in animation
				// Set initial scale to 0 for scale-in effect
				this.youWonText.setScale(0);
				this.amountText.setScale(0);
				
				// Animate scale in with bounce effect
				if (this.scene) {
					this.scene.tweens.add({
						targets: [this.youWonText, this.amountText],
						scaleX: 1,
						scaleY: 1,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => {
							// Ensure scale is exactly 1 after animation
							this.youWonText.setScale(1);
							this.amountText.setScale(1);
						}
					});
				}
				
				console.log(`[BonusHeader] Winnings updated with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		}
	}

	/**
	 * Seed the cumulative bonus total with a base amount (e.g., scatter payout)
	 * Only shows the display if bonus mode is already active to avoid race conditions
	 */
	public seedCumulativeWin(baseAmount: number): void {
		this.scatterBaseWin = Math.max(0, Number(baseAmount) || 0);
		this.cumulativeBonusWin = this.scatterBaseWin;
		this.hasStartedBonusTracking = true;
		this.justSeededWin = true; // Flag that we just seeded to prevent immediate text overrides
		this.skipNextSpinAccumulation = false;
		
		// For bonus mode, we only show per-tumble "YOU WON" values.
		// Seed the cumulative tracker silently; UI will be driven by tumble events.
		console.log(`[BonusHeader] Seeded cumulative bonus win with scatter base (tracking only): $${this.scatterBaseWin}`);
	}

	/**
	 * Seed cumulative total from the first free spin item total (buy feature flow).
	 * This shows the first spin's total at the start of free spins and avoids double-adding it later.
	 */
	public seedFromFirstFreeSpinItem(spinData: any): void {
		try {
			const triggerWin = this.calculateTriggerSpinWin(spinData);
			if (triggerWin > 0) {
				this.scatterBaseWin = triggerWin;
				this.cumulativeBonusWin = triggerWin;
				this.hasStartedBonusTracking = true;
				this.justSeededWin = true;
				this.skipNextSpinAccumulation = false;
				console.log(`[BonusHeader] Seeded cumulative from trigger spin win: $${triggerWin}`);
				return;
			}
		} catch { }
	}

	private calculateTriggerSpinWin(spinData: any): number {
		try {
			const slot: any = spinData?.slot;
			if (!slot) return 0;
			let total = 0;
			if (Array.isArray(slot.paylines)) {
				for (const payline of slot.paylines) {
					const win = Number(payline?.win ?? 0);
					total += isNaN(win) ? 0 : win;
				}
			}
			if (Array.isArray(slot.tumbles)) {
				for (const tumble of slot.tumbles) {
					const win = Number(tumble?.win ?? 0);
					total += isNaN(win) ? 0 : win;
				}
			}
			return total;
		} catch {
			return 0;
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

			if (items.length === 1) return items[0];

			// Try to align with Symbols' remaining counter when available
			try {
				const symbolsComponent = (this.bonusHeaderContainer.scene as any)?.symbols;
				const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
				if (typeof rem === 'number') {
					const targetB = items.find((item: any) => Number(item?.spinsLeft) === rem + 1);
					if (targetB) return targetB;
					const targetA = items.find((item: any) => Number(item?.spinsLeft) === rem);
					if (targetA) return targetA;
				}
			} catch { }

			// Fallbacks: highest spinsLeft (earliest spin) or first item
			const withSpinsLeft = items
				.filter((item: any) => typeof item?.spinsLeft === 'number' && item.spinsLeft > 0)
				.sort((a: any, b: any) => b.spinsLeft - a.spinsLeft);
			if (withSpinsLeft.length) return withSpinsLeft[0];

			return items[0];
		} catch {
			return null;
		}
	}

	private calculateBackendTotalWin(spinData: any): number {
		try {
			const slot: any = spinData?.slot;
			if (!slot) return 0;

			// Prefer backend totalWin if provided
			if (typeof slot.totalWin === 'number' && slot.totalWin > 0) {
				return Number(slot.totalWin);
			}

			let totalWin = 0;
			const freespinData = slot.freespin || slot.freeSpin;
			let itemsSum = 0;
			let hasItems = false;

			// Sum wins from freespin items
			if (freespinData?.items && Array.isArray(freespinData.items)) {
				hasItems = true;
				itemsSum = freespinData.items.reduce((sum: number, item: any) => {
					const perSpinTotal =
						(typeof item?.totalWin === 'number' && item.totalWin > 0)
							? item.totalWin
							: (item?.subTotalWin || 0);
					return sum + perSpinTotal;
				}, 0);
				totalWin += itemsSum;
			}

			// As a last resort, include paylines/tumbles if we have no item totals.
			// Avoid double-counting per-spin tumbles that are already included in item totals.
			if (!hasItems || itemsSum <= 0) {
				if (Array.isArray(slot.paylines) && slot.paylines.length > 0) {
					totalWin += this.calculateTotalWinFromPaylines(slot.paylines);
				}
				if (Array.isArray(slot.tumbles) && slot.tumbles.length > 0) {
					totalWin += this.calculateTotalWinFromTumbles(slot.tumbles);
				}
			}

			return totalWin;
		} catch {
			return 0;
		}
	}

	/**
	 * Add to the cumulative bonus total (e.g., for scatter retriggers)
	 * This preserves the existing cumulative total and adds the new amount
	 */
	public addToCumulativeWin(amount: number): void {
		const amountToAdd = Math.max(0, Number(amount) || 0);
		if (amountToAdd > 0) {
			this.cumulativeBonusWin += amountToAdd;
			this.hasStartedBonusTracking = true;
			console.log(`[BonusHeader] Added to cumulative bonus win: +$${amountToAdd}, new total: $${this.cumulativeBonusWin}`);
		}
	}

	/**
	 * Get the accumulated bonus win total.
	 */
	public getCumulativeBonusWin(): number {
		return this.cumulativeBonusWin;
	}

	/**
	 * Show the cumulative total immediately (e.g. when bonus header becomes visible).
	 * Used so the first spin's win (buy feature scatter) is not hidden - seamless transition from main header.
	 */
	public showCumulativeTotalIfReady(): void {
		if (this.cumulativeBonusWin > 0 && this.youWonText && this.amountText) {
			this.youWonText.setText('TOTAL WIN');
			this.showWinningsDisplay(this.cumulativeBonusWin);
		}
	}

	/**
	 * Hide the winnings display (both "YOU WON" text and amount) with shrink animation
	 */
	public hideWinningsDisplay(): void {
		if (this.amountText && this.youWonText) {
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Animate scale down to 0 before hiding
			if (this.scene) {
				this.scene.tweens.add({
					targets: [this.youWonText, this.amountText],
					scaleX: 0,
					scaleY: 0,
					duration: 200,
					ease: 'Back.easeIn',
					onComplete: () => {
						// Hide both texts after animation
						this.youWonText.setVisible(false);
						this.amountText.setVisible(false);
						// Reset scale for next show
						this.youWonText.setScale(1);
						this.amountText.setScale(1);
					}
				});
			} else {
				// Fallback if scene not available
				this.youWonText.setVisible(false);
				this.amountText.setVisible(false);
			}
			
			console.log('[BonusHeader] Winnings display hidden with shrink animation');
		} else {
			console.warn('[BonusHeader] Cannot hide winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Force-hide the win bar text (used when TotalW_BZ dialog is shown).
	 */
	public forceHideWinningsDisplay(): void {
		if (this.amountText && this.youWonText) {
			try {
				if (this.scene) {
					this.scene.tweens.killTweensOf(this.youWonText);
					this.scene.tweens.killTweensOf(this.amountText);
				}
			} catch { }
			this.youWonText.setVisible(false);
			this.amountText.setVisible(false);
			this.youWonText.setScale(1);
			this.amountText.setScale(1);
			console.log('[BonusHeader] Winbar display force-hidden');
		}
	}

	/**
	 * Show the winnings display with both "YOU WON" text and amount with scale in animation
	 */
	public showWinningsDisplay(winnings: number): void {
		if (this.suppressWinbarDisplay) {
			return;
		}
		if (this.amountText && this.youWonText) {
			const formattedWinnings = this.formatCurrency(winnings);
			
			// Check if the value has actually changed before animating
			const valueChanged = Math.abs(this.currentWinnings - winnings) > 0.01; // Use small epsilon for float comparison
			
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Update amount text with winnings before showing
			this.amountText.setText(formattedWinnings);
			
			// Check if already visible and scaled
			const isAlreadyVisible = this.youWonText.visible && this.amountText.visible;
			const currentScale = this.youWonText.scaleX;
			const isAlreadyScaled = currentScale > 0.9;
			
			// Show both texts first
			this.youWonText.setVisible(true);
			this.amountText.setVisible(true);
			
			// Update current winnings after checks
			this.currentWinnings = winnings;
			
			// Only animate if value changed or not already visible/scaled
			if (isAlreadyVisible && isAlreadyScaled) {
				if (valueChanged) {
					// Value changed - do a pulse animation (enlarge then revert)
					if (this.scene) {
						this.scene.tweens.add({
							targets: [this.youWonText, this.amountText],
							scaleX: 1.2,
							scaleY: 1.2,
							duration: 150,
							ease: 'Power2',
							yoyo: true,
							repeat: 0,
							onComplete: () => {
								// Ensure scale is exactly 1 after animation
								this.youWonText.setScale(1);
								this.amountText.setScale(1);
							}
						});
					}
					console.log(`[BonusHeader] Winnings display updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
				} else {
					// Value hasn't changed - just ensure scale is correct without animation
					this.youWonText.setScale(1);
					this.amountText.setScale(1);
					console.log(`[BonusHeader] Winnings display value unchanged, skipping animation: ${formattedWinnings} (raw: ${winnings})`);
				}
			} else {
				// Not visible or not scaled - do full scale-in animation
				// Set initial scale to 0 for scale-in effect
				this.youWonText.setScale(0);
				this.amountText.setScale(0);
				
				// Animate scale in with bounce effect
				if (this.scene) {
					this.scene.tweens.add({
						targets: [this.youWonText, this.amountText],
						scaleX: 1,
						scaleY: 1,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => {
							// Ensure scale is exactly 1 after animation
							this.youWonText.setScale(1);
							this.amountText.setScale(1);
						}
					});
				}
				console.log(`[BonusHeader] Winnings display shown with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		} else {
			console.warn('[BonusHeader] Cannot show winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Format currency value for display
	 */
	private formatCurrency(amount: number): string {
		const isDemo = (this.scene as any)?.gameAPI?.getDemoState();
		
		// Format with commas for thousands and 2 decimal places
		const formatted = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
		
		if (isDemo) {
			return formatted;
		}
		
		// Get currency prefix with proper spacing
		const prefix = CurrencyManager.getCurrencyCode();
		const space = prefix && !prefix.endsWith(' ') ? ' ' : '';
		return `${prefix}${space}${formatted}`;
	}

	/**
	 * Get current winnings amount
	 */
	public getCurrentWinnings(): number {
		return this.currentWinnings;
	}

	/**
	 * Reset winnings display to zero
	 */
	public resetWinnings(): void {
		this.updateWinningsDisplay(0);
	}

	/**
	 * Initialize winnings display when bonus header starts
	 */
	public initializeWinnings(): void {
		console.log('[BonusHeader] Initializing winnings display - starting hidden');
		this.currentWinnings = 0;
		this.hideWinningsDisplay();
	}

	/**
	 * Hide winnings display at the start of a new spin (like regular header)
	 */
	public hideWinningsForNewSpin(): void {
		console.log('[BonusHeader] Hiding winnings display for new spin');
		this.hideWinningsDisplay();
	}

	/**
	 * Set up event listener for winnings updates from backend (like regular header)
	 */
	private setupWinningsEventListener(): void {
		// Listen for tumble win progress (during bonus mode: per-spin cumulative)
		gameEventManager.on(GameEventType.TUMBLE_WIN_PROGRESS, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const amount = Number((data as any)?.cumulativeWin ?? 0);
				if (amount > 0) {
					// As soon as tumble wins start, we are in the "YOU WON" phase for this spin.
					// Never show "TOTAL WIN" on tumble updates; that label is reserved for the
					// end-of-spin cumulative summary (handled on WIN_STOP).
					if (this.youWonText) {
						this.youWonText.setText('YOU WON');
					}
					// Clear any scatter seeding guard once real tumble wins begin
					if (this.justSeededWin) {
						this.justSeededWin = false;
					}
					this.showWinningsDisplay(amount);
				}
			} catch {}
		});

		// Listen for tumble sequence completion (during bonus mode: accumulate spin total only)
		gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, (data: any) => {
			this.stopConveyorTopAnimation();
			try {
				if (!gameStateManager.isBonus) return;
				const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
				const spinData = symbolsComponent?.currentSpinData;
				
				// Prefer totalWin from the current freespin item (backend per-spin total).
				// Fall back to subTotalWin, then to a manual tumble+payline sum.
				let spinWin = 0;
				try {
					const slotAny: any = spinData?.slot || {};
					const currentItem = this.getCurrentFreeSpinItem(spinData);
					if (currentItem) {
						const rawItemTotal =
							(currentItem as any).totalWin ??
							(currentItem as any).subTotalWin ??
							0;
						const itemTotal = Number(rawItemTotal);
						if (!isNaN(itemTotal) && itemTotal > 0) {
							spinWin = itemTotal;
							console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: using freespin item totalWin=$${itemTotal}`);
						}
					}

					// Fallback: if freespin item total not available, use the totalWin from event data (tumbles only)
					if (spinWin === 0) {
						const spinTumbleWin = Number((data as any)?.totalWin ?? 0);
						if (spinTumbleWin > 0) {
							// Still need to add paylines if tumbles don't include them
							let spinPaylineWin = 0;
							if (slotAny?.paylines && Array.isArray(slotAny.paylines) && slotAny.paylines.length > 0) {
								spinPaylineWin = this.calculateTotalWinFromPaylines(slotAny.paylines);
							}
							spinWin = spinTumbleWin + spinPaylineWin;
							console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: fallback calculation (tumbles=$${spinTumbleWin} + paylines=$${spinPaylineWin}) = $${spinWin}`);
						}
					}
				} catch {}

				// Initialize bonus tracking if needed
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}

				// Accumulate the spin's total into the bonus cumulative.
				// The visible TOTAL WIN display is handled on WIN_STOP so that it only
				// appears after *all* win mechanics for the spin (tumbles + multipliers)
				// have finished, avoiding any label flicker during tumble updates.
				if (spinWin > 0) {
					if (this.skipNextSpinAccumulation) {
						this.accumulatedThisSpin = true;
						this.skipNextSpinAccumulation = false;
						console.log('[BonusHeader] TUMBLE_SEQUENCE_DONE: skipping accumulation (first spin already seeded)');
					} else {
						this.cumulativeBonusWin += spinWin;
						this.accumulatedThisSpin = true;
					}
					console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: added spinWin=$${spinWin}, cumulativeBonusWin=$${this.cumulativeBonusWin}`);
				}
			} catch {}
		});

		// Listen for spin events to hide winnings display at start of manual spin
		gameEventManager.on(GameEventType.SPIN, () => {
			if (gameStateManager.isBonus && this.cumulativeBonusWin > 0) {
				console.log('[BonusHeader] SPIN during bonus - keeping total win visible for cumulative tracking');
				return;
			}
			console.log('[BonusHeader] Manual spin started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// Listen for autoplay start to hide winnings display
		gameEventManager.on(GameEventType.AUTO_START, () => {
			if (gameStateManager.isBonus && this.cumulativeBonusWin > 0) {
				console.log('[BonusHeader] AUTO_START during bonus - keeping total win visible for cumulative tracking');
				return;
			}
			console.log('[BonusHeader] Auto play started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// After radial light transition (dialogAnimationsComplete), re-show cumulative total
		// so it stays visible when transitioning from Free Spin dialog to first bonus spin
		if (this.scene) {
			this.scene.events.on('dialogAnimationsComplete', () => {
				if (gameStateManager.isBonus && this.cumulativeBonusWin > 0 && this.bonusHeaderContainer?.visible) {
					this.showCumulativeTotalIfReady();
					console.log('[BonusHeader] dialogAnimationsComplete: re-showing cumulative total after radial light transition');
				}
			});
		}

		// Listen for reels start to reset per-spin bonus state
		gameEventManager.on(GameEventType.REELS_START, () => {
			console.log('[BonusHeader] Reels started');
			this.playConveyorTopAnimation();
			if (gameStateManager.isBonus) {
				// Reset per-spin accumulation flag
				this.accumulatedThisSpin = false;
				this.showingTotalWin = false;
				// Initialize tracking on first spin in bonus mode
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}
				const totalWinSoFar = this.cumulativeBonusWin;
				console.log(`[BonusHeader] REELS_START (bonus): cumulative bonus win so far = $${totalWinSoFar}`);

				// Clear the justSeededWin flag when first spin starts (scatter activation complete)
				if (this.justSeededWin) {
					this.justSeededWin = false;
					console.log('[BonusHeader] Cleared justSeededWin flag - first bonus spin starting');
				}

				// At the start of each bonus spin, show the cumulative TOTAL WIN so far.
				// During the spin, per-tumble updates will switch the label to "YOU WON".
				if (totalWinSoFar > 0) {
					if (this.youWonText) {
						this.youWonText.setText('TOTAL WIN');
					}
					this.showWinningsDisplay(totalWinSoFar);
				} else {
					this.hideWinningsDisplay();
					if (this.youWonText) {
						this.youWonText.setText('YOU WON');
					}
				}
			} else {
				// Normal mode behavior: hide winnings at the start of the spin
				this.hasStartedBonusTracking = false;
				this.cumulativeBonusWin = 0;
				this.scatterBaseWin = 0;
				this.justSeededWin = false;
				this.hideWinningsDisplay();
			}
		});

		// Listen for reel done events to show winnings display (like regular header)
		gameEventManager.on(GameEventType.REELS_STOP, (data: any) => {
			console.log(`[BonusHeader] REELS_STOP received - checking for wins`);

			// In bonus mode, per-spin display is handled on WIN_STOP; skip here to avoid label mismatch
			if (gameStateManager.isBonus) {
				console.log('[BonusHeader] In bonus mode - skipping REELS_STOP winnings update (handled on WIN_STOP)');
				return;
			}
			
			// Get the current spin data from the Symbols component
			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			if (symbolsComponent && symbolsComponent.currentSpinData) {
				const spinData = symbolsComponent.currentSpinData;
				console.log(`[BonusHeader] Found current spin data:`, spinData);
				
				// Use the same logic as regular header - calculate from paylines
				if (spinData.slot && spinData.slot.paylines && spinData.slot.paylines.length > 0) {
					const totalWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
					console.log(`[BonusHeader] Total winnings calculated from paylines: ${totalWin}`);
					
					if (totalWin > 0) {
						this.showWinningsDisplay(totalWin);
					} else {
						this.hideWinningsDisplay();
					}
				} else {
					console.log('[BonusHeader] No paylines in current spin data - hiding winnings display');
					this.hideWinningsDisplay();
				}
			} else {
				console.log('[BonusHeader] No current spin data available - hiding winnings display');
				this.hideWinningsDisplay();
			}
		});

		// On WIN_START during bonus, only handle non-tumble wins.
		// For tumble-based wins, the winnings display is driven exclusively by
		// TUMBLE_WIN_PROGRESS so that "YOU WON" appears tied to each tumble.
		gameEventManager.on(GameEventType.WIN_START, () => {
			if (!gameStateManager.isBonus) {
				return;
			}
			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;

			// If this spin has tumbles, let TUMBLE_WIN_PROGRESS handle the "YOU WON"
			// label and values so the header updates are synchronized with tumbles.
			if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
				console.log('[BonusHeader] WIN_START (bonus): tumbles present - winnings display handled by TUMBLE_WIN_PROGRESS');
				return;
			}

			let spinWin = 0;
			
			// Check for paylines wins
			if (spinData?.slot?.paylines && spinData.slot.paylines.length > 0) {
				spinWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
			}
			
			// Also check for tumbles (cluster wins) - they might not have paylines
			if (spinWin === 0 && Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
				spinWin = this.calculateTotalWinFromTumbles(spinData.slot.tumbles);
			}
			
			// Always change to "YOU WIN" or "YOU WON" when wins start (unless in initial scatter phase)
			if (!this.justSeededWin && this.youWonText) {
				this.youWonText.setText('YOU WIN');
			}
			
			if (spinWin > 0) {
				this.showWinningsDisplay(spinWin);
			} else {
				// Don't hide if we're showing cumulative total - only hide if truly no wins
				// The TUMBLE_WIN_PROGRESS will handle showing wins during tumbles
			}
		});

		// On WIN_STOP during bonus, finalize cumulative tracking and show "TOTAL WIN" for this spin
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			if (!gameStateManager.isBonus) {
				return;
			}

			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;

			// Calculate the total win for this spin (includes paylines + tumbles)
			let spinWin = 0;
			try {
				const currentItem = this.getCurrentFreeSpinItem(spinData);
				if (currentItem) {
					// Use totalWin if available, otherwise use subTotalWin
					const rawWin = (currentItem as any).totalWin ?? (currentItem as any).subTotalWin;
					if (typeof rawWin === 'number' && rawWin > 0) {
						spinWin = rawWin;
						console.log(`[BonusHeader] WIN_STOP (bonus): using item win=$${spinWin} from freespin item`);
					}
				}
				// Fallback: if freespin item total not available, manually sum paylines + tumbles
				if (spinWin === 0) {
					// Include paylines (if any)
					if (spinData?.slot?.paylines && spinData.slot.paylines.length > 0) {
						spinWin += this.calculateTotalWinFromPaylines(spinData.slot.paylines);
					}
					// Include tumble wins (cluster wins) if present
					if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
						const tumbleWin = this.calculateTotalWinFromTumbles(spinData.slot.tumbles);
						spinWin += tumbleWin;
					}
					if (spinWin > 0) {
						console.log(`[BonusHeader] WIN_STOP (bonus): fallback calculation = $${spinWin}`);
					}
				}
			} catch {}

			// Initialize cumulative tracking if needed
			if (!this.hasStartedBonusTracking) {
				this.cumulativeBonusWin = this.scatterBaseWin || 0;
				this.hasStartedBonusTracking = true;
			}

			// If this spin's win has not yet been accumulated (no TUMBLE_SEQUENCE_DONE or it had 0),
			// add it now. Otherwise, keep the already-accumulated total.
			if (!this.accumulatedThisSpin) {
				if (this.skipNextSpinAccumulation) {
					this.accumulatedThisSpin = true;
					this.skipNextSpinAccumulation = false;
					console.log('[BonusHeader] WIN_STOP (bonus): skipping accumulation (first spin already seeded)');
				} else {
					this.cumulativeBonusWin += (spinWin || 0);
					this.accumulatedThisSpin = true;
				}
			}

			console.log(`[BonusHeader] WIN_STOP (bonus): finalized cumulativeBonusWin=$${this.cumulativeBonusWin} (spinWin=$${spinWin})`);

			// If this was the last free spin, align the cumulative total to backend totalWin
			try {
				let isFinalSpin = false;
				if (gameStateManager.isBonusFinished) {
					isFinalSpin = true;
				} else {
					const currentItem = this.getCurrentFreeSpinItem(spinData);
					if (typeof currentItem?.spinsLeft === 'number' && currentItem.spinsLeft <= 1) {
						isFinalSpin = true;
					}
					try {
						const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
						if (typeof rem === 'number' && rem <= 0) {
							isFinalSpin = true;
						}
					} catch { }
				}

				if (isFinalSpin) {
					const backendTotal = this.calculateBackendTotalWin(spinData);
					if (backendTotal > 0) {
						this.cumulativeBonusWin = backendTotal;
						this.hasStartedBonusTracking = true;
						console.log(`[BonusHeader] WIN_STOP (bonus): aligned cumulative total to backend totalWin=$${backendTotal}`);
					}
				}
			} catch { }

			// Show "TOTAL WIN" with the cumulative total (all spins including scatter trigger)
			const showTotalWinForSpin = () => {
				console.log(`[BonusHeader] showTotalWinForSpin: spinWin=${spinWin}, cumulativeBonusWin=$${this.cumulativeBonusWin}`);
				this.showingTotalWin = true;

				this.scene?.time.delayedCall(0, () => {
					// Always show cumulative total (includes scatter trigger win + all bonus spins)
					if (this.cumulativeBonusWin > 0) {
						// Stop any existing tweens to prevent conflicts
						if (this.scene) {
							this.scene.tweens.killTweensOf(this.youWonText);
							this.scene.tweens.killTweensOf(this.amountText);
						}

						// Set text to TOTAL WIN
						if (this.youWonText) {
							this.youWonText.setText('TOTAL WIN');
							this.youWonText.setVisible(true);
							console.log('[BonusHeader] Set youWonText to "TOTAL WIN" and visible');
						}

						// Show the cumulative total (scatter + all spins so far)
						this.showWinningsDisplay(this.cumulativeBonusWin);
						console.log(`[BonusHeader] WIN_STOP (bonus): ✅ SHOWING "TOTAL WIN" with cumulative total=$${this.cumulativeBonusWin}`);
					} else {
						// No cumulative win yet – leave the existing display unchanged
						console.log('[BonusHeader] WIN_STOP (bonus): cumulativeBonusWin is 0, leaving existing winnings display unchanged');
					}

					// Always emit event to signal that spin display phase is complete
					// This allows FreeSpinController to proceed to next spin
					gameEventManager.emit(GameEventType.BONUS_TOTAL_WIN_SHOWN);
				});
			};

			showTotalWinForSpin();
		});
	}

	/**
	 * Update winnings display with subTotalWin from current spin data
	 * Hides display when no subTotalWin (similar to regular header behavior)
	 */
	public updateWinningsFromSpinData(spinData: any): void {
		if (!spinData) {
			console.warn('[BonusHeader] No spin data provided for winnings update');
			this.hideWinningsDisplay();
			return;
		}

		// Check if this is a free spin with subTotalWin (support freespin and freeSpin)
		const fs = spinData.slot?.freespin || spinData.slot?.freeSpin;
		if (fs?.items && fs.items.length > 0) {
			// Find the current free spin item (usually the first one with spinsLeft > 0)
			const currentFreeSpinItem = fs.items.find((item: any) => item.spinsLeft > 0);
			
			if (currentFreeSpinItem && currentFreeSpinItem.subTotalWin !== undefined) {
				const subTotalWin = currentFreeSpinItem.subTotalWin;
				console.log(`[BonusHeader] Found subTotalWin: $${subTotalWin}`);
				
				// Only show display if subTotalWin > 0, otherwise hide it
				if (subTotalWin > 0) {
					console.log(`[BonusHeader] Showing winnings display with subTotalWin: $${subTotalWin}`);
					this.updateWinningsDisplay(subTotalWin);
				} else {
					console.log(`[BonusHeader] subTotalWin is 0, hiding winnings display`);
					this.hideWinningsDisplay();
				}
				return;
			}
		}

		// Fallback: calculate from paylines if no subTotalWin available
		if (spinData.slot?.paylines && spinData.slot.paylines.length > 0) {
			const totalWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
			console.log(`[BonusHeader] Calculated from paylines: $${totalWin}`);
			
			// Only show display if totalWin > 0, otherwise hide it
			if (totalWin > 0) {
				console.log(`[BonusHeader] Showing winnings display with payline calculation: $${totalWin}`);
				this.updateWinningsDisplay(totalWin);
			} else {
				console.log(`[BonusHeader] No wins from paylines, hiding winnings display`);
				this.hideWinningsDisplay();
			}
		} else {
			console.log('[BonusHeader] No win data available in spin data, hiding display');
			this.hideWinningsDisplay();
		}
	}

	/**
	 * Calculate total win from paylines (fallback method)
	 */
	private calculateTotalWinFromPaylines(paylines: any[]): number {
		let totalWin = 0;
		for (const payline of paylines) {
			if (payline.win && payline.win > 0) {
				totalWin += payline.win;
			}
		}
		return totalWin;
	}

	/**
	 * Calculate total win amount from tumbles array
	 */
	private calculateTotalWinFromTumbles(tumbles: any[]): number {
		if (!Array.isArray(tumbles) || tumbles.length === 0) {
			return 0;
		}
		let totalWin = 0;
		for (const tumble of tumbles) {
			const w = Number(tumble?.win || 0);
			totalWin += isNaN(w) ? 0 : w;
		}
		return totalWin;
	}

	resize(scene: Scene): void {
		if (this.bonusHeaderContainer) {
			this.bonusHeaderContainer.setSize(scene.scale.width, scene.scale.height);
		}
		const centerX = scene.scale.width * 0.5;
		const centerXView = scene.cameras?.main ? scene.cameras.main.centerX : centerX;
		const sceneFrameScale = this.headerSceneFrameImage
			? (scene.scale.width / this.headerSceneFrameImage.width) * HEADER_CONFIG.SCENE_FRAME_SCALE
			: (scene.scale.width * HEADER_CONFIG.SCENE_FRAME_SCALE) / (this.headerSceneImage?.width ?? 1);
		if (this.headerSceneImage) {
			const sceneY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + HEADER_CONFIG.HEADER_SCENE_OFFSET_Y;
			this.headerSceneImage.setPosition(centerX, sceneY);
			this.headerSceneImage.setScale(
				sceneFrameScale * HEADER_CONFIG.HEADER_SCENE_SCALE_X,
				sceneFrameScale * HEADER_CONFIG.HEADER_SCENE_SCALE_Y
			);
		}
		if (this.headerSceneFrameImage) {
			this.headerSceneFrameImage.setOrigin(0.5, 0);
			this.headerSceneFrameImage.setScale(sceneFrameScale);
			this.headerSceneFrameImage.setPosition(centerXView + HEADER_CONFIG.SCENE_FRAME_OFFSET_X, HEADER_CONFIG.SCENE_FRAME_OFFSET_Y);
		}
		if (this.headerWinBarImage && scene.textures.exists('Header_SceneFrame')) {
			const frameHeight = this.getHeaderImageDisplayHeight(scene, 'Header_SceneFrame');
			const winBarY = HEADER_CONFIG.SCENE_FRAME_OFFSET_Y + frameHeight + HEADER_CONFIG.WIN_BAR_OFFSET_Y;
			this.headerWinBarImage.setPosition(centerX, winBarY);
			this.headerWinBarImage.setScale((scene.scale.width / this.headerWinBarImage.width) * HEADER_CONFIG.WIN_BAR_SCALE);
		}
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bonusHeaderContainer;
	}

	/** Set visibility of the whole bonus header (container + scene frame when not in container). */
	setVisible(visible: boolean): void {
		this.bonusHeaderContainer.setVisible(visible);
		if (this.headerSceneFrameImage) {
			this.headerSceneFrameImage.setVisible(visible);
		}
	}

	destroy(): void {
		if (this.headerSceneFrameImage) {
			this.headerSceneFrameImage.destroy();
			this.headerSceneFrameImage = undefined;
		}
		if (this.bonusHeaderContainer) {
			this.bonusHeaderContainer.destroy();
		}
	}
}
