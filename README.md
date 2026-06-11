# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.15.1 create --template minimal --types ts --add tailwindcss="plugins:none" sveltekit-adapter="adapter:node" --no-install .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Configuration

The webmail has its own login (master password + passkeys) and links one or
more JMAP (Stalwart) mail accounts to it. On first run you'll be redirected
to `/setup` to create the master login and link your first account.

Environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEBMAIL_SECRET` | **yes** | Encrypts linked mail-account passwords at rest (AES-256-GCM). Generate with `openssl rand -base64 32`. Back it up — rotating it means re-entering every linked account's mail password. |
| `JMAP_BASE_URL` | recommended | Default mail server base URL offered when linking accounts (e.g. `https://mx.example.com`). Can be overridden per account in the link form. |
| `ORIGIN` | **yes** (in production) | The public URL the app is served from (e.g. `https://webmail.example.com`). Without it, SvelteKit's CSRF check rejects form posts (login/setup) with a 403. |
| `DATABASE_PATH` | no | SQLite path (defaults to `/data/ameera.db` in production, `local-data/ameera.db` in dev). |
| `OLLAMA_URL` / `OLLAMA_API_KEY` / `OLLAMA_MODEL` | no | Enables AI "create event from email" extraction. |
| `PLANE_BASE_URL` / `PLANE_API_KEY` / `PLANE_WORKSPACE_SLUG` | no | Enables the Plane apps integration. |

See `docker-compose.example.yml` for a complete deployment example.
