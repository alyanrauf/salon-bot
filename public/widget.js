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
    '#salonbot-window{display:none;flex-direction:column;position:absolute;bottom:68px;right:0;width:370px;height:480px;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.2);background:#fff}',
    '#salonbot-window.open{display:flex}',
    '#salonbot-header{background:' + primaryColor + ';color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:15px}',
    '#salonbot-call{background:none;border:none;color:white;font-size:20px;cursor:pointer;padding:4px;line-height:1;}',
    '#salonbot-call:hover{opacity:.8;}',
    '#salonbot-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0}',
    '#salonbot-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:80px;font-size:14px!important}',
    '.sb-msg{max-width:80%;padding:8px 12px;border-radius:12px;font-size:14px!important;line-height:1.45;word-break:break-word;white-space:pre-wrap}',
    '.sb-msg img{height:1.2em!important;width:auto!important;vertical-align:middle!important;display:inline-block!important}',
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
    '#salonbot-send:disabled{opacity:.5;cursor:default}'
  ].join('');
  document.head.appendChild(style);

  // ── DOM ────────────────────────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'salonbot-wrap';
  wrap.innerHTML = [
    '<button id="salonbot-toggle" aria-label="Open chat">💬</button>',
    '<div id="salonbot-window" role="dialog" aria-label="' + botName + ' chat">',
    '  <div id="salonbot-header">',
    '    <span>' + botName + '</span>',
    '<button id="salonbot-call" aria-label="Voice Call">📞</button>',
    '    <button id="salonbot-close" aria-label="Close">✕</button>',
    '  </div>',
    '  <div id="salonbot-messages"></div>',
    '  <form id="salonbot-form" autocomplete="off">',
    '    <input id="salonbot-input" type="text" placeholder="Type a message…" maxlength="500" />',
    '    <button id="salonbot-send" type="submit" aria-label="Send">➤</button>',
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

  var opened = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
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

  //  GEMINI-VOICE-CALL MODAL

  function startVoiceCallModal() {
    var modal = document.createElement('div');
    modal.id = "salonbot-call-modal";
    modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.7);
    display:flex; justify-content:center; align-items:center;
    z-index:2147483647;
  `;

    modal.innerHTML = `
    <div style="background:#fff; padding:30px; border-radius:20px; width:340px; text-align:center;">
      <h2 style="margin-bottom:10px;">Voice Call</h2>
      <p id="call-status">Connecting...</p>
      <button id="call-end" style="margin-top:20px;padding:10px 20px;background:red;color:#fff;border:none;border-radius:10px;">End Call</button>
    </div>
  `;

    document.body.appendChild(modal);

    document.getElementById("call-end").onclick = function () {
      modal.remove();
      // also close WebSocket if active etc.
    };

    // Start the Gemini live call
    startVoiceCall();
  }


  // ── Gemini Voice Call ───────────────────────────────────────────────────────
  function startVoiceCall() {
    const ws = new WebSocket(
      baseUrl.replace("https", "wss").replace("http", "ws") + "/api/call"
    );

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      document.getElementById("call-status").textContent = "Connected";
      startMicrophone(ws);
    };

    // Receive model audio
    ws.onmessage = e => {
      if (typeof e.data !== "string") {
        playPCM16(e.data);
      } else {
        const msg = JSON.parse(e.data);
        if (msg.type === "text") {
          console.log("TRANSCRIPTION:", msg.text);
        }
      }
    };

    ws.onclose = () => {
      document.getElementById("call-status").textContent = "Call Ended";
    };

    window._VOICE_WS = ws;
  }

  // ── Microphone capture and sending to Gemini ─────────────────────────────
  async function startMicrophone(ws) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = e => {
      const float = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(float.length);
      for (let i = 0; i < float.length; i++)
        pcm[i] = float[i] * 32767;
      ws.send(pcm);
    };

    src.connect(processor);
    processor.connect(ctx.destination);
  }

  // ── Play PCM16 audio from Gemini ─────────────────────────────────────────
  function playPCM16(buffer) {
    const ctx = new AudioContext({ sampleRate: 16000 });
    const int16 = new Int16Array(buffer);
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++)
      float[i] = int16[i] / 32768;

    const audioBuffer = ctx.createBuffer(1, float.length, 16000);
    audioBuffer.getChannelData(0).set(float);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
  }
  
  // ── Open / close ───────────────────────────────────────────────────────────
  function open() {
    opened = true;
    chatWin.classList.add('open');
    toggleBtn.textContent = '✕';
    input.focus();
    if (!messages.hasChildNodes()) {
      appendMsg('Hi! 👋 How can I help you today? Ask me about prices, deals, locations, or booking.', 'bot');
    }
  }

  function close() {
    opened = false;
    chatWin.classList.remove('open');
    toggleBtn.textContent = '💬';
  }

  toggleBtn.addEventListener('click', function () { opened ? close() : open(); });

  var callBtn = document.getElementById('salonbot-call');
  callBtn.addEventListener('click', function () {
    // TODO: trigger your call UI
    startVoiceCallModal();
  })

  closeBtn.addEventListener('click', close);

  // ── Send message ───────────────────────────────────────────────────────────
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

  // Enter sends (but Shift+Enter is not relevant since it's a single-line input)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
})();
