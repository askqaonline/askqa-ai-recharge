// ASKQA Recharge — Complete WhatsApp Webhook
// Flow: Language → Operator → Number → Smart 5 Plans → Natural language
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

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
    https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => resolve(JSON.parse(body).values || []));
    }).on("error", reject);
  });
}

// ============================================
// GET SMART 5 PLANS
// ============================================
async function getSmartPlans(operator) {
  try {
    const token = await getGoogleToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const rows = await readSheet(token, sheetId, "Plans!A1:I500");
    if (rows.length < 2) return [];

    // Filter by operator
    let plans = rows.slice(1).filter(row =>
      row[0] && row[0].toLowerCase() === operator.toLowerCase()
    );

    if (plans.length === 0) return [];

    // Helper functions
    const getPrice = p => parseFloat(p[1]) || 999999;
    const getPricePerDay = p => parseFloat((p[6] || "").replace("Rs.", "")) || 999999;
    const getDataVal = p => {
      const str = p[2] || "";
      const match = str.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };
    const getDays = p => {
      const str = p[3] || "";
      const match = str.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    };
    const hasOTT = p => p[4] && p[4] !== "No OTT" && p[4] !== "";
    const isDaily = p => (p[2] || "").includes("/day") || (p[2] || "").toLowerCase().includes("day");

    // Pick 5 smart plans — one from each category
    const selected = [];
    const usedPrices = new Set();

    const pickBest = (sortFn, filterFn = null) => {
      let pool = filterFn ? plans.filter(filterFn) : plans;
      pool = pool.filter(p => !usedPrices.has(p[1]));
      pool.sort(sortFn);
      if (pool.length > 0) {
        selected.push(pool[0]);
        usedPrices.add(pool[0][1]);
      }
    };

    // hasData — only plans with actual data
    const hasData = p => p[2] && p[2] !== "" && p[2] !== "Calls only";

    // Plan 1 — Cheapest with data (28-30 days)
    pickBest((a, b) => getPrice(a) - getPrice(b), p => getDays(p) >= 28 && getDays(p) <= 35 && hasData(p));

    // Plan 2 — Cheapest daily data plan (28-30 days)
    pickBest((a, b) => getPrice(a) - getPrice(b), p => isDaily(p) && getDays(p) >= 28 && getDays(p) <= 35 && hasData(p));

    // Plan 3 — Better daily data (28-30 days, more GB/day)
    pickBest((a, b) => getDataVal(b) - getDataVal(a), p => isDaily(p) && getDays(p) >= 28 && getDays(p) <= 35 && hasData(p));

    // Plan 4 — Long validity with data (84-90 days), cheapest per day
    pickBest((a, b) => getPricePerDay(a) - getPricePerDay(b), p => getDays(p) >= 84 && getDays(p) <= 95 && hasData(p));

    // Plan 5 — Long validity better data (180+ days)
    pickBest((a, b) => getPricePerDay(a) - getPricePerDay(b), p => getDays(p) >= 180 && hasData(p));

    // Plan 6 — Operator special — cheapest per day with data (any validity)
    pickBest((a, b) => getPricePerDay(a) - getPricePerDay(b), p => hasData(p));

    return selected;
  } catch (error) {
    console.error("Sheet error:", error.message);
    return [];
  }
}

