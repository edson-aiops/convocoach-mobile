import { SYSTEM_PROMPTS } from './prompts.js';

/* ===================== STATE ===================== */
const state = {
  screen: 'setup',
  mode: null, // 'tech' | 'care'
  messages: [],
  settings: loadSettings(),
  streaming: false,
  abortCtrl: null,
  interimText: '',
  recording: false,
  recognition: null,
  cleanTurns: 0,
  sessionStart: null,
};

/* ===================== STORAGE ===================== */
function loadSettings() {
  try {
    return {
      apiKey: localStorage.getItem('cc.apiKey') || '',
      model: localStorage.getItem('cc.model') || 'llama-3.3-70b-versatile',
      names: {
        tech: localStorage.getItem('cc.name.tech') || 'Edson',
        care: localStorage.getItem('cc.name.care') || 'Ana Paula',
      },
      tts: localStorage.getItem('cc.voice.tts') !== 'false',
      voiceURI: localStorage.getItem('cc.voice.voiceURI') || '',
      rate: parseFloat(localStorage.getItem('cc.voice.rate') || '1.0'),
      autoSendSTT: false,
    };
  } catch (e) { return defaultSettings(); }
}
function defaultSettings() {
  return { apiKey:'', model:'llama-3.3-70b-versatile', names:{tech:'Edson',care:'Ana Paula'}, tts:true, voiceURI:'', rate:1.0, autoSendSTT:false };
}
function saveSettings() {
  try {
    localStorage.setItem('cc.apiKey', state.settings.apiKey);
    localStorage.setItem('cc.model', state.settings.model);
    localStorage.setItem('cc.name.tech', state.settings.names.tech);
    localStorage.setItem('cc.name.care', state.settings.names.care);
    localStorage.setItem('cc.voice.tts', String(state.settings.tts));
    localStorage.setItem('cc.voice.voiceURI', state.settings.voiceURI);
    localStorage.setItem('cc.voice.rate', String(state.settings.rate));
  } catch (e) { toast('Erro ao salvar configurações','danger'); }
}
function getReports() {
  try { return JSON.parse(localStorage.getItem('cc.reports') || '[]'); } catch (e) { return []; }
}
function setReports(reports) {
  try { localStorage.setItem('cc.reports', JSON.stringify(reports)); } catch (e) {}
}
function getStreak() {
  try { return JSON.parse(localStorage.getItem('cc.streak') || '{"count":0,"lastSessionDate":""}'); } catch (e) { return {count:0,lastSessionDate:''}; }
}
function setStreak(s) {
  try { localStorage.setItem('cc.streak', JSON.stringify(s)); } catch (e) {}
}
function getVocab() {
  try { return JSON.parse(localStorage.getItem('cc.vocab') || '[]'); } catch (e) { return []; }
}
function setVocab(v) {
  try { localStorage.setItem('cc.vocab', JSON.stringify(v)); } catch (e) {}
}

/* ===================== DOM REFS ===================== */
const screens = {
  setup: document.getElementById('setup-screen'),
  home: document.getElementById('home-screen'),
  chat: document.getElementById('chat-screen'),
  report: document.getElementById('report-screen'),
  history: document.getElementById('history-screen'),
};
const toastContainer = document.getElementById('toast-container');

/* ===================== NAVIGATION ===================== */
function showScreen(name) {
  state.screen = name;
  Object.values(screens).forEach((s) => s.hidden = true);
  screens[name].hidden = false;
  if (name === 'setup') renderSetup();
  if (name === 'home') renderHome();
  if (name === 'chat') renderChat();
  if (name === 'report') renderReport();
  if (name === 'history') renderHistory();
}

