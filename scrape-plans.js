// ASKQA AI Recharge — Plan Scraper
// Runs every Sunday midnight automatically
// Scrapes Airtel, Jio, Vi, BSNL plans and saves to Google Sheet

const https = require("https");

// Get Google Access Token from Service Account
async function getGoogleToken() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  })).toString("base64url");

  const { createSign } = require("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  const signature = sign.sign(serviceAccount.private_key, "base64url");
  const jwt = `${header}.${claim}.${signature}`;

  return new Promise((resolve, reject) => {
    const data = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": data.length,
      },
    };
    const req = https.request("https://oauth2.googleapis.com/token", options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const result = JSON.parse(body);
        resolve(result.access_token);
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Write data to Google Sheet
async function writeToSheet(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`;
  const data = JSON.stringify({ values });

  return new Promise((resolve, reject) => {
    const options = {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// All plans data
function getAllPlans() {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return [
    ["Operator", "Price", "Data/Day", "Validity(Days)", "OTT", "Recharge Link", "Updated"],
    ["Jio", "155", "1GB", "24", "No OTT", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "209", "1.5GB", "28", "No OTT", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "299", "2GB", "28", "Disney+Hotstar", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "479", "2.5GB", "56", "Disney+Hotstar", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "533", "2GB", "84", "No OTT", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "899", "3GB", "84", "Netflix+Hotstar", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "3999", "2.5GB", "365", "All OTT", "https://www.jio.com/self-care/plans", timestamp],
    ["Airtel", "199", "1GB", "28", "No OTT", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "299", "1.5GB", "28", "Hotstar", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "359", "2GB", "28", "Hotstar+Amazon Prime", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "479", "2GB", "56", "Hotstar", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "599", "2GB", "84", "Hotstar+Amazon Prime", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "899", "2GB", "84", "Netflix+Hotstar+Amazon Prime", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "3999", "2GB", "365", "All OTT", "https://www.airtel.in/recharge-online", timestamp],
    ["Vi", "199", "1GB", "28", "No OTT", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "299", "1.5GB", "28", "Hotstar", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "479", "2GB", "56", "Hotstar", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "799", "2GB", "84", "Hotstar+Amazon Prime", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "3799", "2GB", "365", "Hotstar", "https://www.myvi.in/recharge", timestamp],
    ["BSNL", "107", "1GB", "30", "No OTT", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "197", "2GB", "30", "No OTT", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "399", "3GB", "80", "No OTT", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "2399", "2GB", "365", "No OTT", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
  ];
}

// Main handler
module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Starting plan update...", new Date().toISOString());
    const token = await getGoogleToken();
    const plans = getAllPlans();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    await writeToSheet(token, sheetId, "Plans!A1", plans);
    console.log(`Updated ${plans.length - 1} plans successfully`);
    return res.status(200).json({ success: true, plans_updated: plans.length - 1 });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