// ============================================
// FORMAT SMART 5 PLANS
// ============================================
function formatSmartPlans(plans, operator, language, rechargeLink) {
  if (plans.length === 0) {
    return language === "tamil"
      ? `மன்னிக்கவும். ${operator} திட்டங்கள் இல்லை.`
      : `Sorry. ${operator} plans not available now.`;
  }

  const specialLabel = {
    "Jio": { en: "Jio Special (AI+5G)", ta: "ஜியோ ஸ்பெஷல் (AI+5G)" },
    "Airtel": { en: "Airtel Special (Thanks)", ta: "ஏர்டெல் ஸ்பெஷல் (Thanks)" },
    "Vi": { en: "Vi Special (Weekend Data)", ta: "வி ஸ்பெஷல் (வீக்எண்ட்)" },
    "BSNL": { en: "BSNL Special (Best Value)", ta: "பிஎஸ்என்எல் ஸ்பெஷல்" },
  };
  const sp = specialLabel[operator] || { en: "Best Value", ta: "சிறந்த மதிப்பு" };
  const labels = {
    english: ["Budget Pick", "Daily Data", "More Data", "3 Month Plan", "Long Term", sp.en],
    tamil: ["மலிவான திட்டம்", "தினசரி டேட்டா", "அதிக டேட்டா", "3 மாத திட்டம்", "நீண்ட காலம்", sp.ta]
  };

  const lang = language === "tamil" ? "tamil" : "english";
  let msg = language === "tamil"
    ? `*${operator} சிறந்த திட்டங்கள்:*\n\n`
    : `*Best ${operator} Plans:*\n\n`;

  plans.forEach((plan, i) => {
    const price = plan[1] || "";
    const data = plan[2] || "";
    const validity = plan[3] || "";
    const benefits = plan[4] || "";
    const is5g = plan[5] || "";
    const pricePerDay = plan[6] || "";

    // Format data label
    let dataLabel = data;
    if (language === "tamil") {
      if (data.includes("/day")) {
        dataLabel = data.replace("/day", " ஒரு நாளைக்கு");
      } else if (data.includes("total")) {
        dataLabel = data.replace("total", "மொத்தமும்");
      } else if (data.toLowerCase().includes("unlimited")) {
        dataLabel = "அளவற்ட டேட்டா";
      } else if (!data || data.trim() === "") {
        dataLabel = "அழைப்பு மட்டும்";
      }
    } else {
      if (!data || data.trim() === "") {
        dataLabel = "Calls only";
      }
    }

    // Format validity in Tamil
    let validityLabel = validity;
    if (language === "tamil") {
      validityLabel = validity
        .replace("Days", "நாட்கள்")
        .replace("Day", "நாள்")
        .replace("days", "நாட்கள்")
        .replace("day", "நாள்")
        .replace("Month", "மாதம்")
        .replace("months", "மாதங்கள்")
        .replace("Hour", "மணி நேரம்")
        .replace("hours", "மணி நேரம்");
    }

    const label = labels[lang][i] || "";

    msg += `${i + 1}. *Rs.${price}* — ${dataLabel} | ${validityLabel}\n`;
    if (benefits && benefits !== "No OTT" && benefits !== "") msg += `   OTT: ${benefits}\n`;
    if (is5g === "Yes") msg += `   5G: ${language === "tamil" ? "உண்டு ✓" : "Yes ✓"}\n`;
    if (pricePerDay) msg += `   ${language === "tamil" ? "நாளுக்கு" : "Per day"}: ${pricePerDay}\n`;
    msg += "\n";
  });

  if (language === "tamil") {
    msg += `ரீசார்ஜ் செய்ய: ${rechargeLink}\n\n`;
    msg += `உங்களுக்கு பிடித்த திட்டத்தின் தொகையை தட்டச்சு செய்யுங்கள்.\nஉதாரணம்: 299\n\nஅல்லது உங்களுக்கு என்ன மாதிரி ரீசார்ஜ் வேண்டும் என்று சொன்னால் நான் காண்பிப்பேன்!`;
  } else {
    msg += `Recharge at: ${rechargeLink}\n\n`;
    msg += `Type the amount you want.\nExample: 299\n\nOr tell me what kind of plan you need and I will find it!`;
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
  return links[operator] || "https://www.jio.com/self-care/plans";
}

// ============================================
// CLAUDE AI — HANDLE NATURAL LANGUAGE
// ============================================
async function getClaudeResponse(userMessage, operator, language, plans) {
  const plansText = plans.map((p, i) =>
    `${i + 1}. Rs.${p[1]} — ${p[2]}, ${p[3]}, OTT: ${p[4]}, 5G: ${p[5]}, Per day: ${p[6]}`
  ).join("\n");

  const systemPrompt = `You are ASKQA Recharge — a mobile recharge assistant for India.

STRICT RULE: You ONLY answer questions about mobile recharge plans, data, validity, OTT benefits, operators (Jio, Airtel, Vi, BSNL). 

If user asks ANYTHING else (weather, news, jokes, general questions) — reply ONLY:
${language === "tamil"
  ? "நான் மொபைல் ரீசார்ஜ் மட்டுமே உதவுவேன். ரீசார்ஜ் பற்றி கேளுங்கள்!"
  : "I can only help with mobile recharge. Please ask about recharge plans!"}

Current operator: ${operator}
Current plans shown:
${plansText}

Recharge link: ${getRechargeLink(operator)}

If user types an amount (like 299) — show that specific plan details and recharge link.
If user asks for specific type (cheapest, Netflix, 84 days etc) — filter from the plans above and show matching ones.

Reply in ${language === "tamil" ? "Tamil language" : "English"}.
Keep replies short and clear.
Always include recharge link.
Never discuss anything outside mobile recharge.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return response.content[0].text;
}

// ============================================
// SEND TEXT MESSAGE
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
        to,
        type: "text",
        text: { body: message },
      }),
    }
  );
  const result = await response.json();
  console.log("Send:", JSON.stringify(result));
  return result;
}

// ============================================
// SEND BUTTONS
// ============================================
async function sendButtons(to, bodyText, buttons) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: { buttons }
        }
      }),
    }
  );
  const result = await response.json();
  console.log("Buttons:", JSON.stringify(result));
  return result;
}

// ============================================
// SEND OPERATOR LIST
// ============================================
async function sendOperatorList(to, language) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const bodyText = language === "tamil"
    ? "உங்கள் நெட்வொர்க் தேர்ந்தெடுக்கவும்:"
    : "Select your network:";

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: bodyText },
          action: {
            button: language === "tamil" ? "நெட்வொர்க் தேர்வு" : "Select Network",
            sections: [{
              title: language === "tamil" ? "நெட்வொர்க்" : "Network",
              rows: language === "tamil" ? [
                { id: "op_jio", title: "ஜியோ (Jio)", description: "ரிலையன்ஸ் ஜியோ" },
                { id: "op_airtel", title: "ஏர்டெல் (Airtel)", description: "பாரதி ஏர்டெல்" },
                { id: "op_vi", title: "வி (Vi)", description: "வோடஃபோன் ஐடியா" },
                { id: "op_bsnl", title: "பிஎஸ்என்எல் (BSNL)", description: "பாரத் சஞ்சார் நிகம்" },
              ] : [
                { id: "op_jio", title: "Jio", description: "Reliance Jio" },
                { id: "op_airtel", title: "Airtel", description: "Bharti Airtel" },
                { id: "op_vi", title: "Vi", description: "Vodafone Idea" },
                { id: "op_bsnl", title: "BSNL", description: "Bharat Sanchar Nigam" },
              ]
            }]
          }
        }
      }),
    }
  );
  const result = await response.json();
  console.log("Operator list:", JSON.stringify(result));
  return result;
}

// ============================================
// USER STATE
// ============================================
const userState = {};

// ============================================
// MAIN HANDLER
// ============================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
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
            if (!value.messages || value.messages.length === 0) continue;

            const message = value.messages[0];
            const from = message.from;

            if (!userState[from]) {
              userState[from] = { step: "start", language: "english" };
            }
            const state = userState[from];

            // ── INTERACTIVE REPLY ──
            if (message.type === "interactive") {
              const interType = message.interactive.type;
              let buttonId = "";

              if (interType === "button_reply") {
                buttonId = message.interactive.button_reply.id;
              } else if (interType === "list_reply") {
                buttonId = message.interactive.list_reply.id;
              }

              console.log(`Interactive: ${buttonId} from ${from}`);

              // Language selection
              if (buttonId === "lang_english") {
                state.language = "english";
                state.step = "ask_operator";
                await sendOperatorList(from, "english");

              } else if (buttonId === "lang_tamil") {
                state.language = "tamil";
                state.step = "ask_operator";
                await sendOperatorList(from, "tamil");

              // Operator selection
              } else if (["op_jio", "op_airtel", "op_vi", "op_bsnl"].includes(buttonId)) {
                const opMap = { op_jio: "Jio", op_airtel: "Airtel", op_vi: "Vi", op_bsnl: "BSNL" };
                state.operator = opMap[buttonId];
                state.step = "ask_number";
                const lang = state.language;
                await sendMessage(from, lang === "tamil"
                  ? "உங்கள் 10 இலக்க மொபைல் நம்பரை உள்ளிடவும்:"
                  : "Enter your 10 digit mobile number:");
              }

            // ── TEXT MESSAGE ──
            } else if (message.type === "text") {
              const msgText = message.text.body.trim();
              console.log(`Text from ${from}: ${msgText}`);

              const lower = msgText.toLowerCase();

              // Reset keywords
              if (["hi", "hello", "start", "menu", "restart", "hai", "வணக்கம்"].some(k => lower.includes(k))) {
                userState[from] = { step: "start", language: "english" };
                await sendButtons(from, "Welcome to ASKQA Recharge!\n\nSelect your language:", [
                  { type: "reply", reply: { id: "lang_english", title: "English" } },
                  { type: "reply", reply: { id: "lang_tamil", title: "தமிழ்" } }
                ]);
                continue;
              }

              if (state.step === "start" || state.step === "language_sent") {
                await sendButtons(from, "Welcome to ASKQA Recharge!\n\nSelect your language:", [
                  { type: "reply", reply: { id: "lang_english", title: "English" } },
                  { type: "reply", reply: { id: "lang_tamil", title: "தமிழ்" } }
                ]);
                state.step = "language_sent";

              } else if (state.step === "ask_number") {
                const mobile = msgText.replace(/\D/g, "").slice(-10);
                if (mobile.length === 10) {
                  state.mobile = mobile;
                  state.step = "show_plans";

                  // Get smart 5 plans
                  const plans = await getSmartPlans(state.operator);
                  state.currentPlans = plans;

                  const msg = formatSmartPlans(plans, state.operator, state.language, getRechargeLink(state.operator));
                  await sendMessage(from, msg);

                } else {
                  await sendMessage(from, state.language === "tamil"
                    ? "சரியான 10 இலக்க மொபைல் நம்பரை உள்ளிடவும்."
                    : "Please enter a valid 10 digit mobile number.");
                }

              } else if (state.step === "show_plans") {
                // Check if user typed an amount
                const amountMatch = msgText.match(/^\d+$/);

                if (amountMatch) {
                  // User typed specific amount
                  const amount = parseInt(amountMatch[0]);
                  const link = getRechargeLink(state.operator);

                  if (state.language === "tamil") {
                    await sendMessage(from,
                      `Rs.${amount} ${state.operator} ரீசார்ஜ்!\n\nரீசார்ஜ் செய்ய இந்த லிங்கை க்ளிக் செய்யுங்கள்:\n${link}\n\nவேறு திட்டம் வேண்டுமா? அந்த தொகையை சொல்லுங்கள்.`
                    );
                  } else {
                    await sendMessage(from,
                      `Rs.${amount} ${state.operator} recharge!\n\nClick to recharge:\n${link}\n\nNeed another plan? Just type the amount.`
                    );
                  }

                } else {
                  // Natural language — send to Claude
                  const aiReply = await getClaudeResponse(
                    msgText,
                    state.operator,
                    state.language,
                    state.currentPlans || []
                  );
                  await sendMessage(from, aiReply);
                }

              } else {
                userState[from] = { step: "start", language: "english" };
                await sendButtons(from, "Welcome to ASKQA Recharge!\n\nSelect your language:", [
                  { type: "reply", reply: { id: "lang_english", title: "English" } },
                  { type: "reply", reply: { id: "lang_tamil", title: "தமிழ்" } }
                ]);
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
