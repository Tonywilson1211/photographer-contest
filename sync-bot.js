const admin = require("firebase-admin");
const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");

// 1. CONFIG
const serviceAccount = require("./service-account.json");
const PHOTOS_DIR = "./photos";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

console.log("------------------------------------------------");
console.log("🤖 NICHECOM PHOTO BOT v2.1");
console.log(`👀 Watching: ${PHOTOS_DIR}`);
console.log("------------------------------------------------");

const watcher = chokidar.watch(PHOTOS_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: false,
  depth: 2
});

watcher.on("add", async (filePath) => {
  const normalizedPath = filePath.split(path.sep).join("/");
  const parts = normalizedPath.split("/");

  // Expected: photos/2026-03/Ivan Pecek/img.jpg
  if (parts.length < 4) return;

  const monthFolder = parts[1];      // "2026-03"
  const photographerName = parts[2]; // "Ivan Pecek"
  const fileName = parts[3];         // "img.jpg"

  const mimeType = mime.lookup(filePath);
  if (!mimeType || !mimeType.startsWith("image/")) return;

  console.log(`\n📤 Uploading: ${fileName} (${photographerName})`);

  try {
    // 1. Upload Blob
    const destination = `contest_photos/${monthFolder}/${photographerName}/${fileName}`;
    const [file] = await bucket.upload(filePath, {
      destination: destination,
      metadata: { contentType: mimeType }
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    // 2. Write Entry to Firestore
    const entryId = `${photographerName}-${fileName}`.replace(/[^a-zA-Z0-9]/g, "_");
    
    await db.collection("contests").doc(monthFolder).collection("entries").doc(entryId).set({
      id: entryId,
      photographer: photographerName,
      url: publicUrl,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      votes: 0 // Initialize vote count
    });

    // 3. Update Parent Contest (Critical for Frontend Discovery)
    // We add 'lastUpdated' so the frontend knows something happened
    await db.collection("contests").doc(monthFolder).set({
      monthName: convertDateToName(monthFolder),
      status: "voting", // Auto-start voting
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✅ Success: ${photographerName}`);

  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
});

function convertDateToName(folder) {
  const [y, m] = folder.split("-");
  const date = new Date(y, m - 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}
