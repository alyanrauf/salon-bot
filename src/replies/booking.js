const { getSession, setSession, clearSession } = require('../core/session');
const { getBranchCalendlyLink, BRANCHES } = require('./branches');

const ASK_BRANCH_MESSAGE =
  '📅 *Book an Appointment*\n\n' +
  'Which branch would you like to visit?\n\n' +
  BRANCHES.map((b) => `Reply *${b.number}* for ${b.name}`).join('\n');

function handleBookingStep(userId, messageText, session) {
  if (!session) {
    // Start booking flow
    setSession(userId, { state: 'AWAITING_BRANCH' });
    return ASK_BRANCH_MESSAGE;
  }

  if (session.state === 'AWAITING_BRANCH') {
    const trimmed = messageText.trim();
    const branchNum = parseInt(trimmed, 10);

    if (branchNum === 1 || branchNum === 2) {
      const link = getBranchCalendlyLink(branchNum);
      const branch = BRANCHES.find((b) => b.number === branchNum);
      clearSession(userId);

      if (!link) {
        return (
          `Great choice! To book at *${branch.name}*, please contact us directly.\n\n` +
          'Our team will confirm your appointment shortly.'
        );
      }

      return (
        `Great! Book your appointment at *${branch.name}* here:\n\n` +
        `📅 ${link}\n\n` +
        'After booking, our team will confirm your appointment. See you soon! 💅'
      );
    }

    // Invalid response — re-prompt
    return (
      "Sorry, I didn't catch that. Please reply with:\n\n" +
      BRANCHES.map((b) => `*${b.number}* for ${b.name}`).join('\n')
    );
  }

  // Unexpected state — reset
  clearSession(userId);
  return 'Let\'s start fresh! Type *book* to make an appointment.';
}

module.exports = { handleBookingStep };
