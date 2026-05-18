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

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "22.04.4"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    console.log("UPDATE:", update);

    // QR ontvangen
    if (qr) {
      console.log("QR RECEIVED");

      latestQr = await QRCode.toDataURL(qr);

      console.log("QR SAVED");
    }

    // Verbonden
    if (connection === "open") {
      console.log("WHATSAPP CONNECTED");
      isConnected = true;
    }

    // Verbinding gesloten
    if (connection === "close") {
      console.log("CONNECTION CLOSED");

      isConnected = false;

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("RECONNECTING...");
        startWhatsApp();
      }
    }
  });
}

// Homepage
app.get("/", (req, res) => {
  res.send("WhatsApp bridge online");
});

// Status endpoint
app.get("/status", (req, res) => {
  res.json({
    connected: isConnected,
    hasQr: !!latestQr
  });
});

// QR endpoint
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
  console.log("SERVER RUNNING ON PORT", PORT);
});

startWhatsApp();
