// Static branch information — update addresses and map links here
const BRANCHES = [
  {
    number: 1,
    name: process.env.BRANCH1_NAME || 'Branch 1',
    address: process.env.BRANCH1_ADDRESS || '123 Main Street, City Center',
    mapLink: process.env.BRANCH1_MAP_LINK || 'https://maps.google.com/?q=Branch+1',
    phone: process.env.BRANCH1_PHONE || '',
  },
  {
    number: 2,
    name: process.env.BRANCH2_NAME || 'Branch 2',
    address: process.env.BRANCH2_ADDRESS || '456 Park Avenue, Uptown',
    mapLink: process.env.BRANCH2_MAP_LINK || 'https://maps.google.com/?q=Branch+2',
    phone: process.env.BRANCH2_PHONE || '',
  },
];

function getBranchesReply() {
  let reply = '📍 *Our Branches*\n\n';
  for (const b of BRANCHES) {
    reply += `🏪 *${b.name}*\n`;
    reply += `📌 ${b.address}\n`;
    if (b.phone) reply += `📞 ${b.phone}\n`;
    reply += `🗺️ ${b.mapLink}\n\n`;
  }
  reply += 'To book an appointment, type *book*!';
  return reply;
}



module.exports = { getBranchesReply, BRANCHES };
