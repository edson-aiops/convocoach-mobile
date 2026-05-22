import { SYSTEM_PROMPTS, DAILY_SCENARIOS } from './prompts.js';

const APP_VERSION = '1.7.1';

/* ===================== SERVICE WORKER ===================== */
let swRegistration = null;
let swUpdateReady = false;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    swRegistration = reg;
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          swUpdateReady = true;
          const badge = document.getElementById('update-available');
          if (badge) badge.hidden = false;
        }
      });
    });
  }).catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

/* ===================== INSTALL PROMPT ===================== */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.hidden = true;
});

/* ===================== STATE ===================== */
const state = {
  screen: 'setup',
  mode: null, // 'tech' | 'care' | 'daily'
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
      model: 'llama-3.3-70b-versatile',
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
  daily: document.getElementById('daily-screen'),
  family: document.getElementById('family-screen'),
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
  if (name === 'daily') renderDailyPicker();
  if (name === 'family') renderFamilyPicker();
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
      <div class="setup-section">
        <label>Versão do app</label>
        <div class="row" style="justify-content:space-between;align-items:center;">
          <span class="text-muted">v${APP_VERSION} <span id="update-available" class="update-pill" hidden>nova versão disponível</span></span>
          <button id="update-btn" class="btn btn-secondary" style="width:auto;">🔄 Atualizar</button>
        </div>
      </div>
      <button id="save-setup" class="btn btn-primary">Salvar</button>
      <button id="goto-home" class="btn btn-secondary">Voltar</button>
    </div>
  `;
  populateVoiceSelect();
  document.getElementById('save-setup').onclick = () => {
    state.settings.apiKey = document.getElementById('api-key').value.trim();
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
  const updateBtn = document.getElementById('update-btn');
  if (updateBtn) {
    const badge = document.getElementById('update-available');
    if (swUpdateReady && badge) badge.hidden = false;
    updateBtn.onclick = async () => {
      if (!('serviceWorker' in navigator) || !swRegistration) {
        toast('Atualização indisponível neste navegador.');
        return;
      }
      updateBtn.disabled = true;
      updateBtn.textContent = '🔄 Verificando…';
      try {
        await swRegistration.update();
        const waiting = swRegistration.waiting;
        if (waiting) {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          toast('Atualizando para a versão nova…');
          setTimeout(() => window.location.reload(), 3000);
        } else {
          updateBtn.disabled = false;
          updateBtn.textContent = '🔄 Atualizar';
          toast('Você já está na versão mais recente.');
        }
      } catch (e) {
        updateBtn.disabled = false;
        updateBtn.textContent = '🔄 Atualizar';
        toast('Não foi possível verificar agora. Tente de novo.');
      }
    };
  }
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
  const lastDaily = reports.filter(r => r.mode === 'daily').pop();
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
      <div class="mode-card daily" data-mode="daily">
        <h2>🌟 Dia a Dia</h2>
        <p>Restaurante, viagem, compras e conversa livre.</p>
        <div class="stat">🔥 ${streak.count} dias · ${lastDaily ? 'CEFR: ' + lastDaily.cefr_estimate : 'Iniciar'}</div>
      </div>
      <div class="mode-card family" data-mode="family">
        <h2>👨‍👩‍👧‍👦 Família</h2>
        <p>Inglês para o Pedro e a Manu.</p>
        <div class="stat">Pedro & Manu</div>
      </div>
    </div>
    <button id="home-history" class="btn btn-secondary">📜 Histórico</button>
    <button id="install-btn" class="btn btn-secondary" hidden>📲 Instalar app</button>
    <div class="version-badge">v${APP_VERSION}</div>
  `;
  document.getElementById('home-gear').onclick = () => showScreen('setup');
  document.getElementById('home-history').onclick = () => showScreen('history');
  screens.home.querySelectorAll('.mode-card').forEach(card => {
    card.onclick = () => {
      if (card.dataset.mode === 'daily') showScreen('daily');
      else if (card.dataset.mode === 'family') showScreen('family');
      else startMode(card.dataset.mode);
    };
  });
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    if (deferredInstallPrompt) installBtn.hidden = false;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIOS && !isStandalone) {
      installBtn.hidden = false;
      installBtn.textContent = '📲 Como instalar';
    }
    installBtn.onclick = async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installBtn.hidden = true;
      } else if (isIOS) {
        toast('No iPhone: toque em Compartilhar → "Adicionar à Tela de Início"');
      } else {
        toast('App já instalado ou instalação indisponível neste navegador.');
      }
    };
  }
}

