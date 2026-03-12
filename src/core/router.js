const { detectIntent } = require('./intent');
const { getSession, setSession, clearSession } = require('./session');
const { getPricesReply } = require('../replies/prices');
const { getDealsReply } = require('../replies/deals');
const { getBranchesReply } = require('../replies/branches');
const { handleBookingStep } = require('../replies/booking');

const FALLBACK_MESSAGE =
  "Hi! I'm here to help. You can ask me about:\n\n" +
  '💰 *Prices* — type "prices" or "how much"\n' +
  '🎁 *Deals* — type "offers" or "deals"\n' +
  '📍 *Location* — type "where" or "branches"\n' +
  '📅 *Booking* — type "book" or "appointment"\n\n' +
  'Our team is always happy to help!';

async function routeMessage(userId, messageText, platform) {
  // Check if user is in a booking flow
  const session = getSession(userId);
  if (session && session.state === 'AWAITING_BRANCH') {
    return handleBookingStep(userId, messageText, session);
  }

  const intent = await detectIntent(messageText);

  switch (intent) {
    case 'PRICE':
      return getPricesReply();

    case 'DEALS':
      return getDealsReply();

    case 'BRANCH':
      return getBranchesReply();

    case 'BOOKING':
      return handleBookingStep(userId, messageText, null);

    case 'UNKNOWN':
    default:
      return FALLBACK_MESSAGE;
  }
}

module.exports = { routeMessage };
