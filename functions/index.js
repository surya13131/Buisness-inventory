const { onRequest } = require("firebase-functions/v2/https");
const { apiHandler } = require("./src/app");

exports.api = onRequest(
  {
    region: "asia-south1",
    memory: "512MiB",
    timeoutSeconds: 120,
    cors: true
    // ❌ NO secrets here
  },
  apiHandler
);