/* ===================== TOAST ===================== */
function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ===================== SETUP ===================== */
function renderSetup() {
  const s = state.settings;
  screens.setup.innerHTML = `
    <div class="setup-scroll">
      <div class="setup-section">
        <h2>⚙️ Configurações</h2>
        <label for="api-key">Chave da API Groq</label>
        <input id="api-key" type="password" value="${escapeHtml(s.apiKey)}" placeholder="gsk_..." />
        <a class="help-link" href="https://console.groq.com/keys" target="_blank" rel="noopener">Como obter chave Groq ↗</a>
      </div>
      <div class="setup-section">
        <label for="model-select">Modelo</label>
        <select id="model-select">
          <option value="llama-3.3-70b-versatile" ${s.model === 'llama-3.3-70b-versatile' ? 'selected' : ''}>Llama 3.3 70B</option>
          <option value="qwen/qwen3-32b" ${s.model === 'qwen/qwen3-32b' ? 'selected' : ''}>Qwen3 32B</option>
        </select>
      </div>
      <div class="setup-section">
        <label for="name-tech">Nome (Modo Tech)</label>
        <input id="name-tech" value="${escapeHtml(s.names.tech)}" />
        <label for="name-care">Nome (Modo Care)</label>
        <input id="name-care" value="${escapeHtml(s.names.care)}" />
      </div>
      <div class="setup-section">
        <label><input type="checkbox" id="tts-toggle" ${s.tts ? 'checked' : ''} /> Ativar TTS (voz do tutor)</label>
        <label for="voice-select">Voz TTS</label>
        <select id="voice-select"></select>
        <label for="rate-slider">Velocidade: <span id="rate-val">${s.rate.toFixed(1)}</span></label>
        <input id="rate-slider" type="range" min="0.8" max="1.1" step="0.05" value="${s.rate}" />
      </div>
      <div class="setup-section">
        <label><input type="checkbox" id="auto-send" ${s.autoSendSTT ? 'checked' : ''} /> Enviar automaticamente após ditado</label>
      </div>
      <button id="save-setup" class="btn btn-primary">Salvar</button>
      <button id="goto-home" class="btn btn-secondary">Voltar</button>
    </div>
  `;
  populateVoiceSelect();
  document.getElementById('save-setup').onclick = () => {
    state.settings.apiKey = document.getElementById('api-key').value.trim();
    state.settings.model = document.getElementById('model-select').value;
    state.settings.names.tech = document.getElementById('name-tech').value.trim() || 'Edson';
    state.settings.names.care = document.getElementById('name-care').value.trim() || 'Ana Paula';
    state.settings.tts = document.getElementById('tts-toggle').checked;
    state.settings.voiceURI = document.getElementById('voice-select').value;
    state.settings.rate = parseFloat(document.getElementById('rate-slider').value);
    state.settings.autoSendSTT = document.getElementById('auto-send').checked;
    saveSettings();
    toast('Configurações salvas');
    if (state.mode) showScreen('home');
  };
  document.getElementById('goto-home').onclick = () => showScreen('home');
  const rateSlider = document.getElementById('rate-slider');
  if (rateSlider) rateSlider.oninput = (e) => { document.getElementById('rate-val').textContent = parseFloat(e.target.value).toFixed(1); };
}

function populateVoiceSelect() {
  const sel = document.getElementById('voice-select');
  if (!sel) return;
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  const enVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  const preferred = enVoices.filter(v => /ca|us|gb/.test(v.lang.toLowerCase()));
  const list = preferred.length ? preferred : enVoices;
  sel.innerHTML = '<option value="">Padrão do sistema</option>' +
    list.map(v => `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === state.settings.voiceURI ? 'selected' : ''}>${escapeHtml(v.name)} (${v.lang})</option>`).join('');
}
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    if (state.screen === 'setup') populateVoiceSelect();
  };
}

