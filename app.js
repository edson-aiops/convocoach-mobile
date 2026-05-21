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

/* ===================== CHAT (stubs for next tasks) ===================== */
function renderChat() {
  // Overwritten in later tasks
}
function sendSystemOpening() {
  // Overwritten in T3
}

/* ===================== REPORT / HISTORY stubs ===================== */
function renderReport() {}
function renderHistory() {}

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

/* ===================== INIT ===================== */
const hasKey = !!state.settings.apiKey;
showScreen(hasKey ? 'home' : 'setup');
