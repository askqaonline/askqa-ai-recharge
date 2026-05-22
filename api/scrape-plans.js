const https = require("https");

// ============================================
// GOOGLE TOKEN
// ============================================

async function getGoogleToken() {

  const serviceAccount = JSON.parse(
    process.env.GOOGLE_SERVICE_ACCOUNT
  );

  const header = Buffer
    .from(JSON.stringify({
      alg: "RS256",
      typ: "JWT"
    }))
    .toString("base64url");

  const now = Math.floor(Date.now() / 1000);

  const claim = Buffer
    .from(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    }))
    .toString("base64url");

  const { createSign } = require("crypto");

  const sign = createSign("RSA-SHA256");

  sign.update(`${header}.${claim}`);

  const signature = sign.sign(
    serviceAccount.private_key,
    "base64url"
  );

  const jwt = `${header}.${claim}.${signature}`;

  return new Promise((resolve, reject) => {

    const data =
      `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

    const req = https.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
          "Content-Length": data.length
        }
      },
      (res) => {

        let body = "";

        res.on("data", chunk => body += chunk);

        res.on("end", () => {

          const result = JSON.parse(body);

          resolve(result.access_token);

        });

      }
    );

    req.on("error", reject);

    req.write(data);

    req.end();

  });
}

// ============================================
// WRITE TO GOOGLE SHEET
// ============================================

async function writeToSheet(
  token,
  sheetId,
  range,
  values
) {

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`;

  const data = JSON.stringify({ values });

  return new Promise((resolve, reject) => {

    const req = https.request(
      url,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length":
            Buffer.byteLength(data)
        }
      },
      (res) => {

        let body = "";

        res.on("data", chunk => body += chunk);

        res.on("end", () => {

          resolve(JSON.parse(body));

        });

      }
    );

    req.on("error", reject);

    req.write(data);

    req.end();

  });
}

// ============================================
// FETCH URL
// ============================================

function fetchURL(url) {

  return new Promise((resolve, reject) => {

    https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      },
      (res) => {

        let body = "";

        res.on("data", chunk => body += chunk);

        res.on("end", () => {

          resolve(body);

        });

      }
    ).on("error", reject);

  });

}

// ============================================
// JIO FETCHER
// ============================================

async function fetchJioPlans() {

  const body = await fetchURL(
    "https://www.jio.com/selfcare/plans/mobility/prepaid-plans-list/"
  );

  const timestamp = new Date()
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

  const plans = [];

  const matches = [
    ...body.matchAll(/₹\s?(\d+)/g)
  ];

  matches.forEach(match => {

    plans.push([
      "Jio",
      match[1],
      "",
      "",
      "",
      "https://www.jio.com/self-care/plans",
      timestamp
    ]);

  });

  return plans;

}

// ============================================
// AIRTEL FETCHER
// ============================================

async function fetchAirtelPlans() {

  const body = await fetchURL(
    "https://www.airtel.in/recharge-online"
  );

  const timestamp = new Date()
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

  const plans = [];

  const matches = [
    ...body.matchAll(/₹\s?(\d+)/g)
  ];

  matches.forEach(match => {

    plans.push([
      "Airtel",
      match[1],
      "",
      "",
      "",
      "https://www.airtel.in/recharge-online",
      timestamp
    ]);

  });

  return plans;

}

// ============================================
// VI FETCHER
// ============================================

async function fetchViPlans() {

  const body = await fetchURL(
    "https://www.myvi.in/recharge"
  );

  const timestamp = new Date()
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

  const plans = [];

  const matches = [
    ...body.matchAll(/₹\s?(\d+)/g)
  ];

  matches.forEach(match => {

    plans.push([
      "Vi",
      match[1],
      "",
      "",
      "",
      "https://www.myvi.in/recharge",
      timestamp
    ]);

  });

  return plans;

}

// ============================================
// BSNL FETCHER
// ============================================

async function fetchBSNLPlans() {

  const body = await fetchURL(
    "https://bsnl.in/opencms/jsp/selfcare/index.jsp"
  );

  const timestamp = new Date()
    .toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    });

  const plans = [];

  const matches = [
    ...body.matchAll(/₹\s?(\d+)/g)
  ];

  matches.forEach(match => {

    plans.push([
      "BSNL",
      match[1],
      "",
      "",
      "",
      "https://bsnl.in/opencms/jsp/selfcare/index.jsp",
      timestamp
    ]);

  });

  return plans;

}

// ============================================
// REMOVE DUPLICATES
// ============================================

function removeDuplicates(plans) {

  const seen = new Set();

  return plans.filter(plan => {

    const key =
      `${plan[0]}-${plan[1]}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;

  });

}

// ============================================
// COLLECT ALL PLANS
// ============================================

async function collectAllPlans() {

  const header = [[
    "Operator",
    "Price",
    "Data/Day",
    "Validity(Days)",
    "OTT",
    "Recharge Link",
    "Updated"
  ]];

  const jio = await fetchJioPlans();

  const airtel =
    await fetchAirtelPlans();

  const vi =
    await fetchViPlans();

  const bsnl =
    await fetchBSNLPlans();

  let allPlans = [
    ...jio,
    ...airtel,
    ...vi,
    ...bsnl
  ];

  allPlans =
    removeDuplicates(allPlans);

  return [
    ...header,
    ...allPlans
  ];

}

// ============================================
// MAIN HANDLER
// ============================================

module.exports = async (req, res) => {

  try {

    console.log("Starting scraper test...");

    const plans =
      await collectAllPlans();

    console.log(plans);

    return res.status(200).json({
      success: true,
      total_plans: plans.length - 1,
      sample: plans.slice(0, 20)
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: error.message
    });

  }

};
