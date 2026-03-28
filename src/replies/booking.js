const { setSession, clearSession } = require('../core/session');
const { getDb } = require('../db/database');
const { getBranches } = require('./branches');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getServiceNames() {
  try {
    const db = getDb();
    return db.prepare('SELECT name FROM services ORDER BY name').all().map(s => s.name);
  } catch {
    return [];
  }
}

function saveBooking(data, platform) {
  const db = getDb();
  db.prepare(`
    INSERT INTO bookings (customer_name, phone, service, branch, date, time, status, source)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    data.name,
    data.phone,
    data.service,
    data.branch,
    data.date,
    data.time,
    platform || 'chat'
  );
}

function branchList() {
  const branches = getBranches();
  return branches.map(b => `  *${b.number}* — ${b.name}`).join('\n');
}

// Validates name: at least 2 words, only letters/spaces
function isValidName(text) {
  return /^[a-zA-Z\s]{2,50}$/.test(text.trim()) && text.trim().split(/\s+/).length >= 2;
}

// Validates phone: 7–15 digits, optional leading +
function isValidPhone(text) {
  return /^\+?[0-9\s\-]{7,15}$/.test(text.trim());
}

// Validates date: accepts formats like "30 March", "April 5", "2026-04-05", "tomorrow"
function isValidDate(text) {
  const t = text.trim().toLowerCase();
  if (t === 'tomorrow' || t === 'today') return true;
  return /^(\d{1,2}\s+\w+|\w+\s+\d{1,2})(\s+\d{4})?$/.test(t) ||
    /^\d{4}-\d{2}-\d{2}$/.test(t);
}

// Validates time: "2pm", "2:30 PM", "14:00", "11am"
function isValidTime(text) {
  return /^([01]?\d|2[0-3]):[0-5]\d(\s?(am|pm))?$/i.test(text.trim()) ||
    /^([01]?\d|2[0-3])\s?(am|pm)$/i.test(text.trim());
}

// Parse user time input → "HH:MM" 24-hour string
function parseTimeTo24h(text) {
  const t = text.trim();
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

// Determines if a date string falls on a weekend (Sat/Sun)
function isWeekendDate(dateStr) {
  const t = dateStr.trim().toLowerCase();
  let d;
  if (t === 'today') {
    d = new Date();
  } else if (t === 'tomorrow') {
    d = new Date();
    d.setDate(d.getDate() + 1);
  } else {
    d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      // Try "30 March" / "March 30" style with current year appended
      d = new Date(dateStr + ' ' + new Date().getFullYear());
    }
  }
  if (isNaN(d.getTime())) return false; // can't parse → treat as workday
  const day = d.getDay();
  return day === 0 || day === 6; // 0=Sun, 6=Sat
}

// Fetch the applicable timing row for a given date string
function getSalonTiming(dateStr) {
  try {
    const dayType = isWeekendDate(dateStr) ? 'weekend' : 'workday';
    return getDb().prepare('SELECT * FROM salon_timings WHERE day_type = ?').get(dayType);
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

function handleBookingStep(userId, messageText, session, platform) {
  const text = messageText.trim();

  // ── STEP 1: Start ──────────────────────────────────────────────────────────
  if (!session) {
    setSession(userId, { state: 'ASK_NAME', platform });
    return (
      '📅 *Book an Appointment*\n\n' +
      "Let's get you booked in! 💅\n\n" +
      'Please enter your *full name*:\n' +
      '_e.g. Sara Ahmed_'
    );
  }

  // ── STEP 2: Got name → ask phone ───────────────────────────────────────────
  if (session.state === 'ASK_NAME') {
    if (!isValidName(text)) {
      return (
        '⚠️ Please enter your *full name* (first and last name, letters only).\n\n' +
        '_e.g. Sara Ahmed_'
      );
    }
    setSession(userId, { ...session, state: 'ASK_PHONE', name: text });
    return (
      `Nice to meet you, *${text}*! 😊\n\n` +
      'Please enter your *phone number*:\n' +
      '_e.g. 03001234567 or +92 300 1234567_'
    );
  }

  // ── STEP 3: Got phone → ask service ───────────────────────────────────────
  if (session.state === 'ASK_PHONE') {
    if (!isValidPhone(text)) {
      return (
        '⚠️ Please enter a valid *phone number*.\n\n' +
        '_e.g. 03001234567 or +92 300 1234567_'
      );
    }
    const services = getServiceNames();
    setSession(userId, { ...session, state: 'ASK_SERVICE', phone: text, serviceList: services });

    let reply = '📞 Got it!\n\nWhich *service* would you like to book?\n\n';
    if (services.length) {
      reply += services.map((s, i) => `  *${i + 1}.* ${s}`).join('\n');
      reply += '\n\n_Reply with the number or name of the service._';
    } else {
      reply += '_Type the name of the service you want._';
    }
    return reply;
  }

  // ── STEP 4: Got service → ask branch ──────────────────────────────────────
  if (session.state === 'ASK_SERVICE') {
    const services = session.serviceList || [];
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

  // ── STEP 5: Got branch → ask date ─────────────────────────────────────────
  if (session.state === 'ASK_BRANCH') {
    const branches = getBranches();
    const branchNum = parseInt(text, 10);
    const branch = branches.find(b => b.number === branchNum);
    if (!branch) {
      return (
        '⚠️ Please reply with a valid branch *number*:\n\n' +
        branchList()
      );
    }
    setSession(userId, { ...session, state: 'ASK_DATE', branch: branch.name });
    return (
      `📍 *${branch.name}* — perfect!\n\n` +
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
    setSession(userId, { ...session, state: 'ASK_TIME', date: text });

    // Show available hours for the selected date
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

    // Validate time is within salon operating hours
    const time24 = parseTimeTo24h(text);
    if (time24) {
      const timing = getSalonTiming(session.date);
      if (timing) {
        const requested = toMinutes(time24);
        const open      = toMinutes(timing.open_time);
        const close     = toMinutes(timing.close_time);
        if (requested < open || requested > close) {
          const label = timing.day_type === 'weekend' ? 'weekend' : 'weekday';
          return (
            `⚠️ That time is outside our ${label} hours.\n\n` +
            `🕐 Available: *${formatTime12h(timing.open_time)} – ${formatTime12h(timing.close_time)}*\n\n` +
            'Please choose a time within that range.'
          );
        }
      }
    }

    const bookingData = {
      name:    session.name,
      phone:   session.phone,
      service: session.service,
      branch:  session.branch,
      date:    session.date,
      time:    text,
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
