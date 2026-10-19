import { writable } from 'svelte/store';

export type NewKind = 'event' | 'contact';

/**
 * A request from the corner's + menu for a new event or contact. The page
 * that makes one (Calendar, Contacts) takes it when it's open, whether it
 * was already showing or the menu navigated to it.
 */
export const newRequest = writable<NewKind | null>(null);
