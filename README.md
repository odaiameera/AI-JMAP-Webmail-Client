# JMAP Webmail Client

A self-hosted webmail client built with SvelteKit. It connects to JMAP mail servers, supports CalDAV calendars and JMAP contacts, and includes an optional private AI mail assistant.

## Features

- Multiple JMAP mail accounts behind one app login
- Inbox, folders, search, labels, rules, reminders, drafts, attachments, and signatures
- CalDAV calendar and invitation handling
- JMAP contacts with vCard and CSV import
- Passkey support
- Optional Ollama-powered email summaries, questions, reply drafts, and event extraction

The assistant never sends generated replies automatically. It prepares a reply in the existing composer for the user to review.

## Quick start

Requirements: Node.js 22 or newer and a JMAP-compatible mail server.

```sh
npm ci
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `.env.local` as `WEBMAIL_SECRET`, then start the app:

```sh
npm run dev
```

Open `http://localhost:5173` and follow the setup flow.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEBMAIL_SECRET` | Yes | Encrypts linked mail-account passwords at rest. Use a stable random value of at least 32 characters. |
| `JMAP_BASE_URL` | Recommended | Default mail-server URL offered when linking an account. |
| `ORIGIN` | Production | Public URL used by SvelteKit's request-origin checks. |
| `DATABASE_PATH` | No | SQLite path. Defaults to a local development database or `/data/ameera.db` in production. |
| `OLLAMA_URL` | AI only | Ollama-compatible endpoint. |
| `OLLAMA_API_KEY` | AI only | Bearer token when required by the endpoint. |
| `OLLAMA_MODEL` | AI only | Model name used for assistant and event-extraction requests. |

AI configuration stays on the server. Email content is sent only to the Ollama endpoint configured by the operator.

## Docker

Copy `docker-compose.example.yml` to `docker-compose.yml`, replace its example values, and run:

```sh
docker compose up --build
```

The example binds the application to `127.0.0.1:3001`; place it behind a TLS reverse proxy for remote access.

## Development

```sh
npm run check
npm test
npm run build
```

See [SECURITY.md](SECURITY.md) for reporting security problems.

## License

[MIT](LICENSE)
