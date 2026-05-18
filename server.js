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

let qr = null;
let sock = null;
let connectionState = "starting";

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr: newQr } = update;

    if (newQr) {
      qr = newQr;
      console.log("QR RECEIVED");
    }

    if (connection === "open") {
      connectionState = "open";
      qr = null;
      console.log("WHATSAPP CONNECTED");
    }

    if (connection === "close") {
      connectionState = "closed";
      console.log("CONNECTION CLOSED");
      startWhatsApp();
    }
  });
}

app.get("/", (req, res) => {
  res.send("Bridge online");
});

app.get("/status", (req, res) => {
  res.json({
    state: connectionState,
    hasQr: !!qr
  });
});

app.get("/qr", async (req, res) => {
  if (!qr) {
    return res.send("No QR available yet");
  }

  const image = await QRCode.toDataURL(qr);

  res.send(`
    <html>
      <body style="font-family:sans-serif;text-align:center;padding:40px">
        <h1>Scan WhatsApp QR</h1>
        <img src="${image}" />
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("HTTP listening on", PORT);
});

startWhatsApp();
