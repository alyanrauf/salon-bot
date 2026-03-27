const { routeMessage } = require('../core/router');
const { send } = require('../utils/metaSender');
const logger = require('../utils/logger');

async function handleFacebook(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body.object || body.object !== 'page') return;

    const entry = body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging?.message?.text) return;
    if (messaging.message.is_echo) return;

    const userId = messaging.sender.id;
    const text = messaging.message.text;

    logger.info(`[Facebook] From: ${userId} | Message: ${text}`);

    const reply = await routeMessage(userId, text, 'facebook');
    await send('facebook', userId, reply);
  } catch (err) {
    logger.error('[Facebook] Handler error:', err.message);
  }
}

function verifyFacebook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('[Facebook] Webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.error('[Facebook] Webhook verification failed');
    res.sendStatus(403);
  }
}

module.exports = { handleFacebook, verifyFacebook };
