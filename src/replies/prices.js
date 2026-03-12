const { getDb } = require('../db/database');

function getPricesReply() {
  try {
    const db = getDb();
    const services = db.prepare('SELECT name, price, branch FROM services ORDER BY branch, name').all();

    if (!services.length) {
      return "We're updating our price list. Please contact us directly for current prices!";
    }

    // Group by branch
    const branches = {};
    for (const s of services) {
      const key = s.branch || 'All Branches';
      if (!branches[key]) branches[key] = [];
      branches[key].push(s);
    }

    let reply = '💅 *Our Services & Prices*\n\n';
    for (const [branch, items] of Object.entries(branches)) {
      reply += `📍 *${branch}*\n`;
      for (const item of items) {
        reply += `  • ${item.name} — ${item.price}\n`;
      }
      reply += '\n';
    }
    reply += 'To book an appointment, just type *book*!';
    return reply;
  } catch (err) {
    console.error('[prices] DB error:', err.message);
    return 'Sorry, I could not load prices right now. Please try again shortly.';
  }
}

module.exports = { getPricesReply };
