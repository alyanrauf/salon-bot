const { routeMessage } = require('../core/router');
const { send } = require('../utils/metaSender');
const logger = require('../utils/logger');

async function handleInstagram(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body.object || body.object !== 'instagram') return;

    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging?.message?.text) return;
    if (messaging.message.is_echo) return; // Ignore bot's own messages

    const userId = messaging.sender.id;
    const text = messaging.message.text;

    logger.info(`[Instagram] From: ${userId} | Message: ${text}`);

    const reply = await routeMessage(userId, text, 'instagram');
    await send('instagram', userId, reply);
  } catch (err) {
    logger.error('[Instagram] Handler error:', err.message);
  }
}

function verifyInstagram(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('[Instagram] Webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.error('[Instagram] Webhook verification failed');
    res.sendStatus(403);
  }
}

module.exports = { handleInstagram, verifyInstagram };