function startMode(mode) {
  state.mode = mode;
  state.messages = [];
  state.cleanTurns = 0;
  state.expectingReport = false;
  state.endSessionRequested = false;
  state.sessionStart = Date.now();
  setAccent(mode);
  showScreen('chat');
  primeTTS();
  sendSystemOpening();
}

function renderDailyPicker() {
  let selectedPerson = state.dailyName || 'Edson';
  const updatePersonButtons = () => {
    const edsonBtn = document.getElementById('person-edson');
    const anaBtn = document.getElementById('person-ana');
    if (edsonBtn) edsonBtn.classList.toggle('active', selectedPerson === 'Edson');
    if (anaBtn) anaBtn.classList.toggle('active', selectedPerson === 'Ana Paula');
  };
  screens.daily.innerHTML = `
    <div class="daily-scroll">
      <div class="daily-section">
        <h2>🌟 Dia a Dia</h2>
        <p>Escolha quem está praticando e o cenário.</p>
      </div>
      <div class="daily-section">
        <label>Quem está praticando?</label>
        <div class="person-toggle">
          <button id="person-edson" class="btn btn-secondary">Edson</button>
          <button id="person-ana" class="btn btn-secondary">Ana Paula</button>
        </div>
      </div>
      <div class="daily-section">
        <label>Cenário</label>
        <div class="scenario-grid">
          ${Object.entries(DAILY_SCENARIOS).map(([key, s]) => `
            <button class="mode-card daily" data-scenario="${key}">
              <h2>${s.label}</h2>
            </button>
          `).join('')}
        </div>
      </div>
      <button id="daily-back" class="btn btn-secondary">Voltar</button>
    </div>
  `;
  updatePersonButtons();
  document.getElementById('person-edson').onclick = () => { selectedPerson = 'Edson'; updatePersonButtons(); };
  document.getElementById('person-ana').onclick = () => { selectedPerson = 'Ana Paula'; updatePersonButtons(); };
  screens.daily.querySelectorAll('.scenario-grid .mode-card').forEach(card => {
    card.onclick = () => startDaily(card.dataset.scenario, selectedPerson);
  });
  document.getElementById('daily-back').onclick = () => showScreen('home');
}

function startDaily(scenarioKey, personName) {
  state.mode = 'daily';
  state.dailyScenario = scenarioKey;
  state.dailyName = personName;
  state.messages = [];
  state.cleanTurns = 0;
  state.expectingReport = false;
  state.endSessionRequested = false;
  state.sessionStart = Date.now();
  setAccent('daily');
  showScreen('chat');
  primeTTS();
  sendSystemOpening();
}

function renderFamilyPicker() {
  screens.family.innerHTML = `
    <div class="daily-scroll">
      <div class="daily-section">
        <h2>👨‍👩‍👧‍👦 Família</h2>
        <p>Quem vai praticar hoje?</p>
      </div>
      <div class="scenario-grid">
        <button class="mode-card teen" data-person="teen">
          <h2>🎮 Pedro</h2>
          <p style="font-size:0.8rem;color:var(--muted);">Conversa para teen</p>
        </button>
        <button class="mode-card kids" data-person="kids">
          <h2>☀️ Manu</h2>
          <p style="font-size:0.8rem;color:var(--muted);">Joguinhos de inglês</p>
        </button>
      </div>
      <button id="family-back" class="btn btn-secondary">Voltar</button>
    </div>
  `;
  screens.family.querySelectorAll('.scenario-grid .mode-card').forEach(card => {
    card.onclick = () => startFamily(card.dataset.person);
  });
  document.getElementById('family-back').onclick = () => showScreen('home');
}

function startFamily(person) {
  state.mode = person; // 'teen' or 'kids'
  state.messages = [];
  state.cleanTurns = 0;
  state.expectingReport = false;
  state.endSessionRequested = false;
  state.sessionStart = Date.now();
  setAccent(person);
  showScreen('chat');
  primeTTS();
  sendSystemOpening();
}