/* ===================== HOME ===================== */
function renderHome() {
  const streak = getStreak();
  const reports = getReports();
  const lastTech = reports.filter(r => r.mode === 'tech').pop();
  const lastCare = reports.filter(r => r.mode === 'care').pop();
  screens.home.innerHTML = `
    <div class="home-header">
      <h1>ConvoCoach</h1>
      <button id="home-gear" class="btn btn-secondary" style="padding:10px 12px; min-height:44px;">⚙️</button>
    </div>
    <div class="home-grid">
      <div class="mode-card tech" data-mode="tech">
        <h2>💻 Modo Tech</h2>
        <p>Entrevistas, standups e small talk canadense.</p>
        <div class="stat">🔥 ${streak.count} dias · ${lastTech ? 'CEFR: ' + lastTech.cefr_estimate : 'Iniciar'}</div>
      </div>
      <div class="mode-card care" data-mode="care">
        <h2>🏥 Modo Care</h2>
        <p>Inglês de cuidado ao paciente com precisão clínica.</p>
        <div class="stat">🔥 ${streak.count} dias · ${lastCare ? 'CEFR: ' + lastCare.cefr_estimate : 'Iniciar'}</div>
      </div>
    </div>
    <button id="home-history" class="btn btn-secondary">📜 Histórico</button>
  `;
  document.getElementById('home-gear').onclick = () => showScreen('setup');
  document.getElementById('home-history').onclick = () => showScreen('history');
  screens.home.querySelectorAll('.mode-card').forEach(card => {
    card.onclick = () => startMode(card.dataset.mode);
  });
}

function startMode(mode) {
  state.mode = mode;
  state.messages = [];
  state.cleanTurns = 0;
  state.sessionStart = Date.now();
  setAccent(mode);
  showScreen('chat');
  sendSystemOpening();
}

function setAccent(mode) {
  document.documentElement.style.setProperty('--accent', mode === 'care' ? 'var(--accent-care)' : 'var(--accent-tech)');
}

/* ===================== GROQ CLIENT ===================== */
function buildSystemPrompt(mode) {
  const name = state.settings.names[mode] || (mode === 'tech' ? 'Edson' : 'Ana Paula');
  return SYSTEM_PROMPTS[mode].replace(/\{\{LEARNER_NAME\}\}/g, name);
}

async function streamResponse(messages, opts = {}) {
  const { onToken, onDone, onError, maxTokens = 600 } = opts;
  const key = state.settings.apiKey;
  if (!key) { onError('Chave da API não configurada'); return; }
  const abort = new AbortController();
  state.abortCtrl = abort;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: state.settings.model,
        messages,
        temperature: 0.65,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: abort.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>'');
      let msg = `Erro ${res.status}`;
      if (res.status === 401) msg = 'Chave da API inválida (401)';
      else if (res.status === 429) msg = 'Muitas requisições — aguarde um momento (429)';
      else if (text) msg += ': ' + text.slice(0,200);
      onError(msg);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data:')) continue;
        const data = line.replace(/^data:\s*/, '');
        if (data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          const delta = obj.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; onToken(delta, full); }
        } catch (e) { /* ignore malformed */ }
      }
    }
    onDone(full);
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError(err.message || 'Erro de rede');
  } finally {
    state.abortCtrl = null;
    state.streaming = false;
  }
}

/* ===================== CONVERSATION ENGINE ===================== */
function isEndSessionTrigger(text) {
  const t = text.trim().toLowerCase();
  return /^(stop|chega|acabamos)\b/i.test(t);
}

function sendSystemOpening() {
  state.messages = [{ role:'system', content: buildSystemPrompt(state.mode) }];
  state.streaming = true;
  appendTutorBubble(''); // placeholder
  const bubble = lastTutorBubble();
  let ttsFired = false;
  streamResponse(state.messages, {
    onToken: (_delta, full) => {
      if (bubble) bubble.textContent = full;
      if (!ttsFired && full.includes('---')) {
        const parts = full.split('---');
        if (parts[0].trim().length > 10) {
          ttsFired = true;
          speakLine(parts[0]);
        }
      }
      scrollChatToBottom();
    },
    onDone: (full) => {
      const parsed = parseTutorContent(full);
      if (bubble) renderTutorBubble(bubble, parsed);
      state.messages.push({ role:'assistant', content: full });
      if (!ttsFired) speakLine(parsed.character);
      maybeTrackCleanTurn(full);
    },
    onError: (msg) => {
      toast(msg, 'danger');
      if (bubble) bubble.textContent = 'Erro ao carregar resposta. Toque em retry.';
    }
  });
}

