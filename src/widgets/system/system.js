const CIRCUMFERENCE = 2 * Math.PI * 38;

function setGauge(id, percent) {
  const gauge = document.getElementById(id);
  gauge.querySelector('.fg').style.strokeDashoffset = CIRCUMFERENCE * (1 - percent / 100);
  gauge.querySelector('.value').textContent = `${percent}%`;
  gauge.classList.toggle('warn', percent >= 70 && percent < 90);
  gauge.classList.toggle('hot', percent >= 90);
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `up ${d}d ${h}h` : `up ${h}h ${m}m`;
}

async function update() {
  const s = await window.widgets.system.get();
  setGauge('cpu', s.cpu);
  setGauge('mem', s.mem);
  const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1);
  $('#memtext').textContent = `${gb(s.memUsed)} / ${gb(s.memTotal)} GB`;
  $('#uptime').textContent = formatUptime(s.uptime);
}

(async () => {
  await setupWidget('system');
  await window.widgets.system.get(); // prime the CPU delta
  setTimeout(update, 500);
  setInterval(update, 2000);
})();
