const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    // Ensure this matches your Firebase project settings exactly
    storageBucket: "bussiness-control-platform.firebasestorage.app" 
  });
}

/**
 * Returns the storage bucket instance.
 * Using a function ensures the admin app is initialized before access.
 */
const getBucket = () => {
  return admin.storage().bucket();
};

module.exports = { getBucket };