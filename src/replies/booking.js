const { setSession, clearSession } = require('../core/session');
const { getDb } = require('../db/database');
const { getBranches } = require('./branches');



// ── Helpers ─────────────────────────────────────────────────────────────────



function getServiceNames() {
  try {
    const db = getDb();
    return db.prepare('SELECT name FROM services ORDER BY name').all().map(s => s.name);
  } catch {
    return [];
  }
}

function getActiveStaff(branchName) {
  try {
    const db = getDb();
    const branch = db.prepare('SELECT id FROM branches WHERE name = ?').get(branchName);
    if (branch) {
      // FIX: role filter moved into WHERE clause. Previously was in ORDER BY which is invalid SQL.
      return db.prepare(`
        SELECT s.id, s.name, s.role FROM staff s
        WHERE s.status = 'active'
          AND (s.branch_id = ? OR s.branch_id IS NULL)
          AND s.role NOT IN ('admin', 'manager', 'receptionist')
        ORDER BY s.name
      `).all(branch.id);
    }
    return db.prepare(`
      SELECT id, name, role FROM staff
      WHERE status = 'active'
        AND role NOT IN ('admin', 'manager', 'receptionist')
      ORDER BY name
    `).all();
  } catch {
    return [];
  }
}

function saveBooking(data, platform) {
  const db = getDb();
  db.prepare(`
    INSERT INTO bookings (customer_name, phone, service, branch, date, time, status, source, staff_id, staff_name)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    data.name,
    data.phone,
    data.service,
    data.branch,
    data.date,
    data.time,
    platform || 'chat',
    data.staffId || null,
    data.staffName || null
  );
}

function branchList() {
  const branches = getBranches();
  return branches.map(b => `  *${b.number}* — ${b.name}`).join('\n');
}

// Validates name: accepts Latin, Urdu/Arabic Unicode, spaces — 2–60 chars
function isValidName(text) {
  const t = text.trim();
  if (t.length < 2 || t.length > 60) return false;
  // Allow Latin letters, Urdu/Arabic script (U+0600–U+06FF, U+0750–U+077F, U+FB50–U+FDFF, U+FE70–U+FEFF), spaces
  return /^[a-zA-Z؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\s]+$/.test(t);
}

// Validates phone: 7–15 digits, optional leading +
function isValidPhone(text) {
  return /^\+?[0-9\s\-]{7,15}$/.test(text.trim());
}

// Add this function near the other date helpers
function resolveDate(text) {
  const t = text.trim().toLowerCase();
  const today = new Date();
  if (t === 'aaj' || t === 'today') {
    // no change
  } else if (t === 'kal' || t === 'tomorrow') {
    today.setDate(today.getDate() + 1);
  } else if (t === 'parson' || t === 'day after tomorrow') {
    today.setDate(today.getDate() + 2);
  } else {
    // Already a real date string — return as-is
    return text;
  }
  // Format as YYYY-MM-DD
  return today.toISOString().split('T')[0];
}
// Validates date: accepts "30 March", "April 5", "2026-04-05", "tomorrow", "kal", "parson", "aaj"
function isValidDate(text) {
  const t = text.trim().toLowerCase();
  // Urdu/conversational words
  if (['today', 'aaj', 'kal', 'tomorrow', 'parson', 'day after tomorrow'].includes(t)) return true;
  const formatOk = /^(\d{1,2}\s+\w+|\w+\s+\d{1,2})(\s+\d{4})?$/.test(t) ||
    /^\d{4}-\d{2}-\d{2}$/.test(t);
  if (!formatOk) return false;
  let d = new Date(text);
  if (isNaN(d.getTime())) {
    d = new Date(text + ' ' + new Date().getFullYear());
  }
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d >= today;
}

// Validates time: "2pm", "2:30 PM", "14:00", "11am", "2 pm", "2 baje" (voice-friendly)
function isValidTime(text) {
  const t = text.trim();
  return /^([01]?\d|2[0-3]):[0-5]\d(\s?(am|pm))?$/i.test(t) ||
    /^([01]?\d|2[0-3])\s?(am|pm)$/i.test(t) ||
    /^([01]?\d|2[0-3])\s(baje|o'clock|oclock)$/i.test(t);
}

// Parse user time input → "HH:MM" 24-hour string
function parseTimeTo24h(text) {
  const t = text.trim();
  // Handle "X baje" — assume PM for 1-7, AM otherwise (salon context)
  const bajeMatch = t.match(/^(\d{1,2})\s+baje$/i);
  if (bajeMatch) {
    let h = parseInt(bajeMatch[1], 10);
    if (h >= 1 && h <= 7) h += 12; // 2 baje = 14:00
    return `${String(h).padStart(2, '0')}:00`;
  }
  const match12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2] || '0', 10);
    const period = match12[3].toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    if (period === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return `${String(parseInt(match24[1], 10)).padStart(2, '0')}:${match24[2]}`;
  }
  return null;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function isWeekendDate(dateStr) {
  const t = dateStr.trim().toLowerCase();
  let d;
  if (t === 'today' || t === 'aaj') {
    d = new Date();
  } else if (t === 'tomorrow' || t === 'kal') {
    d = new Date();
    d.setDate(d.getDate() + 1);
  } else if (t === 'parson' || t === 'day after tomorrow') {
    d = new Date();
    d.setDate(d.getDate() + 2);
  } else {
    d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      d = new Date(dateStr + ' ' + new Date().getFullYear());
    }
  }
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

function getSalonTiming(dateStr) {
  try {
    const db = getDb();
    const dayType = isWeekendDate(dateStr) ? 'weekend' : 'workday';
    return db.prepare('SELECT * FROM salon_timings WHERE day_type = ?').get(dayType);
  } catch {
    return null;
  }
}


// ── Main booking step handler ─────────────────────────────────────────────────

function handleBookingStep(userId, text, session, platform) {
  // ── STEP 1: No session yet → start booking ─────────────────────────────────
  if (!session) {
    const services = getServiceNames();
    if (!services.length) {
      return 'Sorry, no services are available right now. Please contact us directly to book.';
    }
    setSession(userId, { state: 'ASK_NAME', platform });
    return (
      '📅 *Let\'s book your appointment!*\n\n' +
      'First, what\'s your *name*?'
    );
  }

  // ── STEP 2: Got name → ask phone ──────────────────────────────────────────
  if (session.state === 'ASK_NAME') {
    if (!isValidName(text)) {
      return '⚠️ Please enter your *full name* (letters only).';
    }
    setSession(userId, { ...session, state: 'ASK_PHONE', name: text.trim() });
    return `👋 Hi *${text.trim()}*!\n\nWhat's your *phone number*?`;
  }

  // ── STEP 3: Got phone → ask service ───────────────────────────────────────
  if (session.state === 'ASK_PHONE') {
    if (!isValidPhone(text)) {
      return '⚠️ Please enter a valid *phone number* (digits only, 7–15 characters).';
    }
    const services = getServiceNames();
    if (!services.length) {
      clearSession(userId);
      return 'Sorry, no services are available right now. Please contact us directly.';
    }
    setSession(userId, { ...session, state: 'ASK_SERVICE', phone: text.trim() });
    return (
      '✅ Got it!\n\nWhich *service* would you like?\n\n' +
      services.map((s, i) => `  *${i + 1}.* ${s}`).join('\n') +
      '\n\n_Reply with a number or service name._'
    );
  }

  // ── STEP 4: Got service → ask branch ──────────────────────────────────────
  if (session.state === 'ASK_SERVICE') {
    const services = getServiceNames();
    let chosenService = null;

    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= services.length) {
      chosenService = services[num - 1];
    } else {
      const lower = text.toLowerCase();
      chosenService = services.find(s => s.toLowerCase().includes(lower));
    }

    if (!chosenService) {
      return (
        '⚠️ Please choose a valid service by *number* or *name*.\n\n' +
        services.map((s, i) => `  *${i + 1}.* ${s}`).join('\n')
      );
    }

    setSession(userId, { ...session, state: 'ASK_BRANCH', service: chosenService });
    return (
      `✨ *${chosenService}* — great choice!\n\n` +
      'Which *branch* would you like to visit?\n\n' +
      branchList()
    );
  }

  // ── STEP 5: Got branch → ask staff (or skip to date) ──────────────────────
  if (session.state === 'ASK_BRANCH') {
    const branches = getBranches();
    const branchNum = parseInt(text.replace(/\D/g, ''), 10);
    const lower = text.trim().toLowerCase();
    // Accept branch by number OR by name/partial name (for voice users who say the name)
    let branch = branches.find(b => b.number === branchNum);
    if (!branch) branch = branches.find(b => b.name.toLowerCase().includes(lower));
    if (!branch) {
      return (
        '⚠️ Please reply with a valid branch *number* or *name*:\n\n' +
        branchList()
      );
    }
    const staffList = getActiveStaff(branch.name);
    if (!staffList.length) {
      setSession(userId, { ...session, state: 'ASK_DATE', branch: branch.name, staffId: null, staffName: null });
      return (
        `📍 *${branch.name}* — perfect!\n\n` +
        'What *date* would you like to come in?\n\n' +
        '_e.g. 30 March · April 5 · tomorrow_'
      );
    }
    setSession(userId, { ...session, state: 'ASK_STAFF', branch: branch.name, staffOptions: staffList });
    let reply = `📍 *${branch.name}* — perfect!\n\n`;
    reply += 'Would you like to choose a specific *stylist/staff member*? (optional)\n\n';
    reply += staffList.map((s, i) => `  *${i + 1}.* ${s.name} _(${s.role})_`).join('\n');
    reply += '\n\n_Reply with a number to choose, or type *any* / *skip* for no preference._';
    return reply;
  }

  // ── STEP 5b: Got staff → ask date ─────────────────────────────────────────
  if (session.state === 'ASK_STAFF') {
    const staffList = session.staffOptions || [];
    let staffId = null;
    let staffName = null;

    const lower = text.toLowerCase();
    if (lower === 'any' || lower === 'skip' || lower === 'no preference' || lower === 'none') {
      // No preference — continue
    } else {
      const num = parseInt(text, 10);
      if (!isNaN(num) && num >= 1 && num <= staffList.length) {
        staffId = staffList[num - 1].id;
        staffName = staffList[num - 1].name;
      } else {
        const match = staffList.find(s => s.name.toLowerCase().includes(lower));
        if (match) {
          staffId = match.id;
          staffName = match.name;
        } else {
          let reply = '⚠️ Please choose by *number*, type a *name*, or type *skip* for no preference.\n\n';
          reply += staffList.map((s, i) => `  *${i + 1}.* ${s.name} _(${s.role})_`).join('\n');
          return reply;
        }
      }
    }

    setSession(userId, { ...session, state: 'ASK_DATE', staffId, staffName });
    const staffMsg = staffName ? `👤 *${staffName}* — great choice!\n\n` : '';
    return (
      staffMsg +
      'What *date* would you like to come in?\n\n' +
      '_e.g. 30 March · April 5 · tomorrow_'
    );
  }

  // ── STEP 6: Got date → ask time ───────────────────────────────────────────
  if (session.state === 'ASK_DATE') {
    if (!isValidDate(text)) {
      return (
        '⚠️ Please enter a valid *date*.\n\n' +
        '_e.g. 30 March · April 5 · tomorrow · 2026-04-05_'
      );
    }
    setSession(userId, { ...session, state: 'ASK_TIME', date: resolveDate(text) });

    const timing = getSalonTiming(text);
    let timeHint = '_e.g. 2:00 PM · 11am · 3:30 PM · 14:00_';
    if (timing) {
      timeHint = `🕐 Available: *${formatTime12h(timing.open_time)} – ${formatTime12h(timing.close_time)}*\n\n${timeHint}`;
    }

    return (
      `📆 *${text}* — noted!\n\n` +
      `What *time* works for you?\n\n${timeHint}`
    );
  }

  // ── STEP 7: Got time → validate & save ────────────────────────────────────
  if (session.state === 'ASK_TIME') {
    if (!isValidTime(text)) {
      return (
        '⚠️ Please enter a valid *time*.\n\n' +
        '_e.g. 2:00 PM · 11am · 3:30 PM · 14:00_'
      );
    }

    const time24 = parseTimeTo24h(text);
    if (time24) {
      const timing = getSalonTiming(session.date);
      if (timing) {
        const requested = toMinutes(time24);
        const open = toMinutes(timing.open_time);
        const close = toMinutes(timing.close_time);
        if (requested < open || requested > close) {
          const label = timing.day_type === 'weekend' ? 'weekend' : 'weekday';
          const openFmt = formatTime12h(timing.open_time);
          const closeFmt = formatTime12h(timing.close_time);
          const plt = session.platform || 'whatsapp';

          if (plt === 'instagram' || plt === 'facebook') {
            return (
              `Unavailable time selected.\n\n` +
              `Our ${label} hours are ${openFmt} to ${closeFmt}.\n` +
              `Please reply with a time within that range.`
            );
          }
          if (plt === 'webchat' || plt === 'voice') {
            return (
              `Selected time is not available. ` +
              `Please choose a slot between ${openFmt} and ${closeFmt}.`
            );
          }
          return (
            `⚠️ That time is outside our ${label} hours.\n\n` +
            `🕐 Available: *${openFmt} – ${closeFmt}*\n\n` +
            'Please choose a time within that range.'
          );
        }
      }
    }

    const bookingData = {
      name: session.name,
      phone: session.phone,
      service: session.service,
      branch: session.branch,
      date: session.date,
      time: parseTimeTo24h(text) || text, ,
      staffId: session.staffId || null,
      staffName: session.staffName || null,
    };

    try {
      saveBooking(bookingData, session.platform);
    } catch (err) {
      clearSession(userId);
      return 'Sorry, there was an error saving your booking. Please try again by typing *book*.';
    }

    clearSession(userId);

    return (
      '✅ *Booking Received!*\n\n' +
      `👤 *Name:* ${bookingData.name}\n` +
      `📞 *Phone:* ${bookingData.phone}\n` +
      `✨ *Service:* ${bookingData.service}\n` +
      `📍 *Branch:* ${bookingData.branch}\n` +
      (bookingData.staffName ? `💅 *Stylist:* ${bookingData.staffName}\n` : '') +
      `📆 *Date:* ${bookingData.date}\n` +
      `🕐 *Time:* ${bookingData.time}\n\n` +
      '⏳ Our team will *confirm your appointment* shortly.\n' +
      'See you soon! 💅'
    );
  }

  // Unexpected state — reset
  clearSession(userId);
  return 'Let\'s start fresh! Type *book* to make an appointment.';
}

module.exports = { handleBookingStep };