// ASKQA AI Recharge — WhatsApp Webhook
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const SYSTEM_PROMPT = `You are ASKQA AI Recharge — a smart assistant that helps Indian mobile users find the best recharge plan on WhatsApp.

EMOJI RULE: Use emojis ONLY when absolutely necessary. Keep replies clean and simple.

STEP 2 — AFTER LANGUAGE SELECTED:
Once user selects a language button, ask EXACTLY this in their chosen language:

If English:
"Please enter your mobile number and network name.
Example: 9876543210 Jio"

If Tamil:
"உங்கள் மொபைல் நம்பர் மற்றும் நெட்வொர்க் பெயரை உள்ளிடவும்.
உதாரணம்: 9876543210 Jio"

If Hindi:
"कृपया अपना मोबाइल नंबर और नेटवर्क नाम दर्ज करें।
उदाहरण: 9876543210 Jio"

STEP 3 — FIND BEST PLANS:
User sends number and network (example: 9876543210 Jio)
Immediately show best 3 plans for that network.
No more questions. Just show plans with recharge links.

Format for plans:
"Best plans for [Network]:

1. Rs.[price] — [X]GB/day, [X] days, [OTT or No OTT]
   Recharge: [link]

2. Rs.[price] — [X]GB/day, [X] days, [OTT or No OTT]
   Recharge: [link]

3. Rs.[price] — [X]GB/day, [X] days, [OTT or No OTT]
   Recharge: [link]

Best value: Plan 1"

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

AFFILIATE LINKS:
- Jio: https://www.jio.com/self-care/plans
- Airtel: https://www.airtel.in/recharge-online
- Vi: https://www.myvi.in/recharge
- BSNL: https://bsnl.in/opencms/jsp/selfcare/index.jsp

RULES:
1. Only 2 steps before showing plans
2. No extra questions
3. No unnecessary emojis
4. Keep messages short and clean
5. Always show recharge link with every plan
6. Stay in chosen language for entire conversation`;

const userMemory = {};

// Send language selection buttons
async function sendLanguageButtons(to) {
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
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: "Welcome to ASKQA AI Recharge!\n\nSelect your language:"
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "lang_english",
                  title: "English"
                }
              },
              {
                type: "reply",
                reply: {
                  id: "lang_tamil",
                  title: "தமிழ்"
                }
              },
              {
                type: "reply",
                reply: {
                  id: "lang_hindi",
                  title: "हिंदी"
                }
              }
            ]
          }
        }
      }),
    }
  );
  const result = await response.json();
  console.log("Button send result:", JSON.stringify(result));
  return result;
}

// Send regular text message
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

// Track new users
const newUsers = {};

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

            // Handle regular text messages
            if (value.messages && value.messages.length > 0) {
              const message = value.messages[0];
              const from = message.from;

              // Handle button reply (language selection)
              if (message.type === "interactive" && message.interactive.type === "button_reply") {
                const buttonId = message.interactive.button_reply.id;
                const buttonTitle = message.interactive.button_reply.title;

                console.log(`Button selected by ${from}: ${buttonId}`);

                // Mark language as selected
                newUsers[from] = buttonId;

                // Add to memory
                if (!userMemory[from]) userMemory[from] = [];
                userMemory[from].push({ role: "user", content: `I selected language: ${buttonTitle}` });

                // Get Claude response
                const aiReply = await getClaudeResponse(from, `I selected language: ${buttonTitle}`);
                await sendWhatsAppMessage(from, aiReply);

              } else if (message.type === "text") {
                const msgText = message.text.body;
                console.log(`Message from ${from}: ${msgText}`);

                // New user — send language buttons first
                if (!newUsers[from] && !userMemory[from]) {
                  await sendLanguageButtons(from);
                  newUsers[from] = "pending";
                } else {
                  // Existing user — get AI response
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
