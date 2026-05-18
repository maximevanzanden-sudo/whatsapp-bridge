const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();

app.use(cors());
app.use(express.json());

let sock;
let latestQr = null;
let connected = false;

async function startSock() {

  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  sock = makeWASocket({
    auth: state,
    browser: ["Railway", "Chrome", "1.0.0"],
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {

    const {
      connection,
      qr,
      lastDisconnect
    } = update;

    console.log("CONNECTION UPDATE:", update);

    if (qr) {

      console.log("QR RECEIVED");

      latestQr = await QRCode.toDataURL(qr);
    }

    if (connection === "open") {

      console.log("WHATSAPP CONNECTED");

      connected = true;
      latestQr = null;
    }

    if (connection === "close") {

      connected = false;

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("CONNECTION CLOSED");

      if (shouldReconnect) {

        console.log("RECONNECTING...");

        setTimeout(() => {
          startSock();
        }, 3000);
      }
    }
  });
}

startSock();

app.get("/", (req, res) => {
  res.send("Bridge running");
});

app.get("/status", (req, res) => {

  res.json({
    connected,
    qr: !!latestQr
  });
});

app.get("/qr", (req, res) => {

  if (!latestQr) {
    return res.send("No QR available");
  }

  res.send(`
    <html>
      <body style="
        background:#000;
        color:#fff;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        flex-direction:column;
        font-family:sans-serif;
      ">
        <h1>Scan met WhatsApp Business</h1>
        <img src="${latestQr}" width="350" />
      </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {

  try {

    const to =
      req.body.to ||
      req.body.phone ||
      req.body.number;

    const message =
      req.body.message ||
      req.body.text ||
      req.body.body;

    if (!to || !message) {

      return res.status(400).json({
        error: "Missing to/message",
        received: req.body
      });
    }

    if (!connected) {

      return res.status(500).json({
        error: "WhatsApp not connected"
      });
    }

    const clean = to
      .replace(/\+/g, "")
      .replace(/\s/g, "");

    const jid = `${clean}@s.whatsapp.net`;

    await sock.sendMessage(jid, {
      text: message
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

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {

  console.log("HTTP listening on", PORT);
});