function sendUserMessage(text) {
  if (!text.trim() || state.streaming) return;
  const triggerEnd = isEndSessionTrigger(text) || state.endSessionRequested;
  appendLearnerBubble(text);
  state.messages.push({ role:'user', content: text });
  if (triggerEnd) {
    state.expectingReport = true;
    state.messages.push({ role:'user', content: 'Encerrar sessão e gerar o Session Report conforme seu protocolo.' });
  }
  state.streaming = true;
  appendTutorBubble('');
  const bubble = lastTutorBubble();
  let ttsFired = false;
  const maxTokens = state.expectingReport ? 1500 : 600;
  streamResponse(state.messages, {
    maxTokens,
    onToken: (_delta, full) => {
      if (bubble) bubble.textContent = full;
      if (!ttsFired && full.includes('---')) {
        const parts = full.split('---');
        if (parts[0].trim().length > 10) {
          ttsFired = true;
          speakLine(parts[0]);
        }
      }
      scrollChatToBottom();
    },
    onDone: (full) => {
      const parsed = parseTutorContent(full);
      if (bubble) renderTutorBubble(bubble, parsed);
      state.messages.push({ role:'assistant', content: full });
      if (!ttsFired) speakLine(parsed.character);
      if (state.expectingReport) {
        handleEndSession(full);
      } else {
        maybeTrackCleanTurn(full);
      }
    },
    onError: (msg) => {
      toast(msg, 'danger');
      if (bubble) bubble.textContent = 'Erro. Toque para tentar novamente.';
    }
  });
}

function parseTutorContent(raw) {
  const text = raw || '';
  const idx = text.indexOf('---');
  if (idx === -1) return { character: text, feedback: '' };
  return {
    character: text.slice(0, idx).trim(),
    feedback: text.slice(idx + 3).trim(),
  };
}

function maybeTrackCleanTurn(full) {
  const fb = parseTutorContent(full).feedback;
  if (/Clean\.\s*Next\./i.test(fb) || /Perfect[\s\w]*Next\./i.test(fb)) {
    state.cleanTurns += 1;
  }
}

function handleEndSession(raw) {
  state.expectingReport = false;
  state.endSessionRequested = false;
  const report = parseReport(raw);
  if (report) {
    const reports = getReports();
    reports.push(report);
    setReports(reports);
    updateStreak();
    accumulateVocab(report.new_vocab || []);
  }
  state.reportData = report;
  state.reportRaw = raw;
  showScreen('report');
}

function parseReport(raw) {
  // Try JSON block first
  const m = raw.match(/<!--REPORT_JSON\s*([\s\S]*?)-->/);
  if (m) {
    try {
      const data = JSON.parse(m[1].trim());
      const report = { ...data, id: data.id || uuid(), date: data.date || new Date().toISOString(), mode: state.mode };
      if (state.cleanTurns > 0) {
        report.wins = report.wins || [];
        report.wins.unshift(`${state.cleanTurns} turn(s) limpo(s) nesta sessão`);
      }
      return report;
    } catch (e) {}
  }
  // Fallback regex parse from Portuguese headings
  const cefr = (raw.match(/Nível CEFR[^:]*:\s*(A2|B1|B2|C1)/i) || [])[1] || '';
  const wins = (raw.match(/🏆[\s\S]*?(?=🔧|📚|🎬|⏱️|$)/) || [''])[0]
    .split('\n').map(s => s.replace(/^[-\d\s)🏆]*/, '').trim()).filter(Boolean);
  const next = (raw.match(/🎬\s*Cena sugerida[^:]*:?\s*(.+)/i) || [])[1] || '';
  const mins = parseInt((raw.match(/⏱️[^\d]*(\d+)/) || [])[1] || '0', 10);
  const report = {
    id: uuid(),
    date: new Date().toISOString(),
    mode: state.mode,
    cefr_estimate: cefr,
    wins: wins.slice(0, 5),
    error_patterns: [],
    new_vocab: [],
    next_scene: next,
    active_speaking_minutes: mins,
  };
  if (state.cleanTurns > 0) report.wins.unshift(`${state.cleanTurns} turn(s) limpo(s) nesta sessão`);
  return report;
}

