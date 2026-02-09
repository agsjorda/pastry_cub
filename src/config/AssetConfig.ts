import { NetworkManager } from "../managers/NetworkManager";
import { ScreenModeManager } from "../managers/ScreenModeManager";

export interface AssetGroup {
	images?: { [key: string]: string };
	spine?: { [key: string]: { atlas: string; json: string } };
	audio?: { [key: string]: string };
	fonts?: { [key: string]: string };
}

export class AssetConfig {
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	private getAssetPrefix(): string {
		const screenConfig = this.screenModeManager.getScreenConfig();
		const isHighSpeed = this.networkManager.getNetworkSpeed();

		const orientation = screenConfig.isPortrait ? 'portrait' : 'landscape';
		const quality = isHighSpeed ? 'high' : 'low';

		return `assets/${orientation}/${quality}`;
	}

	getBackgroundAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'BG-Default': `${prefix}/background/NormalGame.webp`,
				'normal-bg-cover': `${prefix}/background/ControllerNormal_PC.png`,
				'meter': `${prefix}/background/Meter1.png`,
				'loading-spinner': `assets/portrait/high/loading/loading-spinner.png`,
				'shine': `assets/portrait/high/background/shine.png`
			},
			spine: {
				'BG_Conveyor_PC': {
					atlas: `${prefix}/conveyor/BG_Conveyor_PC.atlas`,
					json: `${prefix}/conveyor/BG_Conveyor_PC.json`
				}
			}
		};
	}

	getBonusBackgroundAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		// Reuse normal game background and controller assets to minimize uploads (no bonus spine)
		return {
			images: {
				'BG-Bonus': `${prefix}/background/NormalGame.webp`,
				'bonus-bg-cover': `${prefix}/background/ControllerNormal_PC.png`,
				'meter': `${prefix}/background/Meter1.png`,
			},
			spine: {}
		};
	}

	getHeaderAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'Header_Scene': `${prefix}/header/Header_Scene.webp`,
				'Header_SceneFrame': `${prefix}/header/Header_SceneFrame.webp`,
				'Header_WinBar': `${prefix}/header/Header_WinBar.webp`
			},
			spine: {}
		};
	}

	getBonusHeaderAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'Header_Scene': `${prefix}/header/Header_Scene.webp`,
				'Header_SceneFrame': `${prefix}/header/Header_SceneFrame.webp`,
				'Header_WinBar': `${prefix}/header/Header_WinBar.webp`
			},
			spine: {}
		};
	}


	getLoadingAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'loading_background': `${prefix}/background/LoadingScreen.png`,
				'header_logo': `${prefix}/background/HeaderLogo.png`,
				'button_bg': `${prefix}/loading/button_bg.png`,
				'button_spin': `${prefix}/loading/button_spin.png`,
				'logo_loading': `${prefix}/loading/logo-loading.png`,
				'loading_frame': `${prefix}/loading/loading-frame.png`,
				'loading_frame_2': `${prefix}/loading/loading-frame-2.png`,
				'dijoker_logo': `${prefix}/loading/DiJoker-logo.png`,
				// Character1 texture - must be loaded before spine asset
				'Character1_BZ.webp': `assets/characters/Character1_BZ.webp`,
				// Character2 texture - must be loaded before spine asset
				'Character2_BZ.webp': `assets/characters/Character2_BZ.webp`
			},
			spine: {
				// Studio loading spine (DI JOKER) – only available in portrait/high
				'di_joker': {
					atlas: `${prefix}/dijoker_loading/DI JOKER.atlas`,
					json: `${prefix}/dijoker_loading/DI JOKER.json`
				},
				// Character1 for preloader screen
				'character1': {
					atlas: `assets/characters/Character1_BZ.atlas`,
					json: `assets/characters/Character1_BZ.json`
				},
				// Character2 for preloader screen
				'character2': {
					atlas: `assets/characters/Character2_BZ.atlas`,
					json: `assets/characters/Character2_BZ.json`
				}
			}
		};
	}

	// Add more asset groups as needed
	getSymbolAssets(): AssetGroup {
		const prefix = this.getAssetPrefix(); // This gives us assets/{orientation}/{quality}
		const suffix = 'PC'
		console.log(`[AssetConfig] Loading symbol assets from: ${prefix}/symbols/`);

		// Generate symbol assets for all symbols (0-10)
		const symbolImages: { [key: string]: string } = {};
		const symbolSpine: { [key: string]: { atlas: string; json: string } } = {};

		// Symbol Spine: 0-7 (scatter + regular), 10 (multiplier base). Symbols 8-9, 11-22 use Symbol10 as fallback.
		const pcPath = 'assets/symbols/high/pastry_cub_symbols';
		for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 10]) {
			const spineKey = `symbol_${i}_sugar_spine`;
			symbolSpine[spineKey] = { atlas: `${pcPath}/Symbol${i}_${suffix}.atlas`, json: `${pcPath}/Symbol${i}_${suffix}.json` };
		}

		// symbols for helper (HelpScreen, etc.): 0-7 only
		for (let i = 0; i <= 7; i++) {
			const spritePath = `${pcPath}/statics/symbol${i}.png`;
			symbolImages[`symbol${i}`] = spritePath;
			symbolImages[`symbol_${i}`] = spritePath;
		}

		// Multiplier overlays: symbol ID -> overlay label (matches GameConfig.MULTIPLIER_VALUES)
		const overlayMap: { [value: number]: string } = {
			8: '2', 9: '3', 10: '4', 11: '5', 12: '6', 13: '8', 14: '10', 15: '12',
			16: '15', 17: '20', 18: '25', 19: '50', 20: '100', 21: '250', 22: '500'
		};
		Object.entries(overlayMap).forEach(([valueStr, label]) => {
			const value = Number(valueStr);
			const key = `multiplier_overlay_${value}`;
			const path = `assets/symbols/high/pastry_cub_symbols/multiplier_symbols/${label}.webp`;
			symbolImages[key] = path;
			console.log(`[AssetConfig] Multiplier overlay ${value}: ${path}`);
		});
		
		// Symbol removal explosion VFX
		symbolSpine['Explosion_BZ_VFX'] = {
			atlas: `assets/symbols/high/pastry_cub_symbols/Explosion_BZ_VFX.atlas`,
			json: `assets/symbols/high/pastry_cub_symbols/Explosion_BZ_VFX.json`
		};
		console.log('[AssetConfig] Explosion VFX spine: Explosion_BZ_VFX');

		return {
			images: symbolImages,
			spine: symbolSpine
		};
	}

	getButtonAssets(): AssetGroup {
		// Controller buttons now follow portrait/landscape structure
		const screenConfig = this.screenModeManager.getScreenConfig();
		const isHighSpeed = this.networkManager.getNetworkSpeed();
		const quality = isHighSpeed ? 'high' : 'low';
		const screenMode = screenConfig.isPortrait ? 'portrait' : 'landscape';

		console.log(`[AssetConfig] Loading controller buttons with quality: ${quality}, screen mode: ${screenMode}`);

		return {
			images: {
				'autoplay_off': `assets/controller/${screenMode}/${quality}/autoplay_off.png`,
				'autoplay_on': `assets/controller/${screenMode}/${quality}/autoplay_on.png`,
				'decrease_bet': `assets/controller/${screenMode}/${quality}/decrease_bet.png`,
				'increase_bet': `assets/controller/${screenMode}/${quality}/increase_bet.png`,
				'menu': `assets/controller/${screenMode}/${quality}/menu.png`,
				'spin': `assets/controller/${screenMode}/${quality}/spin_bg.png`,
				'spin_icon': `assets/controller/${screenMode}/${quality}/spin_icon.png`,
				'autoplay_stop_icon': `assets/controller/${screenMode}/${quality}/autoplay_stop_icon.png`,
				'turbo_off': `assets/controller/${screenMode}/${quality}/turbo_off.png`,
				'turbo_on': `assets/controller/${screenMode}/${quality}/turbo_on.png`,
				'amplify': `assets/controller/${screenMode}/${quality}/amplify.png`,
				'feature': `assets/controller/${screenMode}/${quality}/feature.png`,
				'long_button': `assets/controller/${screenMode}/${quality}/long_button.png`,
				'maximize': `assets/controller/${screenMode}/${quality}/maximize.png`,
				'minimize': `assets/controller/${screenMode}/${quality}/minimize.png`,
				// Free round button background (currently only available as portrait/high asset)
				// We reference it directly so it can be used in all modes without additional variants.
				'freeround_bg': `assets/controller/portrait/high/freeround_bg.png`,
				// "Spin Now" button for free round reward panel (portrait/high only asset)
				'spin_now_button': `assets/controller/portrait/high/spin_now_button.png`,
			},
			spine: {
				'spin_button_animation': {
					atlas: `assets/controller/${screenMode}/${quality}/spin_button_anim/spin_button_anim.atlas`,
					json: `assets/controller/${screenMode}/${quality}/spin_button_anim/spin_button_anim.json`
				},
				// Free-round specific spin button animation (portrait/high only asset)
				// Used instead of the normal spin_button_animation while in initialization
				// free-round spins mode.
				'fr_spin_button_animation': {
					atlas: `assets/controller/portrait/high/Button_Bonus_Buttom/Button_Bonus_VFX.atlas`,
					json: `assets/controller/portrait/high/Button_Bonus_Buttom/Button_Bonus_VFX.json`
				},
				'button_animation_idle': {
					atlas: `assets/controller/${screenMode}/${quality}/button_animation_idle/button_animation_idle.atlas`,
					json: `assets/controller/${screenMode}/${quality}/button_animation_idle/button_animation_idle.json`
				},
				'amplify_bet': {
					atlas: `assets/portrait/high/amplify_bet/Amplify Bet.atlas`,
					json: `assets/portrait/high/amplify_bet/Amplify Bet.json`
				},
				// Enhance Bet idle loop (available only in portrait/high for now)
				'enhance_bet_idle_on': {
					atlas: `assets/controller/portrait/high/enhanceBet_idle_on/Amplify Bet.atlas`,
					json: `assets/controller/portrait/high/enhanceBet_idle_on/Amplify Bet.json`
				},
				'turbo_animation': {
					atlas: `assets/controller/${screenMode}/${quality}/turbo_animation/Turbo_Spin.atlas`,
					json: `assets/controller/${screenMode}/${quality}/turbo_animation/Turbo_Spin.json`
				}
			}
		};
	}

	getFontAssets(): AssetGroup {
		console.log(`[AssetConfig] Loading font assets`);

		return {
			fonts: {
				'poppins-thin': 'assets/fonts/poppins/Poppins-Thin.ttf',
				'poppins-bold': 'assets/fonts/poppins/Poppins-Bold.ttf',
				'poppins-regular': 'assets/fonts/poppins/Poppins-Regular.ttf'

			}
		};
	}

	getMenuAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();
		return {
			images: {
				// Menu tab icons
				'menu_info': `${prefix}/menu/Info.png`,
				'menu_history': `${prefix}/menu/History.png`,
				'menu_settings': `${prefix}/menu/Settings.png`,
				// Pagination and loading
				'icon_left': `${prefix}/menu/icon_left.png`,
				'icon_most_left': `${prefix}/menu/icon_most_left.png`,
				'icon_right': `${prefix}/menu/icon_right.png`,
				'icon_most_right': `${prefix}/menu/icon_most_right.png`,
				'loading_icon': `${prefix}/menu/loading.png`,
				// Close icon (portrait/high specific path)
				'menu_close': `assets/controller/portrait/high/close.png`
			}
		};
	}

	getHelpScreenAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();
		return {
			images: {
				'helpscreen_0': `${prefix}/help_screen/helpscreen_0.webp`,
				'helpscreen_1': `${prefix}/help_screen/helpscreen_1.webp`,
				'helpscreen_2': `${prefix}/help_screen/helpscreen_2.webp`,
				'helpscreen_3': `${prefix}/help_screen/helpscreen_3.webp`,
			}
		};
	}

	getDialogAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		console.log(`[AssetConfig] Loading dialog assets with prefix: ${prefix}`);

		return {
			spine: {
				'Congrats_BZ': {
					atlas: `${prefix}/dialogs/Congrats_BZ.atlas`,
					json: `${prefix}/dialogs/Congrats_BZ.json`
				},
				'BigW_BZ': {
					atlas: `${prefix}/dialogs/BigW_BZ.atlas`,
					json: `${prefix}/dialogs/BigW_BZ.json`
				},
				'MegaW_BZ': {
					atlas: `${prefix}/dialogs/MegaW_BZ.atlas`,
					json: `${prefix}/dialogs/MegaW_BZ.json`
				},
				'EpicW_BZ': {
					atlas: `${prefix}/dialogs/EpicW_BZ.atlas`,
					json: `${prefix}/dialogs/EpicW_BZ.json`
				},
				'SuperW_BZ': {
					atlas: `${prefix}/dialogs/SuperW_BZ.atlas`,
					json: `${prefix}/dialogs/SuperW_BZ.json`
				},
				'TotalW_BZ': {
					atlas: `${prefix}/dialogs/TotalW_BZ.atlas`,
					json: `${prefix}/dialogs/TotalW_BZ.json`
				},
				// Total win overlay notes animation (uses TotalW_BZ atlas pages)
				'TotalW_BZ_meow': {
					atlas: `${prefix}/dialogs/TotalW_BZ.atlas`,
					json: `${prefix}/dialogs/cats meow.json`
				},
				'FreeSpin_BZ': {
					atlas: `${prefix}/dialogs/FreeSpin_BZ.atlas`,
					json: `${prefix}/dialogs/FreeSpin_BZ.json`
				},
				'FreeSpinRetri_BZ': {
					atlas: `${prefix}/dialogs/FreeSpinRetri_BZ.atlas`,
					json: `${prefix}/dialogs/FreeSpinRetri_BZ.json`
				},
				'Transition_BZ': {
					atlas: `${prefix}/dialogs/Transition_BZ.atlas`,
					json: `${prefix}/dialogs/Transition_BZ.json`
				}
			}
		};
	}

	getForegroundAssets(): AssetGroup {
		// Old TV overlay not used for pastry_cub
		return { spine: {} };
	}

	/**
	 * Scatter Anticipation assets – only available in portrait/high for now.
	 * We intentionally do not use getAssetPrefix() to avoid missing assets on low quality.
	 */
	getScatterAnticipationAssets(): AssetGroup {
		console.log('[AssetConfig] Loading Scatter Anticipation assets');
		return {
			spine: {}
		};
	}

	getNumberAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		console.log(`[AssetConfig] Loading number assets with prefix: ${prefix}`);

		// Generate number assets for digits 0-9, plus comma and dot
		const numberImages: { [key: string]: string } = {};

		// Add digit images (0-9)
		for (let i = 0; i <= 9; i++) {
			const key = `number_${i}`;
			const path = `${prefix}/numbers/Number${i}.webp`;
			numberImages[key] = path;
			console.log(`[AssetConfig] Number ${key}: ${path}`);
		}

		// Add comma and dot
		numberImages['number_comma'] = `${prefix}/numbers/comma.webp`;
		numberImages['number_dot'] = `${prefix}/numbers/dot.webp`;

		console.log(`[AssetConfig] Number comma: ${prefix}/numbers/comma.webp`);
		console.log(`[AssetConfig] Number dot: ${prefix}/numbers/dot.webp`);

		return {
			images: numberImages
		};
	}

	getCoinAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		console.log(`[AssetConfig] Loading coin assets with prefix: ${prefix}`);

		return {
			images: {
				'coin': `${prefix}/coin/coin.png`
			}
		};
	}

	getBuyFeatureAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		console.log(`[AssetConfig] Loading buy feature assets with prefix: ${prefix}`);

		return {
			images: {
				'buy_feature_logo': `${prefix}/buy_feature/buy_feature_logo.webp`,
				'buy_feature_bg': `${prefix}/buy_feature/buy_feature_bg.webp`,
			}
		};
	}

	//-------------------------
	// Audio assets
	//-------------------------

	getAudioAssets(): AssetGroup {
		console.log(`[AssetConfig] Loading audio assets`);

		return {
			audio: {
				// Menu/UI clicks
				'click_bz': 'assets/sounds/click_sw.ogg',
				//BG sounds
				'mainbg_bz': 'assets/sounds/BG/mainbg_BB.ogg',
				'bonusbg_bz': 'assets/sounds/BG/bonusbg_BB.ogg',
				'freespinbg_bz': 'assets/sounds/BG/freespinwonbg_BB.ogg',
				'spinb_bz': 'assets/sounds/SFX/spin_BB.ogg',
				'reeldrop_bz': 'assets/sounds/SFX/reeldrop_BB.ogg',
				'turbodrop_bz': 'assets/sounds/SFX/turbodrop_BB.ogg',
				// Candy explosion transition SFX (used by SymbolExplosionTransition)
				'candy_transition_bz': 'assets/sounds/SFX/candy_transition.ogg',
				// Scatter win "nom nom" SFX – played when scatter win animation runs
				'nomnom_bz': 'assets/sounds/SFX/nomnom_sw.ogg',
				'coin_throw_bz': 'assets/sounds/SFX/coin_throw_ka.ogg',
				'coin_drop_bz': 'assets/sounds/SFX/coin_drop_ka.ogg',
				// Multiplier trigger / bomb SFX (bonus-mode multipliers)
				'bomb_bz': 'assets/sounds/SFX/bomb_sw.ogg',
				'tbomb_bz': 'assets/sounds/SFX/tbomb_BB.ogg',
				// Transition_BZ SFX (anticipation_BB)
				'ghost_whisper_bz': 'assets/sounds/SFX/anticipation_BB.ogg',
				// Radial light transition whistle SFX
				'whistle_bz': 'assets/sounds/SFX/whistle_BB.ogg',
				'scatter_bz': 'assets/sounds/SFX/scatter_BB.ogg',
				// Tumble symbol-win SFX (play per tumble index)
				'twin1_bz': 'assets/sounds/SFX/symbol_win/twin1_BB.ogg',
				'twin2_bz': 'assets/sounds/SFX/symbol_win/twin2_BB.ogg',
				'twin3_bz': 'assets/sounds/SFX/symbol_win/twin3_BB.ogg',
				'twin4_bz': 'assets/sounds/SFX/symbol_win/twin4_BB.ogg',
				// Win dialog SFX
				'bigw_bz': 'assets/sounds/Wins/bigw_BB.ogg',
				'megaw_bz': 'assets/sounds/Wins/megaw_BB.ogg',
				'superw_bz': 'assets/sounds/Wins/superw_BB.ogg',
				'epicw_bz': 'assets/sounds/Wins/epicw_BB.ogg',
				'congrats_bz': 'assets/sounds/Wins/congrats_BB.ogg'
			}
		};
	}

	// Helper method to get all assets for a scene
	getAllAssets(): { [key: string]: AssetGroup } {
		return {
			background: this.getBackgroundAssets(),
			bonusBackground: this.getBonusBackgroundAssets(),
			header: this.getHeaderAssets(),
			bonusHeader: this.getBonusHeaderAssets(),
			loading: this.getLoadingAssets(),
			symbols: this.getSymbolAssets(),
			buttons: this.getButtonAssets(),
			fonts: this.getFontAssets(),
			dialogs: this.getDialogAssets(),
			numbers: this.getNumberAssets(),
			coin: this.getCoinAssets(),
			buyFeature: this.getBuyFeatureAssets(),
			audio: this.getAudioAssets(),
		};
	}

	// Method to get debug info
	getDebugInfo(): void {
		const prefix = this.getAssetPrefix();
		console.log(`[AssetConfig] Asset prefix: ${prefix}`);
		console.log(`[AssetConfig] Available asset groups:`, Object.keys(this.getAllAssets()));
	}
} 
