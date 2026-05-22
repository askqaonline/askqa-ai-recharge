// ASKQA AI Recharge — Plan Scraper
// Fetches ALL plans from techtanic.github.io (updated daily from official sources)
// Saves to Google Sheet automatically
// Runs every Sunday midnight

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
// FETCH TECHTANIC JSON
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
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error("Invalid JSON: " + body.substring(0, 100)));
        }
      });
    }).on("error", reject);
  });
}

// ============================================
// PARSE PLANS INTO SHEET FORMAT
// ============================================
function parsePlans(operator, plans, rechargeLink) {
  const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const rows = [];

  // Handle both array and object with regions
  let planList = Array.isArray(plans) ? plans : [];

  // If plans is object with regions (Vi/BSNL)
  if (!Array.isArray(plans) && typeof plans === "object") {
    // Get all plans from all regions
    Object.values(plans).forEach(regionPlans => {
      if (Array.isArray(regionPlans)) {
        planList = planList.concat(regionPlans);
      }
    });
  }

  // Remove duplicates by price
  const seen = new Set();
  planList.forEach(plan => {
    const key = `${plan.price}-${plan.validity_days}-${plan.data_per_unit}`;
    if (seen.has(key)) return;
    seen.add(key);

    const price = plan.price || "";
    const validity = plan.validity_text || `${plan.validity_days} Days`;
    const dataType = plan.data_type || "";
    const dataPerUnit = plan.data_per_unit || "";
    const totalData = plan.total_data || "";
    const is5g = plan.is_5g ? "Yes" : "No";
    const benefits = plan.benefits ? plan.benefits.join(", ") : "";
    const pricePerDay = plan.price_per_day ? `Rs.${plan.price_per_day}` : "";

    // Format data display
    let dataDisplay = "";
    if (dataType === "daily") {
      dataDisplay = `${dataPerUnit}GB/day`;
    } else if (dataType === "total") {
      dataDisplay = `${totalData}GB total`;
    } else if (dataType === "unlimited") {
      dataDisplay = "Unlimited";
    } else {
      dataDisplay = dataPerUnit ? `${dataPerUnit}GB` : "";
    }

    rows.push([
      operator,
      price,
      dataDisplay,
      validity,
      benefits || "No OTT",
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
    console.log("Starting plan update from techtanic...", new Date().toISOString());

    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // Fetch all 4 operators from techtanic
    const [jioData, airtelData, viData, bsnlData] = await Promise.allSettled([
      fetchJSON("https://techtanic.github.io/compare-plan/plans-jio.json"),
      fetchJSON("https://techtanic.github.io/compare-plan/plans-airtel.json"),
      fetchJSON("https://techtanic.github.io/compare-plan/plans-vi.json"),
      fetchJSON("https://techtanic.github.io/compare-plan/plans-bsnl.json"),
    ]);

    const header = [[
      "Operator", "Price", "Data", "Validity",
      "Benefits/OTT", "5G", "Price/Day", "Recharge Link", "Updated"
    ]];

    let allPlans = [];

    if (jioData.status === "fulfilled") {
      const rows = parsePlans("Jio", jioData.value, "https://www.jio.com/self-care/plans");
      allPlans = allPlans.concat(rows);
      console.log(`Jio: ${rows.length} plans`);
    } else {
      console.log("Jio failed:", jioData.reason?.message);
    }

    if (airtelData.status === "fulfilled") {
      const rows = parsePlans("Airtel", airtelData.value, "https://www.airtel.in/recharge-online");
      allPlans = allPlans.concat(rows);
      console.log(`Airtel: ${rows.length} plans`);
    } else {
      console.log("Airtel failed:", airtelData.reason?.message);
    }

    if (viData.status === "fulfilled") {
      const rows = parsePlans("Vi", viData.value, "https://www.myvi.in/recharge");
      allPlans = allPlans.concat(rows);
      console.log(`Vi: ${rows.length} plans`);
    } else {
      console.log("Vi failed:", viData.reason?.message);
    }

    if (bsnlData.status === "fulfilled") {
      const rows = parsePlans("BSNL", bsnlData.value, "https://bsnl.in/opencms/jsp/selfcare/index.jsp");
      allPlans = allPlans.concat(rows);
      console.log(`BSNL: ${rows.length} plans`);
    } else {
      console.log("BSNL failed:", bsnlData.reason?.message);
    }

    if (allPlans.length === 0) {
      return res.status(500).json({ error: "No plans fetched from techtanic" });
    }

    // Save to Google Sheet
    const token = await getGoogleToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const allData = [...header, ...allPlans];
    await writeToSheet(token, sheetId, "Plans!A1", allData);

    console.log(`Total ${allPlans.length} plans saved to Google Sheet`);

    return res.status(200).json({
      success: true,
      plans_updated: allPlans.length,
      operators: {
        jio: jioData.status === "fulfilled" ? "ok" : "failed",
        airtel: airtelData.status === "fulfilled" ? "ok" : "failed",
        vi: viData.status === "fulfilled" ? "ok" : "failed",
        bsnl: bsnlData.status === "fulfilled" ? "ok" : "failed",
      },
      timestamp
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
