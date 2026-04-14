import type { AuthState } from '$lib/jmap/types';

declare global {
	namespace App {
		interface Locals {
			auth?: AuthState;
		}
	}
}

export {};
