require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { getDb } = require('./database');

const db = getDb();

// Clear existing services and deals (keeps bookings intact)
db.exec('DELETE FROM deals; DELETE FROM services;');

const insertDeal = db.prepare(
  'INSERT INTO deals (title, description, active) VALUES (?, ?, ?)'
);

// Seed deals
const deals = [
  ['Weekend Special', 'Get 20% off all hair services every Saturday and Sunday!', 1],
  ['Student Discount', 'Show your student ID and enjoy 15% off any service.', 1],
  ['Loyalty Package', 'Book 5 sessions and get the 6th one FREE!', 1],
  ['New Client Offer', 'First visit? Enjoy a complimentary hair treatment with any service.', 0],
];
for (const d of deals) insertDeal.run(d.title, d.description, d.active);

const insertService = db.prepare(
  'INSERT INTO services (name, price, description, branch) VALUES (?, ?, ?, ?)'
);

const services = [

  // ── Hydrafacial ──────────────────────────────────────────────────────────
  {
    name: 'Hydrafacial – Deal 1',
    price: 'Rs. 3,199',
    desc: 'Whitening Glow Polisher · Hydra Machine (8 Tools) · Face Massage · Shoulder Massage · Vitamin C Mask with LED · Whitening Manicure · Whitening Pedicure · Hands & Feet Massage · Hands & Feet Polisher · Nail Cuticles · Eyebrows & Upper Lips',
    branch: 'All Branches',
  },

  // ── Body Waxing ──────────────────────────────────────────────────────────
  {
    name: 'Full Body Waxing – Deal 2',
    price: 'Rs. 2,499',
    desc: 'Full Body Waxing · Bikini & Underarms Waxing · Half Arms Polisher · Feet Polisher',
    branch: 'All Branches',
  },

  // ── Facials ──────────────────────────────────────────────────────────────
  {
    name: '24K Gold Facial – Deal 1',
    price: 'Rs. 2,199',
    desc: 'Whitening Glow Skin Polisher · Gold 4 Creams Massage · Neck & Shoulder Relaxing Massage · Whitening Manicure · Whitening Pedicure · Hands & Feet Polisher · Nail Cuticles · Hands & Feet Massage · Hair Protein Application · Eyebrows & Upper Lips',
    branch: 'All Branches',
  },
  {
    name: 'Janssen Facial Deal',
    price: 'Rs. 3,999',
    desc: 'Janssen 4 Creams Massage · Whitening Skin Glow Polisher · Blackheads Removal · Shoulder Massage · Janssen Peel-Off Mask · Eyebrows & Upper Lips · Skin Truth Manicure · Skin Truth Pedicure · Hands & Feet Massage · Hands & Feet Polisher · Nail Cuticles · Feet Mask',
    branch: 'All Branches',
  },
  {
    name: 'Fruit Facial – Deal 1',
    price: 'Rs. 999',
    desc: 'Fruit Facial · Double Whitening Skin Glow Polisher · 4 Fruit Creams Massage · Shoulder Relaxing Massage · Fruit Face Mask · Blackhead Removal · Hand & Feet Whitening Polisher · Eyebrows & Upper Lips · L\'Oréal Hair Protein Treatment Application',
    branch: 'All Branches',
  },
  {
    name: 'Derma Clear Facial – Deal 1',
    price: 'Rs. 2,199',
    desc: 'Derma Clear Facial · Whitening Skin Polisher · Derma Clear 4 Creams Massage · Face Mask · L\'Oréal Hair Protein Treatment · Eyebrows & Upper Lips · Manicure · Pedicure · Hand & Feet Polisher · Nail Cuticles · Shoulders Relaxing Massage',
    branch: 'All Branches',
  },

  // ── Manicure & Pedicure ──────────────────────────────────────────────────
  {
    name: 'Whitening Manicure & Pedicure – Deal 1',
    price: 'Rs. 999',
    desc: 'Whitening Manicure · Whitening Pedicure · Whitening Hands & Feet Polisher · Hands & Feet Massage · Nail Cuticles',
    branch: 'All Branches',
  },
  {
    name: 'Gold Manicure & Pedicure – Deal 2',
    price: 'Rs. 1,999',
    desc: 'Gold 3 Creams Massage · Whitening Hands & Feet Polisher · Gold 3 Creams Hand Massage · Gold 3 Creams Feet Massage · Gold Hand & Feet Mask · Nail Cuticles',
    branch: 'All Branches',
  },

  // ── Acrylic Nails ────────────────────────────────────────────────────────
  {
    name: 'Acrylic Nails – Deal 1',
    price: 'Rs. 2,999',
    desc: 'Hand Massage · Hand Scrub · Hand Polisher · Simple Nail Paint',
    branch: 'All Branches',
  },
  {
    name: 'Acrylic French Nails – Deal 2',
    price: 'Rs. 3,499',
    desc: 'Hand Polisher · Hand Massage · Hand Scrub',
    branch: 'All Branches',
  },

  // ── Eyelash Extensions ───────────────────────────────────────────────────
  {
    name: 'Eyelash Extensions – Classic',
    price: 'Rs. 2,499',
    desc: 'Classic Lash Set · Face 2 Cream Gold Massage · Gold Face Mask (Free)',
    branch: 'All Branches',
  },
  {
    name: 'Eyelash Extensions – Hybrid',
    price: 'Rs. 2,999',
    desc: 'Hybrid Lash Set · Face 2 Cream Gold Massage · Gold Face Mask (Free)',
    branch: 'All Branches',
  },
  {
    name: 'Eyelash Extensions – Volume',
    price: 'Rs. 3,499',
    desc: 'Volume Lash Set · Face 2 Cream Gold Massage · Gold Face Mask (Free)',
    branch: 'All Branches',
  },

  // ── Hair Cutting ─────────────────────────────────────────────────────────
  {
    name: 'Hair Cutting – Deal 1',
    price: 'Rs. 1,999',
    desc: 'Hair Cutting · Hair Shampoo Wash · Hair Protein Treatment · Hair Relaxing Massage · Hair High Frequency · Hair Setting',
    branch: 'All Branches',
  },
  {
    name: 'Hair Cutting – Deal 2',
    price: 'Rs. 999',
    desc: 'Hair Wash · Hair Cutting · Hair Dry Only',
    branch: 'All Branches',
  },

  // ── Hair Smoothing & Color ───────────────────────────────────────────────
  {
    name: 'Keratin / L\'Oréal Xtenso / Rebonding',
    price: 'From Rs. 5,999',
    desc: 'Free: Hair Cutting · Hair Glossing · 1× Hair Wash & Mask | Shoulder Rs.5,999 · Elbow Rs.7,999 · Waist Rs.9,999 · Hip Rs.11,999',
    branch: 'All Branches',
  },
  {
    name: 'Highlights / Lowlights / Balayage',
    price: 'From Rs. 5,999',
    desc: 'Free: Hair Cutting · Hair Wash · Hair Glossing · Hair Setting · Hair Protein Mask Wash | Shoulder Rs.5,999 · Elbow Rs.6,999 · Waist Rs.8,999 · Hip Rs.10,999',
    branch: 'All Branches',
  },

  // ── Makeup ───────────────────────────────────────────────────────────────
  {
    name: 'Party Makeup Deal',
    price: 'Rs. 2,999',
    desc: 'Party Makeup · Hair Styling · 6D Eyelashes · Nail Paint',
    branch: 'All Branches',
  },
  {
    name: 'Bridal Makeup Deal',
    price: 'Rs. 19,900',
    desc: 'Bridal First Day OR Walima Makeup · Bridal 6D Eyelashes · Bridal Hair Styling · Dupatta Settings · Nail Paint · 2 Party Makeups Free (with Eyelashes & Hair Styling)',
    branch: 'All Branches',
  },
  {
    name: 'Nikkah Makeup Deal (with Janssen Whitening Facial)',
    price: 'Rs. 18,000',
    desc: 'Nikkah Makeup · Janssen Whitening Facial · Whitening Manicure · Whitening Pedicure · Threading · Hair Botox Treatment',
    branch: 'All Branches',
  },

  // ── Bridal Packages ──────────────────────────────────────────────────────
  {
    name: 'Bridal Makeup Package 1',
    price: 'Rs. 34,995',
    desc: 'Signature Bridal Makeup · 2 Facials (Janssen + Hydra) · 2× Mani & Pedi (Skin Truth + Whitening) · Full Body Waxing · Full Body Scrubbing · Full Body Polisher · Eyebrows & Upper Lips · Hair Cutting · Hair Protein Treatment',
    branch: 'All Branches',
  },
  {
    name: 'Bridal Makeup Package 2',
    price: 'Rs. 24,995',
    desc: 'Bridal Makeup · 2 Facials (Whitening + Gold) · 2× Mani & Pedi (Skin Truth + Whitening) · Full Body Wax · Full Body Polisher · Eyebrows & Upper Lips · Hair Protein Treatment',
    branch: 'All Branches',
  },

];

for (const s of services) insertService.run(s.name, s.price, s.desc, s.branch);

runAll();

console.log(`✅ Seeded ${services.length} services successfully!`);
