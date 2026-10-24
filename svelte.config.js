import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		adapter: adapter(),
		// Content-Security-Policy for every page. Mail and attachments are
		// attacker-written, so even if some sender HTML slips past a viewer's
		// sanitiser it must not run script or reach the network:
		//  - script-src: only this app's own bundles, plus a per-request nonce
		//    SvelteKit adds to its inline bootstrap (and app.html's theme
		//    script). No 'unsafe-inline', so injected handlers and
		//    `javascript:` links do not run.
		//  - style-src keeps 'unsafe-inline': email bodies, Svelte transitions
		//    and the editor all set inline styles. Styles cannot run script.
		//  - img/font/media/connect stay on this origin (remote mail images
		//    come through /api/image-proxy), plus data:/blob: for pasted and
		//    embedded images and attachment previews.
		//  - frame-ancestors 'none': nothing may frame the webmail.
		// The reading view's email iframe inherits this policy and adds its
		// own, stricter one (see emailFrameCsp in $lib/utils/email-images).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self', 'data:'],
				'media-src': ['self', 'data:', 'blob:'],
				'connect-src': ['self'],
				'frame-src': ['self', 'blob:'],
				'worker-src': ['self', 'blob:'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
