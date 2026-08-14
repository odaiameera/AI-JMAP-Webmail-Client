export const AI_ASSISTANT_CONTEXT = 'ai-assistant-rail';

export interface AIAssistantContext {
	open: () => void;
	setCurrentEmail: (id: string) => void;
	clearCurrentEmail: (id: string) => void;
}
