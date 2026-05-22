// ASKQA AI Recharge — WhatsApp Webhook
// Complete flow: Language → Number → Preference → Plans
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ============================================
// GOOGLE TOKEN
// ============================================
async function getGoogleToken() {
  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const { createSign } = require("crypto");
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
// READ GOOGLE SHEET
// ============================================
async function readSheet(token, sheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        const result = JSON.parse(body);
        resolve(result.values || []);
      });
    }).on("error", reject);
  });
}

// ============================================
// DETECT OPERATOR FROM NUMBER
// ============================================
function detectOperator(mobile) {
  const num = mobile.replace(/\D/g, "").slice(-10);
  const prefix2 = parseInt(num.substring(0, 2));
  const prefix3 = parseInt(num.substring(0, 3));
  const prefix4 = parseInt(num.substring(0, 4));

  // Jio prefixes
  const jioPrefixes = [70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
  if (num[0] === "6") return "Jio";
  if (jioPrefixes.includes(prefix2)) return "Jio";

  // Airtel prefixes
  const airtelPrefixes = [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 98, 99];
  if (airtelPrefixes.includes(prefix2)) return "Airtel";

  // Vi prefixes
  const viPrefixes = [90, 91, 92, 93, 94, 95, 96, 97];
  if (viPrefixes.includes(prefix2)) return "Vi";

  // BSNL
  const bsnlPrefixes = [94, 95];
  if (bsnlPrefixes.includes(prefix2)) return "BSNL";

  return "Unknown";
}

// ============================================
// GET PLANS FROM SHEET
// ============================================
async function getPlansFromSheet(operator, preference) {
  try {
    const token = await getGoogleToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const rows = await readSheet(token, sheetId, "Plans!A1:I500");

    if (rows.length < 2) return [];

    // Filter by operator
    let plans = rows.slice(1).filter(row => 
      row[0] && row[0].toLowerCase() === operator.toLowerCase()
    );

    // Sort by preference
    if (preference === "low_cost") {
      plans.sort((a, b) => parseFloat(a[1]) - parseFloat(b[1]));
    } else if (preference === "more_data") {
      plans.sort((a, b) => {
        const dataA = parseFloat(a[2]) || 0;
        const dataB = parseFloat(b[2]) || 0;
        return dataB - dataA;
      });
    } else if (preference === "long_validity") {
      plans.sort((a, b) => {
        const daysA = parseInt(a[3]) || 0;
        const daysB = parseInt(b[3]) || 0;
        return daysB - daysA;
      });
    }

    return plans.slice(0, 3);
  } catch (error) {
    console.error("Sheet read error:", error.message);
    return [];
  }
}

// ============================================
// FORMAT PLANS FOR WHATSAPP
// ============================================
function formatPlans(plans, operator, language, rechargeLink) {
  if (plans.length === 0) {
    if (language === "tamil") {
      return `மன்னிக்கவும், ${operator} திட்டங்கள் இப்போது கிடைக்கவில்லை.`;
    }
    return `Sorry, ${operator} plans not available right now.`;
  }

  let msg = "";
  
  if (language === "tamil") {
    msg = `${operator} சிறந்த திட்டங்கள்:\n\n`;
  } else {
    msg = `Best ${operator} plans:\n\n`;
  }

  plans.forEach((plan, i) => {
    const price = plan[1] || "";
    const data = plan[2] || "";
    const validity = plan[3] || "";
    const benefits = plan[4] || "";
    const is5g = plan[5] || "";
    const pricePerDay = plan[6] || "";

    if (language === "tamil") {
      msg += `${i + 1}. Rs.${price} — ${data}, ${validity}\n`;
      if (benefits && benefits !== "No OTT") msg += `   OTT: ${benefits}\n`;
      if (is5g === "Yes") msg += `   5G: உண்டு\n`;
      if (pricePerDay) msg += `   நாள் கட்டணம்: ${pricePerDay}\n`;
    } else {
      msg += `${i + 1}. Rs.${price} — ${data}, ${validity}\n`;
      if (benefits && benefits !== "No OTT") msg += `   OTT: ${benefits}\n`;
      if (is5g === "Yes") msg += `   5G: Yes\n`;
      if (pricePerDay) msg += `   Per day: ${pricePerDay}\n`;
    }
    msg += "\n";
  });

  if (language === "tamil") {
    msg += `ரீசார்ஜ்: ${rechargeLink}`;
  } else {
    msg += `Recharge: ${rechargeLink}`;
  }

  return msg;
}

// ============================================
// GET RECHARGE LINK
// ============================================
function getRechargeLink(operator) {
  const links = {
    "Jio": "https://www.jio.com/self-care/plans",
    "Airtel": "https://www.airtel.in/recharge-online",
    "Vi": "https://www.myvi.in/recharge",
    "BSNL": "https://bsnl.in/opencms/jsp/selfcare/index.jsp"
  };
  return links[operator] || "https://www.google.com/search?q=" + operator + "+recharge";
}

// ============================================
// SEND WHATSAPP TEXT MESSAGE
// ============================================
async function sendMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message },
      }),
    }
  );
  const result = await response.json();
  console.log("Send result:", JSON.stringify(result));
  return result;
}

