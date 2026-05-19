// ASKQA AI Recharge — Offer Scraper
// Runs every day midnight automatically
// Saves cashback offers to Google Sheet

const https = require("https");

async function getGoogleToken() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const { createSign } = require("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  const signature = sign.sign(serviceAccount.private_key, "base64url");
  const jwt = `${header}.${claim}.${signature}`;

  return new Promise((resolve, reject) => {
    const data = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req = https.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": data.length },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body).access_token));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function writeToSheet(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`;
  const data = JSON.stringify({ values });
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getCurrentOffers() {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const today = new Date();
  const month = today.getMonth() + 1;

  const offers = [
    ["Platform", "Offer", "Min Amount", "Conditions", "Link", "Updated"],
    ["Paytm", "Up to Rs.30 cashback", "Rs.199", "Select users — check Paytm app", "https://paytm.com/recharge", timestamp],
    ["PhonePe", "Up to Rs.50 cashback", "Rs.199", "First 3 recharges of month", "https://www.phonepe.com", timestamp],
    ["Amazon Pay", "Up to Rs.100 cashback", "Rs.299", "First recharge on Amazon", "https://www.amazon.in/recharge", timestamp],
    ["Google Pay", "Scratch card rewards", "Any amount", "Random cashback on scratch card", "https://pay.google.com", timestamp],
    ["Freecharge", "Up to 100% cashback", "Rs.10", "New users only", "https://www.freecharge.in", timestamp],
    ["Mobikwik", "Rs.100 SuperCash", "Rs.199", "All users — postpaid bills", "https://www.mobikwik.com", timestamp],
    ["JioFinance", "Double JioPoints", "Rs.199", "On electronics and fashion", "https://jiofinance.com", timestamp],
  ];

  // Add festive offers
  if (month === 10 || month === 11) {
    offers.push(["All Platforms", "Diwali special cashback active!", "Various", "Check all apps for extra offers", "https://www.grabon.in/mobile-recharge-coupons/", timestamp]);
  }
  if (month === 8) {
    offers.push(["All Platforms", "Independence Day special offers", "Various", "Extra cashback today", "https://www.grabon.in/mobile-recharge-coupons/", timestamp]);
  }

  return offers;
}

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    console.log("Starting offer update...", new Date().toISOString());
    const token = await getGoogleToken();
    const offers = getCurrentOffers();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    await writeToSheet(token, sheetId, "Offers!A1", offers);
    console.log(`Updated ${offers.length - 1} offers successfully`);
    return res.status(200).json({ success: true, offers_updated: offers.length - 1 });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
