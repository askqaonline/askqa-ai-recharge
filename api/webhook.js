// ASKQA AI Recharge — WhatsApp Webhook
// Reads plans and offers from Google Sheet
const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Get Google Access Token
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
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body).access_token));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Read data from Google Sheet
async function readSheet(token, sheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const result = JSON.parse(body);
        resolve(result.values || []);
      });
    }).on("error", reject);
  });
}

// Get all plans and offers from Google Sheet
async function getSheetData() {
  try {
    const token = await getGoogleToken();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const [plans, offers] = await Promise.all([
      readSheet(token, sheetId, "Plans!A1:G50"),
      readSheet(token, sheetId, "Offers!A1:F20"),
    ]);
    return { plans, offers };
  } catch (error) {
    console.error("Sheet read error:", error.message);
    return { plans: [], offers: [] };
  }
}

// Format sheet data into text for AI
function formatDataForAI(plans, offers) {
  let plansText = "CURRENT PLANS FROM DATABASE:\n";
  if (plans.length > 1) {
    plans.slice(1).forEach((row) => {
      if (row[0]) {
        plansText += `${row[0]} Rs.${row[1]}: ${row[2]}/day, ${row[3]} days, ${row[4]}, Link: ${row[5]}\n`;
      }
    });
  }

  let offersText = "\nCURRENT CASHBACK OFFERS:\n";
  if (offers.length > 1) {
    offers.slice(1).forEach((row) => {
      if (row[0]) {
        offersText += `${row[0]}: ${row[1]}, Min: ${row[2]}, ${row[3]}, Link: ${row[4]}\n`;
      }
    });
  }

  return plansText + offersText;
}

// Build system prompt with live data
function buildSystemPrompt(plansData) {
  return `You are ASKQA AI Recharge — a smart assistant that helps Indian mobile users find the best and cheapest recharge plan on WhatsApp.

EMOJI RULE: Use emojis ONLY when absolutely necessary. Keep replies clean and simple.

OUR MOTTO: Find every rupee the user can save on recharge — even 1 rupee matters. Tell them exactly how.

STEP 1 — LANGUAGE SELECTION (ALWAYS FIRST):
When user sends ANY first message, reply with EXACTLY this:

"Welcome to ASKQA AI Recharge!

Please select your language:
1 - English
2 - தமிழ் (Tamil)
3 - हिंदी (Hindi)

Reply with 1, 2, or 3"

STEP 2 — AFTER LANGUAGE SELECTED:
Ask in their chosen language:

English: "Please enter your mobile number and network name.
Example: 9876543210 Jio"

Tamil: "உங்கள் மொபைல் நம்பர் மற்றும் நெட்வொர்க் பெயரை உள்ளிடவும்.
உதாரணம்: 9876543210 Jio"

Hindi: "कृपया अपना मोबाइल नंबर और नेटवर्क नाम दर्ज करें।
उदाहरण: 9876543210 Jio"

STEP 3 — SHOW BEST PLANS + CHEAPEST WAY TO PAY:
When user gives number and network — show top 3 plans AND the cheapest payment method.

Format:
"Best [Network] plans:

1. Rs.[price] — [X]GB/day, [X] days, [OTT]
2. Rs.[price] — [X]GB/day, [X] days, [OTT]
3. Rs.[price] — [X]GB/day, [X] days, [OTT]

Cheapest way to pay today:
[Platform] — save Rs.[amount] cashback
Final price: Rs.[price after cashback]

Recharge link: [link]"

${plansData}

RULES:
1. ALWAYS start with language selection
2. Only 2 steps before showing plans
3. ALWAYS show cheapest payment method with cashback
4. No unnecessary emojis
5. Stay in chosen language entire conversation
6. If user asks for specific budget — filter plans by budget
7. Always show recharge link`;
}

// Send language selection buttons
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
          body: { text: "Welcome to ASKQA AI Recharge!\n\nSelect your language:" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "lang_english", title: "English" } },
              { type: "reply", reply: { id: "lang_tamil", title: "தமிழ்" } },
              { type: "reply", reply: { id: "lang_hindi", title: "हिंदी" } }
            ]
          }
        }
      }),
    }
  );
  const result = await response.json();
  console.log("Button result:", JSON.stringify(result));
  return result;
}

// Send text message
async function sendWhatsAppMessage(to, message) {
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

const userMemory = {};
const newUsers = {};

// Get Claude response with live sheet data
async function getClaudeResponse(userPhone, userMessage) {
  if (!userMemory[userPhone]) {
    userMemory[userPhone] = [];
  }

  // Get fresh data from Google Sheet
  const { plans, offers } = await getSheetData();
  const liveData = formatDataForAI(plans, offers);
  const systemPrompt = buildSystemPrompt(liveData);

  userMemory[userPhone].push({ role: "user", content: userMessage });

  if (userMemory[userPhone].length > 10) {
    userMemory[userPhone] = userMemory[userPhone].slice(-10);
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: systemPrompt,
    messages: userMemory[userPhone],
  });

  const aiReply = response.content[0].text;
  userMemory[userPhone].push({ role: "assistant", content: aiReply });
  return aiReply;
}

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

            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const from = message.from;

              // Handle button reply
              if (message.type === "interactive" && message.interactive.type === "button_reply") {
                const buttonTitle = message.interactive.button_reply.title;
                newUsers[from] = "selected";
                const aiReply = await getClaudeResponse(from, `I selected language: ${buttonTitle}`);
                await sendWhatsAppMessage(from, aiReply);

              } else if (message.type === "text") {
                const msgText = message.text.body;
                console.log(`Message from ${from}: ${msgText}`);

                // New user — send language buttons
                if (!newUsers[from] && !userMemory[from]) {
                  await sendLanguageButtons(from);
                  newUsers[from] = "pending";
                } else {
                  const aiReply = await getClaudeResponse(from, msgText);
                  await sendWhatsAppMessage(from, aiReply);
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
