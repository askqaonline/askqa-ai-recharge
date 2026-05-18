// ASKQA AI Recharge — WhatsApp Webhook
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const SYSTEM_PROMPT = `You are ASKQA AI Recharge — a smart, friendly AI assistant that helps Indian mobile users find the best recharge plan instantly on WhatsApp.

You support English, Tamil, and Hindi. ALWAYS reply in the same language the user writes in.

OPERATOR DETECTION FROM NUMBER PREFIX:
- Jio: starts with 6, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79
- Airtel: starts with 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 98, 99
- Vi: starts with 94, 95, 96
- BSNL: starts with 94, 95

JIO PLANS:
- Rs.155: 1GB/day, 24 days, No OTT
- Rs.209: 1.5GB/day, 28 days, No OTT
- Rs.299: 2GB/day, 28 days, Disney+Hotstar
- Rs.479: 2.5GB/day, 56 days, Disney+Hotstar
- Rs.533: 2GB/day, 84 days, No OTT
- Rs.899: 3GB/day, 84 days, Netflix+Hotstar
- Rs.3999: 2.5GB/day, 365 days, All OTT

AIRTEL PLANS:
- Rs.199: 1GB/day, 28 days, No OTT
- Rs.299: 1.5GB/day, 28 days, Hotstar
- Rs.359: 2GB/day, 28 days, Hotstar+Amazon Prime
- Rs.479: 2GB/day, 56 days, Hotstar
- Rs.599: 2GB/day, 84 days, Hotstar+Amazon Prime
- Rs.899: 2GB/day, 84 days, Netflix+Hotstar+Amazon Prime
- Rs.3999: 2GB/day, 365 days, All OTT

VI PLANS:
- Rs.199: 1GB/day, 28 days, No OTT
- Rs.299: 1.5GB/day, 28 days, Hotstar
- Rs.479: 2GB/day, 56 days, Hotstar
- Rs.799: 2GB/day, 84 days, Hotstar+Amazon Prime
- Rs.3799: 2GB/day, 365 days, Hotstar

BSNL PLANS:
- Rs.107: 1GB/day, 30 days, No OTT
- Rs.197: 2GB/day, 30 days, No OTT
- Rs.399: 3GB/day, 80 days, No OTT
- Rs.2399: 2GB/day, 365 days, No OTT

CONVERSATION FLOW:
Step 1 - Greeting: Ask for mobile number
Step 2 - Detect operator from number prefix, confirm with user
Step 3 - Ask budget (Under Rs.200 / Rs.200-300 / Rs.300-500 / Above Rs.500)
Step 4 - Ask OTT needed and data usage (Light/Medium/Heavy)
Step 5 - Recommend top 3 plans with recharge links
Step 6 - Save preferences, mention expiry reminder

AFFILIATE LINKS:
- Jio: https://www.jio.com/self-care/plans
- Airtel: https://www.airtel.in/recharge-online
- Vi: https://www.myvi.in/recharge
- BSNL: https://bsnl.in/opencms/jsp/selfcare/index.jsp

RULES:
1. Never give wrong plan info
2. Never recommend plan outside budget
3. Always confirm operator first
4. Always include recharge link
5. Reply in same language as user (Tamil/Hindi/English)
6. Keep messages short and friendly`;

const userMemory = {};

async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
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
  const result = await response.json();
  console.log("Send result:", JSON.stringify(result));
  return result;
}

async function getClaudeResponse(userPhone, userMessage) {
  if (!userMemory[userPhone]) {
    userMemory[userPhone] = [];
  }

  userMemory[userPhone].push({ role: "user", content: userMessage });

  if (userMemory[userPhone].length > 10) {
    userMemory[userPhone] = userMemory[userPhone].slice(-10);
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
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
              const msgText = message.type === "text" ? message.text.body : null;

              if (msgText) {
                console.log(`Message from ${from}: ${msgText}`);
                const aiReply = await getClaudeResponse(from, msgText);
                await sendWhatsAppMessage(from, aiReply);
                console.log(`Replied to ${from}`);
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
