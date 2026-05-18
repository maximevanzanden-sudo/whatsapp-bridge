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

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, qr }) => {

    console.log("UPDATE:", connection);

    if (qr) {
      console.log("QR RECEIVED");

      latestQr = await QRCode.toDataURL(qr);

      console.log("QR SAVED");
    }

    if (connection === "open") {
      console.log("CONNECTED");
    }

    if (connection === "close") {
      console.log("CLOSED");
      startSock();
    }
  });
}

app.get("/", (req, res) => {
  res.send("online");
});

app.get("/qr", (req, res) => {

  if (!latestQr) {
    return res.send("No QR available");
  }

  res.send(`
    <html>
      <body style="background:black;display:flex;justify-content:center;align-items:center;height:100vh;">
        <img src="${latestQr}" width="400"/>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("HTTP listening on", PORT);
});

startSock();
