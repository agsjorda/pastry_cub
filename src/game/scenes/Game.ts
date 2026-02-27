/**
 * Game Scene - STABLE VERSION v1.0
 * 
 * This version includes:
 * - Complete asset management system with AssetConfig and AssetLoader
 * - NetworkManager and ScreenModeManager integration
 * - Background, Header, Symbols, and SlotController components
 * - BonusBackground and BonusHeader components (commented out)
 * - Proper event handling and backend integration
 * 
 * Base stable version - revert to this if future changes break functionality
 */
import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { Background } from '../components/Background';
import { Header } from '../components/Header';
import { SlotController } from '../components/controller/SlotController';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';
import { AssetConfig } from '../../config/AssetConfig';
import { GRID_CENTER_X_RATIO, GRID_CENTER_X_OFFSET_PX, GRID_CENTER_Y_RATIO, GRID_CENTER_Y_OFFSET_PX, MAX_IDLE_TIME_MINUTES } from '../../config/GameConfig';
import { Symbols } from '../components/symbols/index';
import { GameData } from '../components/GameData';
import { BonusBackground } from '../components/BonusBackground';
import { BonusHeader } from '../components/BonusHeader';
import { Dialogs } from '../components/Dialogs';
import { BetOptions } from '../components/BetOptions';
import { AutoplayOptions } from '../components/AutoplayOptions';
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { gameStateManager } from '../../managers/GameStateManager';
import { GameAPI } from '../../backend/GameAPI';
import { AudioManager, MusicType } from '../../managers/AudioManager';
import { Menu } from '../components/Menu';
import { FullScreenManager } from '../../managers/FullScreenManager';
import { ClockDisplay } from '../components/ClockDisplay';
import WinTracker from '../components/WinTracker';
import {
	CLOCK_DISPLAY_NAME,
	GAME_DISPLAY_NAME,
	CLOCK_DISPLAY_CONFIG,
	WIN_TRACKER_LAYOUT,
	GAME_SCENE_PHYSICS_BOTTOM_OFFSET,
	GAME_SCENE_FADE_IN_DURATION_MS,
} from '../../config/GameConfig';
import { FreeRoundManager } from '../components/FreeRoundManager';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { CurrencyManager } from '../components/CurrencyManager';
import { setDecimalPlaces } from '../../utils/NumberPrecisionFormatter';
import {
	calculateTotalWinFromTumbles as spinCalculateTotalWinFromTumbles,
} from '../components/Spin';
import { IdleManager } from '../components/IdleManager';

export class Game extends Scene {
	private networkManager!: NetworkManager;
	private screenModeManager!: ScreenModeManager;
	private gameStateManager!: typeof gameStateManager;
	private background!: Background;
	private header!: Header;
	private slotController!: SlotController;

	private bonusBackground!: BonusBackground;
	private bonusHeader!: BonusHeader;
	private dialogs!: Dialogs;
	private betOptions!: BetOptions;
	private autoplayOptions!: AutoplayOptions;
	public gameAPI!: GameAPI;
	public audioManager!: AudioManager;
	private menu: Menu;
	private clockDisplay!: ClockDisplay;
	private winTracker!: WinTracker;
	private freeRoundManager: FreeRoundManager | null = null;

	private idleManager: IdleManager | null = null;
	private onPointerDownResetIdle?: () => void;

	// Queue for wins that occur while a dialog is already showing
	private winQueue: Array<{ payout: number; bet: number }> = [];
	private suppressWinDialogsUntilNextSpin: boolean = false;

	public gameData: GameData;
	private symbols: Symbols;

	constructor() {
		super('Game');

		this.gameData = new GameData();
		this.symbols = new Symbols();
		this.menu = new Menu();
	}

	private handleResize(): void {
		try {
			if (this.physics && this.physics.world) {
				this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height - GAME_SCENE_PHYSICS_BOTTOM_OFFSET);
			}
		} catch { }

