import { NetworkManager } from "../managers/NetworkManager";
import { ScreenModeManager } from "../managers/ScreenModeManager";
import { BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT } from "./GameConfig";

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
				'shine': `assets/portrait/high/background/shine.png`,
				'dijoker_loading': `${prefix}/dijoker_loading/DI JOKER.png`
			},
			spine: {
				'BG_Conveyor_PC': {
					atlas: `${prefix}/conveyor/BG_Conveyor_PC.atlas`,
					json: `${prefix}/conveyor/BG_Conveyor_PC.json`
				},
				'di_joker': {
					atlas: `${prefix}/dijoker_loading/DI JOKER.atlas`,
					json: `${prefix}/dijoker_loading/DI JOKER.json`
				}
			}
		};
	}

	getBonusBackgroundAssets(): AssetGroup {
		// Same layout and assets as normal game
		return this.getBackgroundAssets();
	}

	getHeaderAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'Header_Scene': `${prefix}/header/Header_Scene.webp`,
				'Header_SceneFrame': `${prefix}/header/Header_SceneFrame.webp`,
				'Header_WinBar': `${prefix}/header/Header_WinBar.webp`
			},
			spine: {
				'BG_ConveyorTop_PC': {
					atlas: `${prefix}/conveyor/BG_ConveyorTop_PC.atlas`,
					json: `${prefix}/conveyor/BG_ConveyorTop_PC.json`
				},
				'Confetti_VFX_PC': {
					atlas: `assets/portrait/high/vfx/Confetti_VFX_PC.atlas`,
					json: `assets/portrait/high/vfx/Confetti_VFX_PC.json`
				},
				'JimboyNormal_PC': {
					atlas: `assets/portrait/high/characters/JimboyNormal_PC.atlas`,
					json: `assets/portrait/high/characters/JimboyNormal_PC.json`
				},
				'BG_Animals_PC': {
					atlas: `assets/portrait/high/characters/BG_Animals_PC.atlas`,
					json: `assets/portrait/high/characters/BG_Animals_PC.json`
				}
			}
		};
	}

	getBonusHeaderAssets(): AssetGroup {
		// Same layout and assets as normal game (including conveyor top)
		return this.getHeaderAssets();
	}


	getLoadingAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();

		return {
			images: {
				'loading_background': `${prefix}/background/LoadingScreen.png`,
				'header_logo': `${prefix}/background/HeaderLogo.png`,
				'button_bg': `${prefix}/loading/button_bg.png`,
				'button_spin': `${prefix}/loading/button_spin.png`,
				'loading_frame': `${prefix}/loading/loading-frame.png`,
				'loading_frame_2': `${prefix}/loading/loading-frame-2.png`,
				'dijoker_logo': `${prefix}/loading/DiJoker-logo.png`,
			},
			spine: {
				// Studio loading spine (DI JOKER) – only available in portrait/high
				'di_joker': {
					atlas: `${prefix}/dijoker_loading/DI JOKER.atlas`,
					json: `${prefix}/dijoker_loading/DI JOKER.json`
				},
			}
		};
	}

	// Add more asset groups as needed
	getSymbolAssets(): AssetGroup {
		// Symbols and related bonus art live under portrait/high for pastry_cub.
		const suffix = 'PC';
		const pcPath = 'assets/portrait/high/symbols/';

		// Generate symbol assets for all symbols (0-10)
		const symbolImages: { [key: string]: string } = {};
		const symbolSpine: { [key: string]: { atlas: string; json: string } } = {};

		// Symbol Spine: 0-7 (scatter + regular)
		for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
			const spineKey = `symbol_${i}_spine`;
			symbolSpine[spineKey] = { atlas: `${pcPath}/Symbol${i}_${suffix}.atlas`, json: `${pcPath}/Symbol${i}_${suffix}.json` };
		}

		// symbols for helper (HelpScreen, etc.): 0-7 only
		for (let i = 0; i <= 7; i++) {
			const spritePath = `${pcPath}/statics/symbol${i}.png`;
			symbolImages[`symbol${i}`] = spritePath;
			symbolImages[`symbol_${i}`] = spritePath;
		}

		// Bonus-grid Jimboy character (separate from symbol cells)
		symbolSpine['JimboyBonus_PC'] = {
			atlas: `assets/portrait/high/characters/JimboyBonus_PC.atlas`,
			json: `assets/portrait/high/characters/JimboyBonus_PC.json`
		};

		// Multiplier overlays for bonus grid image tiers (1st mark->x1, 2nd->x2, ...).
		// Files expected in: assets/portrait/high/symbols/pastry_cub_symbols/multiplier_symbols/x1.webp, x2.webp, ...
		BONUS_MULTIPLIER_IMAGE_BY_MARK_COUNT.forEach((mult, index) => {
			const key = `bonus_multiplier_x${mult}`;
			const path = `${pcPath}/multiplier_symbols/x${mult}.webp`;
			symbolImages[key] = path;
		});

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

		return {
			fonts: {
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
				// Payline visuals
				'paylineMobileWin': `${prefix}/help_screen/game_settings_content/paylineMobileWin.webp`,
				'paylineMobileNoWin': `${prefix}/help_screen/game_settings_content/paylineMobileNoWin.webp`,
				// Alias for existing GameSettingsContent key
				'help_paylines': `${prefix}/help_screen/game_settings_content/paylineMobileWin.webp`,

				// Scatter / Tumble / Multiplier visuals
				'scatterGame': `${prefix}/help_screen/bonus_game_content/scatterGame.png`,
				'tumbleWin': `${prefix}/help_screen/bonus_game_content/tumbleWin.png`,
				'multiplierGame': `${prefix}/help_screen/bonus_game_content/multiplierGame.png`,

				// How To Play || Bet controls
				'betControlsMinus': `${prefix}/help_screen/how_to_play_content/betControls_minus.png`,
				'betControlsPlus': `${prefix}/help_screen/how_to_play_content/betControls_plus.png`,

				// How To Play || Game actions
				'spin_button': `${prefix}/help_screen/how_to_play_content/spin_button.png`,
				'enhanced_bet_button': `${prefix}/help_screen/how_to_play_content/enhanced_bet.png`,
				'amplify_bet_button': `${prefix}/help_screen/how_to_play_content/enhanced_bet.png`,
				'autoplay_button': `${prefix}/help_screen/how_to_play_content/autoplay.png`,
				'turbo_button': `${prefix}/help_screen/how_to_play_content/turbo.png`,

				// How To Play || General controls
				'sound_icon_on': `${prefix}/help_screen/how_to_play_content/sound_icon_on.png`,
				'sound_icon_off': `${prefix}/help_screen/how_to_play_content/sound_icon_off.png`,
				'settings_icon': `${prefix}/help_screen/how_to_play_content/settings.png`,
				'info_icon': `${prefix}/help_screen/how_to_play_content/info.png`,
			}
		};
	}

	getDialogAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();


		return {
			spine: {
				'Congrats': {
					atlas: `${prefix}/dialogs/Congrats_PC.atlas`,
					json: `${prefix}/dialogs/Congrats_PC.json`
				},
				'BigWin': {
					atlas: `${prefix}/dialogs/BigW_PC.atlas`,
					json: `${prefix}/dialogs/BigW_PC.json`
				},
				'MegaWin': {
					atlas: `${prefix}/dialogs/MegaW_PC.atlas`,
					json: `${prefix}/dialogs/MegaW_PC.json`
				},
				'EpicWin': {
					atlas: `${prefix}/dialogs/EpicW_PC.atlas`,
					json: `${prefix}/dialogs/EpicW_PC.json`
				},
				'SuperWin': {
					atlas: `${prefix}/dialogs/SuperW_PC.atlas`,
					json: `${prefix}/dialogs/SuperW_PC.json`
				},
				'MaxWin': {
					atlas: `${prefix}/dialogs/MaxW_PC.atlas`,
					json: `${prefix}/dialogs/MaxW_PC.json`
				},
				'TotalWin': {
					atlas: `${prefix}/dialogs/Congrats_PC.atlas`,
					json: `${prefix}/dialogs/Congrats_PC.json`
				},
				'FreeSpin': {
					atlas: `${prefix}/dialogs/FreeSpin_PC.atlas`,
					json: `${prefix}/dialogs/FreeSpin_PC.json`
				}
			}
		};
	}

	getForegroundAssets(): AssetGroup {
		// Foreground/VFX assets that are still needed at runtime.
		return {
			spine: {
				'Glow_Effect_PC': {
					atlas: `assets/portrait/high/vfx/Glow_Effect_PC.atlas`,
					json: `assets/portrait/high/vfx/Glow_Effect_PC.json`
				}
			}
		};
	}

	/**
	 * Scatter Anticipation assets – only available in portrait/high for now.
	 * We intentionally do not use getAssetPrefix() to avoid missing assets on low quality.
	 */
	getScatterAnticipationAssets(): AssetGroup {
		return {
			spine: {}
		};
	}

	getNumberAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();


		// Generate number assets for digits 0-9, plus comma and dot
		const numberImages: { [key: string]: string } = {};

		// Add digit images (0-9)
		for (let i = 0; i <= 9; i++) {
			const key = `number_${i}`;
			const path = `${prefix}/numbers/Number${i}.webp`;
			numberImages[key] = path;
		}

		// Add comma and dot
		numberImages['number_comma'] = `${prefix}/numbers/comma.webp`;
		numberImages['number_dot'] = `${prefix}/numbers/dot.webp`;


		return {
			images: numberImages
		};
	}

	getBuyFeatureAssets(): AssetGroup {
		const prefix = this.getAssetPrefix();


		return {
			images: {
				'buy_feature_logo': `${prefix}/buy_feature/buy_feature_logo.webp`,
				'buy_feature_logo2': `${prefix}/buy_feature/buy_feature_logo2.webp`,
				'buy_feature_bg': `${prefix}/buy_feature/buy_feature_bg.webp`,
				'buy_feature_selected_icon': `${prefix}/buy_feature/selected_icon.png`,
			}
		};
	}

	//-------------------------
	// Audio assets
	//-------------------------

	getAudioAssets(): AssetGroup {

		return {
			audio: {
				// Menu/UI clicks
				'click': 'assets/sounds/SFX/click_2.ogg',
				//BG sounds
				'mainbg': 'assets/sounds/BG/normalbg_PC.ogg',
				'bonusbg': 'assets/sounds/BG/bonusbg_PC.ogg',
				'freespinbg': 'assets/sounds/BG/freespinbg_PC.ogg',
				'spinb': 'assets/sounds/SFX/spin_PC.ogg',
				'reelroll': 'assets/sounds/SFX/reelroll_PC.ogg',
				'reeldrop': 'assets/sounds/SFX/reeldrop_PC.ogg',
				// Scatter reel-drop variants (played progressively per scatter reel in a spin)
				'scatterdrop1': 'assets/sounds/SFX/symbol_win/scatter_1_PC.ogg',
				'scatterdrop2': 'assets/sounds/SFX/symbol_win/scatter_2_PC.ogg',
				'scatterdrop3': 'assets/sounds/SFX/symbol_win/scatter_3_PC.ogg',
				'scatterdrop4': 'assets/sounds/SFX/symbol_win/scatter_4_PC.ogg',
				// Scatter collect SFX (played when scatter symbols merge to center)
				'scatter_collect': 'assets/sounds/SFX/scatter_collect_PC.ogg',
				// Scatter burn SFX (chained after scatter_PC during scatter win animation)
				'scatter_burn': 'assets/sounds/SFX/scatter_burn_PC.ogg',
				'turbodrop': 'assets/sounds/SFX/turbo_PC.ogg',
				// Non-scatter box close SFX (played once when all regular symbol wins finish)
				'box_close': 'assets/sounds/SFX/tumble_box_PC.ogg',
				'man_spy_pc': 'assets/sounds/SFX/man_spy_PC.ogg',
				// Radial light transition whistle SFX
				'whistle': 'assets/sounds/SFX/whistle_BB.ogg',
				'scatter': 'assets/sounds/SFX/scatter_PC.ogg',
				// Tumble symbol-win SFX (play per tumble index)
				'twin1': 'assets/sounds/SFX/symbol_win/twin_1_PC.ogg',
				'twin2': 'assets/sounds/SFX/symbol_win/twin_2_PC.ogg',
				'twin3': 'assets/sounds/SFX/symbol_win/twin_3_PC.ogg',
				'twin4': 'assets/sounds/SFX/symbol_win/twin_4_PC.ogg',
				// Win dialog SFX
				'bigw': 'assets/sounds/Wins/bigw_PC.ogg',
				'megaw': 'assets/sounds/Wins/megaw_PC.ogg',
				'superw': 'assets/sounds/Wins/superw_PC.ogg',
				'epicw': 'assets/sounds/Wins/epicw_PC.ogg',
				'maxw': 'assets/sounds/Wins/maxw_PC.ogg',
				'maxwend': 'assets/sounds/Wins/maxwend_PC.ogg',
				// Use totalw SFX as the Congrats/TotalWin dialog sound (mapped to 'congrats')
				'congrats': 'assets/sounds/Wins/totalw_PC.ogg',
				'totalw': 'assets/sounds/Wins/totalw_PC.ogg',
				'retrigger': 'assets/sounds/Wins/retrigger_PC.ogg',
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
			buyFeature: this.getBuyFeatureAssets(),
			audio: this.getAudioAssets(),
		};
	}

	// Method to get debug info
	getDebugInfo(): void {
		const prefix = this.getAssetPrefix();
	}
} 



