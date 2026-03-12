require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { getDb } = require('./database');

const db = getDb();

// Clear existing data
db.exec('DELETE FROM deals; DELETE FROM services;');

// Seed deals
const insertDeal = db.prepare(
  'INSERT INTO deals (title, description, active) VALUES (?, ?, ?)'
);
const deals = [
  ['Weekend Special', 'Get 20% off all hair services every Saturday and Sunday!', 1],
  ['Student Discount', 'Show your student ID and enjoy 15% off any service.', 1],
  ['Loyalty Package', 'Book 5 sessions and get the 6th one FREE!', 1],
  ['New Client Offer', 'First visit? Enjoy a complimentary hair treatment with any service.', 0],
];
for (const d of deals) insertDeal.run(...d);

// Seed services
const insertService = db.prepare(
  'INSERT INTO services (name, price, branch) VALUES (?, ?, ?)'
);
const services = [
  // All Branches
  ['Haircut & Blowdry', 'AED 80', 'All Branches'],
  ['Hair Color (Full)', 'AED 250', 'All Branches'],
  ['Highlights', 'AED 350', 'All Branches'],
  ['Keratin Treatment', 'AED 400', 'All Branches'],
  ['Manicure', 'AED 60', 'All Branches'],
  ['Pedicure', 'AED 80', 'All Branches'],
  ['Gel Nails', 'AED 120', 'All Branches'],
  ['Eyebrow Threading', 'AED 20', 'All Branches'],
  // Branch 1 specific
  ['Bridal Package', 'AED 1,500', 'Branch 1'],
  ['Hair Extensions', 'AED 800', 'Branch 1'],
  // Branch 2 specific
  ['Hydra Facial', 'AED 350', 'Branch 2'],
  ['Lash Extensions', 'AED 300', 'Branch 2'],
];
for (const s of services) insertService.run(...s);

console.log('✅ Database seeded successfully!');
console.log(`   Deals: ${deals.length} inserted`);
console.log(`   Services: ${services.length} inserted`);
