const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const fetch = require('node-fetch');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const BRIDGE_SHARED_SECRET = process.env.BRIDGE_SHARED_SECRET;
const LOVABLE_WEBHOOK_URL = process.env.LOVABLE_WEBHOOK_URL;

if (!BRIDGE_SHARED_SECRET || !LOVABLE_WEBHOOK_URL) {
  console.error(
    '[bridge] Missing LOVABLE_WEBHOOK_URL or BRIDGE_SHARED_SECRET env var.'
  );
}

let sock;
let latestQr = null;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      console.log('[bridge] Scan this QR with WhatsApp -> Linked Devices');
    }

    if (connection === 'open') {
      console.log('[bridge] WhatsApp connected');
      latestQr = null;
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log(
        '[bridge] Connection closed. Reconnecting:',
        shouldReconnect
      );

      if (shouldReconnect) {
        startSock();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];

      if (!msg.message) return;
      if (msg.key.fromMe) return;

      const phone = msg.key.remoteJid?.replace('@s.whatsapp.net', '');

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      console.log('[bridge] Incoming message:', phone, text);

      await fetch(LOVABLE_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bridge-secret': BRIDGE_SHARED_SECRET
        },
        body: JSON.stringify({
          phone,
          text
        })
      });
    } catch (err) {
      console.error('[bridge] webhook error:', err);
    }
  });
}

startSock();

app.get('/', (req, res) => {
  res.send('Rovio WhatsApp Bridge running');
});

app.get('/healthz', (req, res) => {
  res.json({
    ok: true
  });
});

app.get('/status', async (req, res) => {
  try {
    res.json({
      state: sock?.user ? 'open' : 'connecting',
      hasQr: !!latestQr
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: e.message
    });
  }
});

app.get('/qr', async (req, res) => {
  try {
    if (!latestQr) {
      return res.send('No QR available yet');
    }

    const qrImage = await QRCode.toDataURL(latestQr);

    res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#111;color:white;">
          <div style="text-align:center;">
            <h2>Scan met WhatsApp Business</h2>
            <img src="${qrImage}" />
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

app.post('/send', async (req, res) => {
  try {
    const secret = req.headers['x-bridge-secret'];

    if (secret !== BRIDGE_SHARED_SECRET) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const { phone, text } = req.body;

    if (!phone || !text) {
      return res.status(400).json({
        error: 'phone and text required'
      });
    }

    const jid = `${phone}@s.whatsapp.net`;

    await sock.sendMessage(jid, {
      text
    });

    res.json({
      success: true
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('[bridge] HTTP listening on :' + PORT);
});
