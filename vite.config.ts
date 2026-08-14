import { svelteTesting } from '@testing-library/svelte/vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), svelteTesting()],
	// better-sqlite3 ships a native binary; Vite must not try to optimise
	// or bundle it. SvelteKit's adapter-node leaves it external at build
	// time, but the dev server also needs it kept out of the optimiser.
	optimizeDeps: { exclude: ['better-sqlite3'] },
	ssr: { external: ['better-sqlite3'] }
});