function updateStreak() {
  const s = getStreak();
  const t = todayStr();
  if (s.lastSessionDate === t) return; // same day, no increment
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (s.lastSessionDate === yStr || !s.lastSessionDate) {
    s.count += 1;
  } else {
    s.count = 1; // reset after skip
  }
  s.lastSessionDate = t;
  setStreak(s);
}

function accumulateVocab(items) {
  if (!items || !items.length) return;
  const vocab = getVocab();
  const existing = new Set(vocab.map(v => `${v.word}|${v.mode}`));
  for (const it of items) {
    const key = `${it.word}|${state.mode}`;
    if (!existing.has(key)) {
      vocab.push({ word: it.word, translation: it.translation, example: it.example, mode: state.mode, date: todayStr() });
    }
  }
  setVocab(vocab);
}

/* ===================== CHAT UI ===================== */
function renderChat() {
  const streak = getStreak();
  screens.chat.innerHTML = `
    <div class="chat-header">
      <div class="title">
        <h2>${state.mode === 'care' ? '🏥 Care' : '💻 Tech'}</h2>
        <span class="streak">🔥 ${streak.count}</span>
      </div>
      <div class="row" style="gap:10px;align-items:center;">
        <span class="text-muted" style="font-size:0.8rem;">✨ ${state.cleanTurns} clean</span>
        <button id="end-session" class="btn btn-danger" style="padding:8px 10px; font-size:0.85rem;">Encerrar</button>
      </div>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div id="interim" class="interim"></div>
    <div class="composer">
      <div class="composer-row">
        <input id="chat-input" placeholder="Digite em inglês..." autocomplete="off" />
        ${hasSTT() ? `<button id="mic-btn" class="mic-btn">🎙️</button>` : ''}
        <button id="send-btn" class="send-btn">➤</button>
      </div>
      ${!hasSTT() ? '<div class="text-muted text-center" style="font-size:0.8rem;">Ditado por voz não disponível neste navegador — use o teclado.</div>' : ''}
    </div>
  `;
  const input = document.getElementById('chat-input');
  const send = () => { sendUserMessage(input.value); input.value = ''; };
  document.getElementById('send-btn').onclick = send;
  input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
  document.getElementById('end-session').onclick = () => {
    state.endSessionRequested = true;
    sendUserMessage('stop');
  };
  if (hasSTT()) initMic();
  // Re-render existing messages
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  for (const msg of state.messages) {
    if (msg.role === 'user') appendLearnerBubble(msg.content);
    else if (msg.role === 'assistant') {
      const parsed = parseTutorContent(msg.content);
      const b = appendTutorBubble('');
      renderTutorBubble(b, parsed);
    }
  }
  scrollChatToBottom();
}

