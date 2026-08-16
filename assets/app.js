(() => {
  "use strict";

  const EATS_SHEET_ID = "1RdbRqKf16xl57QhQau1UuLr4Hj2OEiy4etDsbLIF9fw";
  const EATS_CSV_URL = `https://docs.google.com/spreadsheets/d/${EATS_SHEET_ID}/export?format=csv&gid=0`;

  const RESV_SHEET_ID = "1ErgL07yP9WRYNYWGNDxO0HcIesfilckC94NFlYX5pzU";
  const RESV_CSV_URL = `https://docs.google.com/spreadsheets/d/${RESV_SHEET_ID}/export?format=csv&gid=0`;

  // Deploy google-apps-script/checklist-api.gs as a Google Apps Script web
  // app (see README) and paste the deployment URL here to sync "tried it"
  // checkmarks across the whole group. Leave blank to keep checkmarks local
  // to this browser only.
  const CHECKLIST_API_URL = "https://script.google.com/macros/s/AKfycbx5oVkfeeIaj9WCJdApev8QYfQ32pLBE_eWG_a5N32NCKb5Myrps0B4Svj3MP7_CQSK/exec";

  const CONFLICT_WINDOW_MIN = 90;
  const CHECKLIST_POLL_MS = 30000;
  const CHECKED_STORAGE_KEY = "disneyEats.checked.v1";

  const state = {
    tab: "eats", // "eats" | "adventures" | "reservations"
    park: "Disneyland",
    selectedAreas: { eats: new Set(), adventures: new Set() },
    eats: [],
    reservations: [],
    checked: new Map(), // key -> boolean
  };

  const els = {
    parkToggle: document.getElementById("park-toggle"),
    tabButtons: document.querySelectorAll(".tab"),
    filterBar: document.getElementById("filter-bar"),
    areaChips: document.getElementById("area-chips"),
    resultsTitle: document.getElementById("results-title"),
    resultCount: document.getElementById("result-count"),
    cardGrid: document.getElementById("card-grid"),
    reservationsList: document.getElementById("reservations-list"),
    emptyState: document.getElementById("empty-state"),
    status: document.getElementById("status"),
    lastUpdated: document.getElementById("last-updated"),
    todayDate: document.getElementById("today-date"),
    todayReservations: document.getElementById("today-reservations"),
    todayResvEmpty: document.getElementById("today-resv-empty"),
    todayPicks: document.getElementById("today-picks"),
    todayPicksEmpty: document.getElementById("today-picks-empty"),
    syncNote: document.getElementById("sync-note"),
  };

  // ─────────────────────────  STATUS  ─────────────────────────
  function setStatus(message, isError = false) {
    if (!message) {
      els.status.hidden = true;
      return;
    }
    els.status.hidden = false;
    els.status.textContent = message;
    els.status.classList.toggle("is-error", isError);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ─────────────────────────  EATS PARSING  ─────────────────────────
  function itemKey(park, area, food) {
    return [park, area, food].join("::").toLowerCase();
  }

  function cleanEatsRow(raw) {
    const num = (val, fallback) => {
      const n = parseFloat(val);
      return Number.isFinite(n) ? n : fallback;
    };
    const str = (val, fallback) => {
      const s = (val ?? "").toString().trim();
      return s.length ? s : fallback;
    };
    const Park = str(raw.Park, "Not listed");
    const Area = str(raw.Area, "Not listed");
    const Food = str(raw.Food, "Unnamed Item");
    return {
      Park,
      Area,
      Food,
      Location: str(raw.Location, "Not listed"),
      Price: num(raw.Price, 0),
      Priority: Math.round(num(raw.Priority, 3)),
      Eats: Math.round(num(raw["Eats?"], 1)),
      Key: itemKey(Park, Area, Food),
    };
  }

  // ─────────────────────────  RESERVATIONS PARSING  ─────────────────────────
  function parseMilitaryTime(raw) {
    const s = (raw ?? "").toString().trim();
    if (!s) return null;

    const ampm = s.match(/^(\d{1,2}):?(\d{2})?\s*([AaPp][Mm])$/);
    if (ampm) {
      let h = parseInt(ampm[1], 10) % 12;
      const m = parseInt(ampm[2] || "0", 10);
      if (/p/i.test(ampm[3])) h += 12;
      return h * 60 + m;
    }

    const colon = s.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);

    const digits = s.replace(/\D/g, "");
    if (digits.length === 3) return parseInt(digits[0], 10) * 60 + parseInt(digits.slice(1), 10);
    if (digits.length === 4) return parseInt(digits.slice(0, 2), 10) * 60 + parseInt(digits.slice(2), 10);

    return null;
  }

  function formatMinutes(mins) {
    if (mins === null || mins === undefined) return "Time TBD";
    const h24 = Math.floor(mins / 60) % 24;
    const m = ((mins % 60) + 60) % 60;
    const period = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  function parseDateCell(raw) {
    const s = (raw ?? "").toString().trim();
    if (!s) return null;
    const native = new Date(s);
    if (Number.isNaN(native.getTime())) return null;
    return new Date(native.getFullYear(), native.getMonth(), native.getDate());
  }

  function dateKey(d) {
    if (!d) return "unknown";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function cleanReservationRow(raw) {
    const str = (val, fallback) => {
      const s = (val ?? "").toString().trim();
      return s.length ? s : fallback;
    };
    const dateObj = parseDateCell(raw.date ?? raw.Date);
    const minutes = parseMilitaryTime(raw.time ?? raw.Time);
    return {
      Reservation: str(raw.reservation ?? raw.Reservation, "Reservation"),
      Area: str(raw.area ?? raw.Area, "Not listed"),
      DateObj: dateObj,
      DateKey: dateKey(dateObj),
      DateLabel: dateObj
        ? dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
        : str(raw.date ?? raw.Date, "Date TBD"),
      Minutes: minutes,
      TimeLabel: formatMinutes(minutes),
      Conflict: false,
    };
  }

  function flagConflicts(reservations) {
    const byDate = new Map();
    reservations.forEach((r) => {
      if (!byDate.has(r.DateKey)) byDate.set(r.DateKey, []);
      byDate.get(r.DateKey).push(r);
    });
    byDate.forEach((group) => {
      const timed = group.filter((r) => r.Minutes !== null).sort((a, b) => a.Minutes - b.Minutes);
      for (let i = 0; i < timed.length - 1; i++) {
        if (timed[i + 1].Minutes - timed[i].Minutes < CONFLICT_WINDOW_MIN) {
          timed[i].Conflict = true;
          timed[i + 1].Conflict = true;
        }
      }
    });
  }

  // ─────────────────────────  DATA LOADING  ─────────────────────────
  async function fetchCsv(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (parsed.errors && parsed.errors.length) console.warn("CSV parse warnings:", parsed.errors);
    return parsed.data;
  }

  async function loadData() {
    setStatus("Loading trip data…");

    const [eatsRaw, resvRaw] = await Promise.all([
      fetchCsv(EATS_CSV_URL),
      fetchCsv(RESV_CSV_URL).catch((err) => {
        console.warn("Couldn't load reservations sheet:", err);
        return [];
      }),
    ]);

    state.eats = eatsRaw.map(cleanEatsRow);
    state.reservations = resvRaw.map(cleanReservationRow);
    flagConflicts(state.reservations);

    els.lastUpdated.textContent = new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    setStatus(null);
  }

  // ─────────────────────────  CHECKLIST (shared "tried it")  ─────────────────────────
  function loadLocalChecked() {
    try {
      const raw = localStorage.getItem(CHECKED_STORAGE_KEY);
      if (!raw) return;
      Object.entries(JSON.parse(raw)).forEach(([k, v]) => state.checked.set(k, !!v));
    } catch (err) {
      /* ignore corrupt local storage */
    }
  }

  function saveLocalChecked() {
    try {
      localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify(Object.fromEntries(state.checked)));
    } catch (err) {
      /* ignore storage failures (e.g. private browsing) */
    }
  }

  function showSyncNote(text) {
    els.syncNote.hidden = !text;
    els.syncNote.textContent = text || "";
  }

  async function loadRemoteChecked() {
    if (!CHECKLIST_API_URL) {
      showSyncNote("Checkmarks are saved on this device only — see README to sync them for the whole group.");
      return;
    }
    try {
      const res = await fetch(`${CHECKLIST_API_URL}?action=list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      (data.items || []).forEach((item) => state.checked.set(item.key, !!item.checked));
      showSyncNote(null);
    } catch (err) {
      console.warn("Couldn't load shared checklist:", err);
      showSyncNote("Couldn't reach the shared checklist — showing local checkmarks only.");
    }
  }

  async function toggleChecked(key) {
    const next = !state.checked.get(key);
    state.checked.set(key, next);
    saveLocalChecked();
    renderAll();

    if (!CHECKLIST_API_URL) return;
    try {
      const url = `${CHECKLIST_API_URL}?action=set&key=${encodeURIComponent(key)}&checked=${next}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn("Couldn't sync checkmark:", err);
      showSyncNote("Couldn't reach the shared checklist — your last change may not be visible to others yet.");
    }
  }

  function startChecklistPolling() {
    if (!CHECKLIST_API_URL) return;
    setInterval(async () => {
      try {
        const res = await fetch(`${CHECKLIST_API_URL}?action=list`);
        if (!res.ok) return;
        const data = await res.json();
        (data.items || []).forEach((item) => state.checked.set(item.key, !!item.checked));
        showSyncNote(null);
        renderAll();
      } catch (err) {
        /* keep last known state; try again next tick */
      }
    }, CHECKLIST_POLL_MS);
  }

  // ─────────────────────────  SHARED RENDER HELPERS  ─────────────────────────
  function prioBadge(p) {
    const clamped = [1, 2, 3].includes(p) ? p : 3;
    return `<span class="prio prio-${clamped}">${clamped}</span>`;
  }

  function checkboxHtml(key, checked) {
    return `
      <label class="tried-toggle">
        <input type="checkbox" data-key="${escapeHtml(key)}" ${checked ? "checked" : ""} />
        <span>Tried it</span>
      </label>
    `;
  }

  function bindCheckbox(container) {
    const input = container.querySelector('input[type="checkbox"]');
    if (!input) return;
    input.addEventListener("change", () => toggleChecked(input.dataset.key));
  }

  function reservationRowEl(r) {
    const row = document.createElement("div");
    row.className = "resv-row" + (r.Conflict ? " is-conflict" : "");
    row.innerHTML = `
      <span class="resv-row__time">${escapeHtml(r.TimeLabel)}</span>
      <span class="resv-row__body">
        <span class="resv-row__name">${escapeHtml(r.Reservation)}</span>
        <span class="resv-row__area">${escapeHtml(r.Area)}</span>
      </span>
      ${r.Conflict ? '<span class="conflict-badge">Conflict</span>' : ""}
    `;
    return row;
  }

  function pickRowEl(r) {
    const row = document.createElement("div");
    row.className = "pick-row";
    row.innerHTML = `
      ${checkboxHtml(r.Key, !!state.checked.get(r.Key))}
      <span class="pick-row__name">${escapeHtml(r.Food)}</span>
      <span class="pick-row__meta">${escapeHtml(r.Area)}</span>
    `;
    bindCheckbox(row);
    return row;
  }

  // ─────────────────────────  TODAY PANEL  ─────────────────────────
  function renderTodayPanel() {
    const today = new Date();
    els.todayDate.textContent = today.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    const todayKey = dateKey(today);
    const todaysResv = state.reservations
      .filter((r) => r.DateKey === todayKey)
      .sort((a, b) => (a.Minutes ?? 9999) - (b.Minutes ?? 9999));

    els.todayReservations.innerHTML = "";
    els.todayResvEmpty.hidden = todaysResv.length !== 0;
    todaysResv.forEach((r) => els.todayReservations.appendChild(reservationRowEl(r)));

    const picks = state.eats
      .filter(
        (r) =>
          r.Priority === 1 &&
          r.Park.toLowerCase().includes(state.park.toLowerCase()) &&
          !state.checked.get(r.Key)
      )
      .slice(0, 6);

    els.todayPicks.innerHTML = "";
    els.todayPicksEmpty.hidden = picks.length !== 0;
    picks.forEach((r) => els.todayPicks.appendChild(pickRowEl(r)));
  }

  // ─────────────────────────  EATS / ADVENTURES TAB  ─────────────────────────
  function getFilteredByParkAndTab() {
    const eatsValue = state.tab === "eats" ? 1 : 0;
    return state.eats.filter(
      (r) => r.Park.toLowerCase().includes(state.park.toLowerCase()) && r.Eats === eatsValue
    );
  }

  function renderAreaChips(areas) {
    els.areaChips.innerHTML = "";

    if (areas.length === 0) {
      els.areaChips.innerHTML = '<span class="chip-placeholder">No areas found for this park yet.</span>';
      return;
    }

    const selected = state.selectedAreas[state.tab];

    areas.forEach((area) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (selected.has(area) ? " active" : "");
      btn.textContent = area;
      btn.addEventListener("click", () => {
        if (selected.has(area)) {
          selected.delete(area);
        } else {
          selected.add(area);
        }
        render();
      });
      els.areaChips.appendChild(btn);
    });
  }

  function renderCards(rows) {
    els.cardGrid.innerHTML = "";

    const sorted = [...rows].sort((a, b) => a.Priority - b.Priority);

    sorted.forEach((row) => {
      const checked = !!state.checked.get(row.Key);
      const card = document.createElement("article");
      card.className = "food-card" + (checked ? " is-checked" : "");
      card.innerHTML = `
        <div class="food-card__header">
          <h3>${escapeHtml(row.Food)}</h3>
          ${prioBadge(row.Priority)}
        </div>
        <dl>
          <dt>Price</dt><dd>$${row.Price.toFixed(2)}</dd>
          <dt>Location</dt><dd>${escapeHtml(row.Location)}</dd>
          <dt>Area</dt><dd>${escapeHtml(row.Area)}</dd>
        </dl>
        ${checkboxHtml(row.Key, checked)}
      `;
      bindCheckbox(card);
      els.cardGrid.appendChild(card);
    });

    return sorted.length;
  }

  // ─────────────────────────  RESERVATIONS TAB  ─────────────────────────
  function renderReservationsTab() {
    els.reservationsList.innerHTML = "";

    const sorted = [...state.reservations].sort((a, b) => {
      if (a.DateKey !== b.DateKey) return a.DateKey.localeCompare(b.DateKey);
      return (a.Minutes ?? 9999) - (b.Minutes ?? 9999);
    });

    let lastDateKey = null;
    sorted.forEach((r) => {
      if (r.DateKey !== lastDateKey) {
        const heading = document.createElement("h3");
        heading.className = "resv-date-heading";
        heading.textContent = r.DateLabel;
        els.reservationsList.appendChild(heading);
        lastDateKey = r.DateKey;
      }
      els.reservationsList.appendChild(reservationRowEl(r));
    });

    return sorted.length;
  }

  // ─────────────────────────  MAIN RENDER  ─────────────────────────
  function render() {
    const isReservations = state.tab === "reservations";
    els.filterBar.hidden = isReservations;
    els.cardGrid.hidden = isReservations;
    els.reservationsList.hidden = !isReservations;

    let count;
    if (isReservations) {
      els.resultsTitle.textContent = "Reservations";
      count = renderReservationsTab();
      els.emptyState.textContent = "No reservations yet — add some to your reservations sheet.";
    } else {
      const scoped = getFilteredByParkAndTab();
      const areas = [...new Set(scoped.map((r) => r.Area))].sort((a, b) => a.localeCompare(b));
      renderAreaChips(areas);

      const selected = state.selectedAreas[state.tab];
      const effectiveAreas = selected.size ? [...selected] : areas;
      const filtered = scoped.filter((r) => effectiveAreas.includes(r.Area));

      els.resultsTitle.textContent = state.tab === "eats" ? "So you should try…" : "So you should explore…";
      count = renderCards(filtered);
      els.emptyState.textContent = "No items match your filters yet — try selecting a different area.";
    }

    els.resultCount.textContent = count === 1 ? "1 item" : `${count} items`;
    els.emptyState.hidden = count !== 0;
  }

  function renderAll() {
    renderTodayPanel();
    render();
  }

  // ─────────────────────────  EVENTS  ─────────────────────────
  function bindEvents() {
    els.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.tab === state.tab) return;
        els.tabButtons.forEach((b) => {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        state.tab = btn.dataset.tab;
        render();
      });
    });

    els.parkToggle.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.park === state.park) return;
        els.parkToggle.querySelectorAll(".seg").forEach((b) => b.classList.toggle("active", b === btn));
        state.park = btn.dataset.park;
        renderAll();
      });
    });
  }

  // ─────────────────────────  INIT  ─────────────────────────
  async function init() {
    bindEvents();
    loadLocalChecked();
    try {
      await loadData();
      await loadRemoteChecked();
      renderAll();
      startChecklistPolling();
    } catch (err) {
      console.error(err);
      setStatus(`Couldn't load trip data. ${err.message || ""}`.trim(), true);
    }
  }

  init();
})();
