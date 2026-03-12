const axios = require('axios');
const logger = require('./logger');

const GRAPH_API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Unified send function for all three platforms.
 * @param {'whatsapp'|'instagram'|'facebook'} platform
 * @param {string} recipientId
 * @param {string} text
 * @param {object} [opts] - Extra options (e.g., phoneNumberId for WhatsApp)
 */
async function send(platform, recipientId, text, opts = {}) {
  try {
    switch (platform) {
      case 'whatsapp':
        await sendWhatsApp(recipientId, text, opts.phoneNumberId);
        break;
      case 'instagram':
        await sendInstagramOrFacebook(recipientId, text, process.env.IG_PAGE_ACCESS_TOKEN);
        break;
      case 'facebook':
        await sendInstagramOrFacebook(recipientId, text, process.env.FB_PAGE_ACCESS_TOKEN);
        break;
      default:
        logger.error(`[metaSender] Unknown platform: ${platform}`);
    }
  } catch (err) {
    logger.error(`[metaSender] Send failed on ${platform}:`, err.response?.data || err.message);
  }
}

async function sendWhatsApp(to, text, phoneNumberId) {
  const url = `${BASE_URL}/${phoneNumberId}/messages`;
  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
  logger.info(`[WhatsApp] Sent to ${to}`);
}

async function sendInstagramOrFacebook(recipientId, text, accessToken) {
  const url = `${BASE_URL}/me/messages`;
  await axios.post(
    url,
    {
      recipient: { id: recipientId },
      message: { text },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  logger.info(`[metaSender] Sent to ${recipientId}`);
}

module.exports = { send };