function appendLearnerBubble(text) {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'msg msg-learner';
  el.textContent = text;
  c.appendChild(el);
  scrollChatToBottom();
  return el;
}
function appendTutorBubble(text) {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const wrap = document.createElement('div');
  wrap.style.alignSelf = 'flex-start';
  wrap.style.maxWidth = '88%';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  const el = document.createElement('div');
  el.className = 'msg msg-tutor';
  el.textContent = text;
  wrap.appendChild(el);
  c.appendChild(wrap);
  scrollChatToBottom();
  return el;
}
function lastTutorBubble() {
  const c = document.getElementById('chat-messages');
  if (!c) return null;
  const all = c.querySelectorAll('.msg-tutor');
  return all[all.length - 1] || null;
}
function renderTutorBubble(bubble, { character, feedback }) {
  if (!bubble) return;
  const parent = bubble.parentElement;
  bubble.textContent = '';
  // Character line
  const charDiv = document.createElement('div');
  charDiv.textContent = character;
  bubble.appendChild(charDiv);
  // Replay button
  const replay = document.createElement('button');
  replay.className = 'replay-btn';
  replay.textContent = '🔊 Replay';
  replay.onclick = () => speakLine(character);
  bubble.appendChild(replay);
  // Feedback card
  if (feedback) {
    const hasSafety = /⚠️|safety|critical|constipated|intoxicated|injury|dose|wrong word/i.test(feedback);
    const card = document.createElement('div');
    card.className = 'feedback-card collapsed' + (hasSafety ? ' safety' : '');
    const header = document.createElement('div');
    header.className = 'feedback-header';
    header.innerHTML = '<span>📝 Feedback</span><span>▼</span>';
    header.onclick = () => {
      const body = card.querySelector('.feedback-body');
      const arrow = header.querySelector('span:last-child');
      const isHidden = !body || body.style.display === 'none';
      if (!body) return;
      body.style.display = isHidden ? 'flex' : 'none';
      arrow.textContent = isHidden ? '▲' : '▼';
    };
    const body = document.createElement('div');
    body.className = 'feedback-body';
    body.style.display = 'none';
    // Parse feedback lines into colored spans
    feedback.split('\n').forEach(line => {
      const div = document.createElement('div');
      const l = line.trim();
      if (!l) return;
      if (l.startsWith('✅')) div.style.color = 'var(--ok)';
      else if (l.startsWith('🔧')) div.className = 'fb-fix';
      else if (l.startsWith('💡')) div.className = 'fb-tip';
      div.textContent = l;
      body.appendChild(div);
    });
    card.appendChild(header);
    card.appendChild(body);
    parent.appendChild(card);
  }
}
function scrollChatToBottom() {
  const c = document.getElementById('chat-messages');
  if (c) c.scrollTop = c.scrollHeight;
}

