(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var scriptEl = document.currentScript ||
    document.querySelector('script[src*="widget.js"]');
  var baseUrl = new URL(scriptEl.src).origin;
  var botName = scriptEl.getAttribute('data-bot-name') || 'Salon Assistant';
  var primaryColor = scriptEl.getAttribute('data-primary-color') || '#8b4a6b';

  // ── Session ID (persistent across page loads) ──────────────────────────────
  var SESSION_KEY = 'salon_bot_session';
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#salonbot-wrap{position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px}',
    '#salonbot-toggle{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:' + primaryColor + ';color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:transform .2s}',
    '#salonbot-toggle:hover{transform:scale(1.08)}',
    '#salonbot-window{display:none;flex-direction:column;position:absolute;bottom:68px;right:0;width:320px;max-height:480px;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.2);background:#fff}',
    '#salonbot-window.open{display:flex}',
    '#salonbot-header{background:' + primaryColor + ';color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:15px}',
    '#salonbot-header-actions{display:flex;align-items:center;gap:8px}',
    '#salonbot-call-btn{background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:background .15s;flex-shrink:0}',
    '#salonbot-call-btn:hover{background:rgba(255,255,255,.35)}',
    '#salonbot-call-btn:disabled{opacity:.4;cursor:default}',
    '#salonbot-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0}',
    '#salonbot-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:80px}',
    '.sb-msg{max-width:80%;padding:8px 12px;border-radius:12px;line-height:1.45;word-break:break-word;white-space:pre-wrap}',
    '.sb-bot{background:#f0f0f0;color:#222;align-self:flex-start;border-bottom-left-radius:4px}',
    '.sb-user{background:' + primaryColor + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}',
    '.sb-typing{display:flex;gap:4px;padding:10px 14px;align-items:center}',
    '.sb-dot{width:7px;height:7px;background:#aaa;border-radius:50%;animation:sb-bounce .9s infinite}',
    '.sb-dot:nth-child(2){animation-delay:.2s}.sb-dot:nth-child(3){animation-delay:.4s}',
    '@keyframes sb-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',
    '#salonbot-form{display:flex;border-top:1px solid #eee;padding:8px}',
    '#salonbot-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:8px 14px;outline:none;font-size:14px}',
    '#salonbot-input:focus{border-color:' + primaryColor + '}',
    '#salonbot-send{margin-left:8px;width:36px;height:36px;border-radius:50%;border:none;background:' + primaryColor + ';color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '#salonbot-send:disabled{opacity:.5;cursor:default}',
    // ── Voice call overlay ──────────────────────────────────────────────────
    '#sb-call-overlay{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:#fff;flex-direction:column;align-items:center;justify-content:space-between;padding:24px 16px 20px;border-radius:16px;z-index:10}',
    '#sb-call-overlay.active{display:flex}',
    '#sb-call-avatar{width:72px;height:72px;border-radius:50%;background:' + primaryColor + ';display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;position:relative}',
    '#sb-call-ripple{position:absolute;inset:-8px;border-radius:50%;border:2px solid ' + primaryColor + ';opacity:0;animation:sb-ripple 2s infinite}',
    '#sb-call-ripple2{position:absolute;inset:-16px;border-radius:50%;border:2px solid ' + primaryColor + ';opacity:0;animation:sb-ripple 2s .6s infinite}',
    '@keyframes sb-ripple{0%{opacity:.5;transform:scale(.9)}100%{opacity:0;transform:scale(1.15)}}',
    '#sb-call-name{font-weight:700;font-size:16px;color:#1a1a1a;margin-top:12px}',
    '#sb-call-status{font-size:12px;color:#888;margin-top:4px;min-height:18px}',
    '#sb-call-transcript{flex:1;width:100%;margin:12px 0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;max-height:140px}',
    '.sb-tr{font-size:12px;padding:5px 9px;border-radius:10px;max-width:85%;line-height:1.4}',
    '.sb-tr-ai{background:#f0f0f0;color:#333;align-self:flex-start}',
    '.sb-tr-user{background:' + primaryColor + '22;color:#333;align-self:flex-end;text-align:right}',
    '#sb-call-controls{display:flex;align-items:center;gap:20px}',
    '.sb-ctrl{width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;transition:transform .15s,background .15s}',
    '.sb-ctrl:hover{transform:scale(1.08)}',
    '#sb-mute-btn{background:#f0f0f0;color:#444}',
    '#sb-mute-btn.muted{background:#e53e3e;color:#fff}',
    '#sb-hangup-btn{background:#e53e3e;color:#fff;width:60px;height:60px;font-size:22px}'
  ].join('');
  document.head.appendChild(style);

  // ── DOM ────────────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'salonbot-wrap';
  wrap.innerHTML = [
    '<button id="salonbot-toggle" aria-label="Open chat">\uD83D\uDCAC</button>',
    '<div id="salonbot-window" role="dialog" aria-label="' + botName + ' chat">',
    '  <div id="salonbot-header">',
    '    <span>' + botName + '</span>',
    '    <div id="salonbot-header-actions">',
    '      <button id="salonbot-call-btn" title="Start voice call" aria-label="Start voice call">\uD83D\uDCDE</button>',
    '      <button id="salonbot-close" aria-label="Close">\u2715</button>',
    '    </div>',
    '  </div>',
    '  <div id="salonbot-messages"></div>',
    '  <div id="sb-call-overlay" role="dialog" aria-label="Voice call">',
    '    <div style="display:flex;flex-direction:column;align-items:center">',
    '      <div id="sb-call-avatar">',
    '        \uD83D\uDC86',
    '        <div id="sb-call-ripple"></div>',
    '        <div id="sb-call-ripple2"></div>',
    '      </div>',
    '      <div id="sb-call-name">' + botName + '</div>',
    '      <div id="sb-call-status">Connecting\u2026</div>',
    '    </div>',
    '    <div id="sb-call-transcript"></div>',
    '    <div id="sb-call-controls">',
    '      <button id="sb-mute-btn" class="sb-ctrl" aria-label="Mute">\uD83C\uDF99\uFE0F</button>',
    '      <button id="sb-hangup-btn" class="sb-ctrl" aria-label="End call">\uD83D\uDCF5</button>',
    '    </div>',
    '  </div>',
    '  <form id="salonbot-form" autocomplete="off">',
    '    <input id="salonbot-input" type="text" placeholder="Type a message\u2026" maxlength="500" />',
    '    <button id="salonbot-send" type="submit" aria-label="Send">\u27A4</button>',
    '  </form>',
    '</div>'
  ].join('');
  document.body.appendChild(wrap);

  // ── Element refs ───────────────────────────────────────────────────────────
  var toggleBtn = document.getElementById('salonbot-toggle');
  var chatWin = document.getElementById('salonbot-window');
  var closeBtn = document.getElementById('salonbot-close');
  var messages = document.getElementById('salonbot-messages');
  var form = document.getElementById('salonbot-form');
  var input = document.getElementById('salonbot-input');
  var sendBtn = document.getElementById('salonbot-send');
  var callBtn = document.getElementById('salonbot-call-btn');
  var callOverlay = document.getElementById('sb-call-overlay');
  var callStatus = document.getElementById('sb-call-status');
  var callTranscript = document.getElementById('sb-call-transcript');
  var muteBtn = document.getElementById('sb-mute-btn');
  var hangupBtn = document.getElementById('sb-hangup-btn');

  var opened = false;

  // ── Chat helpers ───────────────────────────────────────────────────────────
  function appendMsg(text, role) {
    var div = document.createElement('div');
    div.className = 'sb-msg ' + (role === 'bot' ? 'sb-bot' : 'sb-user');
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'sb-msg sb-bot sb-typing';
    el.innerHTML = '<span class="sb-dot"></span><span class="sb-dot"></span><span class="sb-dot"></span>';
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function setLoading(on) {
    sendBtn.disabled = on;
    input.disabled = on;
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function open() {
    opened = true;
    chatWin.classList.add('open');
    toggleBtn.textContent = '\u2715';
    input.focus();
    if (!messages.hasChildNodes()) {
      appendMsg('Hi! \uD83D\uDC4B How can I help you today? Ask me about prices, deals, locations, or booking.', 'bot');
    }
  }

  function close() {
    if (callState.session) endCall();
    opened = false;
    chatWin.classList.remove('open');
    toggleBtn.textContent = '\uD83D\uDCAC';
  }

  toggleBtn.addEventListener('click', function () { opened ? close() : open(); });
  closeBtn.addEventListener('click', close);

  // ── Text chat (Anthropic / Claude) ────────────────────────────────────────
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    appendMsg(text, 'user');
    setLoading(true);

    var typing = showTyping();

    fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: sessionId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        messages.removeChild(typing);
        appendMsg(data.reply || 'Sorry, I couldn\'t respond. Please try again.', 'bot');
      })
      .catch(function () {
        messages.removeChild(typing);
        appendMsg('Network error. Please check your connection and try again.', 'bot');
      })
      .finally(function () {
        setLoading(false);
        input.focus();
      });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // VOICE CALL  —  Gemini Live Audio
  //
  // Architecture:
  //   Browser mic → ScriptProcessor → 16-bit PCM → Gemini Live session
  //   Gemini audio response (PCM chunks) → AudioContext playback
  //   Gemini tool calls → POST /api/voice-tool (Express) → SQLite → response
  //
  // The Gemini API key is fetched at call-start from GET /api/gemini-key
  // (never stored in this file). The @google/genai SDK is lazy-loaded from
  // genai-bundle.js is loaded from the server on first call — no CDN needed.
  // ══════════════════════════════════════════════════════════════════════════

  var callState = {
    session: null,
    audioCtx: null,
    stream: null,
    processor: null,
    muted: false,
    nextPlayTime: 0,
    activeSrcs: [],
    buzzInterval: null,
    geminiKey: null
  };

  // ── Voice persona system instruction ─────────────────────────────────────
  function buildVoiceInstruction() {
    return [
      'You are a friendly AI receptionist for "' + botName + '".',
      'You are on a LIVE VOICE CALL. Be concise — no markdown, no bullet points, no lists.',
      'Current time: ' + new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }) + ' (Pakistan Standard Time).',
      '',
      'AVAILABLE TOOLS:',
      'get_services — all services and prices',
      'get_deals — active promotions',
      'get_branches — branch locations and phone numbers',
      'get_timings — salon opening hours',
      'create_booking — book appointment (needs: customer_name, phone, service, branch, date YYYY-MM-DD, time HH:MM)',
      'find_bookings — look up bookings by customer name',
      '',
      'RULES:',
      '- Greet the caller warmly as soon as connected.',
      '- Match the caller language: English or Urdu only.',
      '- No religious greetings.',
      '- Collect booking info one field at a time.',
      '- Call get_timings before confirming any time slot.',
      '- Never invent services or prices — always call get_services.',
      '- Keep each response under 3 sentences.'
    ].join('\n');
  }

  // ── Gemini tool declarations ──────────────────────────────────────────────
  var voiceTools = [{
    functionDeclarations: [
      { name: 'get_services', description: 'Returns all salon services with names, prices, descriptions.', parameters: { type: 'OBJECT', properties: {} } },
      { name: 'get_deals', description: 'Returns active promotional deals.', parameters: { type: 'OBJECT', properties: {} } },
      { name: 'get_branches', description: 'Returns salon branches with addresses and phone numbers.', parameters: { type: 'OBJECT', properties: {} } },
      { name: 'get_timings', description: 'Returns opening hours for workdays and weekends.', parameters: { type: 'OBJECT', properties: {} } },
      {
        name: 'create_booking',
        description: 'Creates a new appointment. Call get_timings first to validate the time.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customer_name: { type: 'STRING', description: 'Full name of the customer' },
            phone: { type: 'STRING', description: 'Customer phone number' },
            service: { type: 'STRING', description: 'Exact service name from get_services' },
            branch: { type: 'STRING', description: 'Branch name from get_branches' },
            date: { type: 'STRING', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'STRING', description: 'Time in HH:MM 24-hour format' },
            notes: { type: 'STRING', description: 'Optional notes' }
          },
          required: ['customer_name', 'phone', 'service', 'branch', 'date', 'time']
        }
      },
      {
        name: 'find_bookings',
        description: 'Finds existing bookings by customer name.',
        parameters: {
          type: 'OBJECT',
          properties: { customer_name: { type: 'STRING', description: 'Name to search for' } },
          required: ['customer_name']
        }
      }
    ]
  }];

  // ── Fetch Gemini key from server (cached after first fetch) ───────────────
  function getGeminiKey() {
    if (callState.geminiKey) return Promise.resolve(callState.geminiKey);
    return fetch(baseUrl + '/api/gemini-key')
      .then(function (r) {
        if (!r.ok) throw new Error('Voice calls not available right now.');
        return r.json();
      })
      .then(function (d) {
        callState.geminiKey = d.key;
        return d.key;
      });
  }

  // ── Lazy-load @google/genai from self-hosted bundle (runs once) ─────────
  // genai-bundle.js is built by: npx esbuild and served as a static file.
  // This avoids any CDN dependency — works behind firewalls and on intranets.
  // The IIFE sets window.SalonBotGenAI = { GoogleGenAI, Modality }.
  var _genaiPromise = null;
  function loadGenAI() {
    if (_genaiPromise) return _genaiPromise;
    if (window.SalonBotGenAI) return Promise.resolve(window.SalonBotGenAI);
    _genaiPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = baseUrl + '/genai-bundle.js';
      s.onload = function () {
        if (window.SalonBotGenAI) {
          resolve(window.SalonBotGenAI);
        } else {
          _genaiPromise = null;
          reject(new Error('Voice library loaded but exports are missing.'));
        }
      };
      s.onerror = function () {
        _genaiPromise = null;
        reject(new Error('Could not load voice library. Check your network.'));
      };
      document.head.appendChild(s);
    });
    return _genaiPromise;
  }

  // ── PCM / audio utilities (ported from audioUtils.ts) ────────────────────
  function floatTo16BitPCM(f32) {
    var out = new Int16Array(f32.length);
    for (var i = 0; i < f32.length; i++) {
      var s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function pcmToBase64(pcm) {
    var bytes = new Uint8Array(pcm.buffer);
    var bin = '';
    for (var i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToFloat32(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var pcm = new Int16Array(bytes.buffer);
    var f32 = new Float32Array(pcm.length);
    for (var j = 0; j < pcm.length; j++) f32[j] = pcm[j] / 32768.0;
    return f32;
  }

  // ── Audio playback (sequential chunk scheduling) ──────────────────────────
  function playAudioChunk(b64) {
    if (!callState.audioCtx) return;
    var f32 = base64ToFloat32(b64);
    var buf = callState.audioCtx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    var src = callState.audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(callState.audioCtx.destination);
    var now = callState.audioCtx.currentTime;
    var start = Math.max(now, callState.nextPlayTime);
    src.start(start);
    callState.nextPlayTime = start + buf.duration;
    callState.activeSrcs.push(src);
    src.onended = function () {
      callState.activeSrcs = callState.activeSrcs.filter(function (s) { return s !== src; });
    };
  }

  function stopAllAudio() {
    callState.activeSrcs.forEach(function (s) {
      try { s.stop(); s.disconnect(); } catch (e) { }
    });
    callState.activeSrcs = [];
    callState.nextPlayTime = 0;
  }

  // ── Connecting ringtone (double-beep) ─────────────────────────────────────
  function startRingtone() {
    if (callState.buzzInterval || !callState.audioCtx) return;
    function beep(offset) {
      if (!callState.audioCtx || callState.audioCtx.state === 'closed') return;
      var osc = callState.audioCtx.createOscillator();
      var gain = callState.audioCtx.createGain();
      var t = callState.audioCtx.currentTime + offset;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
      gain.gain.setValueAtTime(0.22, t + 0.15);
      gain.gain.linearRampToValueAtTime(0, t + 0.21);
      osc.connect(gain);
      gain.connect(callState.audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    }
    function twice() { beep(0); beep(0.32); }
    twice();
    callState.buzzInterval = setInterval(twice, 2200);
  }

  function stopRingtone() {
    if (callState.buzzInterval) { clearInterval(callState.buzzInterval); callState.buzzInterval = null; }
  }

  // ── Microphone capture → PCM → Gemini ────────────────────────────────────
  function startMicrophone() {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        callState.stream = stream;
        var src = callState.audioCtx.createMediaStreamSource(stream);
        var proc = callState.audioCtx.createScriptProcessor(4096, 1, 1);
        callState.processor = proc;

        proc.onaudioprocess = function (e) {
          if (!callState.session || callState.muted) return;
          var pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
          callState.session.sendRealtimeInput({
            media: { data: pcmToBase64(pcm), mimeType: 'audio/pcm;rate=16000' }
          });
        };

        src.connect(proc);
        proc.connect(callState.audioCtx.destination);
      });
  }

  // ── Execute tool via server proxy ─────────────────────────────────────────
  function executeTool(name, args) {
    return fetch(baseUrl + '/api/voice-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, args: args || {} })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.result; })
      .catch(function (err) { return { error: err.message }; });
  }

  // ── Call overlay helpers ──────────────────────────────────────────────────
  function setCallStatus(txt) { callStatus.textContent = txt; }

  function addTranscript(txt, isAI) {
    if (!txt || !txt.trim()) return;
    var d = document.createElement('div');
    d.className = 'sb-tr ' + (isAI ? 'sb-tr-ai' : 'sb-tr-user');
    d.textContent = txt.trim();
    callTranscript.appendChild(d);
    callTranscript.scrollTop = callTranscript.scrollHeight;
    while (callTranscript.children.length > 20) callTranscript.removeChild(callTranscript.firstChild);
  }

  function showCallOverlay() {
    callTranscript.innerHTML = '';
    setCallStatus('Connecting\u2026');
    callOverlay.classList.add('active');
    form.style.display = 'none';
    callBtn.disabled = true;
  }

  function hideCallOverlay() {
    callOverlay.classList.remove('active');
    form.style.display = '';
    callBtn.disabled = false;
    muteBtn.classList.remove('muted');
    muteBtn.textContent = '\uD83C\uDF99\uFE0F';
  }

  // ── Start voice call ──────────────────────────────────────────────────────
  function startCall() {
    if (callState.session) return;
    if (!opened) open();
    showCallOverlay();

    // AudioContext must be created inside a user gesture
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('not supported');
      callState.audioCtx = new AC({ sampleRate: 16000 });
      if (callState.audioCtx.state === 'suspended') callState.audioCtx.resume();
    } catch (e) {
      hideCallOverlay();
      appendMsg('\u26A0\uFE0F Your browser does not support real-time audio calls.', 'bot');
      return;
    }

    startRingtone();

    Promise.all([getGeminiKey(), loadGenAI()])
      .then(function (res) {
        var apiKey = res[0];
        var GoogleGenAI = res[1].GoogleGenAI;
        var Modality = res[1].Modality;

        var ai = new GoogleGenAI({ apiKey: apiKey });

        return ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            systemInstruction: buildVoiceInstruction(),
            tools: voiceTools,
            outputAudioTranscription: {},
            inputAudioTranscription: {}
          },
          callbacks: {
            onopen: function () {
              stopRingtone();
              setCallStatus('Connected');
              startMicrophone().catch(function (err) {
                setCallStatus('Mic error');
                addTranscript('\u26A0\uFE0F Microphone access denied. Please allow it in your browser and try again.', true);
              });
            },

            onmessage: function (msg) {
              // Model audio + transcription
              var sc = msg.serverContent;
              if (sc && sc.modelTurn && sc.modelTurn.parts) {
                sc.modelTurn.parts.forEach(function (p) {
                  if (p.inlineData && p.inlineData.data) playAudioChunk(p.inlineData.data);
                  if (p.text && !p.thought) addTranscript(p.text, true);
                });
              }
              // Input (user) transcription
              if (sc && sc.inputTranscription && sc.inputTranscription.text) {
                addTranscript(sc.inputTranscription.text, false);
              }
              // Barge-in: user spoke while AI was talking
              if (sc && sc.interrupted) stopAllAudio();

              // Tool calls: send each to server then return all responses together
              if (msg.toolCall && msg.toolCall.functionCalls) {
                var calls = msg.toolCall.functionCalls;
                var done = 0;
                var resps = [];
                calls.forEach(function (call) {
                  executeTool(call.name, call.args).then(function (result) {
                    resps.push({ name: call.name, id: call.id, response: { result: result } });
                    done++;
                    if (done === calls.length && callState.session) {
                      callState.session.sendToolResponse({ functionResponses: resps });
                    }
                  });
                });
              }
            },

            onclose: function () {
              if (callState.session) {
                cleanupCall();
                setCallStatus('Call ended');
                setTimeout(hideCallOverlay, 1500);
              }
            },

            onerror: function (err) {
              console.error('[SalonBot voice]', err);
              setCallStatus('Connection error');
              cleanupCall();
              setTimeout(hideCallOverlay, 2000);
            }
          }
        });
      })
      .then(function (session) {
        callState.session = session;
      })
      .catch(function (err) {
        console.error('[SalonBot voice] startCall failed:', err);
        stopRingtone();
        cleanupCall();
        hideCallOverlay();
        appendMsg('\u26A0\uFE0F ' + (err.message || 'Could not start voice call. Please try again.'), 'bot');
      });
  }

  // ── Cleanup (shared by endCall + error paths) ─────────────────────────────
  function cleanupCall() {
    stopRingtone();
    stopAllAudio();
    if (callState.processor) { try { callState.processor.disconnect(); } catch (e) { } callState.processor = null; }
    if (callState.stream) { callState.stream.getTracks().forEach(function (t) { t.stop(); }); callState.stream = null; }
    if (callState.audioCtx && callState.audioCtx.state !== 'closed') { try { callState.audioCtx.close(); } catch (e) { } }
    callState.audioCtx = null;
    callState.session = null;
    callState.nextPlayTime = 0;
    callState.activeSrcs = [];
    callState.muted = false;
  }

  // ── End call (user presses hangup) ────────────────────────────────────────
  function endCall() {
    if (callState.session) { try { callState.session.close(); } catch (e) { } }
    cleanupCall();
    setCallStatus('Call ended');
    setTimeout(hideCallOverlay, 1200);
  }

  // ── Button events ─────────────────────────────────────────────────────────
  callBtn.addEventListener('click', startCall);

  muteBtn.addEventListener('click', function () {
    callState.muted = !callState.muted;
    muteBtn.classList.toggle('muted', callState.muted);
    muteBtn.textContent = callState.muted ? '\uD83D\uDD07' : '\uD83C\uDF99\uFE0F';
  });

  hangupBtn.addEventListener('click', endCall);

})();
