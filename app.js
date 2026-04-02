/* ============================================
   PULSE — Core App Logic
   Firebase Auth + Firestore sync
   localStorage as offline fallback
   ============================================ */

(function () {
  'use strict';

  // ===== FIREBASE CONFIG =====
  const firebaseConfig = {
    apiKey: "AIzaSyAAM1j9pnDTyousTAwpDzSP-4vZcGsHzPc",
    authDomain: "activity-tracker-cbdba.firebaseapp.com",
    projectId: "activity-tracker-cbdba",
    storageBucket: "activity-tracker-cbdba.firebasestorage.app",
    messagingSenderId: "226727096222",
    appId: "1:226727096222:web:140965eec525b143e8b08f"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // Enable offline persistence
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  // ===== STATE =====
  const STORAGE_KEY = 'pulse_entries';
  let currentUser = null;
  let isOfflineMode = false;
  let unsubFirestore = null; // Firestore listener unsubscribe

  // ===== LOCAL STORAGE (offline fallback) =====
  function getLocalEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  function saveLocalEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  // ===== FIRESTORE HELPERS =====
  function userCollection() {
    return db.collection('users').doc(currentUser.uid).collection('entries');
  }

  async function firestoreAdd(entry) {
    const docRef = await userCollection().add(entry);
    entry.id = docRef.id;
    return entry;
  }

  async function firestoreUpdate(id, data) {
    await userCollection().doc(id).update(data);
  }

  async function firestoreDelete(id) {
    await userCollection().doc(id).delete();
  }

  // ===== UNIFIED STORE API =====
  // getEntries returns the current in-memory cache (kept in sync by listener)
  let entriesCache = [];

  function getEntries() {
    return entriesCache;
  }

  async function addEntry(entry) {
    entry.createdAt = new Date().toISOString();

    if (currentUser && !isOfflineMode) {
      try {
        const saved = await firestoreAdd(entry);
        showSyncBadge();
        return saved;
      } catch (err) {
        console.warn('Firestore add failed, saving locally', err);
      }
    }

    // Fallback: local only
    entry.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    entriesCache.unshift(entry);
    saveLocalEntries(entriesCache);
    return entry;
  }

  async function updateEntry(id, data) {
    if (currentUser && !isOfflineMode) {
      try {
        await firestoreUpdate(id, data);
        showSyncBadge();
        return;
      } catch (err) {
        console.warn('Firestore update failed, updating locally', err);
      }
    }

    const idx = entriesCache.findIndex(e => e.id === id);
    if (idx !== -1) {
      entriesCache[idx] = { ...entriesCache[idx], ...data };
      saveLocalEntries(entriesCache);
    }
  }

  async function deleteEntry(id) {
    if (currentUser && !isOfflineMode) {
      try {
        await firestoreDelete(id);
        showSyncBadge();
        return;
      } catch (err) {
        console.warn('Firestore delete failed, deleting locally', err);
      }
    }

    entriesCache = entriesCache.filter(e => e.id !== id);
    saveLocalEntries(entriesCache);
  }

  function saveEntries(entries) {
    entriesCache = entries;
    saveLocalEntries(entries);

    // If signed in, bulk write to Firestore (used by CSV import)
    if (currentUser && !isOfflineMode) {
      bulkSyncToFirestore(entries);
    }
  }

  async function bulkSyncToFirestore(entries) {
    try {
      // Get all current Firestore doc IDs
      const snapshot = await userCollection().get();
      const existingIds = new Set();
      snapshot.forEach(doc => existingIds.add(doc.id));

      const batch = db.batch();
      let opCount = 0;

      for (const entry of entries) {
        if (!existingIds.has(entry.id)) {
          const docRef = userCollection().doc();
          const newEntry = { ...entry };
          delete newEntry.id;
          batch.set(docRef, newEntry);
          opCount++;
        }
        // Firestore batch limit is 500
        if (opCount >= 450) break;
      }

      if (opCount > 0) {
        await batch.commit();
        showSyncBadge();
      }
    } catch (err) {
      console.warn('Bulk sync failed', err);
    }
  }

  // Expose for other modules
  window.PulseStore = { getEntries, saveEntries, addEntry, updateEntry, deleteEntry };

  // ===== FIRESTORE REAL-TIME LISTENER =====
  function startFirestoreListener() {
    if (unsubFirestore) unsubFirestore();

    unsubFirestore = userCollection()
      .orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        const entries = [];
        snapshot.forEach(doc => {
          entries.push({ id: doc.id, ...doc.data() });
        });
        entriesCache = entries;
        saveLocalEntries(entries); // keep local cache in sync
        showSyncBadge();

        // Re-render current page if visible
        const historyPage = document.getElementById('page-history');
        if (historyPage.classList.contains('active')) renderHistory();
        const dashPage = document.getElementById('page-dashboard');
        if (dashPage.classList.contains('active') && window.PulseDash) window.PulseDash.render();
      }, err => {
        console.warn('Firestore listener error', err);
      });
  }

  function stopFirestoreListener() {
    if (unsubFirestore) {
      unsubFirestore();
      unsubFirestore = null;
    }
  }

  // ===== SYNC BADGE =====
  function showSyncBadge() {
    const badge = document.getElementById('syncBadge');
    if (!badge || !currentUser) return;
    badge.style.display = 'inline-block';
    badge.textContent = '✓ synced';
    clearTimeout(badge._timer);
    badge._timer = setTimeout(() => { badge.style.display = 'none'; }, 3000);
  }

  // ===== AUTH UI =====
  const loginScreen = document.getElementById('loginScreen');
  const appHeader = document.getElementById('appHeader');
  const bottomNav = document.getElementById('bottomNav');
  const avatarBtn = document.getElementById('userAvatarBtn');
  const avatarImg = document.getElementById('userAvatar');
  const userMenu = document.getElementById('userMenu');
  const userMenuOverlay = document.getElementById('userMenuOverlay');

  function showApp() {
    loginScreen.style.display = 'none';
    appHeader.style.display = 'flex';
    bottomNav.style.display = 'flex';
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    appHeader.style.display = 'none';
    bottomNav.style.display = 'none';
  }

  // Google sign in
  document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      console.error('Google sign-in failed', err);
      showToast('Sign-in failed. Try again.');
    }
  });

  // Skip login (offline mode)
  document.getElementById('btnSkipLogin').addEventListener('click', () => {
    isOfflineMode = true;
    currentUser = null;
    entriesCache = getLocalEntries();
    showApp();
  });

  // Sign out
  document.getElementById('btnSignOut').addEventListener('click', async () => {
    closeUserMenu();
    stopFirestoreListener();
    await auth.signOut();
    currentUser = null;
    isOfflineMode = false;
    entriesCache = [];
    showLogin();
    showToast('Signed out');
  });

  // User menu toggle
  avatarBtn.addEventListener('click', () => {
    userMenu.classList.toggle('show');
    userMenuOverlay.classList.toggle('show');
  });

  userMenuOverlay.addEventListener('click', closeUserMenu);

  function closeUserMenu() {
    userMenu.classList.remove('show');
    userMenuOverlay.classList.remove('show');
  }

  // Auth state listener
  auth.onAuthStateChanged(async user => {
    if (user) {
      currentUser = user;
      isOfflineMode = false;

      // Show user avatar
      avatarBtn.style.display = 'flex';
      avatarImg.src = user.photoURL || '';
      document.getElementById('userMenuName').textContent = user.displayName || 'User';
      document.getElementById('userMenuEmail').textContent = user.email || '';

      // Migrate any local entries to Firestore on first sign-in
      const localEntries = getLocalEntries();
      if (localEntries.length > 0) {
        await migrateLocalToFirestore(localEntries);
        localStorage.removeItem(STORAGE_KEY);
      }

      // Start real-time listener
      startFirestoreListener();
      showApp();
    } else if (!isOfflineMode) {
      // No user and not skipped — show login
      currentUser = null;
      showLogin();
    }
  });

  // Migrate local entries to Firestore (one-time on first sign-in)
  async function migrateLocalToFirestore(localEntries) {
    try {
      const batch = db.batch();
      let count = 0;
      for (const entry of localEntries) {
        const docRef = userCollection().doc();
        const data = { ...entry };
        delete data.id; // Firestore will assign its own ID
        batch.set(docRef, data);
        count++;
        if (count >= 450) break; // batch limit
      }
      if (count > 0) {
        await batch.commit();
        showToast(`Migrated ${count} entries to cloud!`);
      }
    } catch (err) {
      console.warn('Migration failed, keeping local data', err);
      // Don't clear localStorage if migration fails
    }
  }

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
    if (mins < 0) mins += 24 * 60;
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

  document.querySelectorAll('.category-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.category-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedCategory = pill.dataset.category;
    });
  });

  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMood = parseInt(btn.dataset.mood);
    });
  });

  function updateDuration() {
    const mins = calcDuration(startInput.value, endInput.value);
    durationEl.textContent = formatDuration(mins);
  }

  startInput.addEventListener('change', updateDuration);
  endInput.addEventListener('change', updateDuration);

  function setDefaultTimes() {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    startInput.value = `${hh}:${mm}`;
  }
  setDefaultTimes();

  form.addEventListener('submit', async (e) => {
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
      await updateEntry(editId, data);
      showToast('Entry updated!');
      editIdInput.value = '';
      submitBtn.innerHTML = '<span class="btn-icon">+</span> Save Entry';
    } else {
      await addEntry(data);
      showToast('Entry saved!');
    }

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
    const entry = entriesCache.find(e => e.id === id);
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
    let entries = [...entriesCache];
    const dateVal = filterDate.value;
    const catVal = filterCategory.value;
    if (dateVal) entries = entries.filter(e => e.date === dateVal);
    if (catVal !== 'All') entries = entries.filter(e => e.category === catVal);

    if (entries.length === 0) {
      entriesList.innerHTML = '';
      emptyHistory.style.display = 'block';
      return;
    }
    emptyHistory.style.display = 'none';

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
          </div>`;
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
      await deleteEntry(id);
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
    if (entries.length === 0) { showToast('No entries to export'); return; }
    downloadCSV(entriesToCSV(entries), `pulse-export-all-${todayISO()}.csv`);
    showToast('Exported all entries!');
  });

  document.getElementById('btnExportRange').addEventListener('click', () => {
    const from = document.getElementById('exportFrom').value;
    const to = document.getElementById('exportTo').value;
    if (!from || !to) { showToast('Please select both dates'); return; }
    const entries = getEntries().filter(e => e.date >= from && e.date <= to);
    if (entries.length === 0) { showToast('No entries in this range'); return; }
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

  fileUploadArea.addEventListener('click', (e) => {
    if (e.target !== csvFileInput) csvFileInput.click();
  });

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
    if (file && file.name.endsWith('.csv')) handleCSVFile(file);
    else showToast('Please drop a .csv file');
  });

  csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files[0];
    if (file) handleCSVFile(file);
  });

  document.getElementById('btnClearImport').addEventListener('click', () => resetImport());

  function resetImport() {
    parsedImportRows = [];
    importPreview.style.display = 'none';
    uploadText.textContent = 'Tap to select a CSV file';
    csvFileInput.value = '';
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { result.push(current.trim()); current = ''; }
        else current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function handleCSVFile(file) {
    uploadText.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 2) { showToast('CSV file is empty or has no data rows'); return; }

      const rawHeader = parseCSVLine(lines[0]);
      const header = rawHeader.map(h => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());

      const colMap = {};
      const mappings = {
        date: ['date'], title: ['title', 'task', 'task name', 'name'],
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

      if (colMap.date === undefined || colMap.title === undefined || colMap.category === undefined) {
        showToast('CSV missing required columns: Date, Title, Category'); return;
      }

      const existing = getEntries();
      const validCategories = ['Work', 'Study', 'Personal'];
      const results = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 3) continue;
        const row = {
          date: cols[colMap.date] || '', title: cols[colMap.title] || '',
          category: cols[colMap.category] || '',
          startTime: colMap.startTime !== undefined ? cols[colMap.startTime] || '' : '',
          endTime: colMap.endTime !== undefined ? cols[colMap.endTime] || '' : '',
          mood: colMap.mood !== undefined ? parseInt(cols[colMap.mood]) || 3 : 3,
          notes: colMap.notes !== undefined ? cols[colMap.notes] || '' : ''
        };

        let status = 'new', error = '';
        if (!row.date || !row.title) { status = 'invalid'; error = 'Missing date or title'; }
        else if (!row.date.match(/^\d{4}-\d{2}-\d{2}$/)) { status = 'invalid'; error = 'Invalid date format'; }
        else if (!validCategories.includes(row.category)) {
          const fixed = validCategories.find(c => c.toLowerCase() === row.category.toLowerCase());
          if (fixed) row.category = fixed;
          else { status = 'invalid'; error = 'Invalid category'; }
        }

        if (row.startTime && row.endTime) row.duration = calcDuration(row.startTime, row.endTime);
        else if (colMap.duration !== undefined) row.duration = parseInt(cols[colMap.duration]) || 0;
        else row.duration = 0;

        row.mood = Math.max(1, Math.min(5, row.mood || 3));

        if (status === 'new') {
          const isDup = existing.some(e => e.date === row.date && e.title === row.title && e.startTime === row.startTime);
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
      ${errRows.length > 0 ? `<span class="preview-stat error">✗ ${errRows.length} invalid</span>` : ''}`;

    let html = '';
    results.slice(0, 50).forEach(r => {
      const catClass = r.category.toLowerCase();
      const statusClass = r._status === 'new' ? 'new' : r._status === 'duplicate' ? 'dup' : 'err';
      const statusLabel = r._status === 'new' ? 'NEW' : r._status === 'duplicate' ? 'SKIP' : r._error;
      const rowClass = r._status === 'duplicate' ? 'duplicate' : r._status === 'invalid' ? 'invalid' : '';
      html += `<div class="preview-row ${rowClass}"><span class="preview-row-title">${escapeHtml(r.title)}</span><span class="preview-row-cat ${catClass}">${r.category}</span><span class="preview-row-status ${statusClass}">${statusLabel}</span></div>`;
    });
    if (results.length > 50) html += `<div class="preview-row" style="justify-content:center;color:var(--text-muted);font-size:0.78rem;">+ ${results.length - 50} more rows</div>`;

    previewList.innerHTML = html;
    importCountEl.textContent = newRows.length;
    importPreview.style.display = 'block';
    importCountEl.parentElement.disabled = newRows.length === 0;
    importCountEl.parentElement.style.opacity = newRows.length === 0 ? '0.5' : '1';
  }

  document.getElementById('btnConfirmImport').addEventListener('click', async () => {
    const newRows = parsedImportRows.filter(r => r._status === 'new');
    if (newRows.length === 0) { showToast('No new entries to import'); return; }

    if (currentUser && !isOfflineMode) {
      // Import directly to Firestore
      try {
        const batch = db.batch();
        let count = 0;
        for (const row of newRows) {
          const docRef = userCollection().doc();
          batch.set(docRef, {
            title: row.title, category: row.category,
            startTime: row.startTime, endTime: row.endTime,
            duration: row.duration, notes: row.notes,
            mood: row.mood, date: row.date,
            createdAt: new Date().toISOString()
          });
          count++;
          if (count >= 450) break;
        }
        await batch.commit();
        showToast(`Imported ${count} entries!`);
        showSyncBadge();
      } catch (err) {
        console.error('Firestore import failed', err);
        showToast('Import failed, try again');
      }
    } else {
      // Offline import
      const entries = [...entriesCache];
      newRows.forEach(row => {
        entries.unshift({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: row.title, category: row.category,
          startTime: row.startTime, endTime: row.endTime,
          duration: row.duration, notes: row.notes,
          mood: row.mood, date: row.date,
          createdAt: new Date().toISOString()
        });
      });
      entriesCache = entries;
      saveLocalEntries(entries);
      showToast(`Imported ${newRows.length} entries!`);
    }
    resetImport();
  });

  // ===== SERVICE WORKER =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

})();
