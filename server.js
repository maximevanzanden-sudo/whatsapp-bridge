const express = require("express");

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const app = express();

let pairingCode = null;

async function startSock() {
  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    console.log(update);

    if (update.connection === "open") {
      console.log("CONNECTED");
    }
  });

  // TELEFOONNUMMER INVULLEN
 const phoneNumber = "31684596226";

  pairingCode = await sock.requestPairingCode(phoneNumber);

  console.log("PAIRING CODE:", pairingCode);
}

app.get("/", (req, res) => {
  res.send("online");
});

app.get("/pair", (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:40px">
        <h1>WhatsApp Pairing Code</h1>
        <h2>${pairingCode || "Loading..."}</h2>
      </body>
    </html>
  `);
});

app.listen(process.env.PORT || 8080, () => {
  console.log("SERVER STARTED");
});

startSock();
