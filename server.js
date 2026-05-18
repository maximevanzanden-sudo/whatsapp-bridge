const express = require("express");

const {
  default: makeWASocket,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");

const app = express();

let stateInfo = {
  started: false,
  qr: false,
  connected: false,
  error: null
};

async function boot() {
  try {

    console.log("BOOT START");

    const { state, saveCreds } =
      await useMultiFileAuthState("debug_auth");

    console.log("AUTH READY");

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true
    });

    console.log("SOCKET CREATED");

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {

      console.log("UPDATE:", JSON.stringify(update));

      if (update.qr) {
        stateInfo.qr = true;
      }

      if (update.connection === "open") {
        stateInfo.connected = true;
      }
    });

    stateInfo.started = true;

  } catch (err) {

    console.error("BOOT ERROR:");
    console.error(err);

    stateInfo.error = err.message;
  }
}

boot();

app.get("/status", (req, res) => {
  res.json(stateInfo);
});

app.listen(process.env.PORT || 8080, () => {
  console.log("SERVER RUNNING");
});