function setAccent(mode) {
  const accent = mode === 'care' ? 'var(--accent-care)' : mode === 'daily' ? 'var(--accent-daily)' : mode === 'teen' ? 'var(--accent-teen)' : mode === 'kids' ? 'var(--accent-kids)' : 'var(--accent-tech)';
  document.documentElement.style.setProperty('--accent', accent);
}

/* ===================== GROQ CLIENT ===================== */
function buildSystemPrompt(mode) {
  if (mode === 'daily') {
    const name = state.dailyName || 'Edson';
    const scenario = DAILY_SCENARIOS[state.dailyScenario] || DAILY_SCENARIOS.free;
    const scenarioContext = scenario.context.replace(/\{\{LEARNER_NAME\}\}/g, name);
    return SYSTEM_PROMPTS.daily
      .replace(/\{\{SCENARIO\}\}/g, scenarioContext)
      .replace(/\{\{LEARNER_NAME\}\}/g, name);
  }
  if (mode === 'teen') {
    return SYSTEM_PROMPTS.teen.replace(/\{\{LEARNER_NAME\}\}/g, 'Pedro');
  }
  if (mode === 'kids') {
    return SYSTEM_PROMPTS.kids.replace(/\{\{LEARNER_NAME\}\}/g, 'Manu');
  }
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
  return /^(stop|chega|acabamos|tchau|acabou)\b/i.test(t);
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
      if (bubble) {
        bubble.textContent = 'Erro ao carregar resposta. Toque para tentar novamente.';
        bubble.style.cursor = 'pointer';
        bubble.onclick = () => { bubble.style.cursor = ''; bubble.onclick = null; sendSystemOpening(); };
      }
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
  const maxTokens = state.expectingReport ? 2000 : 600;
  streamResponse(state.messages, {
    maxTokens,
    onToken: (_delta, full) => {
      if (bubble) bubble.textContent = state.expectingReport
        ? full.replace(/<!--REPORT_JSON[\s\S]*$/, '')
        : full;
      if (!ttsFired && !state.expectingReport && full.includes('---')) {
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
      if (!ttsFired && !state.expectingReport) speakLine(parsed.character);
      if (state.expectingReport) {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        handleEndSession(full);
      } else {
        maybeTrackCleanTurn(full);
      }
    },
    onError: (msg) => {
      toast(msg, 'danger');
      if (bubble) {
        bubble.textContent = 'Erro. Toque para tentar novamente.';
        bubble.style.cursor = 'pointer';
        bubble.onclick = () => {
          bubble.style.cursor = ''; bubble.onclick = null;
          bubble.textContent = '';
          state.streaming = true;
          let ttsFired = false;
          const maxTokens = state.expectingReport ? 2000 : 600;
          streamResponse(state.messages, {
            maxTokens,
            onToken: (_delta, full) => {
              if (bubble) bubble.textContent = full;
              if (!ttsFired && !state.expectingReport && full.includes('---')) {
                const parts = full.split('---');
                if (parts[0].trim().length > 10) { ttsFired = true; speakLine(parts[0]); }
              }
              scrollChatToBottom();
            },
            onDone: (full) => {
              const parsed = parseTutorContent(full);
              if (bubble) renderTutorBubble(bubble, parsed);
              state.messages.push({ role:'assistant', content: full });
              if (!ttsFired && !state.expectingReport) speakLine(parsed.character);
              if (state.expectingReport) {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                handleEndSession(full);
              } else {
                maybeTrackCleanTurn(full);
              }
            },
            onError: (m2) => {
              toast(m2, 'danger');
              if (bubble) bubble.textContent = 'Erro. Toque para tentar novamente.';
            }
          });
        };
      }
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
  if (window.speechSynthesis) window.speechSynthesis.cancel();
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
      if (state.cleanTurns > 0 && state.mode !== 'kids') {
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
  const isKids = state.mode === 'kids';
  screens.chat.classList.toggle('kids', isKids);
  const title = state.mode === 'care' ? '🏥 Care' : state.mode === 'daily' ? '🌟 Dia a Dia' : state.mode === 'teen' ? '🎮 Pedro' : state.mode === 'kids' ? '☀️ Manu' : '💻 Tech';
  screens.chat.innerHTML = `
    <div class="chat-header">
      <div class="title">
        <h2>${title}</h2>
        <span class="streak">🔥 ${streak.count}</span>
      </div>
      <div class="row" style="gap:10px;align-items:center;">
        <span class="text-muted" style="font-size:0.8rem;">✨ ${state.cleanTurns} clean</span>
        <button id="end-session" class="btn btn-danger" style="padding:8px 10px; font-size:0.85rem;">Encerrar</button>
      </div>
    </div>
    ${!navigator.onLine ? '<div class="text-center" style="padding:6px; background:rgba(255,92,92,0.15); color:var(--danger); font-size:0.8rem; border-radius:8px; margin-bottom:6px;">⚠️ Sem internet — o chat precisa de conexão</div>' : ''}
    <div id="chat-messages" class="chat-messages"></div>
    <div id="interim" class="interim"></div>
    <div class="composer">
      <div class="composer-row">
        ${isKids ? '' : `<input id="chat-input" placeholder="Digite em inglês..." autocomplete="off" />`}
        ${hasSTT() ? `<button id="mic-btn" class="mic-btn">🎙️</button>` : ''}
        ${isKids ? '' : `<button id="send-btn" class="send-btn">➤</button>`}
      </div>
      ${!hasSTT() ? '<div class="text-muted text-center" style="font-size:0.8rem;">Ditado por voz não disponível neste navegador — use o teclado.</div>' : ''}
    </div>
  `;
  if (!isKids) {
    const input = document.getElementById('chat-input');
    const send = () => { primeTTS(); sendUserMessage(input.value); input.value = ''; };
    document.getElementById('send-btn').onclick = send;
    input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
  }
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
  const translateBtn = document.createElement('button');
  translateBtn.className = 'replay-btn';
  translateBtn.textContent = '🇧🇷 Traduzir';
  const translationDiv = document.createElement('div');
  translationDiv.className = 'translation';
  translationDiv.style.display = 'none';
  let translated = false;
  translateBtn.onclick = async () => {
    if (translated) {
      const showing = translationDiv.style.display !== 'none';
      translationDiv.style.display = showing ? 'none' : 'block';
      translateBtn.textContent = showing ? '🇧🇷 Traduzir' : '🇧🇷 Ocultar';
      return;
    }
    translateBtn.textContent = '🇧🇷 Traduzindo…';
    translateBtn.disabled = true;
    const pt = await translateToPT(character);
    translateBtn.disabled = false;
    if (pt) {
      translationDiv.textContent = pt;
      translationDiv.style.display = 'block';
      translated = true;
      translateBtn.textContent = '🇧🇷 Ocultar';
    } else {
      translateBtn.textContent = '🇧🇷 Traduzir';
      toast('Erro ao traduzir', 'danger');
    }
  };
  bubble.appendChild(translateBtn);
  bubble.appendChild(translationDiv);
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
  if ((!state.settings.tts && state.mode !== 'kids') || !window.speechSynthesis) return;
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

async function translateToPT(text) {
  const key = state.settings.apiKey;
  if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: state.settings.model,
        messages: [
          { role: 'system', content: 'You are a translator. Translate the user English text into natural Brazilian Portuguese. Return ONLY the translation — no preamble, no quotes, no explanation.' },
          { role: 'user', content: text }
        ],
        temperature: 0, max_tokens: 500, stream: false
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) { return null; }
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
    let speechDetected = false;
    let silenceTimer = null;
    rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      state.recording = true;
      btn.classList.add('recording');
      if (interim) interim.textContent = 'Ouvindo…';
      silenceTimer = setTimeout(() => { if (!speechDetected) stopRec(); }, 4000);
    };
    rec.onresult = (e) => {
      speechDetected = true;
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t;
        else interimText += t;
      }
      if (interim) interim.textContent = interimText;
    };
    rec.onerror = (e) => {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
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
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
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

  let suppressClick = false;
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { e.preventDefault(); startRec(); }
  });
  btn.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') { stopRec(); suppressClick = true; setTimeout(() => suppressClick = false, 300); }
  });
  btn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') stopRec(); });
  btn.addEventListener('click', () => {
    if (suppressClick) return;
    state.recording ? stopRec() : startRec();
  });
}

