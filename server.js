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
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    console.log("UPDATE:", connection);

    if (qr) {
      console.log("QR RECEIVED");

      latestQr = await QRCode.toDataURL(qr);

      console.log("QR SAVED");

      connectionState = "qr";
    }

    if (connection === "open") {
      console.log("CONNECTED");

      connectionState = "connected";
    }

    if (connection === "close") {
      console.log("CONNECTION CLOSED");

      connectionState = "closed";

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("RECONNECTING...");
        startSock();
      }
    }
  });
}

app.get("/", (req, res) => {
  res.send("WhatsApp bridge online");
});

app.get("/status", (req, res) => {
  res.json({
    state: connectionState,
    hasQr: !!latestQr
  });
});

app.get("/qr", (req, res) => {

  if (!latestQr) {
    return res.send(`
      <html>
        <body style="background:#111;color:white;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
          <div>
            <h2>QR wordt geladen...</h2>
            <script>
              setTimeout(() => location.reload(), 3000);
            </script>
          </div>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="background:#111;display:flex;justify-content:center;align-items:center;height:100vh;">
        <div style="text-align:center;">
          <h2 style="color:white;font-family:sans-serif;">
            Scan met WhatsApp Business
          </h2>

          <img src="${latestQr}" width="350" />
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("HTTP listening on", PORT);
});

startSock();
