const { WebSocketServer } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');
const { getDb } = require('../db/database');
const { buildSalonContext } = require('../data/salonCache');

// ── Voice tool implementations ──────────────────────────────────────────────
// Only create_booking remains — all read-only data is embedded in the system
// instruction at session start, eliminating tool-call round-trip latency.

async function handleVoiceTool(name, args) {
    if (name === 'create_booking') {
        const db = getDb();
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

        const callSessionId = `__CALL_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        let sessionClosed = false;

        // Load all salon data fresh from cache for this session
        const salonContext = buildSalonContext();

        try {
            const session = await client.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',

                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },

                    systemInstruction: `${salonContext}

You are a live voice receptionist for a beauty salon. You speak ONLY in pure Urdu or English — never Hindi.

IMPORTANT: Do not narrate your reasoning or describe what tools you are calling. Never say things like "I will now look up the services" or "Let me check the branches." Respond naturally and directly, as if you already know everything.

LANGUAGE RULES:
- Caller speaks English → respond fully in English.
- Caller speaks Urdu → respond in pure Urdu only.
- NEVER use Hindi words. Use "shukriya" not "shukria", "bohat acha" not "bahut accha", "khubsoorat" not "sundar".
- Do not say "aapka din shubh ho" or any Hindi blessings.

GREETING:
- When the caller's first message is "__GREET__", greet warmly.
  English: "Hello! Welcome to our salon. How can I help you today?"
  Urdu: "Assalamu Alaikum! Salon mein khush aamdeed. Main aap ki kya khidmat kar sakti hoon?"

BOOKING (when caller wants to book an appointment):
1. You already have the full service list, branch list, staff list, and timings above — use them directly.
2. Collect these required fields — use values the caller already mentioned, ask only for missing ones:
   • name    — caller's name
   • phone   — digits only, no spaces (e.g. "03001234567")
   • service — must exactly match a name from the SERVICES list above
   • branch  — must exactly match a name from the BRANCHES list above
   • date    — natural date is fine (e.g. "kal", "tomorrow", "30 March")
   • time    — convert to HH:MM 24-hour format before saving (e.g. "2 baje" → "14:00", "3 pm" → "15:00")
3. Once the branch is known, check the STAFF list above for that branch.
   - If no staff listed for that branch: skip staff, continue to date/time.
   - If staff are listed: ask "Would you like to book with a specific stylist, or no preference?" and read the names.
     • If they pick someone: include that name as staff_name in create_booking.
     • If they say no preference / skip: proceed without staff_name.
4. Check OPENING HOURS above to verify the requested time is within salon hours. Warn the caller if it is not.
5. Once all fields are collected, read them back to the caller and ask for confirmation.
6. After confirmation, call create_booking.

PRICES / SERVICES / BRANCHES:
- All this information is already in your context above. Answer directly without calling any tool.

GENERAL:
- Keep responses short and natural — this is a phone call, not a chat.
- No bullet points, no markdown.
- If unsure about one thing, ask one short question.
`,

                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: 'create_booking',
                                    description: 'Save the appointment to the database. Only call this after the caller has confirmed all details.',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string', description: 'Customer full name' },
                                            phone: { type: 'string', description: 'Phone number, digits only, e.g. "03001234567"' },
                                            service: { type: 'string', description: 'Exact service name from the salon data' },
                                            branch: { type: 'string', description: 'Exact branch name from the salon data' },
                                            date: { type: 'string', description: 'Appointment date, e.g. "kal", "30 March", "2026-04-01"' },
                                            time: { type: 'string', description: 'Appointment time in HH:MM 24-hour format, e.g. "14:00"' },
                                            staff_name: { type: 'string', description: 'Staff member name. Omit if caller has no preference.' },
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
                            console.log('[call] Gemini interrupted (barge-in)');
                        }

                        // Tool call handling — only create_booking
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

            // Browser messages: binary = PCM16 mic audio; text JSON = control messages
            ws.on('message', (data) => {
                if (sessionClosed) return;

                // JSON control messages (e.g. { type: 'greet' })
                if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
                    try {
                        const msg = JSON.parse(data.toString());
                        if (msg.type === 'greet') {
                            console.log('[call] Sending greeting trigger to Gemini');
                            session.sendClientContent({
                                turns: [{
                                    role: 'user',
                                    parts: [{ text: '__GREET__' }],
                                }],
                                turnComplete: true,
                            });
                        }
                    } catch (_) { /* not JSON, ignore */ }
                    return;
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
