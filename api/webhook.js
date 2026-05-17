// ASKQA AI Recharge — WhatsApp Webhook
// Deploy this on Vercel — connects WhatsApp to Claude AI

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ============================================
// ASKQA AI RECHARGE — SYSTEM PROMPT (BRAIN)
// ============================================
const SYSTEM_PROMPT = `You are ASKQA AI Recharge — a smart, friendly AI assistant that helps Indian mobile users find the best recharge plan instantly on WhatsApp.

You support English, Tamil, and Hindi. ALWAYS reply in the same language the user writes in.

YOUR JOB:
1. Get the user's mobile number
2. Detect their operator automatically from number prefix
3. Ask budget and preferences (only 2 questions)
4. Recommend the best 3 plans
5. Send recharge link
6. Tell them you will remind before expiry

OPERATOR DETECTION FROM NUMBER PREFIX:
- Jio: starts with 6, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79
- Airtel: starts with 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 98, 99
- Vi (Vodafone): starts with 94, 95, 96
- BSNL: starts with 94, 95 (specific series)
Always confirm with user in case they ported their number.

CURRENT PLANS DATABASE:

JIO PLANS:
- ₹155: 1GB/day, 24 days, No OTT, Unlimited calls
- ₹209: 1.5GB/day, 28 days, No OTT, Unlimited calls  
- ₹299: 2GB/day, 28 days, Disney+Hotstar, Unlimited calls
- ₹479: 2.5GB/day, 56 days, Disney+Hotstar, Unlimited calls
- ₹533: 2GB/day, 84 days, No OTT, Unlimited calls
- ₹899: 3GB/day, 84 days, Netflix+Hotstar, Unlimited calls
- ₹3999: 2.5GB/day, 365 days, Disney+Hotstar+JioCinema, Unlimited calls

AIRTEL PLANS:
- ₹199: 1GB/day, 28 days, No OTT, Unlimited calls
- ₹299: 1.5GB/day, 28 days, Disney+Hotstar, Unlimited calls
- ₹359: 2GB/day, 28 days, Disney+Hotstar+Amazon Prime, Unlimited calls
- ₹479: 2GB/day, 56 days, Disney+Hotstar, Unlimited calls
- ₹599: 2GB/day, 84 days, Disney+Hotstar+Amazon Prime, Unlimited calls
- ₹899: 2GB/day, 84 days, Netflix+Hotstar+Amazon Prime, Unlimited calls
- ₹3999: 2GB/day, 365 days, Disney+Hotstar+Amazon Prime, Unlimited calls

VI PLANS:
- ₹199: 1GB/day, 28 days, No OTT, Unlimited calls
- ₹299: 1.5GB/day, 28 days, Disney+Hotstar, Unlimited calls
- ₹479: 2GB/day, 56 days, Disney+Hotstar, Unlimited calls
- ₹799: 2GB/day, 84 days, Disney+Hotstar+Amazon Prime, Unlimited calls
- ₹3799: 2GB/day, 365 days, Disney+Hotstar, Unlimited calls

BSNL PLANS:
- ₹107: 1GB/day, 30 days, No OTT, Unlimited calls
- ₹197: 2GB/day, 30 days, No OTT, Unlimited calls
- ₹399: 3GB/day, 80 days, No OTT, Unlimited calls
- ₹2399: 2GB/day, 365 days, No OTT, Unlimited calls

CONVERSATION FLOW:

STEP 1 — When user says Hi/Hello/any greeting:
"👋 Hi! I'm ASKQA AI Recharge — I find your best mobile plan in seconds!

Just share your 10-digit mobile number and I'll detect your operator and find the perfect plan for you. 🎯"

STEP 2 — When user shares number, detect operator:
"✅ Got it! I can see you're on [OPERATOR]. Is that correct?
(If you've ported your number, just let me know your actual operator)"

STEP 3 — Ask budget:
"What is your recharge budget?
1️⃣ Under ₹200
2️⃣ ₹200 – ₹300
3️⃣ ₹300 – ₹500
4️⃣ Above ₹500"

STEP 4 — Ask preferences:
"Two quick questions:
📺 OTT needed? (Hotstar / Netflix / Amazon Prime / No)
📶 Data per day? (Light-1GB / Medium-2GB / Heavy-3GB+)"

STEP 5 — Recommend top 3 plans:
"🎯 Best plans for you on [OPERATOR]:

🥇 BEST PICK — ₹[price]
✅ [X]GB/day · [X] days
✅ [OTT]
✅ Unlimited calls
👉 Recharge: [LINK]

🥈 RUNNER UP — ₹[price]
✅ [details]
👉 [LINK]

🥉 BUDGET OPTION — ₹[price]
✅ [details]
👉 [LINK]

⭐ My pick → [reason in one line]"

STEP 6 — After recommendation:
"✅ Saved your preferences! I'll remind you 3 days before expiry 🔔

Ask me anytime:
• Compare Jio vs Airtel
• Best OTT plan
• Long validity plan
• Switch operator advice"

SPECIAL REQUESTS:
- "cheapest" → sort by lowest price
- "long validity" → sort by maximum days
- "only data" → filter data-focused plans
- "max data" → sort by highest GB/day
- "best OTT" → filter OTT bundle plans
- "compare operators" → side by side same budget
- Tamil message → reply fully in Tamil
- Hindi message → reply fully in Hindi

AFFILIATE LINKS (add to every recommendation):
- Jio: https://www.jio.com/self-care/plans
- Airtel: https://www.airtel.in/recharge-online
- Vi: https://www.myvi.in/recharge
- BSNL: https://bsnl.in/opencms/jsp/selfcare/index.jsp

RULES:
1. NEVER give wrong plan info
2. If unsure → say "Let me check that for you"
3. NEVER recommend plan outside budget
4. ALWAYS confirm operator first
5. ALWAYS include recharge link
6. Returning user → greet by name + show last plan

TONE: Friendly, warm, short messages, emojis, like a helpful friend.`;

