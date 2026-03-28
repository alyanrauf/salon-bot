const { getDb } = require('../db/database');

function getBranches() {
  try {
    return getDb().prepare('SELECT * FROM branches ORDER BY number ASC').all();
  } catch {
    return [];
  }
}

function getBranchesReply() {
  const branches = getBranches();
  let reply = '📍 *Our Branches*\n\n';
  for (const b of branches) {
    reply += `🏪 *${b.name}*\n`;
    reply += `📌 ${b.address}\n`;
    if (b.phone) reply += `📞 ${b.phone}\n`;
    reply += `🗺️ ${b.map_link}\n\n`;
  }
  reply += 'To book an appointment, type *book*!';
  return reply;
}

module.exports = { getBranchesReply, getBranches };
