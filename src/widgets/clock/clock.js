(async () => {
  const settings = await setupWidget('clock');
  const hour12 = Boolean(settings.hour12);

  function tick() {
    const now = new Date();
    let hours = now.getHours();
    if (hour12) {
      $('#ampm').textContent = hours < 12 ? 'AM' : 'PM';
      hours = hours % 12 || 12;
    }
    const hh = hour12 ? String(hours) : String(hours).padStart(2, '0');
    $('#hm').textContent = `${hh}:${String(now.getMinutes()).padStart(2, '0')}`;
    $('#sec').textContent = settings.showSeconds ? String(now.getSeconds()).padStart(2, '0') : '';
    $('#weekday').textContent = now.toLocaleDateString(undefined, { weekday: 'long' });
    $('#date').textContent = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  tick();
  // Align updates to the start of each second so the clock never lags visibly.
  setTimeout(() => {
    tick();
    setInterval(tick, 1000);
  }, 1000 - (Date.now() % 1000));
})();
