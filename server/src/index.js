// require('dotenv').config({ path: ".env" });
import dotenv from "dotenv";
import http from "http";

import connectDB from "./db/index.js";
import { app } from "./app.js"
import { configureDns } from "./config/dns.js";
import { initErrorMonitoring } from "./services/errorMonitoring.js";
import { initNotificationSocket } from "./socket/notificationSocket.js";
import logger from "./config/logger.js";

dotenv.config({
  path: "./.env",
}); // we have add this in package json file under dev -r dotenv/config --experimental-json-modules

// Initialize error monitoring (Sentry) BEFORE the app accepts requests. It is
// SENTRY_DSN-gated and no-ops when the DSN is blank; an init failure degrades
// to disabled with a logged error and never blocks startup (Req 13.1, 13.3).
initErrorMonitoring();

// Configure Node's DNS resolver from the optional DNS_SERVERS env var BEFORE
// connecting/listening. Works around local/ISP resolvers that refuse the
// mongodb+srv SRV lookup (querySrv ECONNREFUSED / ESERVFAIL) for Atlas.
// Falls back to the system default resolver when DNS_SERVERS is unset.
configureDns(process.env.DNS_SERVERS);

connectDB()
  .then(() => {
    app.on("error from app.on", (err) => {
      logger.error({ err }, "Application error event (index.js)");
      throw err;
    });
    const httpServer = http.createServer(app);
    initNotificationSocket(httpServer);
    httpServer.listen(process.env.PORT || 8000, () => {
      logger.info({ port: process.env.PORT || 8000 }, "Server is running");
    });
  })
  .catch((err) => logger.error({ err }, "MONGODB connection failed"));
// becuase connectDB is aysnc and will return a promise so when it is connected we will connect our serer

/*

import express from "express";
const app = express();
(async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`);
    app.on("error", (err) =>{
        console.error(err);
        throw err;
    })
    app.listen(process.env.PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
  } catch (error) {
    console.error("ERROR : ", error);
    throw err;
  }
})(); // thi is called effy methof in js where we deifne an call func at same timr
*/
