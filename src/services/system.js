const os = require('os');

/** CPU load is measured between consecutive samples, so the first call primes it. */
class SystemMonitor {
  constructor() {
    this.previous = this.cpuTimes();
  }

  cpuTimes() {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
      for (const [kind, ms] of Object.entries(cpu.times)) {
        total += ms;
        if (kind === 'idle') idle += ms;
      }
    }
    return { idle, total };
  }

  sample() {
    const now = this.cpuTimes();
    const idle = now.idle - this.previous.idle;
    const total = now.total - this.previous.total;
    this.previous = now;

    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    return {
      cpu: total > 0 ? Math.round(100 * (1 - idle / total)) : 0,
      cpuModel: (os.cpus()[0] || {}).model || 'CPU',
      cores: os.cpus().length,
      memUsed: usedMem,
      memTotal: totalMem,
      mem: Math.round((100 * usedMem) / totalMem),
      uptime: os.uptime(),
      host: os.hostname()
    };
  }
}

module.exports = { SystemMonitor };