// ============================================
// SEND LANGUAGE BUTTONS
// ============================================
async function sendLanguageButtons(to) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "Welcome to ASKQA Recharge!\n\nSelect your language:" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "lang_english", title: "English" } },
              { type: "reply", reply: { id: "lang_tamil", title: "தமிழ்" } }
            ]
          }
        }
      }),
    }
  );
  const result = await response.json();
  console.log("Language buttons result:", JSON.stringify(result));
  return result;
}

// ============================================
// SEND PREFERENCE BUTTONS
// ============================================
async function sendPreferenceButtons(to, language) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const bodyText = language === "tamil"
    ? "நீங்கள் எந்த திட்டம் விரும்புகிறீர்கள்?"
    : "What do you prefer?";

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: [
              { type: "reply", reply: { id: "pref_low_cost", title: language === "tamil" ? "குறைந்த விலை" : "Low Cost" } },
              { type: "reply", reply: { id: "pref_more_data", title: language === "tamil" ? "அதிக டேட்டா" : "More Data" } },
              { type: "reply", reply: { id: "pref_long_validity", title: language === "tamil" ? "நீண்ட காலம்" : "Long Validity" } }
            ]
          }
        }
      }),
    }
  );
  const result = await response.json();
  console.log("Preference buttons result:", JSON.stringify(result));
  return result;
}

// ============================================
// USER STATE MANAGEMENT
// ============================================
const userState = {};

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      console.log("Webhook verified!");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      console.log("Incoming:", JSON.stringify(body));

      if (body.object === "whatsapp_business_account") {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            const value = change.value;

            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const from = message.from;

              // Initialize user state
              if (!userState[from]) {
                userState[from] = { step: "start", language: "english" };
              }

              const state = userState[from];

              // ── BUTTON REPLY HANDLER ──
              if (message.type === "interactive" && message.interactive.type === "button_reply") {
                const buttonId = message.interactive.button_reply.id;
                console.log(`Button: ${buttonId} from ${from}`);

                // Language selection
                if (buttonId === "lang_english") {
                  state.language = "english";
                  state.step = "ask_number";
                  await sendMessage(from, "Please enter your 10 digit mobile number:");

                } else if (buttonId === "lang_tamil") {
                  state.language = "tamil";
                  state.step = "ask_number";
                  await sendMessage(from, "உங்கள் 10 இலக்க மொபைல் நம்பரை உள்ளிடவும்:");

                // Preference selection
                } else if (buttonId === "pref_low_cost") {
                  state.preference = "low_cost";
                  state.step = "show_plans";
                  const plans = await getPlansFromSheet(state.operator, "low_cost");
                  const msg = formatPlans(plans, state.operator, state.language, getRechargeLink(state.operator));
                  await sendMessage(from, msg);

                } else if (buttonId === "pref_more_data") {
                  state.preference = "more_data";
                  state.step = "show_plans";
                  const plans = await getPlansFromSheet(state.operator, "more_data");
                  const msg = formatPlans(plans, state.operator, state.language, getRechargeLink(state.operator));
                  await sendMessage(from, msg);

                } else if (buttonId === "pref_long_validity") {
                  state.preference = "long_validity";
                  state.step = "show_plans";
                  const plans = await getPlansFromSheet(state.operator, "long_validity");
                  const msg = formatPlans(plans, state.operator, state.language, getRechargeLink(state.operator));
                  await sendMessage(from, msg);
                }

              // ── TEXT MESSAGE HANDLER ──
              } else if (message.type === "text") {
                const msgText = message.text.body.trim();
                console.log(`Text from ${from}: ${msgText}`);

                // Step 1 — New user — show language buttons
                if (state.step === "start") {
                  await sendLanguageButtons(from);
                  state.step = "language_sent";

                // Step 2 — Waiting for mobile number
                } else if (state.step === "ask_number") {
                  const mobile = msgText.replace(/\D/g, "").slice(-10);

                  if (mobile.length === 10) {
                    // Detect operator silently
                    const operator = detectOperator(mobile);
                    state.mobile = mobile;
                    state.operator = operator;
                    state.step = "ask_preference";

                    // Show preference buttons
                    await sendPreferenceButtons(from, state.language);

                  } else {
                    // Invalid number
                    if (state.language === "tamil") {
                      await sendMessage(from, "சரியான 10 இலக்க மொபைல் நம்பரை உள்ளிடவும்.");
                    } else {
                      await sendMessage(from, "Please enter a valid 10 digit mobile number.");
                    }
                  }

                // Step 3 — After plans shown — handle follow up
                } else if (state.step === "show_plans") {
                  const lower = msgText.toLowerCase();

                  // Reset conversation
                  if (lower.includes("hi") || lower.includes("hello") || lower.includes("start") || lower.includes("menu")) {
                    userState[from] = { step: "start", language: "english" };
                    await sendLanguageButtons(from);

                  } else if (lower.includes("more") || lower.includes("other") || lower.includes("different")) {
                    await sendPreferenceButtons(from, state.language);

                  } else {
                    // Any other message — show preference buttons again
                    await sendPreferenceButtons(from, state.language);
                  }

                // Default — any other state — restart
                } else {
                  userState[from] = { step: "start", language: "english" };
                  await sendLanguageButtons(from);
                }
              }
            }
          }
        }
      }

      return res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).send("Method not allowed");
};
