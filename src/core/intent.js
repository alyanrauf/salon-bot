const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a classifier for a beauty salon chatbot.
Classify the user's message as one of: PRICE, DEALS, BOOKING, BRANCH, UNKNOWN.

- PRICE: asking about service prices, costs, how much something costs
- DEALS: asking about offers, promotions, discounts, packages, specials
- BOOKING: wants to book, schedule, make an appointment, reserve a slot
- BRANCH: asking about location, address, directions, where the salon is
- UNKNOWN: anything else

Reply with ONLY the single category word, nothing else.`;

async function detectIntent(message) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    });

    const intent = response.content[0].text.trim().toUpperCase();
    const validIntents = ['PRICE', 'DEALS', 'BOOKING', 'BRANCH', 'UNKNOWN'];
    return validIntents.includes(intent) ? intent : 'UNKNOWN';
  } catch (err) {
    console.error('[intent] Claude API error:', err.message);
    return 'UNKNOWN';
  }
}

module.exports = { detectIntent };
