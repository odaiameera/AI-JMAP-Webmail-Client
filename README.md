# JMAP Webmail Client

A self-hosted webmail client built with SvelteKit. It connects to JMAP mail servers, supports CalDAV calendars and JMAP contacts, and includes an optional private AI mail assistant.

## Features

- Multiple JMAP mail accounts behind one app login
- Inbox, folders, search, labels, rules, reminders, drafts, attachments, and signatures
- CalDAV calendar and invitation handling
- JMAP contacts with vCard and CSV import
- Passkey support
- Collapsible Ollama-powered AI mail agent with mailbox summaries, email questions, reply drafts, and calendar briefings
- Confirmation-gated task proposals through a generic task API, automation webhook, or MCP bridge

The agent never sends generated replies or creates tasks automatically. Replies are prepared for review, and task proposals require an explicit confirmation click.

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
| `TODOIST_API_TOKEN` | Todoist only | Personal API token used to create confirmed tasks. |
| `TODOIST_PROJECT_ID` | No | Optional destination project; omitted tasks go to Todoist Inbox. |
| `LINEAR_API_KEY` | Linear only | Personal API key used to create confirmed issues. |
| `LINEAR_TEAM_ID` | Linear only | UUID of the destination Linear team. |
| `LINEAR_PROJECT_ID` | No | Optional destination Linear project UUID. |
| `NOTION_API_TOKEN` | Notion only | Integration token with access to the destination data source. |
| `NOTION_DATA_SOURCE_ID` | Notion only | Data-source ID where confirmed tasks become pages. |
| `NOTION_DUE_PROPERTY` | No | Optional date-property name; otherwise `Due`, `Due date`, or `Deadline` is detected. |
| `TASK_ADAPTER_URL` | Task creation only | HTTP endpoint that accepts confirmed task proposals. |
| `TASK_ADAPTER_API_KEY` | No | Optional bearer token for the task adapter endpoint. |

AI and task-app credentials stay on the server. Email content is sent only to the Ollama endpoint configured by the operator. Task title, description, and due date are sent to the chosen task app only after confirmation.

The task adapter receives a `POST` body only after confirmation:

```json
{
  "source": "ai-jmap-webmail-client",
  "task": {
    "title": "Reply to Sam",
    "description": "Send the requested figures.",
    "dueDate": "2026-08-18"
  }
}
```

This small contract can be handled directly by a task app API, an automation tool, or an MCP-to-HTTP bridge.

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
