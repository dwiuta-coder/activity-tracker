/* ============================================
   PULSE — AI Insight Summary Generator
   Formats last 7 days for Claude analysis
   ============================================ */

(function () {
  'use strict';

  const { getEntries } = window.PulseStore;
  const { formatDuration } = window.PulseHelpers;

  function getLast7Days() {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  function generateSummary() {
    const entries = getEntries();
    const dates = getLast7Days();
    const rangeEntries = entries.filter(e => dates.includes(e.date));

    if (rangeEntries.length === 0) {
      return 'No activity data found for the past 7 days. Start logging entries to generate a summary!';
    }

    const categories = ['Work', 'Study', 'Personal'];
    const dayNames = {};
    dates.forEach(d => {
      const dt = new Date(d + 'T00:00:00');
      dayNames[d] = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    });

    let output = 'Here is my activity log for the past 7 days:\n\n';

    categories.forEach(cat => {
      const catEntries = rangeEntries.filter(e => e.category === cat);
      const totalMins = catEntries.reduce((s, e) => s + (e.duration || 0), 0);
      const totalHours = (totalMins / 60).toFixed(1);

      output += `${cat.toUpperCase()}: ${totalHours} hours total\n`;

      if (catEntries.length === 0) {
        output += '- No entries\n';
      } else {
        // Group by date
        const byDate = {};
        catEntries.forEach(e => {
          if (!byDate[e.date]) byDate[e.date] = [];
          byDate[e.date].push(e);
        });

        dates.forEach(d => {
          if (!byDate[d]) return;
          const dayEntries = byDate[d];
          const dayMins = dayEntries.reduce((s, e) => s + (e.duration || 0), 0);
          const dayMoods = dayEntries.map(e => e.mood);
          const avgMood = (dayMoods.reduce((s, m) => s + m, 0) / dayMoods.length).toFixed(1);

          output += `- ${dayNames[d]}: ${formatDuration(dayMins)} (mood avg: ${avgMood})\n`;

          dayEntries.forEach(entry => {
            const notePart = entry.notes ? `, notes: ${entry.notes}` : '';
            output += `  • ${entry.title} — ${formatDuration(entry.duration)}, mood ${entry.mood}${notePart}\n`;
          });
        });
      }

      output += '\n';
    });

    // Summary stats
    const totalMins = rangeEntries.reduce((s, e) => s + (e.duration || 0), 0);
    const avgMood = (rangeEntries.reduce((s, e) => s + e.mood, 0) / rangeEntries.length).toFixed(1);
    const activeDays = new Set(rangeEntries.map(e => e.date)).size;

    output += `SUMMARY: ${(totalMins / 60).toFixed(1)} total hours across ${activeDays} active days, average energy ${avgMood}/5\n\n`;
    output += 'Please analyze my routine and suggest 3 incremental improvements I can make this week.';

    return output;
  }

  // Generate button
  document.getElementById('btnGenerate').addEventListener('click', () => {
    const summary = generateSummary();
    const outputEl = document.getElementById('aiOutput');
    const wrapEl = document.getElementById('aiOutputWrap');

    outputEl.textContent = summary;
    wrapEl.style.display = 'block';

    // Smooth scroll to output
    setTimeout(() => {
      wrapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  });

  // Copy button
  document.getElementById('btnCopy').addEventListener('click', async () => {
    const text = document.getElementById('aiOutput').textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const toast = document.getElementById('copyToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  });

})();
