const { detectIntent } = require('./intent');
const { getSession, setSession, clearSession } = require('./session');
const { getPricesReply, getServiceDetail, getServiceListReply } = require('../replies/prices');
const { getDealsReply } = require('../replies/deals');
const { getBranchesReply } = require('../replies/branches');
const { handleBookingStep } = require('../replies/booking');

const FALLBACK_MESSAGE =
  "Hi! I'm here to help. You can ask me about:\n\n" +
  '💰 *Prices* — type "prices" or "how much"\n' +
  '✨ *Service Details* — type "tell me about" or "what is"\n' +
  '🎁 *Deals* — type "offers" or "deals"\n' +
  '📍 *Location* — type "where" or "branches"\n' +
  '📅 *Booking* — type "book" or "appointment"\n\n' +
  'Our team is always happy to help!';

async function routeMessage(userId, messageText, platform) {
  const session = getSession(userId);

  // Step 1 — always detect intent first
  const result = await detectIntent(messageText);
  const intent = typeof result === 'object' ? result.intent : result;
  const term = typeof result === 'object' ? result.term : null;

  // Step 2 — handle cancellation at ANY time
  if (intent === 'CANCEL') {
    clearSession(userId);
    return "✅ Your booking process has been cancelled. If you need anything else, I'm here to help!";
  }

  // Step 3 — If user is inside booking flow & not canceling → continue booking flow
  if (session && session.state && session.state.startsWith('ASK_')) {
    return handleBookingStep(userId, messageText, session, platform);
  }

  // Step 4 — Normal intent routing
  switch (intent) {
    case 'PRICE':
      return getPricesReply();

    case 'SERVICE_LIST':
      return getServiceListReply();

    case 'SERVICE_DETAIL':
      return getServiceDetail(term);

    case 'DEALS':
      return getDealsReply();

    case 'BRANCH':
      return getBranchesReply();

    case 'BOOKING':
      return handleBookingStep(userId, messageText, null, platform);

    default:
      return FALLBACK_MESSAGE;
  }
}


module.exports = { routeMessage };