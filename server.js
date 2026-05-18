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

  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["Railway", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {

    const { connection, lastDisconnect, qr } = update;

    console.log("UPDATE:", update);

    if (qr) {
      latestQr = qr;
      isConnected = false;
      console.log("QR RECEIVED");
    }

    if (connection === "open") {
      console.log("WHATSAPP CONNECTED");
      isConnected = true;
      latestQr = null;
    }

    if (connection === "close") {

      isConnected = false;

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("CONNECTION CLOSED");

      if (shouldReconnect) {
        startSock();
      }
    }
  });
}

startSock();

app.get("/", (req, res) => {
  res.send("WhatsApp bridge online");
});

app.get("/status", (req, res) => {
  res.json({
    started: true,
    qr: !!latestQr,
    connected: isConnected
  });
});

app.get("/qr", async (req, res) => {

  if (!latestQr) {
    return res.send("No QR available");
  }

  const qrImage = await QRCode.toDataURL(latestQr);

  res.send(`
    <html>
      <body style="
        background:black;
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        flex-direction:column;
        color:white;
        font-family:sans-serif;
      ">
        <h1>Scan met WhatsApp Business</h1>
        <img src="${qrImage}" width="350" />
      </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {

  try {

    const { to, message } = req.body;

    if (!isConnected) {
      return res.status(400).json({
        error: "WhatsApp not connected"
      });
    }

    if (!to || !message) {
      return res.status(400).json({
        error: "Missing to/message"
      });
    }

    const clean =
      to.replace(/\D/g, "") + "@s.whatsapp.net";

    await sock.sendMessage(clean, {
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
