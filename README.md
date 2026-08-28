# Self-Hosted Mail, Calendar & Contacts

[![CI](https://github.com/odaiameera/AI-JMAP-Webmail-Client/actions/workflows/ci.yml/badge.svg)](https://github.com/odaiameera/AI-JMAP-Webmail-Client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A self-hosted workspace for your mail, calendar, and contacts — with an AI assistant that runs on your own hardware.**

A single SvelteKit application that speaks JMAP for mail and contacts and CalDAV for calendars. It is designed to sit in front of your own [Stalwart](https://stalw.art) server, and it keeps every part of the stack — including the AI — under your control.

The assistant reads your mailbox and calendar to answer questions, draft replies, and propose events and tasks. It runs against an Ollama-compatible endpoint you configure, which can be a model on your own machine. Nothing is sent to a third-party AI provider unless you point it at one.

---

## Why this exists

Most webmail either gives you a good client with no intelligence, or an intelligent client that reads your mail on someone else's servers. This project is an attempt at the third option: a coherent workspace where mail, calendar, contacts, and an assistant share one interface and one trust boundary — yours.

Three principles shape the design:

**Your server is the source of truth.** Contacts live in Stalwart, calendars in CalDAV. The app does not maintain a shadow copy that drifts from the rest of your setup, so changes made in Apple Mail or a CardDAV client show up here and vice versa.

**The assistant proposes; you decide.** It never sends a reply, creates a task, or changes your calendar on its own. Drafts are prepared for review. Calendar and task changes surface as confirmation cards that name exactly what will happen — a proposed deletion shows the event title and date, not an opaque id — and apply only on a click.

**Credentials stay on the server.** Mail passwords are encrypted at rest. AI and task-app tokens are read only in server-side modules and never reach the browser.

---

## What's here today

**Mail** — Multiple JMAP accounts behind one app login. Inbox, folders, search, labels, rules, reminders, drafts, attachments, and signatures. Sender trust through the address book, with visible reasons when a message is flagged.

**Calendar** — CalDAV calendars with invitation handling, and the ICS parsing to go with it.

**Contacts** — JMAP contacts synced through Stalwart, with vCard and CSV import from Apple and Google exports. A preview shows valid, duplicate, and rejected rows before anything is written.

**AI assistant** — A collapsible rail that searches the whole mailbox and calendar, holds persistent conversations, answers in Markdown, drafts replies, and proposes calendar events and tasks. Task proposals can route to Todoist, Linear, Notion, a generic webhook, or an MCP bridge.

**Security** — Passkey support, encrypted account credentials, server-only secret handling, and a mock mode that short-circuits every AI call and labels itself so a demo can never be mistaken for a live reply.

---

## Roadmap

This started as a mail client and is growing into a full personal workspace. The direction is a small set of well-integrated apps that share context, rather than a large set of shallow ones.

### Next: Tasks and Notes

Tasks is already stubbed in the app rail. Both Tasks and Notes will be backed by a **dedicated local SQLite store, independent of Stalwart** — mail, calendar, and contacts belong to the mail server, but personal notes and tasks do not, and forcing them through a mail protocol would constrain the data model for no benefit.

- **Tasks** — a first-class app, so the assistant's existing task proposals can land in-product instead of only in external tools. External adapters stay for people who live in Todoist or Linear.
- **Notes** — durable notes with search, linkable to mail threads, events, and contacts.

### Then: broader server support

JMAP is the right protocol, but most mail in the world still lives behind IMAP. Adding **IMAP** — and **POP3** for the accounts that only offer it — means the app can front a Dovecot or Cyrus server, or a mailbox at a provider that has no JMAP endpoint, instead of requiring Stalwart.

The mail layer is already behind a typed client boundary, so this is an additional backend rather than a rewrite. JMAP stays the primary path and the one that gets the richest feature set; IMAP and POP3 are about reach.

### Then: a shared canvas

The value of one workspace is cross-app context. Once Notes and Tasks exist, the assistant can work across all five surfaces — turn a thread into a task with the message attached, pull meeting notes into a calendar event, answer questions that span mail and notes at once.

### Also planned

- **Contacts** — groups, avatars, vCard export, duplicate detection and merge
- **Composer** — unified recipient autocomplete over saved contacts and learned previous recipients, with contacts always ranking first and learned addresses never silently becoming visible contacts ([design](PLAN.md))
- **Packaging** — a published container image, so deployment is a `docker compose up` rather than a build

Nothing here has a date on it. This is a personal project built in the open, and the roadmap describes intent rather than a commitment.

---

## Quick start

Requirements: **Node.js 22+** and a JMAP-compatible mail server. Developed and tested against **Stalwart**.

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

### Docker

```sh
cp docker-compose.example.yml docker-compose.yml
# replace the example values
docker compose up --build
```

The example binds to `127.0.0.1:3001`. Put it behind a TLS reverse proxy for remote access.

---

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEBMAIL_SECRET` | Yes | Encrypts linked mail-account passwords at rest. Use a stable random value of at least 32 characters. |
| `JMAP_BASE_URL` | Recommended | Default mail-server URL offered when linking an account. |
| `ORIGIN` | Production | Public URL used by SvelteKit's request-origin checks. |
| `DATABASE_PATH` | No | SQLite path. Defaults to a local development database or `/data/ameera.db` in production. |
| `OLLAMA_URL` | AI only | Ollama-compatible endpoint. |
| `OLLAMA_API_KEY` | AI only | Bearer token when required by the endpoint. |
| `OLLAMA_MODEL` | AI only | Model tag the endpoint serves. Verify with `npm run ai:models`. |
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

`OLLAMA_MODEL` has to name a tag your endpoint currently serves. Ollama Cloud serves its hosted models under `-cloud` tags, so a bare tag copied from the model library (`deepseek-v3.1:671b`) resolves only on a self-hosted endpoint that has pulled it — against Cloud it fails with 404 or 410.

Changing model is a configuration change, not a code change: set `OLLAMA_MODEL` in `.env.local` (development) or the compose `environment:` block (production) and restart. The tag compiled into the app applies only when that variable is unset.

List what your endpoint actually offers:

```sh
npm run ai:models
```

It prints every available tag, marks the one `OLLAMA_MODEL` is set to, and exits non-zero when that tag is missing — so it can also run as a deployment preflight. Tags are retired upstream from time to time, so prefer this over copying a name out of documentation.

If the agent panel reports that the AI service does not serve the configured model, that is the same condition. The server log records the endpoint's own explanation on the `[ai]` line for each failed request, followed by the tags the endpoint does serve; that detail is deliberately kept out of the browser response.

### Where your data goes

AI and task-app credentials stay on the server. Email content is sent only to the Ollama endpoint you configure. Task title, description, and due date are sent to the chosen task app **only after confirmation**. Calendar changes go to your own CalDAV server and, like tasks, only after confirmation.

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

---

## Development

```sh
npm run check     # type and lint checks
npm test          # unit and integration tests
npm run build     # production build
```

CI runs on every push and pull request.

See [SECURITY.md](SECURITY.md) for reporting security problems, and [PLAN.md](PLAN.md) for the contacts and recipient-autocomplete design.

---

## License

[MIT](LICENSE)
