/**
 * script.js — Smart Home Control
 *
 * PROXY = '' (empty string = same origin)
 * Works on Vercel deployment and with `vercel dev` locally.
 * No more node proxy.js needed!
 */

const PROXY = '';  // Same origin — Vercel serverless functions handle /proxy, /proxy-post, /ping

let ESP_IP  = '192.168.0.100';
let CAM_IP  = '192.168.0.105:6677';

let pollTimer   = null;
let motionLevel = 0;
let flashOn     = false;

const ts = () =>
  new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

function addLog(msg, tag, cls) {
  const box   = document.getElementById('logBox');
  const first = box.querySelector('.log-time');
  if (first && first.textContent === '--:--:--') box.innerHTML = '';
  const e = document.createElement('div');
  e.className = 'log-entry';
  e.innerHTML = `<span class="log-time">${ts()}</span><span class="log-msg">${msg}</span><span class="log-tag ${cls}">${tag}</span>`;
  box.insertBefore(e, box.firstChild);
  while (box.children.length > 40) box.removeChild(box.lastChild);
}
function clearLog() { document.getElementById('logBox').innerHTML = ''; }

function setConn(state, msg) {
  document.getElementById('connDot').className    = 'conn-dot ' + state;
  document.getElementById('connText').textContent = msg;
  document.getElementById('navDot').style.display = state === 'online' ? 'block' : 'none';
  const el = document.getElementById('infoConn');
  el.textContent = state === 'online'  ? 'Online'
                 : state === 'loading' ? 'Connecting'
                 : 'Offline';
  el.style.color = state === 'online'  ? 'var(--accent)'
                 : state === 'error'   ? 'var(--red)'
                 : 'var(--text3)';
  const heroDot    = document.getElementById('heroDot');
  const heroStatus = document.getElementById('heroStatus');
  if (heroDot && heroStatus) {
    heroDot.className = 'hero-dot ' + (state === 'online' ? 'online' : state === 'loading' ? 'loading' : 'offline');
    heroStatus.childNodes[1] && (heroStatus.childNodes[1].textContent =
      state === 'online' ? msg : state === 'loading' ? 'Connecting…' : 'Offline');
  }
}

function setProxyBanner(visible) {
  document.getElementById('proxyBanner')?.classList.toggle('visible', visible);
}

async function checkProxy() {
  try {
    await fetch(`${PROXY}/ping`, { signal: AbortSignal.timeout(4000) });
    setProxyBanner(false);
    return true;
  } catch {
    setProxyBanner(true);
    return false;
  }
}

async function connect() {
  const v = document.getElementById('esp32ip').value.trim();
  if (!v) return;
  ESP_IP = v;
  document.getElementById('infoIP').textContent = v;
  setConn('loading', 'Connecting...');
  addLog(`Connecting to ESP32 <strong>${v}</strong>`, 'SYS', 'tag-sys');
  const ok = await checkProxy();
  if (!ok) {
    addLog('Could not reach proxy endpoint', 'ERR', 'tag-off');
    setConn('error', 'Proxy error');
    return;
  }
  fetchStatus();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchStatus, 3000);
}

async function sendCmd(route) {
  const url = `/proxy?ip=${encodeURIComponent(ESP_IP)}&path=${encodeURIComponent(route)}`;
  try {
    await fetch(url);
    addLog(`Command: <strong>${route.replace(/\//g,' ').trim()}</strong>`, 'CMD', 'tag-on');
    setTimeout(fetchStatus, 500);
  } catch {
    addLog(`Command failed: <strong>${route}</strong>`, 'ERR', 'tag-off');
    setConn('error', 'Command failed');
  }
}

async function fetchStatus() {
  const url = `/proxy?ip=${encodeURIComponent(ESP_IP)}&path=/status`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error();
    const d = await r.json();
    render(d);
    setConn('online', ESP_IP);
    document.getElementById('lastUpdated').textContent = `Updated ${ts()}`;
  } catch {
    setConn('error', 'No response');
    document.getElementById('lastUpdated').textContent = 'Connection lost';
  }
}

