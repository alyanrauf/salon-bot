const { routeMessage } = require('../core/router');
const { send } = require('../utils/metaSender');
const logger = require('../utils/logger');

async function handleWhatsApp(req, res) {
  // Acknowledge immediately — Meta requires 200 within 5 seconds
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body.object || body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Ignore status updates (delivered, read, etc.)
    if (!value?.messages) return;

    const message = value.messages[0];
    if (message.type !== 'text') return; // Only handle text for now

    const userId = message.from; // WhatsApp number
    const text = message.text.body;
    const phoneNumberId = value.metadata.phone_number_id;

    logger.info(`[WhatsApp] From: ${userId} | Message: ${text}`);

    const reply = await routeMessage(userId, text, 'whatsapp');
    await send('whatsapp', userId, reply, { phoneNumberId });
  } catch (err) {
    logger.error('[WhatsApp] Handler error:', err.message);
  }
}

function verifyWhatsApp(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('[WhatsApp] Webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.error('[WhatsApp] Webhook verification failed');
    res.sendStatus(403);
  }
}

module.exports = { handleWhatsApp, verifyWhatsApp };
