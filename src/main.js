const { app, BrowserWindow, Tray, Menu, ipcMain, shell, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { MediaBridge } = require('./media/media-bridge');
const { fetchDiscordWidget } = require('./services/discord');
const { fetchWeather } = require('./services/weather');
const { SystemMonitor } = require('./services/system');

const WIDGETS = {
  spotify: { title: 'Spotify', width: 380, height: 140 },
  discord: { title: 'Discord', width: 300, height: 380 },
  clock: { title: 'Clock', width: 300, height: 150 },
  system: { title: 'System', width: 280, height: 160 },
  weather: { title: 'Weather', width: 280, height: 180 }
};

const DEFAULT_CONFIG = require('./default-config.json');
const userDir = app.getPath('userData');
const CONFIG_PATH = path.join(userDir, 'config.json');
const STATE_PATH = path.join(userDir, 'state.json');

let config = DEFAULT_CONFIG;
let ownConfigMtime = 0;
let state = { positions: {} };
let tray = null;
const windows = new Map();
const media = new MediaBridge({ logFile: path.join(userDir, 'media.log') });
const system = new SystemMonitor();

// ---------- config & state ----------

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) writeJson(CONFIG_PATH, DEFAULT_CONFIG);
  config = deepMerge(DEFAULT_CONFIG, readJson(CONFIG_PATH, {}));
}

function saveConfig() {
  // Keep any keys the user added by hand: merge our change into what is on disk.
  writeJson(CONFIG_PATH, deepMerge(readJson(CONFIG_PATH, {}), config));
  ownConfigMtime = fs.statSync(CONFIG_PATH).mtimeMs;
}

let saveStateTimer = null;
function saveStateSoon() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => writeJson(STATE_PATH, state), 400);
}

// ---------- windows ----------

function defaultPosition(name) {
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 24;
  const names = Object.keys(WIDGETS);
  let y = workArea.y + margin;
  for (const n of names) {
    if (n === name) break;
    y += WIDGETS[n].height + 12;
  }
  const { width } = WIDGETS[name];
  // Wrap into a second column if the first one runs off the screen.
  if (y + WIDGETS[name].height > workArea.y + workArea.height) {
    return { x: workArea.x + workArea.width - width * 2 - margin * 2, y: workArea.y + margin };
  }
  return { x: workArea.x + workArea.width - width - margin, y };
}

function positionIsVisible(pos, size) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    pos.x + size.width > a.x + 20 && pos.x < a.x + a.width - 20 &&
    pos.y + 20 > a.y && pos.y < a.y + a.height - 20);
}

function createWidget(name) {
  const spec = WIDGETS[name];
  const saved = state.positions[name];
  const pos = saved && positionIsVisible(saved, spec) ? saved : defaultPosition(name);

  const win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: spec.width,
    height: spec.height,
    title: spec.title,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: config.alwaysOnTop,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'widgets', name, 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    state.positions[name] = { x, y };
    saveStateSoon();
  });
  win.on('closed', () => windows.delete(name));
  // Links inside widgets open in the default browser, never in a widget window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  windows.set(name, win);
}

function syncWindows() {
  for (const name of Object.keys(WIDGETS)) {
    const enabled = config.widgets[name] && config.widgets[name].enabled;
    const win = windows.get(name);
    if (enabled && !win) createWidget(name);
    if (!enabled && win) win.close();
  }
  media.setSource(config.widgets.spotify.source);
  media.setActive(Boolean(config.widgets.spotify.enabled));
}

function broadcast(channel, payload) {
  for (const win of windows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function reloadAll() {
  loadConfig();
  for (const win of windows.values()) {
    win.setAlwaysOnTop(config.alwaysOnTop);
    win.webContents.reload();
  }
  syncWindows();
  buildTrayMenu();
}

// ---------- tray ----------

function buildTrayMenu() {
  const widgetItems = Object.entries(WIDGETS).map(([name, spec]) => ({
    label: spec.title,
    type: 'checkbox',
    checked: Boolean(config.widgets[name] && config.widgets[name].enabled),
    click: (item) => {
      config.widgets[name].enabled = item.checked;
      saveConfig();
      syncWindows();
    }
  }));

  const menu = Menu.buildFromTemplate([
    { label: 'Desktop Widgets', enabled: false },
    { type: 'separator' },
    ...widgetItems,
    { type: 'separator' },
    {
      label: 'Lock positions',
      type: 'checkbox',
      checked: config.locked,
      click: (item) => {
        config.locked = item.checked;
        saveConfig();
        broadcast('widget:locked', config.locked);
      }
    },
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: config.alwaysOnTop,
      click: (item) => {
        config.alwaysOnTop = item.checked;
        saveConfig();
        for (const win of windows.values()) win.setAlwaysOnTop(config.alwaysOnTop);
      }
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    {
      label: 'Reset positions',
      click: () => {
        state.positions = {};
        saveStateSoon();
        for (const [name, win] of windows) {
          const { x, y } = defaultPosition(name);
          win.setPosition(x, y);
        }
      }
    },
    { label: 'Edit settings…', click: () => shell.openPath(CONFIG_PATH) },
    { label: 'Reload widgets', click: reloadAll },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Desktop Widgets');
  tray.on('click', () => {
    for (const win of windows.values()) win.showInactive();
  });
  buildTrayMenu();
}

// ---------- IPC ----------

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'spotify:', 'discord:', 'ms-settings:']);

function openExternal(url) {
  try {
    if (ALLOWED_PROTOCOLS.has(new URL(url).protocol)) shell.openExternal(url);
  } catch {
    // Ignore malformed URLs.
  }
}

function registerIpc() {
  ipcMain.handle('widget:init', (_e, name) => ({
    name,
    theme: config.theme,
    locked: config.locked,
    settings: config.widgets[name] || {}
  }));
  ipcMain.on('widget:open-external', (_e, url) => openExternal(url));

  ipcMain.handle('media:get', () => media.latest);
  ipcMain.on('media:command', (_e, command) => media.send(command));

  ipcMain.handle('discord:get', () => fetchDiscordWidget(config.widgets.discord.serverId));
  ipcMain.handle('weather:get', () => fetchWeather(config.widgets.weather));
  ipcMain.handle('system:get', () => system.sample());

  media.on('update', (data) => {
    const win = windows.get('spotify');
    if (win && !win.isDestroyed()) win.webContents.send('media:update', data);
  });
}

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    for (const win of windows.values()) win.showInactive();
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.windowswidgets.app');
    loadConfig();
    state = deepMerge({ positions: {} }, readJson(STATE_PATH, {}));
    registerIpc();
    createTray();
    syncWindows();

    // Pick up hand edits to config.json without restarting.
    let reloadTimer = null;
    fs.watchFile(CONFIG_PATH, { interval: 1500 }, (curr) => {
      if (curr.mtimeMs === ownConfigMtime) return; // our own tray-menu save
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reloadAll, 300);
    });
  });

  // Widgets live in the tray: closing every window must not quit the app.
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    fs.unwatchFile(CONFIG_PATH);
    media.stop();
    writeJson(STATE_PATH, state);
  });
}
