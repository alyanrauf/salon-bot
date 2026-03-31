const { WebSocketServer } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');
const { routeMessage } = require('../core/router');

function setupCallServer(server) {
    const wss = new WebSocketServer({ noServer: true });

    // FIX: validate Origin header so only allowed domains can open voice calls
    // (prevents external sites from consuming your Gemini quota)
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

        // FIX: unique session ID per call so parallel callers don't share booking state.
        // Previously all calls used the hardcoded string "__CALL_USER__".
        const callSessionId = `__CALL_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

        const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Reusable AudioContext equivalent: track session state for cleanup
        let sessionClosed = false;

        try {
            const session = await client.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',

                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },

                    systemInstruction: `
You are a live voice receptionist for a beauty salon.
- Greet callers warmly and keep responses brief and natural for voice.
- Help with: service prices, available deals, branch locations, and booking appointments.
- To handle any of these requests, ALWAYS use the salon_intent tool — do not answer from memory.
- If booking: collect name, phone, service, branch, date, and time step by step.
- Speak in Urdu or English based on the caller's language.
- If unsure, ask a clarifying question rather than guessing.
`,

                    tools: [
                        {
                            functionDeclarations: [
                                {
                                    name: 'salon_intent',
                                    description:
                                        'Process any salon-related request: prices, deals, branches, booking. Always call this with the caller\'s transcribed message.',
                                    parameters: {
                                        type: 'object',
                                        properties: {
                                            text: {
                                                type: 'string',
                                                description: 'The caller\'s message text',
                                            },
                                        },
                                        required: ['text'],
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

                        // Tool call handling
                        if (message.toolCall) {
                            (async () => {
                                for (const call of message.toolCall.functionCalls) {
                                    if (call.name === 'salon_intent') {
                                        let result;
                                        try {
                                            // FIX: use unique callSessionId so parallel calls are isolated
                                            result = await routeMessage(callSessionId, call.args.text, 'voice');
                                        } catch (err) {
                                            console.error('[call] routeMessage error:', err.message);
                                            result = "Sorry, I couldn't process that. Please try again.";
                                        }

                                        // FIX: session.sendToolResponse is the correct method name in @google/genai v1+
                                        session.sendToolResponse({
                                            functionResponses: [
                                                {
                                                    name: call.name,
                                                    id: call.id,
                                                    response: { result },
                                                },
                                            ],
                                        });
                                    }
                                }
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

            // Browser PCM16 audio → Gemini
            // NOTE: must use { audio: { data, mimeType } } — NOT { media: { ... } }
            // Using 'media' silently sends nothing; the correct key is 'audio'.
            ws.on('message', (data) => {
                if (sessionClosed) return;
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
