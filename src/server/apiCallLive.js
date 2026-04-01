const { WebSocketServer } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');
const { getDb } = require('../db/database');

// ── Voice tool implementations ──────────────────────────────────────────────

function isWeekendForDate(dateStr) {
    const t = (dateStr || '').trim().toLowerCase();
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
        if (isNaN(d.getTime())) d = new Date(dateStr + ' ' + new Date().getFullYear());
    }
    if (isNaN(d.getTime())) return false;
    return d.getDay() === 0 || d.getDay() === 6;
}

async function handleVoiceTool(name, args) {
    const db = getDb();

    if (name === 'get_services') {
        const rows = db.prepare('SELECT name, price FROM services ORDER BY name').all();
        if (!rows.length) return 'No services available right now.';
        return rows.map(r => `${r.name}: ${r.price}`).join(', ');
    }

    if (name === 'get_branches') {
        const rows = db.prepare('SELECT name, address, phone FROM branches ORDER BY name').all();
        if (!rows.length) return 'No branches available right now.';
        return rows.map(r => [r.name, r.address, r.phone].filter(Boolean).join(' — ')).join(' | ');
    }

    if (name === 'get_timings') {
        const dayType = isWeekendForDate(args.date || 'today') ? 'weekend' : 'workday';
        const row = db.prepare('SELECT open_time, close_time FROM salon_timings WHERE day_type = ?').get(dayType);
        if (!row) return 'Timing info not configured.';
        return `Salon is open ${row.open_time} to ${row.close_time} on ${dayType}s.`;
    }

    if (name === 'get_staff') {
        const branchName = (args.branch || '').trim();
        let brRow = db.prepare('SELECT id, name FROM branches WHERE LOWER(name) = LOWER(?)').get(branchName);
        if (!brRow) brRow = db.prepare("SELECT id, name FROM branches WHERE LOWER(name) LIKE '%' || LOWER(?) || '%'").get(branchName);
        if (!brRow) return 'Branch not found.';

        console.log('[get_staff] branch arg:', JSON.stringify(branchName), '→ resolved:', JSON.stringify(brRow));
        const staff = db.prepare(`
            SELECT s.id, s.name, r.name as role
            FROM staff s
            LEFT JOIN staff_roles r ON s.role_id = r.id
            WHERE s.branch_id = ?
              AND (r.name IS NULL OR LOWER(r.name) NOT IN ('admin', 'receptionist', 'manager'))
            ORDER BY s.name
        `).all(brRow.id);
        console.log('[get_staff] staff rows found:', staff.length, staff.map(s => s.name));

        if (!staff.length) return 'NO_STAFF';
        return staff.map(s => `${s.name} (${s.role || 'Stylist'})`).join(', ');
    }

    if (name === 'create_booking') {
        const { name: custName, phone, service, branch, date, time, staff_name } = args;

        if (!custName || !phone || !service || !branch || !date || !time) {
            return 'Missing required fields. Need: name, phone, service, branch, date, time.';
        }

        // Case-insensitive service lookup — exact first, then partial
        let svcRow = db.prepare('SELECT name FROM services WHERE LOWER(name) = LOWER(?)').get(service.trim());
        if (!svcRow) {
            svcRow = db.prepare("SELECT name FROM services WHERE LOWER(name) LIKE '%' || LOWER(?) || '%'").get(service.trim());
        }
        if (!svcRow) return `Service "${service}" not found. Please check the service name.`;

        // Case-insensitive branch lookup — exact first, then partial
        let brRow = db.prepare('SELECT id, name FROM branches WHERE LOWER(name) = LOWER(?)').get(branch.trim());
        if (!brRow) {
            brRow = db.prepare("SELECT id, name FROM branches WHERE LOWER(name) LIKE '%' || LOWER(?) || '%'").get(branch.trim());
        }
        if (!brRow) return `Branch "${branch}" not found. Please check the branch name.`;

        // Optional staff lookup
        let staffId = null;
        let staffNameSaved = null;
        if (staff_name && staff_name.trim()) {
            const staffRow = db.prepare(`
                SELECT s.id, s.name FROM staff s
                WHERE s.branch_id = ? AND LOWER(s.name) LIKE '%' || LOWER(?) || '%'
                LIMIT 1
            `).get(brRow.id, staff_name.trim());
            if (staffRow) {
                staffId = staffRow.id;
                staffNameSaved = staffRow.name;
            }
        }

        console.log('[BOOKING FIELDS] SAVING VOICE BOOKING:', JSON.stringify({
            name: custName, phone, service: svcRow.name, branch: brRow.name,
            date, time, staff: staffNameSaved || null,
        }));

        db.prepare(`
            INSERT INTO bookings (customer_name, phone, service, branch, date, time, status, source, staff_id, staff_name)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', 'voice', ?, ?)
        `).run(custName.trim(), phone.trim(), svcRow.name, brRow.name, date.trim(), time.trim(), staffId, staffNameSaved);

        let confirm = `Booking confirmed for ${custName} — ${svcRow.name} at ${brRow.name} on ${date} at ${time}`;
        if (staffNameSaved) confirm += ` with ${staffNameSaved}`;
        return confirm + '.';
    }

    return `Unknown tool: ${name}`;
}

