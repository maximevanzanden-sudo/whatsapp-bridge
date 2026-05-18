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

let latestQr = null;
let isConnected = false;
let sock = null;

async function startSock() {
  try {
    console.log("Starting WhatsApp socket...");

    const sessionName = process.env.SESSION_NAME || "default";

    const { state, saveCreds } = await useMultiFileAuthState(
      `./auth_info_${sessionName}`
    );

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["Baileys", "Chrome", "4.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      console.log("connection.update", update);

      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        console.log("QR RECEIVED");

        latestQr = await QRCode.toDataURL(qr);

        isConnected = false;
      }

      if (connection === "open") {
        console.log("WHATSAPP CONNECTED");

        isConnected = true;

        latestQr = null;
      }

      if (connection === "close") {
        console.log("CONNECTION CLOSED");

        isConnected = false;

        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log("Reconnect:", shouldReconnect);

        if (shouldReconnect) {
          startSock();
        }
      }
    });
  } catch (err) {
    console.error("STARTSOCK ERROR:");
    console.error(err);
  }
}

startSock();

app.get("/", (req, res) => {
  res.send("WhatsApp bridge running");
});

app.get("/status", (req, res) => {
  res.json({
    connected: isConnected,
    qr: !!latestQr
  });
});

app.get("/qr", (req, res) => {
  if (!latestQr) {
    return res.send("No QR available");
  }

  res.send(`
    <html>
      <body style="background:black;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
        <h1 style="color:white;">Scan met WhatsApp Business</h1>
        <img src="${latestQr}" width="350"/>
      </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {
  try {
    const { to, message } = req.body;

    console.log("SEND BODY:", req.body);

    if (!to || !message) {
      return res.status(400).json({
        error: "Missing to/message"
      });
    }

    if (!isConnected) {
      return res.status(400).json({
        error: "WhatsApp not connected"
      });
    }

    const jid = to.replace(/\+/g, "") + "@s.whatsapp.net";

    await sock.sendMessage(jid, {
      text: message
    });

    res.json({
      success: true
    });
  } catch (err) {
    console.error("SEND ERROR:");
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
