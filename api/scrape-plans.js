// ASKQA AI Recharge — Plan Scraper
// Fetches ALL plans from techtanic.github.io
// Cleans and filters data before saving to Google Sheet

const https = require("https");
const { createSign } = require("crypto");

// ============================================
// GOOGLE TOKEN
// ============================================
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
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve(JSON.parse(body).access_token));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ============================================
// WRITE TO GOOGLE SHEET
// ============================================
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
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve(JSON.parse(body)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ============================================
// FETCH JSON FROM TECHTANIC
// ============================================
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error("Invalid JSON")); }
      });
    }).on("error", reject);
  });
}

// ============================================
// CLEAN OTT BENEFITS
// ============================================
function cleanOTT(benefits) {
  if (!benefits || benefits.length === 0) return "No OTT";

  // Map internal codes to user friendly names
  const ottMap = {
    "ADOBE_EXPRESS_PREMIUM": "",
    "SPAM_PROTECTION": "",
    "HELLOTUNES_SILVER": "",
    "HELLOTUNES_GOLD": "",
    "XSTREAM_PLAY_FREE": "Airtel Xstream",
    "UNLIMITED_5G": "",
    "UNLIMITED_5G_FOR_SELECTED_PACKS_A": "",
    "XSTREAM_PREMIUM": "Airtel Xstream Premium",
    "NETFLIX_BASIC": "Netflix",
    "NETFLIX_PREPAID_BASIC": "Netflix",
    "SVOD_NETFLIX_BASIC_84_PREPAID": "Netflix",
    "SVOD_NETFLIX_BASIC_28_PREPAID": "Netflix",
    "SVOD_HOTSTAR_84_PREPAID": "Hotstar",
    "SVOD_HOTSTAR_28_PREPAID": "Hotstar",
    "JIOHOTSTAR_SUPER": "JioHotstar",
    "JioHotstar_1M_RC48": "JioHotstar",
    "JioHotstar_1M_RC100": "JioHotstar",
    "JioHotstar_Quarterly": "JioHotstar",
    "JioHotstar_Quarterly_195": "JioHotstar",
    "JioHotstar_28D": "JioHotstar",
    "JioHotstar_1Year": "JioHotstar",
    "JioHotstar": "JioHotstar",
    "SVOD_ZEE_84_PREPAID": "ZEE5",
    "SVOD_ZEE_28_PREPAID": "ZEE5",
    "ZEE5_PREMIUM": "ZEE5",
    "SONYLIV_PRIME_30D": "Sony LIV",
    "SONYLIV_PRIME_56D": "Sony LIV",
    "SONYLIV_PRIME_84D": "Sony LIV",
    "SONYLIV_PRIME_28D": "Sony LIV",
    "PRIME_LITE_84": "Amazon Prime Lite",
    "PRIME_LITE_56": "Amazon Prime Lite",
    "SVOD_XSTREAM_PREMIUM_84_PREPAID_ALL_IN": "Airtel Xstream Premium",
    "SVOD_XSTREAM_PREMIUM_28_PREPAID_ALL_IN": "Airtel Xstream Premium",
    "GOOGLE_ONE_PREPAID_001": "Google One",
    "GOOGLE_ONE_PREPAID_002": "Google One",
    "GOOGLE_ONE_PREPAID_003": "Google One",
    "APPLE_MUSIC_PREPAID_V2": "Apple Music",
    "JioTV": "JioTV",
    "JioAICloud": "JioAICloud",
    "Gemini": "Gemini AI",
    "JioHotstar_Mobile": "JioHotstar",
    "BENEFITS_12": "",
    "BENEFITS_3": "",
    "BENEFITS_9": "",
    "BENEFITS_8": "",
    "FanCode": "FanCode",
    "JioGames": "JioGames",
    "Swiggy": "Swiggy",
    "Snapchat+": "Snapchat+",
    "BGMI": "BGMI",
  };

  const cleaned = benefits
    .map(b => {
      const trimmed = b.trim();
      // Check exact match in map
      if (ottMap.hasOwnProperty(trimmed)) return ottMap[trimmed];
      // Remove pipe and everything after (e.g. "JioHotstar | 84 Days" -> "JioHotstar")
      const withoutPipe = trimmed.split("|")[0].trim();
      if (ottMap.hasOwnProperty(withoutPipe)) return ottMap[withoutPipe];
      // Remove known junk patterns
      if (trimmed.startsWith("BENEFITS_")) return "";
      if (trimmed.startsWith("UNLIMITED_")) return "";
      if (trimmed.startsWith("SVOD_")) return "";
      if (trimmed.includes("PREPAID")) return "";
      if (trimmed.includes("PACK")) return "";
      return withoutPipe;
    })
    .filter(b => b && b.length > 0)
    // Remove duplicates
    .filter((b, i, arr) => arr.indexOf(b) === i);

  return cleaned.length > 0 ? cleaned.join(", ") : "No OTT";
}

