const admin = require("firebase-admin");
const sa = require("/root/firebase-service-account.json");
const app = admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: "https://axexodiweb-default-rtdb.firebaseio.com" });
const db = admin.database();
if (typeof db.getRules === "function") {
  db.getRules().then(r => { console.log("RULES:"); console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error("ERR:", e.message); process.exit(1); });
} else if (typeof db.getRulesJSON === "function") {
  db.getRulesJSON().then(r => { console.log("RULES:"); console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error("ERR:", e.message); process.exit(1); });
} else {
  console.log("NO getRules API available");
  console.log("db methods:", Object.keys(db).filter(k => k.toLowerCase().includes("rule") || k.toLowerCase().includes("get")));
  process.exit(0);
}