// ── WebSocket call server ────────────────────────────────────────────────────

function setupCallServer(server) {
    const wss = new WebSocketServer({ noServer: true });

    // Validate Origin so only allowed domains can open voice calls
    server.on('upgrade', (req, socket, head) => {
        if (req.url !== '/api/call') return;

        const allowed = (process.env.WIDGET_ALLOWED_ORIGINS || '*')
            .split(',')
            .map(o => o.trim());
        const origin = req.headers.origin || '';

        if (!allowed.includes('*') && !allowed.includes(origin)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', async (ws) => {
        console.log('[call] Client connected');

        // Unique session ID per call — parallel callers don't share state
        const callSessionId = `__CALL_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let sessionClosed = false;

        try {
            const session = await client.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',

                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },
                    realtimeInputConfig: {
                        automaticActivityDetection: {
                            // High sensitivity — detects normal conversational speech
                            startSensitivity: 'START_SENSITIVITY_HIGH',
                            // High end sensitivity — ends turn promptly after caller stops
                            endSensitivity: 'END_SENSITIVITY_HIGH',
                            // 800ms silence before turn ends (was 2000 — too long, felt unresponsive)
                            silenceDurationMs: 800,
                            prefixPaddingMs: 200,
                        },
                    },

                    systemInstruction: `
You are a live voice receptionist for a beauty salon.

LANGUAGE — THIS IS YOUR MOST IMPORTANT RULE:
- You ONLY speak two languages: Urdu and English. Nothing else.
- DEFAULT language is English. Start in English unless the caller speaks Urdu first.
- If the caller speaks Urdu → switch to Urdu with some words of english for elloquence immediately and stay in Urdu for the entire call.
- If the caller speaks English → respond in English for the entire call.
- NEVER mix languages mid-sentence.
- NEVER use Hindi.
- NEVER use word related to any religion, culture, or region (e.g. no "bhai", "dost", "janab", "sahib", "ji", "aapka din mubarak ho", etc.). You are a modern, professional salon receptionist, not a traditional one.


GREETING:
- When the caller's first message is "__GREET__", greet warmly without calling any tool.
  English: "Hello! Welcome to our salon. How can I help you today?"
  Urdu: "Assalamu Alaikum! hmary Salon mein khush aamdeed. Main aap ki kya khidmat kar sakti hoon?"

BOOKING (when caller wants to book an appointment):
1. Immediately call get_services AND get_branches so you know what is available.
2. Collect these required fields — use values the caller already mentioned, ask only for missing ones:
   • name    — caller's name (e.g. "Alyan")
   • phone   — digits only, no spaces (e.g. "03001234567")
   • service — must exactly match a name returned by get_services
   • branch  — must exactly match a name returned by get_branches
   • date    — natural date is fine (e.g. "kal", "tomorrow", "30 March")
   • time    — convert to HH:MM 24-hour format before saving (e.g. "2 baje" → "14:00", "3 pm" → "15:00")
3. Once the branch is confirmed, call get_staff with that branch name.
   - If the result is "NO_STAFF": skip staff, continue to date/time.
   - If staff are listed: ask the caller "Would you like to book with a specific stylist, or no preference?" and read the names.
     • If they pick someone: include that name as staff_name in create_booking.
     • If they say no preference / skip: proceed without staff_name.
4. Call get_timings to verify the requested time is within salon hours. Warn the caller if it is not.
5. Once all fields are collected, read them back to the caller and ask for confirmation.
6. After confirmation, call create_booking.

PRICES / SERVICES / BRANCHES / DEALS:
- For any question about prices or services: call get_services.
- For any question about locations or branches: call get_branches.

GENERAL:
- Keep responses short and natural — this is a phone call, not a chat.
- No bullet points, no markdown.
- If unsure about one thing, ask one short question.
`,

                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: 'get_services',
                                    description: 'Get all available salon services and their prices.',
                                    parameters: { type: 'object', properties: {} },
                                },
                                {
                                    name: 'get_branches',
                                    description: 'Get all salon branch names and locations.',
                                    parameters: { type: 'object', properties: {} },
                                },
                                {
                                    name: 'get_staff',
                                    description: 'Get staff members available at a specific branch. Returns "NO_STAFF" if the branch has no staff.',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            branch: {
                                                type: 'string',
                                                description: 'Branch name, e.g. "Gulberg"',
                                            },
                                        },
                                        required: ['branch'],
                                    },
                                },
                                {
                                    name: 'get_timings',
                                    description: 'Get salon opening and closing hours for a given date.',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            date: {
                                                type: 'string',
                                                description: 'Date string, e.g. "kal", "tomorrow", "today", "30 March", "2026-04-01"',
                                            },
                                        },
                                        required: ['date'],
                                    },
                                },
                                {
                                    name: 'create_booking',
                                    description: 'Save the appointment to the database. Only call this after the caller has confirmed all details.',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            name:       { type: 'string', description: 'Customer full name' },
                                            phone:      { type: 'string', description: 'Phone number, digits only, e.g. "03001234567"' },
                                            service:    { type: 'string', description: 'Exact service name from get_services' },
                                            branch:     { type: 'string', description: 'Exact branch name from get_branches' },
                                            date:       { type: 'string', description: 'Appointment date, e.g. "kal", "30 March", "2026-04-01"' },
                                            time:       { type: 'string', description: 'Appointment time in HH:MM 24-hour format, e.g. "14:00"' },
                                            staff_name: { type: 'string', description: 'Staff member name from get_staff. Omit if caller has no preference.' },
                                        },
                                        required: ['name', 'phone', 'service', 'branch', 'date', 'time'],
                                    },
                                },
                            ],
                        },
                    ],

                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },

                callbacks: {
                    onopen() {
                        console.log('[call] Gemini session OPEN — sessionId:', callSessionId);
                    },

                    onmessage(message) {
                        if (sessionClosed) return;

                        // Model audio chunks → browser
                        if (message.serverContent?.modelTurn?.parts) {
                            for (const part of message.serverContent.modelTurn.parts) {
                                if (part.inlineData) {
                                    ws.send(Buffer.from(part.inlineData.data, 'base64'));
                                }
                                if (part.text) {
                                    ws.send(JSON.stringify({ type: 'text', text: part.text }));
                                }
                            }
                        }

                        if (message.serverContent?.interrupted) {
                            console.log('[call] Gemini interrupted (barge-in) — clearing browser playback');
                            ws.send(JSON.stringify({ type: 'interrupted' }));
                        }

                        // Tool call handling
                        if (message.toolCall) {
                            (async () => {
                                const responses = [];
                                for (const call of message.toolCall.functionCalls) {
                                    console.log('[TOOL CALL RAW PAYLOAD]', JSON.stringify({ name: call.name, args: call.args }));
                                    let result;
                                    try {
                                        result = await handleVoiceTool(call.name, call.args || {});
                                    } catch (err) {
                                        console.error('[call] tool error:', err.message);
                                        result = `Error: ${err.message}`;
                                    }
                                    console.log('[TOOL CALL RESULT]', call.name, '→', JSON.stringify(result));
                                    responses.push({ name: call.name, id: call.id, response: { result } });
                                }
                                session.sendToolResponse({ functionResponses: responses });
                            })();
                        }
                    },

                    onerror(err) {
                        console.error('[call] Gemini error:', err);
                    },

                    onclose() {
                        console.log('[call] Gemini session CLOSED');
                        sessionClosed = true;
                    },
                },
            });

            // Gemini is ready — trigger greeting immediately from server side.
            // We do NOT wait for a browser "greet" message because it always
            // arrives before ws.on('message') is registered (race condition).
            console.log('[call] Gemini ready — sending greeting trigger');
            session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: '__GREET__' }] }],
                turnComplete: true,
            });

            // Browser messages: binary = PCM16 mic audio only
            ws.on('message', (data) => {
                if (sessionClosed) return;

                // Ignore JSON control messages — they are always short strings.
                // Audio frames are always many hundreds of bytes, so length < 100 is a safe guard.
                if (typeof data === 'string') return;
                if (data instanceof Buffer && data.length < 100) {
                    try { JSON.parse(data.toString()); return; } catch (_) { /* not JSON — treat as audio */ }
                }

                // Binary = raw PCM16 mic audio at 16kHz (downsampled by AudioWorklet in browser)
                try {
                    session.sendRealtimeInput({
                        audio: {
                            data: Buffer.from(data).toString('base64'),
                            mimeType: 'audio/pcm;rate=16000',
                        },
                    });
                } catch (err) {
                    console.error('[call] sendRealtimeInput error:', err.message);
                }
            });

            ws.on('close', () => {
                console.log('[call] Browser disconnected — sessionId:', callSessionId);
                sessionClosed = true;
                try { session.close(); } catch (_) { }
            });

            ws.on('error', (err) => {
                console.error('[call] WebSocket error:', err.message);
                sessionClosed = true;
                try { session.close(); } catch (_) { }
            });

        } catch (err) {
            console.error('[call] Failed to open Gemini session:', err.message);
            ws.close(1011, 'Failed to connect to voice service');
        }
    });
}

module.exports = { setupCallServer };
