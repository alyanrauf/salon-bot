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
  // Check if user is mid-booking flow
  const session = getSession(userId);
  if (session && session.state && session.state.startsWith('ASK_')) {
    return handleBookingStep(userId, messageText, session, platform);
  }

  const result = await detectIntent(messageText);

  // result is either a plain string or { intent, term }
  const intent = typeof result === 'object' ? result.intent : result;
  const term = typeof result === 'object' ? result.term : null;

  switch (intent) {
    case 'PRICE': return getPricesReply();
    case 'SERVICE_LIST': return getServiceListReply();
    case 'SERVICE_DETAIL': return getServiceDetail(term);
    case 'DEALS': return getDealsReply();
    case 'BRANCH': return getBranchesReply();
    case 'BOOKING': return handleBookingStep(userId, messageText, null, platform);
    default: return FALLBACK_MESSAGE;
  }
}

module.exports = { routeMessage };