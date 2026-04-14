import type { JMAPResponse, MethodCall } from './types';

const DEFAULT_USING = [
	'urn:ietf:params:jmap:core',
	'urn:ietf:params:jmap:mail',
	'urn:ietf:params:jmap:submission'
];

export class JMAPClient {
	constructor(
		private apiUrl: string,
		private authHeader: string
	) {}

	async request(methodCalls: MethodCall[], using: string[] = DEFAULT_USING): Promise<JMAPResponse> {
		const response = await fetch(this.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: this.authHeader
			},
			body: JSON.stringify({ using, methodCalls })
		});

		if (response.status === 401) {
			throw new JMAPAuthError('Authentication failed');
		}

		if (!response.ok) {
			throw new JMAPError(`JMAP request failed: ${response.status} ${response.statusText}`);
		}

		const data: JMAPResponse = await response.json();

		for (const [name, result] of data.methodResponses) {
			if (name === 'error' || name.endsWith('/error')) {
				const error = result as { type?: string; description?: string };
				throw new JMAPError(`JMAP error: ${error.type ?? 'unknown'} - ${error.description ?? ''}`);
			}
		}

		return data;
	}
}

export class JMAPError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'JMAPError';
	}
}

export class JMAPAuthError extends JMAPError {
	constructor(message: string) {
		super(message);
		this.name = 'JMAPAuthError';
	}
}
