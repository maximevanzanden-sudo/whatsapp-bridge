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

let latestQr = null;
let connectionState = "starting";

async function startSock() {
  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
      latestQr = qr;
      connectionState = "qr";
      console.log("QR READY");
    }

    if (connection === "open") {
      connectionState = "open";
      latestQr = null;
      console.log("CONNECTED");
    }

    if (connection === "close") {
      connectionState = "closed";
      console.log("CLOSED");
      startSock();
    }
  });
}

app.get("/", (req, res) => {
  res.send("bridge online");
});

app.get("/status", (req, res) => {
  res.json({
    state: connectionState,
    hasQr: !!latestQr
  });
});

app.get("/qr", async (req, res) => {
  if (!latestQr) {
    return res.send("No QR available");
  }

  const qrImage = await QRCode.toDataURL(latestQr);

  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;flex-direction:column">
        <h1>WhatsApp QR</h1>
        <img src="${qrImage}" />
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("[bridge] HTTP listening on :" + PORT);
});

startSock();
