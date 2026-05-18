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
let connectionState = "starting";

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "20.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("NEW QR RECEIVED");

      latestQr = await QRCode.toDataURL(qr);
      connectionState = "qr";
    }

    if (connection === "open") {
      console.log("WHATSAPP CONNECTED");
      connectionState = "connected";
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("Connection closed");

      if (shouldReconnect) {
        startSock();
      }
    }
  });
}

app.get("/", (req, res) => {
  res.send("Bridge online");
});

app.get("/status", (req, res) => {
  res.json({
    state: connectionState,
    hasQr: !!latestQr
  });
});

app.get("/qr", (req, res) => {
  if (!latestQr) {
    return res.send("No QR available");
  }

  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;">
        <img src="${latestQr}" width="350" />
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("[bridge] HTTP listening on :" + PORT);
});

startSock();