/* ===================== REPORT ===================== */
function renderReport() {
  const r = state.reportData || {};
  const raw = state.reportRaw || '';
  // Extract human-readable portion above JSON block
  let human = raw.replace(/<!--REPORT_JSON[\s\S]*?-->/, '').trim();

  if (r.mode === 'kids') {
    if (!human) {
      human = `Sessão da Manu ☀️\n\n${r.note || '—'}\n\nPalavras praticadas:\n${(r.words_practiced || []).map(w => `- ${w}`).join('\n') || '—'}`;
    }
    screens.report.innerHTML = `
      <div class="chat-header">
        <h2>☀️ Sessão da Manu</h2>
        <button id="report-close" class="btn btn-secondary" style="padding:8px 10px;">✕</button>
      </div>
      <div class="report-scroll">
        <div class="report-section">
          <h3>📝 Para os pais</h3>
          <p>${escapeHtml(r.note || '—')}</p>
        </div>
        <div class="report-section">
          <h3>🌟 Palavras praticadas</h3>
          ${(r.words_practiced || []).map(w => `<p>• ${escapeHtml(w)}</p>`).join('') || '<p class="text-muted">—</p>'}
        </div>
        <div class="row row-wrap">
          <button id="copy-report" class="btn btn-secondary grow">Copiar</button>
          <button id="dl-md" class="btn btn-secondary grow">Baixar .md</button>
        </div>
        <button id="new-session" class="btn btn-primary">Nova sessão</button>
      </div>
    `;
  } else {
    if (!human) {
      human = `# Relatório de Sessão — ${r.mode === 'care' ? 'Care' : r.mode === 'daily' ? 'Dia a Dia' : r.mode === 'teen' ? 'Pedro' : 'Tech'}\n\n` +
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
  }
  document.getElementById('report-close').onclick = () => showScreen('home');
  document.getElementById('copy-report').onclick = () => {
    navigator.clipboard.writeText(human).then(() => toast('Copiado!')).catch(() => toast('Erro ao copiar','danger'));
  };
  document.getElementById('dl-md').onclick = () => downloadFile('relatorio.md', human, 'text/markdown');
  const dlVocab = document.getElementById('dl-vocab');
  if (dlVocab) {
    dlVocab.onclick = () => {
      const vocab = getVocab().filter(v => v.mode === state.mode);
      downloadFile('vocabulario.json', JSON.stringify(vocab, null, 2), 'application/json');
    };
  }
  document.getElementById('new-session').onclick = () => {
    state.messages = [];
    state.cleanTurns = 0;
    state.expectingReport = false;
    state.endSessionRequested = false;
    state.sessionStart = Date.now();
    state.reportData = null;
    state.reportRaw = '';
    showScreen('chat');
    primeTTS();
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
      <option value="daily" ${filter==='daily'?'selected':''}>Daily</option>
      <option value="teen" ${filter==='teen'?'selected':''}>Pedro</option>
      <option value="kids" ${filter==='kids'?'selected':''}>Manu</option>
    </select>
    <div class="history-list">
      ${reports.length === 0 ? '<p class="text-muted text-center">Nenhum relatório ainda.</p>' : ''}
      ${reports.slice().reverse().map(r => {
        const modeLabel = r.mode === 'care' ? '🏥 Care' : r.mode === 'daily' ? '🌟 Dia a Dia' : r.mode === 'teen' ? '🎮 Pedro' : r.mode === 'kids' ? '☀️ Manu' : '💻 Tech';
        const subLabel = r.mode === 'kids' ? escapeHtml(r.note || '—') : `CEFR: ${escapeHtml(r.cefr_estimate || '—')}`;
        const badge = r.mode === 'kids' ? '☀️' : escapeHtml(r.cefr_estimate || '—');
        return `
        <div class="history-item" data-id="${escapeHtml(r.id)}">
          <div>
            <div><strong>${new Date(r.date).toLocaleDateString('pt-BR')}</strong> · ${modeLabel}</div>
            <div class="text-muted">${subLabel}</div>
          </div>
          <span class="badge">${badge}</span>
        </div>
      `;
      }).join('')}
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

/* ===================== NETWORK ===================== */
function updateOnlineStatus() {
  if (!navigator.onLine) {
    toast('Sem conexão. O app funciona offline, mas o chat precisa de internet.', 'danger');
  }
}
window.addEventListener('online', () => toast('Conexão restaurada'));
window.addEventListener('offline', () => toast('Sem conexão', 'danger'));

/* ===================== INIT ===================== */
const hasKey = !!state.settings.apiKey;
showScreen(hasKey ? 'home' : 'setup');
updateOnlineStatus();
