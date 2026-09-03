// Count one visit per tab session. This is an approximate count, not unique people.
(async () => {
  const key = 'koma-demo-visit-counted';
  let counted = false;
  let canRemember = true;
  try {
    counted = sessionStorage.getItem(key) === '1';
  } catch {
    // If browser storage is disabled, display the count without inflating it on refresh.
    canRemember = false;
  }
  try {
    const method = counted || !canRemember ? 'GET' : 'POST';
    const response = await fetch('/api/visits', { method, cache: 'no-store' });
    if (!response.ok) return;
    const visits = await response.json();
    if (!Number.isSafeInteger(visits.count) || visits.count < 0) return;
    if (method === 'POST') {
      try { sessionStorage.setItem(key, '1'); } catch { /* Display still works. */ }
    }
    document.getElementById('visit-count').textContent = visits.count.toLocaleString();
    document.getElementById('visit-counter').hidden = false;
  } catch {
    // The demo remains usable when counting is unavailable.
  }
})();