/* ===================== VOICE ===================== */
let ttsPrimed = false;
function primeTTS() {
  if (ttsPrimed || !window.speechSynthesis) return;
  ttsPrimed = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

function speakLine(text) {
  if (!state.settings.tts || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = String(text)
    .replace(/^🎭\s*/, '')
    .replace(/[*_`#]/g, '')
    .trim();
  if (!clean) return;
  const utter = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices() || [];
  const chosen = voices.find(v => v.voiceURI === state.settings.voiceURI)
    || voices.find(v => /en-ca/i.test(v.lang))
    || voices.find(v => /en-us/i.test(v.lang))
    || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'))
    || null;
  if (chosen) {
    utter.voice = chosen;
    utter.lang = chosen.lang;
  } else {
    utter.lang = 'en-CA';
  }
  utter.rate = state.settings.rate || 1.0;
  window.speechSynthesis.speak(utter);
}

function hasSTT() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function initMic() {
  const btn = document.getElementById('mic-btn');
  const input = document.getElementById('chat-input');
  const interim = document.getElementById('interim');
  if (!btn || !input) return;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;

  let rec = null;
  let finalTranscript = '';

  function startRec() {
    primeTTS();
    if (rec) { try { rec.stop(); } catch(e){} }
    finalTranscript = '';
    rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      state.recording = true;
      btn.classList.add('recording');
      if (interim) interim.textContent = 'Ouvindo…';
    };
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t;
        else interimText += t;
      }
      if (interim) interim.textContent = interimText;
    };
    rec.onerror = (e) => {
      state.recording = false;
      btn.classList.remove('recording');
      if (interim) interim.textContent = '';
      const map = {
        'no-speech': 'Nenhuma fala detectada.',
        'audio-capture': 'Microfone não disponível.',
        'not-allowed': 'Permissão do microfone negada.',
      };
      toast(map[e.error] || `Erro de reconhecimento: ${e.error}`, 'danger');
    };
    rec.onend = () => {
      state.recording = false;
      btn.classList.remove('recording');
      if (interim) interim.textContent = '';
      if (finalTranscript.trim()) {
        if (state.settings.autoSendSTT) {
          sendUserMessage(finalTranscript.trim());
        } else {
          input.value = finalTranscript.trim();
          input.focus();
        }
      }
      rec = null;
    };
    try { rec.start(); } catch(e) { toast('Não foi possível iniciar o microfone','danger'); }
  }
  function stopRec() {
    if (rec) { try { rec.stop(); } catch(e){} }
  }

  // Push-to-talk: hold on pointerdown, release on pointerup/leave
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); startRec(); });
  btn.addEventListener('pointerup', () => stopRec());
  btn.addEventListener('pointerleave', () => stopRec());
  // Tap-to-toggle fallback for iOS
  btn.addEventListener('click', (e) => {
    if (!state.recording) { e.stopPropagation(); startRec(); }
    else { e.stopPropagation(); stopRec(); }
  });
}

/* ===================== REPORT ===================== */
function renderReport() {
  const r = state.reportData || {};
  const raw = state.reportRaw || '';
  // Extract human-readable portion above JSON block
  let human = raw.replace(/<!--REPORT_JSON[\s\S]*?-->/, '').trim();
  if (!human) {
    // Reconstruct from JSON
    human = `# Relatório de Sessão — ${r.mode === 'care' ? 'Care' : 'Tech'}\n\n` +
      `**Nível CEFR estimado:** ${r.cefr_estimate || '—'}\n\n` +
      `🏆 **Destaques**\n${(r.wins || []).map(w => `- ${w}`).join('\n') || '—'}\n\n` +
      `🔧 **Padrões de erro**\n${(r.error_patterns || []).map(e => `- ${e.pattern}${e.safety_critical ? ' ⚠️' : ''}`).join('\n') || '—'}\n\n` +
      `📚 **Vocabulário novo**\n${(r.new_vocab || []).map(v => `- **${v.word}**: ${v.translation} — "${v.example}"`).join('\n') || '—'}\n\n` +
      `🎬 **Próxima cena:** ${r.next_scene || '—'}\n\n` +
      `⏱️ **Tempo de fala ativa:** ${r.active_speaking_minutes || 0} min`;
  }
  screens.report.innerHTML = `
    <div class="chat-header">
      <h2>📊 Relatório</h2>
      <button id="report-close" class="btn btn-secondary" style="padding:8px 10px;">✕</button>
    </div>
    <div class="report-scroll">
      <div class="report-section">
        <h3>🎯 Nível CEFR</h3>
        <p>${escapeHtml(r.cefr_estimate || '—')}</p>
      </div>
      <div class="report-section">
        <h3>🏆 Destaques</h3>
        ${(r.wins || []).map(w => `<p>• ${escapeHtml(w)}</p>`).join('') || '<p class="text-muted">—</p>'}
      </div>
      <div class="report-section">
        <h3>🔧 Padrões de erro</h3>
        ${(r.error_patterns || []).map(e => `<p class="${e.safety_critical ? 'danger' : ''}">• ${escapeHtml(e.pattern)} ${e.safety_critical ? '⚠️' : ''}</p>`).join('') || '<p class="text-muted">—</p>'}
      </div>
      <div class="report-section">
        <h3>📚 Vocabulário novo</h3>
        ${(r.new_vocab || []).map(v => `<p><strong>${escapeHtml(v.word)}</strong> — ${escapeHtml(v.translation)}<br/><em>"${escapeHtml(v.example)}"</em></p>`).join('') || '<p class="text-muted">—</p>'}
      </div>
      <div class="report-section">
        <h3>🎬 Próxima cena</h3>
        <p>${escapeHtml(r.next_scene || '—')}</p>
      </div>
      <div class="report-section">
        <h3>⏱️ Tempo de fala ativa</h3>
        <p>${r.active_speaking_minutes || 0} min</p>
      </div>
      <div class="row row-wrap">
        <button id="copy-report" class="btn btn-secondary grow">Copiar</button>
        <button id="dl-md" class="btn btn-secondary grow">Baixar .md</button>
        <button id="dl-vocab" class="btn btn-secondary grow">Exportar vocabulário (JSON)</button>
      </div>
      <button id="new-session" class="btn btn-primary">Nova sessão</button>
    </div>
  `;
  document.getElementById('report-close').onclick = () => showScreen('home');
  document.getElementById('copy-report').onclick = () => {
    navigator.clipboard.writeText(human).then(() => toast('Copiado!')).catch(() => toast('Erro ao copiar','danger'));
  };
  document.getElementById('dl-md').onclick = () => downloadFile('relatorio.md', human, 'text/markdown');
  document.getElementById('dl-vocab').onclick = () => {
    const vocab = getVocab().filter(v => v.mode === state.mode);
    downloadFile('vocabulario.json', JSON.stringify(vocab, null, 2), 'application/json');
  };
  document.getElementById('new-session').onclick = () => {
    state.messages = [];
    state.cleanTurns = 0;
    state.sessionStart = Date.now();
    state.reportData = null;
    state.reportRaw = '';
    showScreen('chat');
    sendSystemOpening();
  };
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

/* ===================== HISTORY ===================== */
function renderHistory() {
  const all = getReports();
  const filter = state.historyFilter || 'all';
  const reports = filter === 'all' ? all : all.filter(r => r.mode === filter);
  screens.history.innerHTML = `
    <div class="chat-header">
      <h2>📜 Histórico</h2>
      <button id="hist-close" class="btn btn-secondary" style="padding:8px 10px;">✕</button>
    </div>
    <select id="hist-filter" style="margin-bottom:4px;">
      <option value="all" ${filter==='all'?'selected':''}>Todos</option>
      <option value="tech" ${filter==='tech'?'selected':''}>Tech</option>
      <option value="care" ${filter==='care'?'selected':''}>Care</option>
    </select>
    <div class="history-list">
      ${reports.length === 0 ? '<p class="text-muted text-center">Nenhum relatório ainda.</p>' : ''}
      ${reports.slice().reverse().map(r => `
        <div class="history-item" data-id="${escapeHtml(r.id)}">
          <div>
            <div><strong>${new Date(r.date).toLocaleDateString('pt-BR')}</strong> · ${r.mode === 'care' ? '🏥 Care' : '💻 Tech'}</div>
            <div class="text-muted">CEFR: ${escapeHtml(r.cefr_estimate || '—')}</div>
          </div>
          <span class="badge">${escapeHtml(r.cefr_estimate || '—')}</span>
        </div>
      `).join('')}
    </div>
    <button id="clear-hist" class="btn btn-danger">Limpar histórico</button>
  `;
  document.getElementById('hist-close').onclick = () => showScreen('home');
  const filterSel = document.getElementById('hist-filter');
  if (filterSel) filterSel.onchange = (e) => { state.historyFilter = e.target.value; renderHistory(); };
  screens.history.querySelectorAll('.history-item').forEach(item => {
    item.onclick = () => {
      const r = all.find(x => x.id === item.dataset.id);
      if (r) { state.reportData = r; state.reportRaw = ''; showScreen('report'); }
    };
  });
  document.getElementById('clear-hist').onclick = () => {
    if (!confirm('Apagar todo o histórico?')) return;
    setReports([]);
    renderHistory();
    toast('Histórico limpo');
  };
}

/* ===================== UTILS ===================== */
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function todayStr() {
  return new Date().toISOString().slice(0,10);
}

/* ===================== KEYBOARD AWARENESS ===================== */
function handleVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const app = document.getElementById('app');
  const offset = window.innerHeight - vv.height - vv.offsetTop;
  if (offset > 80) {
    // keyboard likely open
    app.style.height = `${vv.height}px`;
    app.style.overflow = 'hidden';
  } else {
    app.style.height = '';
    app.style.overflow = '';
  }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleVisualViewport);
  window.visualViewport.addEventListener('scroll', handleVisualViewport);
}

/* ===================== INIT ===================== */
const hasKey = !!state.settings.apiKey;
showScreen(hasKey ? 'home' : 'setup');