// ============================================
// CLEAN DATA DISPLAY
// ============================================
function cleanData(plan) {
  const dataPerUnit = plan.data_per_unit;
  const dataType = plan.data_type;
  const totalData = plan.total_data;

  // Handle unlimited (99999 is techtanic's way of saying unlimited)
  if (dataPerUnit >= 99999 || totalData >= 99999) {
    return "Unlimited";
  }

  // Handle tiny data (BSNL 2G plans)
  if (dataPerUnit < 0.5 && dataPerUnit > 0) {
    const mb = Math.round(dataPerUnit * 1024);
    if (dataType === "daily") return `${mb}MB/day`;
    return `${mb}MB total`;
  }

  if (dataType === "daily") {
    return `${dataPerUnit}GB/day`;
  } else if (dataType === "total") {
    return `${totalData}GB total`;
  } else if (dataType === "unlimited") {
    return "Unlimited";
  }

  return dataPerUnit ? `${dataPerUnit}GB` : "";
}

// ============================================
// CHECK IF PLAN IS VALID (filter junk)
// ============================================
function isValidPlan(plan) {
  // Only filter plans with no price
  if (!plan.price || plan.price <= 0) return false;
  return true;
}

// ============================================
// PARSE PLANS INTO SHEET FORMAT
// ============================================
function parsePlans(operator, plans, rechargeLink) {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const rows = [];

  let planList = Array.isArray(plans) ? plans : [];

  // Handle object with regions (Vi/BSNL)
  if (!Array.isArray(plans) && typeof plans === "object") {
    Object.values(plans).forEach(regionPlans => {
      if (Array.isArray(regionPlans)) {
        planList = planList.concat(regionPlans);
      }
    });
  }

  // Remove duplicates by price + validity + data
  const seen = new Set();

  planList.forEach(plan => {
    // Filter invalid plans
    if (!isValidPlan(plan)) return;

    const key = `${plan.price}-${plan.validity_days}-${plan.data_per_unit}`;
    if (seen.has(key)) return;
    seen.add(key);

    const price = plan.price || "";
    const validity = plan.validity_text || `${plan.validity_days} Days`;
    const dataDisplay = cleanData(plan);
    const is5g = plan.is_5g ? "Yes" : "No";
    const benefits = Array.isArray(plan.benefits) ? cleanOTT(plan.benefits) : "No OTT";
    const pricePerDay = plan.price_per_day ? `Rs.${parseFloat(plan.price_per_day).toFixed(2)}` : "";

    rows.push([
      operator,
      price,
      dataDisplay,
      validity,
      benefits,
      is5g,
      pricePerDay,
      rechargeLink,
      timestamp
    ]);
  });

  return rows;
}

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("Starting plan update...", new Date().toISOString());

    const [jioData, airtelData, viData, bsnlData] = await Promise.allSettled([
      fetchJSON("https://techtanic.github.io/compare-plan/plans-jio.json"),
      fetchJSON("https://techtanic.github.io/compare-plan/plans-airtel.json"),
      fetchJSON("https://techtanic.github.io/compare-plan/plans-vi.json"),
      fetchJSON("https://techtanic.github.io/compare-plan/plans-bsnl.json"),
    ]);

    const header = [[
      "Operator", "Price", "Data", "Validity",
      "OTT", "5G", "Price/Day", "Recharge Link", "Updated"
    ]];

    let allPlans = [];

    if (jioData.status === "fulfilled") {
      const rows = parsePlans("Jio", jioData.value, "https://www.jio.com/self-care/plans");
      allPlans = allPlans.concat(rows);
      console.log(`Jio: ${rows.length} plans`);
    }

    if (airtelData.status === "fulfilled") {
      const rows = parsePlans("Airtel", airtelData.value, "https://www.airtel.in/recharge-online");
      allPlans = allPlans.concat(rows);
      console.log(`Airtel: ${rows.length} plans`);
    }

    if (viData.status === "fulfilled") {
      const rows = parsePlans("Vi", viData.value, "https://www.myvi.in/recharge");
      allPlans = allPlans.concat(rows);
      console.log(`Vi: ${rows.length} plans`);
    }

    if (bsnlData.status === "fulfilled") {
      const rows = parsePlans("BSNL", bsnlData.value, "https://bsnl.in/opencms/jsp/selfcare/index.jsp");
      allPlans = allPlans.concat(rows);
      console.log(`BSNL: ${rows.length} plans`);
    }

    if (allPlans.length === 0) {
      return res.status(500).json({ error: "No plans fetched" });
    }

    const token = await getGoogleToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    await writeToSheet(token, sheetId, "Plans!A1", [...header, ...allPlans]);

    console.log(`Total ${allPlans.length} clean plans saved`);

    return res.status(200).json({
      success: true,
      plans_updated: allPlans.length,
      operators: {
        jio: jioData.status === "fulfilled" ? "ok" : "failed",
        airtel: airtelData.status === "fulfilled" ? "ok" : "failed",
        vi: viData.status === "fulfilled" ? "ok" : "failed",
        bsnl: bsnlData.status === "fulfilled" ? "ok" : "failed",
      },
      timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
