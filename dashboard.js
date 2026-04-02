/* ============================================
   PULSE — Dashboard
   Weekly bar chart, category donut,
   daily summary, completion rate
   ============================================ */

(function () {
  'use strict';

  const { getEntries } = window.PulseStore;
  const { formatDuration, todayISO } = window.PulseHelpers;

  // Chart.js global defaults
  Chart.defaults.color = '#8888a0';
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size = 12;

  let weeklyChart = null;
  let categoryChart = null;
  let completionChart = null;

  function getWeekDates() {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day + 6) % 7));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  function render() {
    const entries = getEntries();
    const today = todayISO();
    const weekDates = getWeekDates();

    // ===== TODAY SUMMARY =====
    const todayEntries = entries.filter(e => e.date === today);
    const todayMins = todayEntries.reduce((s, e) => s + (e.duration || 0), 0);
    const todayAvgMood = todayEntries.length > 0
      ? (todayEntries.reduce((s, e) => s + e.mood, 0) / todayEntries.length).toFixed(1)
      : '—';

    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    document.getElementById('todayHours').textContent = formatDuration(todayMins);
    document.getElementById('todayTasks').textContent = todayEntries.length;
    document.getElementById('todayMood').textContent = todayAvgMood;

    // ===== WEEKLY BAR CHART =====
    const dayLabels = weekDates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('en-US', { weekday: 'short' });
    });

    const workHours = weekDates.map(d => entries.filter(e => e.date === d && e.category === 'Work').reduce((s, e) => s + (e.duration || 0), 0) / 60);
    const studyHours = weekDates.map(d => entries.filter(e => e.date === d && e.category === 'Study').reduce((s, e) => s + (e.duration || 0), 0) / 60);
    const personalHours = weekDates.map(d => entries.filter(e => e.date === d && e.category === 'Personal').reduce((s, e) => s + (e.duration || 0), 0) / 60);

    const weeklyCtx = document.getElementById('weeklyChart').getContext('2d');

    if (weeklyChart) weeklyChart.destroy();

    weeklyChart = new Chart(weeklyCtx, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [
          {
            label: 'Work',
            data: workHours,
            backgroundColor: '#f97316',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.6
          },
          {
            label: 'Study',
            data: studyHours,
            backgroundColor: '#06b6d4',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.6
          },
          {
            label: 'Personal',
            data: personalHours,
            backgroundColor: '#a855f7',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a28',
            borderColor: '#22223a',
            borderWidth: 1,
            titleFont: { weight: '600' },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}h`
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: "'Space Mono', monospace", size: 11 } }
          },
          y: {
            stacked: true,
            grid: { color: 'rgba(34,34,58,0.5)' },
            border: { display: false },
            ticks: {
              font: { family: "'Space Mono', monospace", size: 11 },
              callback: v => v + 'h'
            }
          }
        }
      }
    });

    // ===== CATEGORY DONUT =====
    const weekEntries = entries.filter(e => weekDates.includes(e.date));
    const catMins = {
      Work: weekEntries.filter(e => e.category === 'Work').reduce((s, e) => s + (e.duration || 0), 0),
      Study: weekEntries.filter(e => e.category === 'Study').reduce((s, e) => s + (e.duration || 0), 0),
      Personal: weekEntries.filter(e => e.category === 'Personal').reduce((s, e) => s + (e.duration || 0), 0)
    };

    const totalWeekMins = catMins.Work + catMins.Study + catMins.Personal;
    document.getElementById('donutTotal').textContent = formatDuration(totalWeekMins);

    const catCtx = document.getElementById('categoryChart').getContext('2d');

    if (categoryChart) categoryChart.destroy();

    const hasData = totalWeekMins > 0;

    categoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: ['Work', 'Study', 'Personal'],
        datasets: [{
          data: hasData ? [catMins.Work, catMins.Study, catMins.Personal] : [1],
          backgroundColor: hasData ? ['#f97316', '#06b6d4', '#a855f7'] : ['#22223a'],
          borderWidth: 0,
          spacing: hasData ? 3 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            backgroundColor: '#1a1a28',
            borderColor: '#22223a',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: ctx => `${ctx.label}: ${formatDuration(ctx.raw)}`
            }
          }
        }
      }
    });

    // Legend
    const legendEl = document.getElementById('categoryLegend');
    const colors = { Work: '#f97316', Study: '#06b6d4', Personal: '#a855f7' };
    legendEl.innerHTML = ['Work', 'Study', 'Personal'].map(cat => {
      const hrs = (catMins[cat] / 60).toFixed(1);
      return `<div class="legend-item"><span class="legend-dot" style="background:${colors[cat]}"></span>${cat} ${hrs}h</div>`;
    }).join('');

    // ===== COMPLETION RING =====
    // "Task completion rate" = days this week with at least one entry / days elapsed so far this week
    const todayIndex = weekDates.indexOf(today);
    const daysElapsed = todayIndex >= 0 ? todayIndex + 1 : 7;
    const daysWithEntries = weekDates.slice(0, daysElapsed).filter(d => entries.some(e => e.date === d)).length;
    const completionPct = daysElapsed > 0 ? Math.round((daysWithEntries / daysElapsed) * 100) : 0;

    document.getElementById('completionPct').textContent = completionPct + '%';
    document.getElementById('completionMeta').textContent = `${daysWithEntries} of ${daysElapsed} days logged this week`;

    const compCtx = document.getElementById('completionChart').getContext('2d');

    if (completionChart) completionChart.destroy();

    completionChart = new Chart(compCtx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [completionPct, 100 - completionPct],
          backgroundColor: ['#6c5ce7', '#1a1a28'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  window.PulseDash = { render };

})();
