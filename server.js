// Rovio WhatsApp Bridge (Baileys).
//
// Run on any always-on Node.js host (VPS, Railway, Render, Fly.io, Raspberry Pi).
// Connects to WhatsApp Web as your business number, pushes inbound messages to
// the Lovable dashboard, and exposes a /send endpoint for outbound replies.
//
// Required env vars (see .env.example):
//   LOVABLE_WEBHOOK_URL    e.g. https://<project>.lovable.app/api/public/wa-inbound
//   BRIDGE_SHARED_SECRET   long random string, also set in Lovable secrets
//   PORT                   default 3000
//
// First start: scan the QR code that prints in the terminal with your WhatsApp
// Business app -> Linked devices. Session is persisted in ./auth_info so
// subsequent restarts skip the QR step.

import express from "express";
import pino from "pino";
import qrTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const LOVABLE_WEBHOOK_URL = process.env.LOVABLE_WEBHOOK_URL;
const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
const PORT = Number(process.env.PORT ?? 3000);
const AUTH_DIR = process.env.AUTH_DIR ?? "./auth_info";

if (!LOVABLE_WEBHOOK_URL || !BRIDGE_SHARED_SECRET) {
  console.error(
    "[bridge] Missing LOVABLE_WEBHOOK_URL or BRIDGE_SHARED_SECRET env var.",
  );
  process.exit(1);
}

const logger = pino({ level: "warn" });

let sock = null;
let connectionState = "disconnected"; // disconnected | qr | connecting | open
let latestQr = null; // data URL for /qr endpoint

async function postToLovable(payload) {
  try {
    const res = await fetch(LOVABLE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-secret": BRIDGE_SHARED_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[bridge] webhook non-200:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[bridge] webhook failed:", err.message);
  }
}

function jidToPhone(jid) {
  // jid looks like "31612345678@s.whatsapp.net". Strip suffix.
  return jid.split("@")[0];
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  );
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionState = "qr";
      latestQr = await QRCode.toDataURL(qr);
      console.log("\n[bridge] Scan this QR with WhatsApp -> Linked Devices:\n");
      qrTerminal.generate(qr, { small: true });
      console.log(`\n[bridge] Or open http://localhost:${PORT}/qr in a browser.\n`);
    }

    if (connection === "connecting") {
      connectionState = "connecting";
    }

    if (connection === "open") {
      connectionState = "open";
      latestQr = null;
      console.log("[bridge] WhatsApp connection OPEN.");
    }

    if (connection === "close") {
      connectionState = "disconnected";
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(
        `[bridge] connection closed (code=${code}). reconnect=${shouldReconnect}`,
      );
      if (shouldReconnect) {
        setTimeout(start, 2000);
      } else {
        console.error(
          "[bridge] Logged out from WhatsApp. Delete auth_info/ and restart to re-link.",
        );
      }
    }
  });

  // Inbound messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue; // ignore own outgoing echoes
      const from = msg.key.remoteJid;
      if (!from || from.endsWith("@g.us")) continue; // skip groups
      const phone = jidToPhone(from);
      const text = extractText(msg);
      if (!text) continue;

      console.log(`[bridge] inbound from ${phone}: ${text.slice(0, 80)}`);
      await postToLovable({
        kind: "inbound",
        from: phone,
        text,
        wa_message_id: msg.key.id,
        timestamp: msg.messageTimestamp,
      });
    }
  });

  // Delivery / read receipts -> forward as status updates
  sock.ev.on("messages.update", async (updates) => {
    for (const u of updates) {
      const status = u.update?.status; // 2=server, 3=delivered, 4=read
      if (!status) continue;
      const map = { 2: "sent", 3: "delivered", 4: "read" };
      const mapped = map[status];
      if (!mapped) continue;
      await postToLovable({
        kind: "status",
        wa_message_id: u.key.id,
        status: mapped,
      });
    }
  });
}

// ---- HTTP API ----
const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  // Public endpoints
  if (req.path === "/healthz" || req.path === "/qr" || req.path === "/status") {
    return next();
  }
  const secret = req.header("x-bridge-secret");
  if (secret !== BRIDGE_SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/healthz", (_req, res) => res.json({ ok: true, state: connectionState }));

app.get("/status", (_req, res) => {
  res.json({ state: connectionState, hasQr: !!latestQr });
});

app.get("/qr", (_req, res) => {
  if (!latestQr) {
    return res
      .status(404)
      .send(`<h1>No QR available</h1><p>State: ${connectionState}</p>`);
  }
  res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding:40px">
       <h1>Scan with WhatsApp Business</h1>
       <p>WhatsApp -> Settings -> Linked Devices -> Link a Device</p>
       <img src="${latestQr}" style="width:320px;height:320px"/>
       <p>State: ${connectionState}</p>
     </body></html>`,
  );
});

app.post("/send", async (req, res) => {
  if (connectionState !== "open" || !sock) {
    return res.status(503).json({ error: "wa_not_connected", state: connectionState });
  }
  const { phone, text } = req.body ?? {};
  if (!phone || !text) {
    return res.status(400).json({ error: "phone and text required" });
  }
  const digits = String(phone).replace(/[^\d]/g, "");
  const jid = `${digits}@s.whatsapp.net`;
  try {
    const result = await sock.sendMessage(jid, { text: String(text) });
    return res.json({ ok: true, wa_message_id: result?.key?.id });
  } catch (err) {
    console.error("[bridge] send failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[bridge] HTTP listening on :${PORT}`);
});

start().catch((e) => {
  console.error("[bridge] fatal:", e);
  process.exit(1);
});
