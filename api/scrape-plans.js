// ASKQA AI Recharge — Plan Scraper
// Reads from techtanic.github.io/compare-plan — updated daily from official operator sources
// Runs every Sunday midnight automatically

const https = require("https");
const { createSign } = require("crypto");

// Get Google Access Token
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

// Write to Google Sheet
async function writeToSheet(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`;
  const data = JSON.stringify({ values });
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      },
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

// Fetch page from URL
function fetchURL(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/json,*/*"
      }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

// Try to get techtanic data file directly
async function fetchTechtanicData() {
  const urls = [
    "https://techtanic.github.io/compare-plan/data.json",
    "https://techtanic.github.io/compare-plan/plans.json",
    "https://raw.githubusercontent.com/techtanic/compare-plan/main/data.json",
    "https://raw.githubusercontent.com/techtanic/compare-plan/main/plans.json",
    "https://raw.githubusercontent.com/techtanic/compare-plan/gh-pages/data.json",
  ];

  for (const url of urls) {
    try {
      console.log(`Trying: ${url}`);
      const body = await fetchURL(url);
      const data = JSON.parse(body);
      if (data && (Array.isArray(data) || typeof data === "object")) {
        console.log(`Success from: ${url}`);
        return data;
      }
    } catch (e) {
      console.log(`Failed: ${url} — ${e.message}`);
    }
  }
  return null;
}

// Parse techtanic data into our format
function parseTechtanicData(data) {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const plans = [["Operator", "Price", "Data/Day", "Validity(Days)", "OTT", "5G", "Recharge Link", "Updated"]];

  const items = Array.isArray(data) ? data : (data.plans || data.data || []);

  items.forEach(plan => {
    const operator = plan.operator || plan.network || "";
    const price = plan.price || plan.amount || plan.cost || "";
    const data_per_day = plan.data || plan.daily_data || plan.data_per_day || "";
    const validity = plan.validity || plan.days || "";
    const ott = plan.ott || plan.benefits || plan.extras || "No OTT";
    const is5g = plan.is_5g || plan["5g"] || false;
    const link = operator.toLowerCase().includes("jio") ? "https://www.jio.com/self-care/plans" :
                 operator.toLowerCase().includes("airtel") ? "https://www.airtel.in/recharge-online" :
                 operator.toLowerCase().includes("vi") ? "https://www.myvi.in/recharge" :
                 "https://bsnl.in/opencms/jsp/selfcare/index.jsp";

    if (operator && price) {
      plans.push([operator, price, data_per_day, validity, ott, is5g ? "Yes" : "No", link, timestamp]);
    }
  });

  return plans;
}

// Fallback — comprehensive researched plan data May 2026
function getFallbackPlans() {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return [
    ["Operator", "Price", "Data/Day", "Validity(Days)", "OTT", "5G", "Recharge Link", "Updated"],
    // JIO PLANS
    ["Jio", "19", "200MB", "1", "No OTT", "No", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "103", "5GB total", "28", "No OTT", "No", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "155", "1GB", "24", "No OTT", "No", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "189", "1.5GB", "28", "No OTT", "No", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "239", "1.5GB", "28", "No OTT", "No", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "299", "2GB", "28", "JioHotstar", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "349", "2GB", "28", "JioHotstar+OTT Pack", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "399", "2GB", "28", "Netflix+JioHotstar", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "479", "2.5GB", "56", "JioHotstar", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "533", "2GB", "84", "No OTT", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "601", "2GB", "84", "JioHotstar", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "799", "2GB", "84", "JioHotstar+Gemini AI", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "899", "3GB", "84", "Netflix+JioHotstar+Gemini", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "2999", "2.5GB", "365", "JioHotstar+Gemini AI", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    ["Jio", "3599", "2.5GB", "365", "All OTT+Gemini AI Pro", "Yes", "https://www.jio.com/self-care/plans", timestamp],
    // AIRTEL PLANS
    ["Airtel", "179", "1GB", "28", "No OTT", "No", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "199", "1GB", "28", "No OTT", "No", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "299", "2GB", "28", "Hotstar", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "359", "2GB", "30", "Hotstar+Amazon Prime", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "399", "2GB", "28", "Hotstar+Amazon+SonyLiv", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "509", "2GB", "84", "Hotstar", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "599", "2GB", "84", "Hotstar+Amazon Prime", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "699", "2GB", "84", "Hotstar+Amazon+SonyLiv", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "899", "2GB", "84", "Netflix+Hotstar+Amazon", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "1849", "No data", "365", "Unlimited calls only", "No", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "2999", "2.5GB", "365", "Hotstar+Amazon Prime", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    ["Airtel", "3599", "2.5GB", "365", "All OTT+Airtel Thanks", "Yes", "https://www.airtel.in/recharge-online", timestamp],
    // VI PLANS
    ["Vi", "179", "1GB", "28", "No OTT", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "199", "1GB", "28", "No OTT", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "249", "1.5GB", "28", "No OTT", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "299", "2GB", "28", "Hotstar", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "399", "2GB", "28", "Hotstar+SonyLiv", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "459", "2GB", "56", "Hotstar", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "799", "2GB", "84", "Hotstar+Amazon+SonyLiv", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "1189", "50GB total", "365", "No OTT", "No", "https://www.myvi.in/recharge", timestamp],
    ["Vi", "3099", "2.5GB", "365", "Hotstar+SonyLiv", "No", "https://www.myvi.in/recharge", timestamp],
    // BSNL PLANS
    ["BSNL", "107", "1GB", "28", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "147", "2GB", "24", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "197", "2GB", "30", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "333", "2GB", "90", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "399", "3GB", "80", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "999", "2GB", "160", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
    ["BSNL", "2399", "2GB", "365", "No OTT", "No", "https://bsnl.in/opencms/jsp/selfcare/index.jsp", timestamp],
  ];
}

// Main handler
module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Starting plan update...", new Date().toISOString());

    // Try techtanic first
    let plans;
    const techtanicData = await fetchTechtanicData();

    if (techtanicData) {
      console.log("Using techtanic data");
      plans = parseTechtanicData(techtanicData);
    } else {
      console.log("Using fallback researched data");
      plans = getFallbackPlans();
    }

    // Save to Google Sheet
    const token = await getGoogleToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    await writeToSheet(token, sheetId, "Plans!A1", plans);

    console.log(`Updated ${plans.length - 1} plans successfully`);
    return res.status(200).json({
      success: true,
      plans_updated: plans.length - 1,
      source: techtanicData ? "techtanic" : "fallback"
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
