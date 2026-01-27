const admin = require("firebase-admin");


if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: "bussiness-control-platform.firebasestorage.app" 
  });
}

const bucket = admin.storage().bucket();

module.exports = { bucket };