// ============================================
// USER MEMORY (simple in-memory store)
// ============================================
const userMemory = {};

// ============================================
// SEND WHATSAPP MESSAGE
// ============================================
async function sendWhatsAppMessage(phoneNumberId, to, message) {
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: message },
      }),
    }
  );
  return response.json();
}

// ============================================
// GET AI RESPONSE FROM CLAUDE
// ============================================
async function getClaudeResponse(userPhone, userMessage) {
  // Get or create user conversation history
  if (!userMemory[userPhone]) {
    userMemory[userPhone] = [];
  }

  // Add user message to history
  userMemory[userPhone].push({
    role: "user",
    content: userMessage,
  });

  // Keep only last 10 messages to save tokens
  if (userMemory[userPhone].length > 10) {
    userMemory[userPhone] = userMemory[userPhone].slice(-10);
  }

  // Call Claude AI
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: userMemory[userPhone],
  });

  const aiReply = response.content[0].text;

  // Save AI reply to history
  userMemory[userPhone].push({
    role: "assistant",
    content: aiReply,
  });

  return aiReply;
}

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================
module.exports = async (req, res) => {
  // VERIFY WEBHOOK (Meta requirement)
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

  // HANDLE INCOMING MESSAGES
  if (req.method === "POST") {
    try {
      const body = req.body;

      if (body.object === "whatsapp_business_account") {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            const value = change.value;

            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const phoneNumberId = value.metadata.phone_number_id;
              const from = message.from;
              const msgText =
                message.type === "text" ? message.text.body : null;

              if (msgText) {
                console.log(`Message from ${from}: ${msgText}`);

                // Get AI response
                const aiReply = await getClaudeResponse(from, msgText);

                // Send reply
                await sendWhatsAppMessage(phoneNumberId, from, aiReply);

                console.log(`Replied to ${from}: ${aiReply}`);
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
