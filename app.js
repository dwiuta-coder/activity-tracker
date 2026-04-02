/* ============================================
   PULSE — Core App Logic
   Navigation, CRUD, History, Export
   ============================================ */

(function () {
  'use strict';

  // ===== STORAGE =====
  const STORAGE_KEY = 'pulse_entries';

  function getEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function addEntry(entry) {
    const entries = getEntries();
    entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    entry.createdAt = new Date().toISOString();
    entries.unshift(entry);
    saveEntries(entries);
    return entry;
  }

  function updateEntry(id, data) {
    const entries = getEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx !== -1) {
      entries[idx] = { ...entries[idx], ...data };
      saveEntries(entries);
    }
  }

  function deleteEntry(id) {
    const entries = getEntries().filter(e => e.id !== id);
    saveEntries(entries);
  }

  // Expose for other modules
  window.PulseStore = { getEntries, saveEntries, addEntry, updateEntry, deleteEntry };

  // ===== DATE HELPERS =====
  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  function calcDuration(start, end) {
    if (!start || !end) return null;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60; // handle overnight
    return mins;
  }

  function formatDuration(mins) {
    if (mins == null || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // Expose helpers
  window.PulseHelpers = { formatDate, formatTime, calcDuration, formatDuration, todayISO };

  // ===== HEADER DATE =====
  document.getElementById('headerDate').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // ===== NAVIGATION =====
  const pages = document.querySelectorAll('.page');
  const navBtns = document.querySelectorAll('.nav-btn');

  function navigateTo(pageName) {
    pages.forEach(p => p.classList.remove('active'));
    navBtns.forEach(b => b.classList.remove('active'));

    const page = document.getElementById('page-' + pageName);
    const btn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
    if (page) page.classList.add('active');
    if (btn) btn.classList.add('active');

    // Trigger page-specific renders
    if (pageName === 'history') renderHistory();
    if (pageName === 'dashboard' && window.PulseDash) window.PulseDash.render();
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // ===== TOAST =====
  function showToast(msg) {
    const toast = document.getElementById('globalToast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  window.showToast = showToast;

  // ===== CONFIRM MODAL =====
  let confirmResolve = null;

  function showConfirm(msg) {
    return new Promise(resolve => {
      confirmResolve = resolve;
      document.getElementById('confirmMsg').textContent = msg;
      document.getElementById('confirmModal').classList.add('show');
    });
  }

  document.getElementById('confirmOk').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('show');
    if (confirmResolve) confirmResolve(true);
  });

  document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('show');
    if (confirmResolve) confirmResolve(false);
  });

  // ===== LOG FORM =====
  const form = document.getElementById('logForm');
  const titleInput = document.getElementById('entryTitle');
  const startInput = document.getElementById('startTime');
  const endInput = document.getElementById('endTime');
  const notesInput = document.getElementById('entryNotes');
  const durationEl = document.getElementById('durationValue');
  const editIdInput = document.getElementById('editId');
  const submitBtn = document.getElementById('submitBtn');

  let selectedCategory = 'Work';
  let selectedMood = 3;

  // Category pills
  document.querySelectorAll('.category-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.category-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedCategory = pill.dataset.category;
    });
  });

  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMood = parseInt(btn.dataset.mood);
    });
  });

  // Auto-calculate duration
  function updateDuration() {
    const mins = calcDuration(startInput.value, endInput.value);
    durationEl.textContent = formatDuration(mins);
  }

  startInput.addEventListener('change', updateDuration);
  endInput.addEventListener('change', updateDuration);

  // Set default start time to now
  function setDefaultTimes() {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    startInput.value = `${hh}:${mm}`;
  }
  setDefaultTimes();

  // Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const mins = calcDuration(startInput.value, endInput.value);
    if (!mins || mins <= 0) {
      showToast('End time must be after start time');
      return;
    }

    const data = {
      title: titleInput.value.trim(),
      category: selectedCategory,
      startTime: startInput.value,
      endTime: endInput.value,
      duration: mins,
      notes: notesInput.value.trim(),
      mood: selectedMood,
      date: todayISO()
    };

    const editId = editIdInput.value;
    if (editId) {
      updateEntry(editId, data);
      showToast('Entry updated!');
      editIdInput.value = '';
      submitBtn.innerHTML = '<span class="btn-icon">+</span> Save Entry';
    } else {
      addEntry(data);
      showToast('Entry saved!');
    }

    // Reset form
    form.reset();
    setDefaultTimes();
    selectedCategory = 'Work';
    selectedMood = 3;
    document.querySelectorAll('.category-pills .pill').forEach(p => p.classList.remove('active'));
    document.querySelector('.pill[data-category="Work"]').classList.add('active');
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.mood-btn[data-mood="3"]').classList.add('active');
    durationEl.textContent = '—';
  });

  // ===== EDIT ENTRY =====
  function editEntry(id) {
    const entries = getEntries();
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    navigateTo('log');

    titleInput.value = entry.title;
    startInput.value = entry.startTime;
    endInput.value = entry.endTime;
    notesInput.value = entry.notes || '';
    editIdInput.value = id;

    selectedCategory = entry.category;
    document.querySelectorAll('.category-pills .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.category === entry.category);
    });

    selectedMood = entry.mood;
    document.querySelectorAll('.mood-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.mood) === entry.mood);
    });

    updateDuration();
    submitBtn.innerHTML = '<span class="btn-icon">✓</span> Update Entry';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ===== HISTORY PAGE =====
  const entriesList = document.getElementById('entriesList');
  const emptyHistory = document.getElementById('emptyHistory');
  const filterDate = document.getElementById('filterDate');
  const filterCategory = document.getElementById('filterCategory');

  function renderHistory() {
    let entries = getEntries();

    // Apply filters
    const dateVal = filterDate.value;
    const catVal = filterCategory.value;

    if (dateVal) {
      entries = entries.filter(e => e.date === dateVal);
    }
    if (catVal !== 'All') {
      entries = entries.filter(e => e.category === catVal);
    }

    if (entries.length === 0) {
      entriesList.innerHTML = '';
      emptyHistory.style.display = 'block';
      return;
    }

    emptyHistory.style.display = 'none';

    // Group by date
    const grouped = {};
    entries.forEach(e => {
      const key = e.date || 'Unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });

    let html = '';
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(dateKey => {
      html += `<div class="date-group-label" style="font-size:0.75rem;font-family:var(--font-mono);color:var(--text-muted);padding:10px 2px 4px;text-transform:uppercase;letter-spacing:0.06em;">${formatDate(dateKey + 'T00:00:00')}</div>`;
      grouped[dateKey].forEach(entry => {
        const catClass = entry.category.toLowerCase();
        const moodEmojis = ['', '😴', '😐', '🙂', '😊', '🔥'];
        html += `
          <div class="entry-card" data-id="${entry.id}">
            <div class="entry-top">
              <span class="entry-title">${escapeHtml(entry.title)}</span>
              <span class="entry-badge ${catClass}">${entry.category}</span>
            </div>
            <div class="entry-meta">
              <span class="entry-meta-item">⏱ ${formatDuration(entry.duration)}</span>
              <span class="entry-meta-item">${formatTime(entry.startTime)}–${formatTime(entry.endTime)}</span>
              <span class="entry-meta-item">${moodEmojis[entry.mood] || ''} ${entry.mood}/5</span>
            </div>
            ${entry.notes ? `<div class="entry-notes">${escapeHtml(entry.notes)}</div>` : ''}
            <div class="entry-actions">
              <button class="entry-action-btn edit" onclick="window._editEntry('${entry.id}')">Edit</button>
              <button class="entry-action-btn delete" onclick="window._deleteEntry('${entry.id}')">Delete</button>
            </div>
          </div>
        `;
      });
    });

    entriesList.innerHTML = html;
  }

  filterDate.addEventListener('change', renderHistory);
  filterCategory.addEventListener('change', renderHistory);

  window._editEntry = editEntry;
  window._deleteEntry = async function (id) {
    const ok = await showConfirm('Delete this entry?');
    if (ok) {
      deleteEntry(id);
      renderHistory();
      showToast('Entry deleted');
    }
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== EXPORT =====
  function entriesToCSV(entries) {
    const headers = ['Date', 'Title', 'Category', 'Start Time', 'End Time', 'Duration (min)', 'Duration', 'Mood', 'Notes', 'Created At'];
    const rows = entries.map(e => [
      e.date,
      `"${(e.title || '').replace(/"/g, '""')}"`,
      e.category,
      e.startTime,
      e.endTime,
      e.duration,
      formatDuration(e.duration),
      e.mood,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
      e.createdAt
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById('btnExportAll').addEventListener('click', () => {
    const entries = getEntries();
    if (entries.length === 0) {
      showToast('No entries to export');
      return;
    }
    downloadCSV(entriesToCSV(entries), `pulse-export-all-${todayISO()}.csv`);
    showToast('Exported all entries!');
  });

  document.getElementById('btnExportRange').addEventListener('click', () => {
    const from = document.getElementById('exportFrom').value;
    const to = document.getElementById('exportTo').value;
    if (!from || !to) {
      showToast('Please select both dates');
      return;
    }
    const entries = getEntries().filter(e => e.date >= from && e.date <= to);
    if (entries.length === 0) {
      showToast('No entries in this range');
      return;
    }
    downloadCSV(entriesToCSV(entries), `pulse-export-${from}-to-${to}.csv`);
    showToast(`Exported ${entries.length} entries!`);
  });

  // ===== CSV IMPORT =====
  const csvFileInput = document.getElementById('csvFileInput');
  const fileUploadArea = document.getElementById('fileUploadArea');
  const uploadText = document.getElementById('uploadText');
  const importPreview = document.getElementById('importPreview');
  const previewStats = document.getElementById('previewStats');
  const previewList = document.getElementById('previewList');
  const importCountEl = document.getElementById('importCount');

  let parsedImportRows = [];

  // Drag & drop
  fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.classList.add('dragover');
  });

  fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.classList.remove('dragover');
  });

  fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleCSVFile(file);
    } else {
      showToast('Please drop a .csv file');
    }
  });

  // File input
  csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files[0];
    if (file) handleCSVFile(file);
  });

  // Clear
  document.getElementById('btnClearImport').addEventListener('click', () => {
    resetImport();
  });

  function resetImport() {
    parsedImportRows = [];
    importPreview.style.display = 'none';
    uploadText.textContent = 'Tap to select a CSV file';
    csvFileInput.value = '';
  }

  // Parse CSV text respecting quoted fields
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  function handleCSVFile(file) {
    uploadText.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

      if (lines.length < 2) {
        showToast('CSV file is empty or has no data rows');
        return;
      }

      // Parse header to detect column mapping
      const rawHeader = parseCSVLine(lines[0]);
      const header = rawHeader.map(h => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());

      // Map columns by name (flexible matching)
      const colMap = {};
      const mappings = {
        date: ['date'],
        title: ['title', 'task', 'task name', 'name'],
        category: ['category', 'cat', 'type'],
        startTime: ['start time', 'start', 'starttime'],
        endTime: ['end time', 'end', 'endtime'],
        duration: ['duration min', 'duration minutes', 'durationmin'],
        mood: ['mood', 'energy', 'energy level'],
        notes: ['notes', 'note', 'description', 'details']
      };

      for (const [field, aliases] of Object.entries(mappings)) {
        const idx = header.findIndex(h => aliases.some(a => h === a || h.includes(a)));
        if (idx !== -1) colMap[field] = idx;
      }

      // Must have at least date, title, category
      if (colMap.date === undefined || colMap.title === undefined || colMap.category === undefined) {
        showToast('CSV missing required columns: Date, Title, Category');
        return;
      }

      const existing = getEntries();
      const validCategories = ['Work', 'Study', 'Personal'];
      const results = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 3) continue;

        const row = {
          date: cols[colMap.date] || '',
          title: cols[colMap.title] || '',
          category: cols[colMap.category] || '',
          startTime: colMap.startTime !== undefined ? cols[colMap.startTime] || '' : '',
          endTime: colMap.endTime !== undefined ? cols[colMap.endTime] || '' : '',
          mood: colMap.mood !== undefined ? parseInt(cols[colMap.mood]) || 3 : 3,
          notes: colMap.notes !== undefined ? cols[colMap.notes] || '' : ''
        };

        // Validate
        let status = 'new';
        let error = '';

        if (!row.date || !row.title) {
          status = 'invalid';
          error = 'Missing date or title';
        } else if (!row.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          status = 'invalid';
          error = 'Invalid date format';
        } else if (!validCategories.includes(row.category)) {
          // Try to fix category casing
          const fixed = validCategories.find(c => c.toLowerCase() === row.category.toLowerCase());
          if (fixed) {
            row.category = fixed;
          } else {
            status = 'invalid';
            error = 'Invalid category';
          }
        }

        // Calculate duration from start/end if available
        if (row.startTime && row.endTime) {
          row.duration = calcDuration(row.startTime, row.endTime);
        } else if (colMap.duration !== undefined) {
          row.duration = parseInt(cols[colMap.duration]) || 0;
        } else {
          row.duration = 0;
        }

        // Clamp mood
        row.mood = Math.max(1, Math.min(5, row.mood || 3));

        // Check for duplicates (same date + title + startTime)
        if (status === 'new') {
          const isDup = existing.some(e =>
            e.date === row.date &&
            e.title === row.title &&
            e.startTime === row.startTime
          );
          if (isDup) status = 'duplicate';
        }

        results.push({ ...row, _status: status, _error: error });
      }

      parsedImportRows = results;
      renderImportPreview(results);
    };

    reader.readAsText(file);
  }

  function renderImportPreview(results) {
    const newRows = results.filter(r => r._status === 'new');
    const dupRows = results.filter(r => r._status === 'duplicate');
    const errRows = results.filter(r => r._status === 'invalid');

    previewStats.innerHTML = `
      <span class="preview-stat new">✓ ${newRows.length} new</span>
      <span class="preview-stat skip">⊘ ${dupRows.length} duplicates</span>
      ${errRows.length > 0 ? `<span class="preview-stat error">✗ ${errRows.length} invalid</span>` : ''}
    `;

    let html = '';
    results.slice(0, 50).forEach(r => {
      const catClass = r.category.toLowerCase();
      const statusClass = r._status === 'new' ? 'new' : r._status === 'duplicate' ? 'dup' : 'err';
      const statusLabel = r._status === 'new' ? 'NEW' : r._status === 'duplicate' ? 'SKIP' : r._error;
      const rowClass = r._status === 'duplicate' ? 'duplicate' : r._status === 'invalid' ? 'invalid' : '';

      html += `
        <div class="preview-row ${rowClass}">
          <span class="preview-row-title">${escapeHtml(r.title)}</span>
          <span class="preview-row-cat ${catClass}">${r.category}</span>
          <span class="preview-row-status ${statusClass}">${statusLabel}</span>
        </div>
      `;
    });

    if (results.length > 50) {
      html += `<div class="preview-row" style="justify-content:center;color:var(--text-muted);font-size:0.78rem;">+ ${results.length - 50} more rows</div>`;
    }

    previewList.innerHTML = html;
    importCountEl.textContent = newRows.length;
    importPreview.style.display = 'block';

    if (newRows.length === 0) {
      importCountEl.parentElement.disabled = true;
      importCountEl.parentElement.style.opacity = '0.5';
    } else {
      importCountEl.parentElement.disabled = false;
      importCountEl.parentElement.style.opacity = '1';
    }
  }

  // Confirm import
  document.getElementById('btnConfirmImport').addEventListener('click', () => {
    const newRows = parsedImportRows.filter(r => r._status === 'new');
    if (newRows.length === 0) {
      showToast('No new entries to import');
      return;
    }

    const entries = getEntries();

    newRows.forEach(row => {
      entries.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: row.title,
        category: row.category,
        startTime: row.startTime,
        endTime: row.endTime,
        duration: row.duration,
        notes: row.notes,
        mood: row.mood,
        date: row.date,
        createdAt: new Date().toISOString()
      });
    });

    saveEntries(entries);
    showToast(`Imported ${newRows.length} entries!`);
    resetImport();
  });

  // ===== SERVICE WORKER =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

})();
