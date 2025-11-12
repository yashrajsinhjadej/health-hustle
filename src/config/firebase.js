// File: config/firebase.js
const admin = require("firebase-admin");

let isInitialized = false;

function initializeFirebase() {
  // Prevent multiple initializations
  if (isInitialized && admin.apps.length > 0) {
    console.log("ℹ️ Firebase Admin already initialized");
    return admin;
  }

  try {
    let serviceAccount;

    // Method 1: Using FIREBASE_KEY_JSON (entire JSON as string)
    if (process.env.FIREBASE_KEY_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
        console.log("✅ Loaded Firebase credentials from FIREBASE_KEY_JSON");
      } catch (parseError) {
        throw new Error(`Failed to parse FIREBASE_KEY_JSON: ${parseError.message}`);
      }
    }
    // Method 2: Using individual environment variables
    else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      };
      console.log("✅ Loaded Firebase credentials from individual env variables");
    }
    // Method 3: Using service account file path
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      console.log("✅ Loaded Firebase credentials from file path");
    } else {
      throw new Error(
        "Missing Firebase credentials. Please provide one of:\n" +
        "1. FIREBASE_KEY_JSON (full JSON string)\n" +
        "2. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n" +
        "3. FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file)"
      );
    }

    // Ensure private_key has proper newlines
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    isInitialized = true;
    console.log(`✅ Firebase Admin SDK initialized for project: ${serviceAccount.project_id}`);

    return admin;
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error.message);
    throw error;
  }
}

module.exports = initializeFirebase();