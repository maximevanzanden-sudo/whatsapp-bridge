const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const app = express();

app.use(cors());
app.use(express.json());

let sock;
let latestQr = null;
let connected = false;

async function startSock() {

  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {

    const { connection, qr } = update;

    if (qr) {

      latestQr = await QRCode.toDataURL(qr);

      console.log("QR updated");
    }

    if (connection === "open") {

      connected = true;
      latestQr = null;

      console.log("WhatsApp connected");
    }

    if (connection === "close") {

      connected = false;

      console.log("Connection closed");

      setTimeout(() => {
        startSock();
      }, 5000);
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
    qr: latestQr ? true : false
  });
});

app.get("/qr", (req, res) => {

  if (!latestQr) {
    return res.send("No QR available");
  }

  res.send(`
    <html>
      <body style="
        background:black;
        color:white;
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

    console.log("Incoming body:", req.body);

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

    const cleanNumber = to
      .replace(/\+/g, "")
      .replace(/\s/g, "");

    const jid = `${cleanNumber}@s.whatsapp.net`;

    await sock.sendMessage(jid, {
      text: message
    });

    console.log("Message sent to:", jid);

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
