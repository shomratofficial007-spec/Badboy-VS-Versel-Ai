# Mockup preview sandbox

The Vite sandbox serves component previews and can proxy API requests to the
separate Express API server.

## Development

Run the API server on port 3000 in one terminal:

```sh
PORT=3000 pnpm --filter @workspace/api-server dev
```

Run the mockup preview in another terminal:

```sh
pnpm --filter @workspace/mockup-sandbox dev
```

The Vite dev server and preview server forward `/api/*` to
`http://127.0.0.1:3000` by default. Set `API_PROXY_TARGET` to use a different
absolute HTTP(S) API origin, or set `API_PORT` when using a different local
port. The API server still requires its own `PORT` environment variable.

## Host allowlist

Only localhost is allowed by default. Replit's exact deployment domains are
added from `REPLIT_DOMAINS` and `REPLIT_DEV_DOMAIN` when those variables are
present. For a custom preview hostname, set `VITE_ALLOWED_HOSTS` in the
sandbox environment to a comma-separated list of explicit hostnames.
Dot-prefixed entries allow subdomains, for example `.preview.example.com`.
Wildcards and `true` are intentionally rejected.

The Replit runtime-error overlay and cartographer plugins are loaded only for
Replit development sessions. The mockup preview plugin remains enabled for
both development and production builds because it generates the module imported
by the preview application.
