const express = require("express");
const QRCode = require("qrcode");

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const app = express();

let latestQr = null;

async function startSock() {
  // NIEUWE SESSION NAAM
  const { state, saveCreds } =
    await useMultiFileAuthState("brand_new_session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    console.log(update);

    if (update.qr) {
      latestQr = update.qr;
      console.log("QR RECEIVED");
    }

    if (update.connection === "open") {
      console.log("CONNECTED");
    }
  });
}

app.get("/", (req, res) => {
  res.send("online");
});

app.get("/status", (req, res) => {
  res.json({
    hasQr: !!latestQr
  });
});

app.get("/qr", async (req, res) => {
  if (!latestQr) {
    return res.send("No QR available yet");
  }

  const img = await QRCode.toDataURL(latestQr);

  res.send(`
    <html>
      <body style="text-align:center;padding:40px">
        <h1>Scan QR</h1>
        <img src="${img}" />
      </body>
    </html>
  `);
});

app.listen(process.env.PORT || 8080, () => {
  console.log("SERVER STARTED");
});

startSock();
