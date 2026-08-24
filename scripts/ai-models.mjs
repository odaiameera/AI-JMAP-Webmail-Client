#!/usr/bin/env node
/**
 * Print the model tags the configured AI endpoint actually serves.
 *
 * `OLLAMA_MODEL` has to name a tag the endpoint currently provides — a
 * retired or misspelled one fails at request time as a 404/410, long after
 * startup. This asks the endpoint directly, so the value can be verified
 * before it reaches production.
 *
 *   npm run ai:models
 *
 * Reads the same three variables as the app, from .env.local when present.
 */

const endpoint = (process.env.OLLAMA_URL || 'https://ollama.com').replace(/\/+$/, '');
const apiKey = process.env.OLLAMA_API_KEY;
const configured = process.env.OLLAMA_MODEL;

const fail = (message) => {
	console.error(message);
	process.exit(1);
};

if (!apiKey && !process.env.OLLAMA_URL) {
	fail(
		'Neither OLLAMA_URL nor OLLAMA_API_KEY is set, so the AI features are switched off.\n' +
			'Set them in .env.local (see .env.example) and run this again.'
	);
}

console.log(`Endpoint: ${endpoint}`);
console.log(`OLLAMA_MODEL: ${configured || '(unset — the app falls back to its built-in default)'}\n`);

let response;
try {
	response = await fetch(`${endpoint}/api/tags`, {
		headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
		signal: AbortSignal.timeout(20_000)
	});
} catch (error) {
	fail(`Could not reach ${endpoint}/api/tags — ${error.message}`);
}

if (!response.ok) {
	const detail = await response.text().catch(() => '');
	fail(
		`${endpoint}/api/tags answered ${response.status}.\n` +
			(response.status === 401 || response.status === 403
				? 'The endpoint rejected OLLAMA_API_KEY.'
				: detail.slice(0, 300))
	);
}

const body = await response.json().catch(() => null);
const models = (body?.models ?? [])
	.map((entry) => entry.name || entry.model || '')
	.filter(Boolean)
	.sort();

if (!models.length) {
	fail('The endpoint returned no models. On Ollama Cloud, check that the account has models enabled.');
}

console.log(`Available models (${models.length}):`);
for (const name of models) {
	console.log(`  ${name}${name === configured ? '   <- current OLLAMA_MODEL' : ''}`);
}

if (configured && !models.includes(configured)) {
	console.log(
		`\nOLLAMA_MODEL is "${configured}", which is not in that list — ` +
			'requests will fail with 404/410 until it is set to one of the above.'
	);
	process.exit(1);
}
