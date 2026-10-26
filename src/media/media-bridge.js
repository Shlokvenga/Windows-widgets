const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// PowerShell cannot read files inside app.asar, so packaged builds unpack the script.
const SCRIPT = path.join(__dirname, 'media.ps1').replace('app.asar', 'app.asar.unpacked');

/**
 * Keeps a PowerShell helper (media.ps1) running while the Spotify widget is open and
 * relays its now-playing updates. Restarts the helper if it crashes.
 */
class MediaBridge extends EventEmitter {
  constructor({ logFile } = {}) {
    super();
    this.logFile = logFile;
    if (logFile) {
      try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.writeFileSync(logFile, '');
      } catch {
        this.logFile = null;
      }
    }
    this.proc = null;
    this.active = false;
    this.source = 'Spotify';
    this.restartDelay = 1000;
    this.restartTimer = null;
    this.latest = process.platform === 'win32'
      ? { type: 'state', active: false }
      : { type: 'unsupported', message: 'Now-playing info needs Windows 10 or 11.' };
  }

  setActive(active) {
    this.active = active;
    if (active) this.start();
    else this.stop();
  }

  setSource(source) {
    const next = source == null ? 'Spotify' : String(source);
    if (next === this.source) return;
    this.source = next;
    if (this.proc) {
      this.stop();
      this.start();
    }
  }

  start() {
    if (this.proc || process.platform !== 'win32') return;
    clearTimeout(this.restartTimer);

    const proc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT, '-Source', this.source
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;

    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.type === 'state') {
        // The helper sends album art only when the track changes; keep the last one.
        if (!('art' in message) && this.latest.active && message.active &&
            message.title === this.latest.title && message.artist === this.latest.artist) {
          message.art = this.latest.art;
        }
        this.latest = message;
        this.restartDelay = 1000;
      }
      this.emit('update', message);
    });

    proc.stderr.on('data', (chunk) => this.log(chunk.toString()));
    proc.on('error', (err) => this.log(`failed to start: ${err.message}\n`));
    proc.on('exit', () => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.active) {
        this.restartTimer = setTimeout(() => this.start(), this.restartDelay);
        this.restartDelay = Math.min(this.restartDelay * 2, 30000);
      }
    });
  }

  log(text) {
    console.error('[media]', text.trim());
    if (this.logFile) fs.appendFile(this.logFile, text, () => {});
  }

  send(command) {
    if (!['playpause', 'next', 'previous', 'refresh'].includes(command)) return;
    if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(command + '\n');
  }

  stop() {
    clearTimeout(this.restartTimer);
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      proc.stdin.end();
      setTimeout(() => proc.kill(), 1000);
    }
  }
}

module.exports = { MediaBridge };
