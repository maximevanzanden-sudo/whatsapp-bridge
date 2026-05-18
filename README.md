# Rovio WhatsApp Bridge

Headless Baileys bridge that connects your WhatsApp Business number to the
Rovio Lovable dashboard.

- Pushes inbound WhatsApp messages -> `POST {LOVABLE_WEBHOOK_URL}` (with `x-bridge-secret`).
- Exposes `POST /send` for the dashboard to send outbound replies.
- Persists session in `./auth_info` so it only asks for the QR once.

## 1. Configure

```bash
cp .env.example .env
# edit .env, generate BRIDGE_SHARED_SECRET (e.g. `openssl rand -hex 32`)
```

The same `BRIDGE_SHARED_SECRET` must be added in the Lovable project secrets,
together with `BRIDGE_URL` (the public URL of this bridge, e.g.
`https://my-bridge.up.railway.app`).

## 2. Run locally

```bash
npm install
node --env-file=.env server.js
```

Scan the QR that prints in the terminal (or open `http://localhost:3000/qr`)
with WhatsApp Business -> Settings -> Linked Devices.

## 3. Deploy (recommended hosts)

### Railway
1. New project -> "Deploy from GitHub" (push this folder to a repo).
2. Add env vars from `.env.example`.
3. Add a **Volume** mounted at `/app/auth_info` so the session survives redeploys.
4. After first deploy, open `https://<your-bridge>.up.railway.app/qr` and scan.

### Fly.io
```bash
fly launch --no-deploy
fly volumes create wa_auth --size 1
# fly.toml: mount [mounts] source="wa_auth" destination="/app/auth_info"
fly secrets set LOVABLE_WEBHOOK_URL=... BRIDGE_SHARED_SECRET=...
fly deploy
```

### VPS / Raspberry Pi (with PM2)
```bash
npm install
npm install -g pm2
pm2 start server.js --name rovio-wa
pm2 save
pm2 startup   # auto-start on reboot
```

## 4. Wire the dashboard

In the Lovable project, set these secrets:
- `BRIDGE_URL` = the public URL of the bridge (no trailing slash)
- `BRIDGE_SHARED_SECRET` = same value as in the bridge `.env`

That's it. The dashboard now sends via `POST {BRIDGE_URL}/send` and receives
inbound messages on `/api/public/wa-inbound`.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/healthz` | public | health + state |
| GET | `/status` | public | `{ state, hasQr }` |
| GET | `/qr` | public | QR scan page |
| POST | `/send` | `x-bridge-secret` | `{ phone, text }` -> sends WhatsApp |

## Notes

- Uses unofficial WhatsApp Web protocol via Baileys. Use a dedicated business
  number; mass-blasting can get the number banned.
- Group messages are ignored. Only 1:1 chats are synced.
- Status events (`sent` / `delivered` / `read`) are pushed back to the
  dashboard and update the `messages.status` column.
