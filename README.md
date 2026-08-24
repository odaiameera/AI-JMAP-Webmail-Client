# JMAP Webmail Client

[![CI](https://github.com/odaiameera/AI-JMAP-Webmail-Client/actions/workflows/ci.yml/badge.svg)](https://github.com/odaiameera/AI-JMAP-Webmail-Client/actions/workflows/ci.yml)

A self-hosted webmail client built with SvelteKit. It connects to JMAP mail servers, supports CalDAV calendars and JMAP contacts, and includes an optional private AI mail assistant.

## Features

- Multiple JMAP mail accounts behind one app login
- Inbox, folders, search, labels, rules, reminders, drafts, attachments, and signatures
- CalDAV calendar and invitation handling
- JMAP contacts with vCard and CSV import
- Passkey support
- Collapsible Ollama-powered AI mail agent that searches the whole mailbox and calendar, answers questions, drafts replies, and proposes calendar events
- Confirmation-gated calendar changes: the agent can propose adding or deleting an event, but only a click applies it
- Confirmation-gated task proposals through a generic task API, automation webhook, or MCP bridge

The agent never sends generated replies, creates tasks, or changes your calendar
automatically. Replies are prepared for review, and task and calendar proposals
require an explicit confirmation click. A proposed calendar deletion names the
event and its date on the confirmation card, so what is being agreed to is the
event itself and not an opaque id.

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
| `OLLAMA_MODEL` | AI only | Model tag used for assistant and event-extraction requests. Must be a tag the endpoint serves — Ollama Cloud uses `-cloud` tags such as `deepseek-v4-flash:cloud`. Verify with `npm run ai:models`. |
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

### Choosing a model

`OLLAMA_MODEL` has to name a tag your endpoint currently serves. Ollama Cloud
serves its hosted models under `-cloud` tags, so a bare tag copied from the
model library (`deepseek-v3.1:671b`) resolves only on a self-hosted endpoint
that has pulled it — against Cloud it fails with 404 or 410.

Changing model is a configuration change, not a code change: set `OLLAMA_MODEL`
in `.env.local` (development) or the compose `environment:` block (production)
and restart. The tag compiled into the app applies only when that variable is
unset.

List what your endpoint actually offers:

```sh
npm run ai:models
```

It prints every available tag, marks the one `OLLAMA_MODEL` is set to, and
exits non-zero when that tag is missing — so it can also run as a deployment
preflight. Tags are retired upstream from time to time, so prefer this over
copying a name out of documentation.

If the agent panel reports that the AI service does not serve the configured
model, that is the same condition. The server log records the endpoint's own
explanation on the `[ai]` line for each failed request, followed by the list of
tags the endpoint does serve; that detail is deliberately kept out of the
browser response.

AI and task-app credentials stay on the server. Email content is sent only to the
Ollama endpoint configured by the operator. Task title, description, and due date
are sent to the chosen task app only after confirmation. Calendar changes go to
your own CalDAV server and, like tasks, only after confirmation.

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
