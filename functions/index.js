require("dotenv").config();
const { onRequest } = require("firebase-functions/v2/https");
const { apiHandler } = require("./src/app");

exports.api = onRequest(
  { region: "asia-south1" },
  apiHandler
);
