import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";

const { detectIntent } = require("../core/intent");
const { routeMessage } = require("../core/router");

export function setupCallServer(server) {
  const wss = new WebSocketServer({
    noServer: true,
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/api/call") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", async (ws) => {
    console.log("Client connected for live voice call");

    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    try {
      const session = await client.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",

        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },

          systemInstruction: `
You are a live receptionist for Beauty Salon.
- Speak concisely.
- Detect intent and perform tool calls.
- If booking: ask for missing info.
- Speak in Urdu or English based on user language.
`,

          tools: [
            {
              functionDeclarations: [
                {
                  name: "salon_intent",
                  description: "Detect intent and perform salon actions",
                  parameters: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                    },
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
            console.log("Gemini call session OPEN");
          },

          onmessage(message) {
            // Model audio → Browser
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData) {
                  ws.send(Buffer.from(part.inlineData.data, "base64"));
                }
                if (part.text) {
                  ws.send(JSON.stringify({ type: "text", text: part.text }));
                }
              }
            }

            // Handle interrupt
            if (message.serverContent?.interrupted) {
              console.log("Gemini interrupted.");
            }

              // ✅ Tool call handling (clean & correct)
              if (message.toolCall) {
                  (async () => {
                      for (const call of message.toolCall.functionCalls) {

                          // ✅ Handle salon_intent tool
                          if (call.name === "salon_intent") {
                              const userText = call.args.text;

                              // ✅ Use your real message routing system
                              const reply = await routeMessage("__CALL_USER__", userText, "voice");

                              // ✅ Send response back to Gemini so it SPEAKS IT OUT
                              session.sendToolResponse({
                                  functionResponses: [
                                      {
                                          name: call.name,
                                          id: call.id,
                                          response: { result: reply }
                                      }
                                  ]
                              });
                          }

                      }
                  })();
              }
          },

          onerror(err) {
            console.error("Gemini Error:", err);
          },

          onclose() {
            console.log("Gemini call session CLOSED");
          },
        },
      });

      // Browser PCM16 → Gemini
      ws.on("message", (data) => {
        session.sendRealtimeInput({
          media: {
            data: Buffer.from(data).toString("base64"),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      });

      ws.on("close", () => {
        console.log("Browser closed call");
        session.close();
      });
    } catch (err) {
      console.error("Call failed:", err);
      ws.close();
    }
  });
}