		try { this.background?.resize(this); } catch { }
		try { this.bonusBackground?.resize(this); } catch { }
		try { this.header?.resize(this); } catch { }
		try { this.bonusHeader?.resize(this); } catch { }
		try { (this.symbols as any)?.resize?.(this); } catch { }
		try { this.slotController?.resize(this); } catch { }
		try { (this.dialogs as any)?.resize?.(this); } catch { }
		try { (this.betOptions as any)?.resize?.(this); } catch { }
		try { (this.autoplayOptions as any)?.resize?.(this); } catch { }
		try { (this.menu as any)?.resize?.(this); } catch { }
		try { (this.winTracker as any)?.resize?.(this); } catch { }
		try { (this.clockDisplay as any)?.resize?.(); } catch { }
		try { (this.freeRoundManager as any)?.resize?.(this); } catch { }
	}

	init(data: any) {
		// Receive managers from Preloader scene
		this.networkManager = data.networkManager;
		this.screenModeManager = data.screenModeManager;

		// Initialize game state manager
		this.gameStateManager = gameStateManager;
		console.log(`[Game] Initial isBonus state: ${this.gameStateManager.isBonus}`);

		// Prefer the GameAPI instance passed from Preloader so we reuse initialization data
		if (data.gameAPI) {
			console.log('[Game] Using GameAPI instance from Preloader');
			this.gameAPI = data.gameAPI as GameAPI;
		} else {
			console.log('[Game] No GameAPI instance passed from Preloader, creating a new one');
			this.gameAPI = new GameAPI(this.gameData);
		}

		console.log(`[Game] Received managers from Preloader`);
	}

	public getCurrentBetAmount(): number {
		if (this.slotController) {
			const betText = this.slotController.getBetAmountText?.();
			const parsedBet = betText ? parseFloat(betText) : Number.NaN;
			if (!Number.isNaN(parsedBet) && parsedBet > 0) {
				return parsedBet;
			}

			const baseBet = this.slotController.getBaseBetAmount?.();
			if (typeof baseBet === 'number' && baseBet > 0) {
				return baseBet;
			}
		}
		return 1;
	}

	/** Base bet for payout table display (excludes amplify multiplier so payouts stay consistent) */
	public getBaseBetAmount(): number {
		const base = this.slotController?.getBaseBetAmount?.();
		return typeof base === 'number' && base > 0 ? base : 1;
	}

	preload() {
		// Assets are now loaded in Preloader scene
		console.log(`[Game] Assets already loaded in Preloader scene`);
		console.log(`[Game] Backend service initialized via GameStateManager`);

		// Preload Menu assets specific to the Game scene
		this.menu.preload(this);
	}

	create() {
		console.log(`[Game] Creating game scene`);
		try { ensureSpineFactory(this, '[Game] create'); } catch { }

		const fadeOverlay = this.createFadeAndResize();
		this.createHeaderAndBackground();
		this.createCharactersAndClock();
		this.createBonusLayers();
		this.createSymbolsAndWinTracker();
		this.createAudio();
		this.createDialogsAndScatter();
		this.createBetAndAutoplay();
		this.createSlotController();
		this.createFreeRoundAndScatterAnticipation();

		this.initializeAndStartIdleManager();

		this.initializeGameBalance();
		console.log(`[Game] Emitting START event to initialize game...`);
		gameEventManager.emit(GameEventType.START);
		this.header.initializeWinnings();
		this.setupBonusModeEventListeners();
		EventBus.emit('current-scene-ready', this);

		this.runFadeIn(fadeOverlay);
		this.setupEventBusListeners();
		this.setupGameEventListeners();
	}

	private initializeAndStartIdleManager(): void {
		const idleTimeoutMs = MAX_IDLE_TIME_MINUTES * 60 * 1000;
		this.idleManager = new IdleManager(this, idleTimeoutMs);

		// On timeout, delegate to GameAPI handler (shows popup and clears tokens)
		this.idleManager.events.on(IdleManager.TIMEOUT_EVENT, () => {
			try {
				this.gameAPI?.handleSessionTimeout?.();
			} catch (e) {
				console.error('[Game] Error handling session timeout:', e);
			}
		});

		// Reset idle when game is actively running (bonus/spin) so we don't timeout mid-spin.
		this.idleManager.events.on(IdleManager.CHECK_INTERVAL_EVENT, () => {
			try {
				const gsm: any = this.gameStateManager;
				if (gsm?.isBonus || gsm?.isReelSpinning || gsm?.isProcessingSpin) {
					this.idleManager?.reset();
				}
			} catch {}
		});

		this.onPointerDownResetIdle = () => {
			this.idleManager?.reset();
		};
		this.input.on('pointerdown', this.onPointerDownResetIdle);

		this.events.once('shutdown', () => {
			try {
				if (this.onPointerDownResetIdle) {
					this.input.off('pointerdown', this.onPointerDownResetIdle);
				}
			} catch {}
			try {
				this.idleManager?.destroy();
				this.idleManager = null;
			} catch {}
		});

		this.idleManager.start();
	}

	/** Physics, fade overlay, resize handler */
	private createFadeAndResize(): Phaser.GameObjects.Rectangle {
		if (this.physics?.world) {
			this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height - GAME_SCENE_PHYSICS_BOTTOM_OFFSET);
			console.log('[Game] Physics world bounds set');
		} else {
			console.warn('[Game] Physics system not available');
		}
		const fadeOverlay = this.add.rectangle(
			this.scale.width * 0.5, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x000000
		).setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(1).setDepth(99999);
		this.scale.on('resize', this.handleResize, this);
		this.events.once('shutdown', () => this.scale.off('resize', this.handleResize, this));
		return fadeOverlay;
	}

	private createHeaderAndBackground(): void {
		this.header = new Header(this.networkManager, this.screenModeManager);
		this.header.create(this);
		this.background = new Background(this.networkManager, this.screenModeManager);
		this.background.create(this);
	}

	private createCharactersAndClock(): void {
		this.clockDisplay = new ClockDisplay(this, {
			...CLOCK_DISPLAY_CONFIG,
			suffixText: ` | ${GAME_DISPLAY_NAME}${this.gameAPI.getDemoState() ? ' | DEMO' : ''}`,
			additionalText: CLOCK_DISPLAY_NAME,
		});
		this.clockDisplay.create();
	}

	private createBonusLayers(): void {
		console.log('[Game] Creating bonus background...');
		this.bonusBackground = new BonusBackground(this.networkManager, this.screenModeManager);
		this.bonusBackground.create(this);
		this.bonusBackground.getContainer().setVisible(false);
		console.log('[Game] Creating bonus header...');
		this.bonusHeader = new BonusHeader(this.networkManager, this.screenModeManager);
		this.bonusHeader.create(this);
		this.bonusHeader.setVisible(false);
	}

	private createSymbolsAndWinTracker(): void {
		this.winTracker = new WinTracker();
		this.winTracker.create(this);
		this.winTracker.setLayout(WIN_TRACKER_LAYOUT);
		console.log(`[Game] Creating symbols...`);
		this.symbols.create(this);
	}

	private createAudio(): void {
		this.audioManager = new AudioManager(this);
		console.log('[Game] AudioManager initialized');
		this.time.delayedCall(0, () => {
			const tryInitAudio = () => {
				try {
					this.audioManager.createMusicInstances();
					this.audioManager.playBackgroundMusic(MusicType.MAIN);
					console.log('[Game] Audio instances created and background music started');
					return true;
				} catch { return false; }
			};
			if (tryInitAudio()) return;
			try {
				console.log('[Game] Background-loading audio assets (fallback)...');
				const audioAssets = new AssetConfig(this.networkManager, this.screenModeManager).getAudioAssets();
				const audioMap = audioAssets.audio || {};
				let queued = 0;
				for (const [key, path] of Object.entries(audioMap)) {
					try { if ((this.cache.audio as any)?.exists?.(key)) continue; } catch { }
					try { this.load.audio(key, path as string); queued++; } catch { }
				}
				if (queued > 0) {
					this.load.once('complete', () => tryInitAudio(), this);
					this.load.start();
				} else {
					this.time.delayedCall(150, tryInitAudio);
				}
			} catch (e) {
				console.warn('[Game] Failed to queue background audio load:', e);
				this.time.delayedCall(250, tryInitAudio);
			}
		});
		(window as any).audioManager = this.audioManager;
	}

	private createDialogsAndScatter(): void {
		this.dialogs = new Dialogs(this.networkManager, this.screenModeManager);
		this.dialogs.create(this);
		this.symbols.scatterAnimationManager.initialize(this, this.symbols.container, this.dialogs);
	}

	private createBetAndAutoplay(): void {
		this.betOptions = new BetOptions(this.networkManager, this.screenModeManager);
		this.betOptions.create(this);
		this.autoplayOptions = new AutoplayOptions(this.networkManager, this.screenModeManager);
		this.autoplayOptions.create(this);
	}

	private createSlotController(): void {
		// Create loading spinner at center of reel (same as symbol grid)
		const centerX = this.scale.width * GRID_CENTER_X_RATIO + GRID_CENTER_X_OFFSET_PX;
		const centerY = this.scale.height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX;
		const loadingSpinner = new LoadingSpinner(this, centerX, centerY);

		this.slotController = new SlotController(this.networkManager, this.screenModeManager);
		this.slotController.setSymbols(this.symbols);
		this.slotController.setBuyFeatureReference();
		this.slotController.setLoadingSpinner(loadingSpinner);
		this.slotController.create(this);
	}

	private createFreeRoundAndScatterAnticipation(): void {
		try {
			const initData = this.gameAPI.getInitializationData();
			const initFsRemaining = this.gameAPI.getRemainingInitFreeSpins();
			const initFsBet = this.gameAPI.getInitFreeSpinBet();
			const initCurrencyPlaces = Number((initData as any)?.currencyDecimalPlaces);
			setDecimalPlaces(Number.isFinite(initCurrencyPlaces) ? initCurrencyPlaces : 2);
			CurrencyManager.initializeFromInitData(initData);
			this.slotController?.refreshCurrencySymbols?.();
			this.freeRoundManager = new FreeRoundManager();
			this.freeRoundManager.create(this, this.gameAPI, this.slotController);
			if (initData && initData.hasFreeSpinRound && initFsRemaining > 0) {
				console.log(`[Game] Initialization indicates free spin round available (${initFsRemaining}). Enabling FreeRoundManager UI.`);
				if (this.slotController && initFsBet && initFsBet > 0) {
					this.slotController.updateBetAmount(initFsBet);
				}
				this.freeRoundManager.setFreeSpins(initFsRemaining);
				this.freeRoundManager.enableFreeSpinMode();
			}
		} catch (e) {
			console.warn('[Game] Failed to create FreeRoundManager from initialization data:', e);
		}
	}

	private runFadeIn(fadeOverlay: Phaser.GameObjects.Rectangle): void {
		this.tweens.add({
			targets: fadeOverlay,
			alpha: 0,
			duration: GAME_SCENE_FADE_IN_DURATION_MS,
			ease: 'Power2',
			onComplete: () => {
				console.log('[Game] Fade in from black complete');
				fadeOverlay.destroy();
			}
		});
	}

	/** EventBus: spin, menu, bet-options, autoplay, amplify */
	private setupEventBusListeners(): void {
		EventBus.on('spin', () => this.spin());
		EventBus.on('menu', () => {
			console.log('[Game] Menu button clicked - toggling menu');
			this.menu.toggleMenu(this);
		});
		EventBus.on('show-bet-options', () => {
			const currentBaseBet = this.slotController.getBaseBetAmount() || 0.20;
			const currentDisplayText = this.slotController.getBetAmountText();
			const currentDisplayBet = currentDisplayText ? parseFloat(currentDisplayText) : currentBaseBet;
			this.betOptions.show({
				currentBet: currentBaseBet,
				currentBetDisplay: currentDisplayBet,
				isEnhancedBet: this.gameData?.isEnhancedBet,
				onClose: () => console.log('[Game] Bet options closed'),
				onConfirm: (betAmount: number) => {
					this.slotController.updateBetAmount(betAmount);
					gameEventManager.emit(GameEventType.BET_UPDATE, { newBet: betAmount, previousBet: currentBaseBet });
				}
			});
		});
		EventBus.on('amplify', (isEnhanced: boolean) => {
			try {
				if (this.betOptions?.isVisible()) {
					const baseBet = this.slotController.getBaseBetAmount() || 0.20;
					const displayText = this.slotController.getBetAmountText();
					const displayBet = displayText ? parseFloat(displayText) : baseBet;
					this.betOptions.setEnhancedBetState(!!isEnhanced, displayBet, baseBet);
				}
			} catch { }
		});
		EventBus.on('autoplay', () => {
			// Display bet (may include amplify/enhanced multiplier)
			const currentBetText = this.slotController.getBetAmountText?.();
			const currentDisplayBet = currentBetText ? parseFloat(currentBetText) : 0.20;

			// Base bet from controller (without amplify), used for API and ladders
			const baseBet = this.slotController.getBaseBetAmount?.() || currentDisplayBet;

			const currentBalance = this.slotController.getBalanceAmount();
			const isEnhancedBet = !!this.gameData?.isEnhancedBet;
			const betDisplayMultiplier = isEnhancedBet ? 1.25 : 1;

			this.autoplayOptions.show({
				currentAutoplayCount: 10,
				// Use base bet for internal logic and ladders
				currentBet: baseBet,
				// Pass display bet + multiplier so UI matches controller bet text
				currentBetDisplay: currentDisplayBet,
				betDisplayMultiplier,
				currentBalance,
				isEnhancedBet,
				onClose: () => console.log('[Game] Autoplay options closed'),
				onBetChange: (betAmount: number) => {
					// Sync SlotController/base bet + controller label live as user adjusts bet in autoplay
					this.slotController.updateBetAmountFromAutoplay(betAmount);
				},
				onConfirm: (autoplayCount: number) => {
					const selectedBet = this.autoplayOptions.getCurrentBet();
					if (Math.abs(selectedBet - baseBet) > 0.0001) {
						this.slotController.updateBetAmountFromAutoplay(selectedBet);
						gameEventManager.emit(GameEventType.BET_UPDATE, { newBet: selectedBet, previousBet: baseBet });
					}
					this.slotController.startAutoplay(autoplayCount);
				}
			});
		});
	}

	/** GameEventManager: WIN_STOP, REELS_*, dialogAnimationsComplete, SPIN, AUTO_START */
	private setupGameEventListeners(): void {
		gameEventManager.on(GameEventType.WIN_STOP, (data: any) => this.onWinStop(data));
		gameEventManager.on(GameEventType.REELS_STOP, () => {
			console.log('[Game] REELS_STOP event received');
		});
		gameEventManager.on(GameEventType.REELS_START, () => {
			try {
				if (this.winTracker) this.winTracker.hideWithFade(250);
			} catch (e) {
				console.warn('[Game] Failed to clear WinTracker on REELS_START:', e);
			}
		});
		this.events.on('dialogAnimationsComplete', () => {
			console.log('[Game] Dialog animations complete event received');
			this.suppressWinDialogsUntilNextSpin = false;
			gameStateManager.isShowingWinDialog = false;
			this.symbols?.scatterAnimationManager?.tryPlayDelayedScatterAnimation();
			this.processWinQueue();
		});
		gameEventManager.on(GameEventType.SPIN, () => {
			console.log('[Game] SPIN event received - clearing win queue for new spin');
			this.suppressWinDialogsUntilNextSpin = false;
			if (gameStateManager.isShowingWinDialog && this.gameData?.isAutoPlaying) {
				console.log('[Game] Autoplay SPIN event BLOCKED - win dialog is showing');
				return;
			}
			try { this.winTracker?.hideWithFade(250); } catch { }
			const isRetryingPausedSpin = this.gameData?.isAutoPlaying && this.winQueue.length > 0;
			if (!isRetryingPausedSpin) {
				this.clearWinQueue();
				gameStateManager.isShowingWinDialog = false;
			}
		});
		gameEventManager.on(GameEventType.AUTO_START, () => {
			this.suppressWinDialogsUntilNextSpin = false;
			if (gameStateManager.isShowingWinDialog) {
				console.log('[Game] AUTO_START blocked - win dialog is showing');
				return;
			}
			try { this.winTracker?.hideWithFade(250); } catch { }
		});
	}

	/** WIN_STOP: resolve totalWin, character animation, win dialog, demo balance, balance update */
	private onWinStop(_data: any): void {
		console.log('[Game] WIN_STOP event received (tumble-based evaluation)');
		if (!this.symbols?.currentSpinData) {
			console.log('[Game] WIN_STOP: No current spin data available');
			return;
		}
		const spinData = this.symbols.currentSpinData;
		let freeSpinItem: any | null = null;
		let totalWin = 0;
		const betAmount = parseFloat(spinData.bet);

		if (gameStateManager.isBonus) {
			try {
				const slotAny: any = spinData.slot || {};
				const fs = slotAny.freespin || slotAny.freeSpin;
				const items = Array.isArray(fs?.items) ? fs.items : [];
				const area = slotAny.area;
				if (items.length > 0 && Array.isArray(area)) {
					const areaJson = JSON.stringify(area);
					freeSpinItem = items.find((item: any) => Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson) ?? null;
				}
				if (!freeSpinItem && items.length > 0) freeSpinItem = items[0];
				if (freeSpinItem) {
					const itemTotalWinRaw = (freeSpinItem as any).totalWin ?? (freeSpinItem as any).subTotalWin ?? 0;
					const itemTotalWin = Number(itemTotalWinRaw);
					if (!isNaN(itemTotalWin) && itemTotalWin > 0) totalWin = itemTotalWin;
				}
			} catch (e) {
				console.warn('[Game] WIN_STOP: Failed to derive freespin item totalWin, falling back to tumble totalWin', e);
			}
		}

		const slotTotalWin = Number((spinData.slot as any)?.totalWin);
		if (totalWin === 0 && Number.isFinite(slotTotalWin) && slotTotalWin > 0) totalWin = slotTotalWin;

		const slotTumbles = spinData.slot?.tumbles || [];
		const bonusTumbles = freeSpinItem?.tumbles;
		const tumblesToUse = (Array.isArray(slotTumbles) && slotTumbles.length > 0) ? slotTumbles : (Array.isArray(bonusTumbles) ? bonusTumbles : []);
		const tumbleResult = spinCalculateTotalWinFromTumbles(tumblesToUse);
		if (totalWin === 0) {
			totalWin = tumbleResult.totalWin;
		}
		const hasCluster = tumbleResult.hasCluster;

		console.log(`[Game] WIN_STOP: totalWin used for win dialog=$${totalWin}, hasCluster>=8=${hasCluster}`);
		if (hasCluster && totalWin > 0) {
			this.checkAndShowWinDialog(totalWin, betAmount);
		} else {
			console.log('[Game] WIN_STOP: No qualifying cluster wins (>=8) detected');
		}

		// If the menu History tab is open, refresh the history list once per spin.
		try {
			(this.menu as any)?.refreshHistoryAfterSpin?.(this);
		} catch { /* avoid surfacing menu/history issues in core win flow */ }
	}

	/**
	 * Initialize the game balance on start
	 */
	private async initializeGameBalance(): Promise<void> {
		try {
			console.log('[Game] Initializing game balance...');

			// Call the GameAPI to get the current balance
			const balance = await this.gameAPI.initializeBalance();

			// Update the SlotController balance display
			if (this.slotController) {
				this.slotController.updateBalanceAmount(balance);
				console.log(`[Game] Balance initialized and updated in SlotController: $${balance}`);
			}

			// Emit balance initialized event
			gameEventManager.emit(GameEventType.BALANCE_INITIALIZED, {
				newBalance: balance,
				previousBalance: 0,
				change: balance
			});

			console.log('[Game] Balance initialization completed successfully');

		} catch (error) {
			console.error('[Game] Error initializing balance:', error);
			// Use default balance if initialization fails
			const defaultBalance = 200000.00;
			if (this.slotController) {
				this.slotController.updateBalanceAmount(defaultBalance);
				console.log(`[Game] Using default balance: $${defaultBalance}`);
			}
		}
	}

	/**
	 * Delegate to Dialogs: check conditions and show appropriate win dialog or queue.
	 */
	private checkAndShowWinDialog(payout: number, bet: number): void {
		// Win dialogs should only be shown during bonus game flow.
		if (!gameStateManager.isBonus) {
			console.log('[Game] Skipping win dialog - not in bonus mode');
			gameStateManager.isShowingWinDialog = false;
			return;
		}

		this.dialogs.checkAndShowWinDialog(this, payout, bet, {
			pushToQueue: (p, b) => this.winQueue.push({ payout: p, bet: b }),
			scheduleProcessQueue: () => {
				this.scene.time.delayedCall(0, () => this.processWinQueue());
			},
			isSuppressed: () => this.suppressWinDialogsUntilNextSpin,
			symbols: this.symbols,
			gameData: this.gameData,
		});
	}

	/**
	 * Process the win queue to show the next win dialog
	 */
	private processWinQueue(): void {
		if (this.suppressWinDialogsUntilNextSpin) {
			console.log('[Game] Suppressing processing of win queue (transitioning from bonus to base)');
			return;
		}
		console.log(`[Game] processWinQueue called. Queue length: ${this.winQueue.length}`);
		console.log(`[Game] Current isShowingWinDialog state: ${gameStateManager.isShowingWinDialog}`);
		console.log(`[Game] Current dialog showing state: ${this.dialogs.isDialogShowing()}`);

		// Check dialog overlay visibility
		const dialogContainer = this.dialogs.getContainer();
		if (dialogContainer) {
			console.log(`[Game] Dialog overlay visible: ${dialogContainer.visible}, alpha: ${dialogContainer.alpha}`);
		}

		if (this.winQueue.length === 0) {
			console.log('[Game] Win queue is empty, nothing to process');
			return;
		}

		if (this.dialogs.isDialogShowing()) {
			console.log('[Game] Dialog still showing, cannot process win queue yet');
			return;
		}

		// Get the next win from the queue
		const nextWin = this.winQueue.shift();
		if (nextWin) {
			console.log(`[Game] Processing next win from queue: $${nextWin.payout} on $${nextWin.bet} bet. Queue remaining: ${this.winQueue.length}`);
			this.checkAndShowWinDialog(nextWin.payout, nextWin.bet);
		}
	}

	/**
	 * Clear the win queue (useful for resetting state)
	 */
	public clearWinQueue(): void {
		const queueLength = this.winQueue.length;
		this.winQueue = [];
		console.log(`[Game] Win queue cleared. Removed ${queueLength} pending wins`);
	}

	/**
	 * Get current win queue status for debugging
	 */
	private getWinQueueStatus(): string {
		return `Win Queue: ${this.winQueue.length} pending wins`;
	}


	private setupBonusModeEventListeners(): void {
		// Listen for bonus mode events from dialogs
		this.events.on('setBonusMode', (isBonus: boolean) => {
			console.log(`[Game] Setting bonus mode: ${isBonus}`);
			console.log(`[Game] Current gameStateManager.isBonus: ${this.gameStateManager.isBonus}`);

			// Ensure winnings display stays visible and transfers to bonus header on bonus start
			if (isBonus) {
				// Only transfer winnings if we're NOT already in bonus mode (i.e., this is the initial bonus activation)
				// During retriggers, we're already in bonus mode, so we should preserve the accumulated total
				const wasAlreadyInBonus = this.gameStateManager.isBonus;

				if (!wasAlreadyInBonus) {
					console.log('[Game] Bonus mode started - transferring winnings display to bonus header');
					try {
						const currentHeaderWin = this.header && typeof this.header.getCurrentWinnings === 'function'
							? Number(this.header.getCurrentWinnings()) || 0
							: 0;
						const triggerSpinWin = this.getTriggerSpinWinForBonusStart();
						if (this.bonusHeader) {
							// Seed the bonus header with the current total shown on the main header
							if (typeof (this.bonusHeader as any).seedFromFirstFreeSpinItem === 'function') {
								const spinData = this.gameAPI?.getCurrentSpinData?.() || (this.symbols as any)?.currentSpinData;
								(this.bonusHeader as any).seedFromFirstFreeSpinItem(spinData);
								console.log('[Game] Seeded BonusHeader from first free spin item');
							} else if (typeof (this.bonusHeader as any).seedCumulativeWin === 'function') {
								const seedWin = Math.max(0, Math.max(currentHeaderWin, triggerSpinWin));
								(this.bonusHeader as any).seedCumulativeWin(seedWin);
								console.log(`[Game] Seeded BonusHeader with base win: $${seedWin} (header=$${currentHeaderWin}, spinData=$${triggerSpinWin})`);

								// In bonus mode we only show per-tumble "YOU WON" values in the bonus header.
								// The seeded cumulative value is tracked internally; no immediate header UI update here.
							} else if (typeof this.bonusHeader.updateWinningsDisplay === 'function') {
								const seedWin = Math.max(0, Math.max(currentHeaderWin, triggerSpinWin));
								this.bonusHeader.updateWinningsDisplay(seedWin);
								console.log(`[Game] Updated BonusHeader winnings to: $${seedWin}`);
							}
						}
					} catch (e) {
						console.warn('[Game] Failed transferring winnings to BonusHeader on bonus start:', e);
					}
				} else {
					console.log('[Game] Already in bonus mode (retrigger detected) - preserving accumulated winnings total');
				}

				// Music will be switched when showBonusBackground event is emitted
			} else {
				console.log('[Game] Bonus mode ended - enabling winningsDisplay');
				// Ensure bonus-finished flag is cleared and bonus mode is turned off when leaving bonus
				this.gameStateManager.isBonus = false;
				this.gameStateManager.isBonusFinished = false;
				// Clear autoplay-related flags like on fresh spin
				this.gameStateManager.isAutoPlaying = false;
				this.gameStateManager.isAutoPlaySpinRequested = false;
				this.gameStateManager.isShowingWinDialog = false;
				// Suppress any win dialogs that might be triggered during the transition back to base
				this.suppressWinDialogsUntilNextSpin = true;
				// Prevent re-showing any queued base-game win dialogs after bonus ends
				this.clearWinQueue();
				// Proactively reset visuals and symbols in case the dialog didn't emit them
				this.events.emit('hideBonusBackground');
				this.events.emit('hideBonusHeader');
				this.events.emit('resetSymbolsForBase');
				// Reset free spin-related state across components
				this.events.emit('resetFreeSpinState');
				// Hide winnings displays on both headers (same as on spin start)
				try {
					if (this.header && typeof this.header.hideWinningsDisplay === 'function') {
						this.header.hideWinningsDisplay();
					}
					if (this.bonusHeader && typeof this.bonusHeader.hideWinningsDisplay === 'function') {
						this.bonusHeader.hideWinningsDisplay();
					}
					// Also fade out any lingering WinTracker entries when returning to base game
					if (this.winTracker) {
						this.winTracker.hideWithFade(250);
						console.log('[Game] Fading out WinTracker on bonus mode end (transition to base game)');
					}
				} catch (e) {
					console.warn('[Game] Failed to hide winnings displays on bonus end:', e);
				}
				// Notify other systems autoplay is fully stopped
				gameEventManager.emit(GameEventType.AUTO_STOP);
				// Switch back to main background music
				if (this.audioManager) {
					this.audioManager.playBackgroundMusic(MusicType.MAIN);
					console.log('[Game] Switched to main background music');
				}
			}

			// TODO: Update backend data isBonus flag if needed
		});

		this.events.on('showBonusBackground', () => {
			console.log('[Game] ===== SHOW BONUS BACKGROUND EVENT RECEIVED =====');
			console.log('[Game] Background exists:', !!this.background);
			console.log('[Game] BonusBackground exists:', !!this.bonusBackground);

			// Hide normal background
			if (this.background) {
				this.background.getContainer().setVisible(false);
				console.log('[Game] Normal background hidden');
			}

			// Show bonus background
			if (this.bonusBackground) {
				this.bonusBackground.getContainer().setVisible(true);
				console.log('[Game] Bonus background shown');
				console.log('[Game] Bonus background container visible:', this.bonusBackground.getContainer().visible);
			} else {
				console.error('[Game] BonusBackground is null!');
			}

			// Switch to bonus background music when background changes to bonus
			if (this.audioManager) {
				this.audioManager.playBackgroundMusic(MusicType.BONUS);
				console.log('[Game] Switched to bonus background music (bonusbg)');
			}

			console.log('[Game] ===== BONUS BACKGROUND EVENT HANDLED =====');
		});

		this.events.on('showBonusHeader', () => {
			console.log('[Game] ===== SHOW BONUS HEADER EVENT RECEIVED =====');
			console.log('[Game] Header exists:', !!this.header);
			console.log('[Game] BonusHeader exists:', !!this.bonusHeader);

			// Hide normal header
			if (this.header) {
				this.header.setVisible(false);
				console.log('[Game] Normal header hidden');
			}

			// Show bonus header
			if (this.bonusHeader) {
				this.bonusHeader.setVisible(true);
				console.log('[Game] Bonus header shown');
				console.log('[Game] Bonus header container visible:', this.bonusHeader.getContainer().visible);
				// If we already have a cumulative total (e.g., buy feature trigger win), show it immediately.
				// Fallback: if cumulative is still 0, seed once from header/spinData and show.
				try {
					const bonusHeaderAny: any = this.bonusHeader as any;
					const currentTotal = typeof bonusHeaderAny.getCumulativeBonusWin === 'function'
						? Number(bonusHeaderAny.getCumulativeBonusWin()) || 0
						: 0;
					if (currentTotal <= 0) {
						const headerWin = this.header && typeof this.header.getCurrentWinnings === 'function'
							? Number(this.header.getCurrentWinnings()) || 0
							: 0;
						const triggerWin = this.getTriggerSpinWinForBonusStart();
						const spinData = this.gameAPI?.getCurrentSpinData?.() || (this.symbols as any)?.currentSpinData;
						if (typeof bonusHeaderAny.seedFromFirstFreeSpinItem === 'function') {
							bonusHeaderAny.seedFromFirstFreeSpinItem(spinData);
							console.log('[Game] showBonusHeader fallback seed from first free spin item');
						} else {
							const seedWin = Math.max(0, Math.max(headerWin, triggerWin));
							if (seedWin > 0 && typeof bonusHeaderAny.seedCumulativeWin === 'function') {
								bonusHeaderAny.seedCumulativeWin(seedWin);
								console.log(`[Game] showBonusHeader fallback seed: $${seedWin} (header=$${headerWin}, spinData=$${triggerWin})`);
							}
						}
					}
					if (typeof bonusHeaderAny.showCumulativeTotalIfReady === 'function') {
						bonusHeaderAny.showCumulativeTotalIfReady();
					}
				} catch { }
			} else {
				console.error('[Game] BonusHeader is null!');
			}
			console.log('[Game] ===== BONUS HEADER EVENT HANDLED =====');
		});

		this.events.on('hideBonusBackground', () => {
			console.log('[Game] Hiding bonus background');

			// Show normal background
			if (this.background) {
				this.background.getContainer().setVisible(true);
				console.log('[Game] Normal background shown');
			}

			// Hide bonus background
			if (this.bonusBackground) {
				this.bonusBackground.getContainer().setVisible(false);
				console.log('[Game] Bonus background hidden');
			}
		});

		this.events.on('hideBonusHeader', () => {
			console.log('[Game] Hiding bonus header');

			// Show normal header
			if (this.header) {
				this.header.setVisible(true);
				console.log('[Game] Normal header shown');
			}

			// Hide bonus header
			if (this.bonusHeader) {
				this.bonusHeader.setVisible(false);
				console.log('[Game] Bonus header hidden');
			}
		});

		// Reset symbols back to base state
		this.events.on('resetSymbolsForBase', () => {
			console.log('[Game] Resetting symbols to base state');
			try {
				if (this.symbols) {
					// Do not clear Spine tracks here; keep symbols animating by forcing Idle loops
					if ((this.symbols as any).resumeIdleAnimationsForAllSymbols) {
						(this.symbols as any).resumeIdleAnimationsForAllSymbols();
					}
					// Also hide any winning overlays and restore depths/visibility
					if (typeof (this.symbols as any).hideWinningOverlay === 'function') {
						(this.symbols as any).hideWinningOverlay();
					}
					if (typeof (this.symbols as any).resetSymbolDepths === 'function') {
						(this.symbols as any).resetSymbolDepths();
					}
					if (typeof (this.symbols as any).restoreSymbolVisibility === 'function') {
						(this.symbols as any).restoreSymbolVisibility();
					}
				}
				// Reset any internal flags related to win dialogs
				gameStateManager.isShowingWinDialog = false;
				console.log('[Game] Symbols reset complete');
			} catch (e) {
				console.error('[Game] Error resetting symbols for base:', e);
			}
		});

		console.log('[Game] Bonus mode event listeners setup complete');

		// Add fullscreen toggle button (top-right) using shared manager
		const assetScale = this.networkManager.getAssetScale();
		FullScreenManager.addToggle(this, {
			margin: 16 * assetScale,
			iconScale: 1.5 * assetScale,
			depth: 1500,
			maximizeKey: 'maximize',
			minimizeKey: 'minimize'
		});

		// Add a test method to manually trigger bonus mode (for debugging)
		(window as any).testBonusMode = () => {
			console.log('[Game] TEST: Manually triggering bonus mode');
			console.log('[Game] TEST: Current isBonus state:', this.gameStateManager.isBonus);
			this.gameStateManager.isBonus = true;
			console.log('[Game] TEST: After setting isBonus to true:', this.gameStateManager.isBonus);
			this.events.emit('showBonusBackground');
			this.events.emit('showBonusHeader');
		};

		// Add a test method to simulate free spin dialog close
		(window as any).testFreeSpinDialogClose = () => {
			console.log('[Game] TEST: Simulating free spin dialog close');
			this.events.emit('showBonusBackground');
			this.events.emit('showBonusHeader');
		};

		// Add a method to check current state
		(window as any).checkBonusState = () => {
			console.log('[Game] Current game state:');
			console.log('- isBonus:', this.gameStateManager.isBonus);
			console.log('- isScatter:', this.gameStateManager.isScatter);
			console.log('- Background exists:', !!this.background);
			console.log('- BonusBackground exists:', !!this.bonusBackground);
			console.log('- Header exists:', !!this.header);
			console.log('- BonusHeader exists:', !!this.bonusHeader);
			if (this.background) console.log('- Background visible:', this.background.getContainer().visible);
			if (this.bonusBackground) console.log('- BonusBackground visible:', this.bonusBackground.getContainer().visible);
			if (this.header) console.log('- Header visible:', this.header.getContainer().visible);
			if (this.bonusHeader) console.log('- BonusHeader visible:', this.bonusHeader.getContainer().visible);
		};

		// Add a helper to adjust default win dialog auto-close from the console
		(window as any).setWinDialogAutoClose = (ms?: number | null, enabled: boolean = true) => {
			const value = (ms === undefined) ? 2000 : ms;
			this.dialogs.setDefaultWinDialogAutoClose(value === null ? null : Number(value), enabled);
		};

		// Add a helper to show a Medium win dialog from the console.
		(window as any).showMediumWin = (amount: number = 10000, bet: number = 1) => {
			this.dialogs.showMediumWin(this, { winAmount: amount, betAmount: bet });
		};
		(window as any).showSmallWin = (amount: number = 10000, bet: number = 1) => {
			this.dialogs.showSmallWin(this, { winAmount: amount, betAmount: bet });
		};
		(window as any).showLargeWin = (amount: number = 10000, bet: number = 1) => {
			this.dialogs.showLargeWin(this, { winAmount: amount, betAmount: bet });
		};
		(window as any).showSuperWin = (amount: number = 10000, bet: number = 1) => {
			this.dialogs.showSuperWin(this, { winAmount: amount, betAmount: bet });
		};

	}

	private getTriggerSpinWinForBonusStart(): number {
		try {
			const spinData = this.gameAPI?.getCurrentSpinData?.() || (this.symbols as any)?.currentSpinData;
			const slot: any = spinData?.slot;
			if (!slot) return 0;

			const explicitTotal = Number(slot.totalWin ?? spinData?.totalWin ?? 0);

			let paylineWin = 0;
			if (Array.isArray(slot.paylines)) {
				for (const payline of slot.paylines) {
					paylineWin += Number(payline?.win ?? 0) || 0;
				}
			}

			let tumbleWin = 0;
			if (Array.isArray(slot.tumbles)) {
				for (const tumble of slot.tumbles) {
					tumbleWin += Number(tumble?.win ?? 0) || 0;
				}
			}

			const derivedTotal = paylineWin + tumbleWin;
			return Math.max(0, explicitTotal, derivedTotal);
		} catch {
			return 0;
		}
	}

	changeScene() {
		// Scene change logic if needed
	}

	spin() {
		console.log('Game Spin');

		// Check if we're in bonus mode - if so, let the free spin autoplay system handle it
		if (this.gameStateManager.isBonus) {
			console.log('[Game] In bonus mode - skipping old spin system, free spin autoplay will handle it');
			return;
		}

		this.gameStateManager.startSpin();
	}

	turbo() {
		console.log('Game Turbo');
		this.gameStateManager.toggleTurbo();
	}

}