async function sendPassword() {
  const pwd = document.getElementById('pwdInput').value.trim();
  if (!pwd) { addLog('Enter a password first', 'WARN', 'tag-off'); return; }
  try {
    await fetch(`/proxy-post?ip=${encodeURIComponent(ESP_IP)}&path=/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `password=${encodeURIComponent(pwd)}`
    });
    addLog(`Password sent to gate controller`, 'PWD', 'tag-on');
    document.getElementById('pwdInput').value = '';
  } catch {
    addLog('Password send failed', 'ERR', 'tag-off');
  }
}

function render(d) {
  if (d.temperature != null) {
    document.getElementById('tempVal').textContent = d.temperature;
    document.getElementById('humVal').textContent  = d.humidity;
  }
  const fanCard = document.getElementById('card-fan');
  const fanSvg  = document.getElementById('fanSvg');
  if (d.fan) {
    fanCard.classList.add('active'); fanSvg.classList.add('spinning');
    const b = document.getElementById('fanBadge');
    b.textContent = d.fanManual ? 'Manual on' : 'Auto on';
    b.className   = 'dcard-badge ' + (d.fanManual ? 'on' : 'auto');
    document.getElementById('fanSub').textContent =
      d.fanManual ? 'Manually activated' : `Auto — ${d.temperature}°C detected`;
  } else {
    fanCard.classList.remove('active'); fanSvg.classList.remove('spinning');
    const b = document.getElementById('fanBadge');
    b.textContent = 'Off'; b.className = 'dcard-badge';
    document.getElementById('fanSub').textContent = 'Auto mode — activates above 26 °C';
  }
  const bulbCard = document.getElementById('card-bulb');
  if (d.bulb) {
    bulbCard.classList.add('active');
    const b = document.getElementById('bulbBadge');
    b.textContent = d.bulbManual ? 'Manual on' : 'Auto on';
    b.className   = 'dcard-badge ' + (d.bulbManual ? 'on' : 'auto');
    document.getElementById('bulbSub').textContent =
      d.bulbManual ? 'Manually activated' : 'Motion detected — auto activated';
  } else {
    bulbCard.classList.remove('active');
    const b = document.getElementById('bulbBadge');
    b.textContent = 'Off'; b.className = 'dcard-badge';
    document.getElementById('bulbSub').textContent = 'Auto mode — activates on motion';
  }
  const gateCard = document.getElementById('card-gate');
  const gb = document.getElementById('gateBadge');
  if (d.gate === 'open') {
    gateCard.classList.add('active');
    gb.textContent = 'Open'; gb.className = 'dcard-badge open';
  } else {
    gateCard.classList.remove('active');
    gb.textContent = 'Closed'; gb.className = 'dcard-badge';
  }
  const motionCard = document.getElementById('card-motion');
  const mb = document.getElementById('motionBadge');
  const motionBig = document.getElementById('motionBig');
  if (d.motion) {
    motionLevel = Math.min(motionLevel + 1, 10);
    motionCard.classList.add('active');
    mb.textContent = 'Detected'; mb.className = 'dcard-badge alert';
    motionBig.textContent = 'MOTION'; motionBig.classList.add('detected');
    document.getElementById('motionSub').textContent = 'Movement detected in area';
  } else {
    motionLevel = Math.max(motionLevel - 1, 0);
    motionCard.classList.remove('active');
    mb.textContent = 'Clear'; mb.className = 'dcard-badge';
    motionBig.textContent = 'CLEAR'; motionBig.classList.remove('detected');
    document.getElementById('motionSub').textContent = 'No movement — area is clear';
  }
  document.getElementById('motionFill').style.width = (motionLevel * 10) + '%';
  const curtainCard = document.getElementById('card-curtain');
  const cb = document.getElementById('curtainBadge');
  if (d.curtain) {
    curtainCard.classList.add('active');
    cb.textContent = 'Open'; cb.className = 'dcard-badge open';
    document.getElementById('curtainSub').textContent = 'Curtain is open';
  } else {
    curtainCard.classList.remove('active');
    cb.textContent = 'Closed'; cb.className = 'dcard-badge';
    document.getElementById('curtainSub').textContent = 'Servo-controlled curtain';
  }
  const cookerCard = document.getElementById('card-cooker');
  const ckb = document.getElementById('cookerBadge');
  if (d.cooker) {
    cookerCard.classList.add('active');
    ckb.textContent = 'On'; ckb.className = 'dcard-badge on';
    document.getElementById('cookerSub').textContent = 'Cooker is running';
  } else {
    cookerCard.classList.remove('active');
    ckb.textContent = 'Off'; ckb.className = 'dcard-badge';
    document.getElementById('cookerSub').textContent = 'Manual control only';
  }
}

function camProxy(path) {
  return `/proxy?ip=${encodeURIComponent(CAM_IP)}&path=${encodeURIComponent(path)}`;
}

function applyStream() {
  const img = document.getElementById('camStream');
  if (!img) return;
  img.src = camProxy('/video');
  addLog(`Camera stream connected at <strong>${CAM_IP}</strong>`, 'CAM', 'tag-auto');
}

function connectCamera() {
  const v = document.getElementById('camip').value.trim();
  if (!v) return;
  CAM_IP = v;
  document.getElementById('camIpDisplay').textContent = v;
  applyStream();
}

function refreshStream() {
  const img = document.getElementById('camStream');
  if (!img) return;
  const src = img.src;
  img.src = '';
  setTimeout(() => { img.src = src; }, 150);
  addLog('Camera stream refreshed', 'CAM', 'tag-auto');
}

async function toggleFlash() {
  flashOn = !flashOn;
  const path = flashOn ? '/settings/torch?set=on' : '/settings/torch?set=off';
  try {
    await fetch(camProxy(path));
    const btn = document.getElementById('btnFlash');
    btn.classList.toggle('primary', flashOn);
    btn.querySelector('.flash-label').textContent = flashOn ? 'Flash ON' : 'Flash';
    addLog(`Flash <strong>${flashOn ? 'ON' : 'OFF'}</strong>`, 'CAM', 'tag-auto');
  } catch {
    addLog('Flash command failed', 'ERR', 'tag-off');
    flashOn = !flashOn;
  }
}

async function triggerFocus() {
  try {
    await fetch(camProxy('/focus'));
    addLog('Autofocus triggered', 'CAM', 'tag-auto');
  } catch { addLog('Focus command failed', 'ERR', 'tag-off'); }
}

async function setQuality(val) {
  document.getElementById('qualityVal').textContent = val + '%';
  try {
    await fetch(camProxy(`/settings/quality?set=${val}`));
    addLog(`Camera quality set to <strong>${val}%</strong>`, 'CAM', 'tag-auto');
  } catch { addLog('Quality command failed', 'ERR', 'tag-off'); }
}

async function setOrientation(val) {
  try {
    await fetch(camProxy(`/settings/orientation?set=${val}`));
    addLog(`Orientation: <strong>${val}</strong>`, 'CAM', 'tag-auto');
  } catch { addLog('Orientation command failed', 'ERR', 'tag-off'); }
}

function takeSnapshot() {
  window.open(camProxy('/shot.jpg'), '_blank');
  addLog('Snapshot taken', 'CAM', 'tag-auto');
}

function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', dark ? 'light' : 'dark');
  const icon = document.getElementById('themeIcon');
  icon.innerHTML = dark
    ? '<path d="M7 1.5A5.5 5.5 0 1 0 12.5 7 4 4 0 1 1 7 1.5z" fill="currentColor" stroke="none"/>'
    : '<circle cx="7" cy="7" r="2.5"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1 1M10.1 10.1l1 1M2.9 11.1l1-1M10.1 2.9l1-1"/>';
}

window.addEventListener('DOMContentLoaded', () => {
  checkProxy().then(ok => {
    addLog(
      ok ? 'Proxy ready — enter your ESP32 IP and click Link'
         : 'Proxy not reachable — check Vercel deployment',
      'SYS',
      ok ? 'tag-sys' : 'tag-off'
    );
  });
  document.getElementById('camIpDisplay').textContent = CAM_IP;
  applyStream();
});