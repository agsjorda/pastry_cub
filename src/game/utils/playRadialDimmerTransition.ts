import { Scene } from 'phaser';
import { RadialDimmerTransition } from '../components/RadialDimmerTransition';

/**
 * Play a radial dimmer transition (black overlay with shrinking circular hole), then call onComplete.
 * Used e.g. from Preloader to transition into the Game scene.
 * Plays whistle_BB.ogg at the start of the transition when available.
 */
export function playRadialDimmerTransition(
	scene: Scene,
	onComplete: () => void,
	opts?: { onWhistleComplete?: () => void },
): void {
	// Play whistle SFX at transition start (asset key 'whistle' – e.g. whistle_BB.ogg)
	try {
		if (scene.cache.audio.exists('whistle')) {
			const whistle = scene.sound.add('whistle', { volume: 0.55, loop: false });
			if (opts?.onWhistleComplete) {
				try { whistle.once('complete', opts.onWhistleComplete); } catch {}
			}
			whistle.play();
		} else {
			opts?.onWhistleComplete?.();
		}
	} catch (_) {
		try { opts?.onWhistleComplete?.(); } catch {}
	}

	const dimmer = new RadialDimmerTransition(scene);
	const centerX = scene.scale.width * 0.5;
	const centerY = scene.scale.height * 0.5;
	const startRadius = Math.ceil(Math.hypot(scene.scale.width, scene.scale.height));
	const endRadius = 0;
	const durationMs = 1200;
	dimmer.setCenter(centerX, centerY);
	dimmer.setRadiusImmediate(startRadius);
	dimmer.show();
	dimmer.zoomInToRadius(endRadius, durationMs);
	scene.time.delayedCall(durationMs, () => {
		dimmer.hide();
		onComplete();
	});
}
