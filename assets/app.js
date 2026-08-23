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
  const CHECKLIST_API_URL = "https://script.google.com/macros/s/AKfycbzWPtyK07yaTC3bCXdwR4K1CpAzAgw1VvgOOVdn1iPlK28o5sqkUL8xjfUkXqb6pFAF/exec";

  const CONFLICT_WINDOW_MIN = 90;
  const CHECKLIST_POLL_MS = 30000;
  const CHECKED_STORAGE_KEY = "disneyEats.checked.v1";

  const TRIP_START = new Date(2026, 8, 4); // September 4, 2026

  // Seasonal decoration (accent color + favicon). Set to "" to turn off.
  const SEASONAL_THEME = "halloween";
  const SEASONAL_FAVICONS = {
    halloween: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎃</text></svg>",
  };

  // Photo for each reservation venue, keyed by lowercased name with accents
  // stripped (see normalizeName). Add a URL to show a photo on that
  // reservation's row; leave blank for a plain fallback avatar instead.
  const RESERVATION_IMAGES = {
    "centrico": "https://thekingdominsider.com/wp-content/uploads/2024/06/IMG_0543-scaled.jpg",
    "carthay circle lounge": "https://d23.com/app/uploads/2013/04/1180w-600h_a-to-z-carthay-circle.jpg",
    "lamplight lounge": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQF3fYqrzp7uQQQKsqy8HxeMQfcIuEwHmhHmK5QaJCtODSzua2QV1Vsqgw&s=10",
    "lamplight lounge boardwalk": "https://www.disneyfoodblog.com/wp-content/uploads/2021/03/2020-disneyland-dca-california-adventure-pixar-pier-lamplight-lounge-atmo-2.jpg",
    "carnation cafe": "https://i0.wp.com/live.staticflickr.com/65535/50012186097_8f3c485c40_b.jpg?resize=1024%2C683&ssl=1",
    "blue bayou": "https://disneylanddaily.com/wp-content/uploads/2017/08/IMG_2450-2.jpg",
    "fantasmic dining package": "https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/1600/900/75/dam/wdpro-assets/dlr/parks-and-tickets/entertainment/disneyland/fantasmic/fantasmic-02.jpg?1785252442313",
  };

  const state = {
    tab: "eats", // "eats" | "adventures" | "reservations"
    park: "Disneyland",
    selectedAreas: { eats: new Set(), adventures: new Set() },
    eats: [],
    reservations: [],
    checked: new Map(), // key -> boolean
  };

  // Key of the checkbox that was just toggled by the user, so the render
  // pass can play a brief "pop" animation on it. Cleared right after that
  // render so a later poll/re-render doesn't replay it.
  let lastToggledKey = null;

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
    todayPicksFood: document.getElementById("today-picks-food"),
    todayPicksFoodEmpty: document.getElementById("today-picks-food-empty"),
    todayPicksAdventures: document.getElementById("today-picks-adventures"),
    todayPicksAdventuresEmpty: document.getElementById("today-picks-adventures-empty"),
    todayGrid: document.getElementById("today-grid"),
    countdownBox: document.getElementById("countdown-box"),
    countdownNumber: document.getElementById("countdown-number"),
    countdownLabel: document.getElementById("countdown-label"),
    syncNote: document.getElementById("sync-note"),
    addEntryBtn: document.getElementById("add-entry-btn"),
    addEntryDialog: document.getElementById("add-entry-dialog"),
    addEntryForm: document.getElementById("add-entry-form"),
    addTypeToggle: document.getElementById("add-type-toggle"),
    addFood: document.getElementById("add-food"),
    addPark: document.getElementById("add-park"),
    addArea: document.getElementById("add-area"),
    addLocation: document.getElementById("add-location"),
    addPriority: document.getElementById("add-priority"),
    addEntryError: document.getElementById("add-entry-error"),
    addEntryCancel: document.getElementById("add-entry-cancel"),
    addEntrySubmit: document.getElementById("add-entry-submit"),
  };

  function daysUntilTrip() {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((TRIP_START.getTime() - todayMidnight.getTime()) / 86400000);
  }

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

  // Looks up a CSV column by name, ignoring case and stray leading/trailing
  // whitespace in the header cell (a common copy-paste artifact in Sheets)
  // so e.g. "Date ", "DATE", and "date" all resolve to the same field.
  function pickField(row, name) {
    const target = name.trim().toLowerCase();
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === target);
    return key === undefined ? undefined : row[key];
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
    // An item is Eats only if this column is explicitly marked truthy/1;
    // anything else (blank, 0, "false", unrecognized text, ...) is an
    // Adventure. Handles both a plain 0/1 column and a Sheets checkbox
    // column, which exports as the literal text "TRUE"/"FALSE" rather
    // than a number.
    const bool01 = (val) => {
      const s = (val ?? "").toString().trim().toLowerCase();
      if (["true", "yes", "y"].includes(s)) return 1;
      return parseFloat(s) === 1 ? 1 : 0;
    };
    const Park = str(pickField(raw, "Park"), "Not listed");
    const Area = str(pickField(raw, "Area"), "Not listed");
    const Food = str(pickField(raw, "Food"), "Unnamed Item");
    return {
      Park,
      Area,
      Food,
      Location: str(pickField(raw, "Location"), "Not listed"),
      Priority: Math.round(num(pickField(raw, "Priority"), 3)),
      Eats: bool01(pickField(raw, "Eats?")),
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

    // Parsed manually (not via `new Date(string)`) because browsers disagree
    // on which string formats they accept — notably Safari/iOS rejects
    // non-zero-padded ISO dates like "2026-8-9" that Chrome parses fine,
    // which silently turned every reservation into the same "unknown" date
    // on iPhone. new Date(year, month, day) behaves identically everywhere.

    // M/D/YYYY or M-D-YYYY (Google Sheets' default US date export format)
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));

    // YYYY-MM-DD (ISO date-only), zero-padded or not
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    // Google Sheets serial date (days since Dec 30 1899), in case the
    // column isn't formatted as a date and exports as a raw number
    if (/^\d+(\.\d+)?$/.test(s)) {
      const serial = parseFloat(s);
      if (serial > 20000 && serial < 60000) {
        const epoch = new Date(1899, 11, 30);
        return new Date(epoch.getFullYear(), epoch.getMonth(), epoch.getDate() + Math.floor(serial));
      }
    }

    // Last resort for anything else (e.g. "August 20, 2026")
    const native = new Date(s);
    if (!Number.isNaN(native.getTime())) {
      return new Date(native.getFullYear(), native.getMonth(), native.getDate());
    }

    return null;
  }

  function dateKey(d) {
    if (!d) return "unknown";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function normalizeName(s) {
    return (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents, e.g. "Céntrico" -> "Centrico"
      .trim()
      .toLowerCase();
  }

  function findReservationImage(name) {
    const normalized = normalizeName(name);
    if (RESERVATION_IMAGES[normalized]) return RESERVATION_IMAGES[normalized];
    // Fall back to a partial match, e.g. "Lamplight Lounge Boardwalk Dining"
    // should still match a "lamplight lounge" entry if no exact one exists.
    const match = Object.keys(RESERVATION_IMAGES).find(
      (key) => RESERVATION_IMAGES[key] && (normalized.includes(key) || key.includes(normalized))
    );
    return match ? RESERVATION_IMAGES[match] : "";
  }

  function cleanReservationRow(raw) {
    const str = (val, fallback) => {
      const s = (val ?? "").toString().trim();
      return s.length ? s : fallback;
    };
    const dateObj = parseDateCell(pickField(raw, "date"));
    const minutes = parseMilitaryTime(pickField(raw, "time"));
    const reservation = str(pickField(raw, "reservation"), "Reservation");
    return {
      Reservation: reservation,
      Area: str(pickField(raw, "area"), "Not listed"),
      DateObj: dateObj,
      DateKey: dateKey(dateObj),
      DateLabel: dateObj
        ? dateObj.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
        : str(pickField(raw, "date"), "Date TBD"),
      Minutes: minutes,
      TimeLabel: formatMinutes(minutes),
      Conflict: false,
      ImageUrl: findReservationImage(reservation),
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
    lastToggledKey = key;
    renderAll();
    lastToggledKey = null;

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

  function openAddDialog() {
    els.addEntryForm.reset();
    els.addEntryError.hidden = true;
    els.addPark.value = state.park;
    els.addPriority.value = "2";

    const defaultEats = state.tab === "adventures" ? "0" : "1";
    els.addTypeToggle.querySelectorAll(".seg").forEach((b) => {
      b.classList.toggle("active", b.dataset.eats === defaultEats);
    });

    els.addEntryDialog.showModal();
    els.addFood.focus();
  }

  async function submitAddEntry(event) {
    event.preventDefault();
    els.addEntryError.hidden = true;

    const food = els.addFood.value.trim();
    if (!food) {
      els.addEntryError.textContent = "Give it a name first.";
      els.addEntryError.hidden = false;
      els.addFood.focus();
      return;
    }

    if (!CHECKLIST_API_URL) {
      els.addEntryError.textContent = "Adding entries needs the shared checklist backend set up first — see README.";
      els.addEntryError.hidden = false;
      return;
    }

    const activeType = els.addTypeToggle.querySelector(".seg.active");
    const eatsValue = activeType && activeType.dataset.eats === "0" ? 0 : 1;
    const park = els.addPark.value;
    const area = els.addArea.value.trim() || "Not listed";
    const location = els.addLocation.value.trim() || "Not listed";
    const priority = Number(els.addPriority.value) || 2;

    els.addEntrySubmit.disabled = true;
    els.addEntrySubmit.textContent = "Adding…";

    try {
      const params = new URLSearchParams({
        action: "add",
        park,
        area,
        food,
        location,
        priority: String(priority),
        eats: String(eatsValue),
      });
      const res = await fetch(`${CHECKLIST_API_URL}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Couldn't add that item.");

      state.eats.push({
        Park: park,
        Area: area,
        Food: food,
        Location: location,
        Priority: priority,
        Eats: eatsValue,
        Key: itemKey(park, area, food),
      });

      // Jump to wherever the new item actually lives so it's immediately visible.
      state.tab = eatsValue === 1 ? "eats" : "adventures";
      els.tabButtons.forEach((b) => {
        const active = b.dataset.tab === state.tab;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      state.selectedAreas[state.tab].clear();
      state.park = park;
      els.parkToggle.querySelectorAll(".seg").forEach((b) => b.classList.toggle("active", b.dataset.park === park));

      spawnSparkles(els.addEntryBtn);
      els.addEntryDialog.close();
      renderAll();
    } catch (err) {
      console.warn("Couldn't add entry:", err);
      els.addEntryError.textContent = "Couldn't save that — check your connection and try again.";
      els.addEntryError.hidden = false;
    } finally {
      els.addEntrySubmit.disabled = false;
      els.addEntrySubmit.textContent = "Add to list";
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
    const pop = key === lastToggledKey ? " pop" : "";
    return `
      <label class="tried-toggle">
        <input type="checkbox" class="${pop.trim()}" data-key="${escapeHtml(key)}" ${checked ? "checked" : ""} />
        <span>Tried it</span>
      </label>
    `;
  }

  const SPARKLE_CHARS = ["✦", "✧", "★"];
  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function spawnSparkles(anchorEl) {
    if (prefersReducedMotion()) return;
    const rect = anchorEl.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      const distance = 20 + Math.random() * 14;
      const sparkle = document.createElement("span");
      sparkle.className = "sparkle";
      sparkle.textContent = SPARKLE_CHARS[i % SPARKLE_CHARS.length];
      sparkle.style.left = `${originX}px`;
      sparkle.style.top = `${originY}px`;
      sparkle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      sparkle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      sparkle.style.animationDelay = `${Math.random() * 60}ms`;
      sparkle.addEventListener("animationend", () => sparkle.remove());
      document.body.appendChild(sparkle);
    }
  }

  function bindCheckbox(container) {
    const input = container.querySelector('input[type="checkbox"]');
    if (!input) return;
    input.addEventListener("change", () => {
      if (input.checked) spawnSparkles(input);
      toggleChecked(input.dataset.key);
    });
  }

  function reservationThumbEl(r) {
    const initial = (r.Reservation.trim().charAt(0) || "?").toUpperCase();

    if (!r.ImageUrl) {
      const fallback = document.createElement("span");
      fallback.className = "resv-row__thumb resv-row__thumb--fallback";
      fallback.textContent = initial;
      return fallback;
    }

    const img = document.createElement("img");
    img.className = "resv-row__thumb";
    img.src = r.ImageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      const fallback = document.createElement("span");
      fallback.className = "resv-row__thumb resv-row__thumb--fallback";
      fallback.textContent = initial;
      img.replaceWith(fallback);
    });
    return img;
  }

  function reservationRowEl(r) {
    const row = document.createElement("div");
    row.className = "resv-row" + (r.Conflict ? " is-conflict" : "");
    row.appendChild(reservationThumbEl(r));

    const main = document.createElement("span");
    main.className = "resv-row__main";
    main.innerHTML = `
      <span class="resv-row__time">${escapeHtml(r.TimeLabel)}</span>
      <span class="resv-row__body">
        <span class="resv-row__name">${escapeHtml(r.Reservation)}</span>
        <span class="resv-row__area">${escapeHtml(r.Area)}</span>
      </span>
      ${r.Conflict ? '<span class="conflict-badge">Conflict</span>' : ""}
    `;
    row.appendChild(main);
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

    const days = daysUntilTrip();
    const showCountdown = days > 0;
    els.todayGrid.hidden = showCountdown;
    els.countdownBox.hidden = !showCountdown;
    if (showCountdown) {
      els.countdownNumber.textContent = days;
      els.countdownLabel.textContent = days === 1 ? "Day til Disney" : "Days til Disney";
      showSyncNote(null); // nothing to sync yet — no checklist is showing
      return;
    }

    const todayKey = dateKey(today);
    const todaysResv = state.reservations
      .filter((r) => r.DateKey === todayKey)
      .sort((a, b) => (a.Minutes ?? 9999) - (b.Minutes ?? 9999));

    els.todayReservations.innerHTML = "";
    els.todayResvEmpty.hidden = todaysResv.length !== 0;
    todaysResv.forEach((r) => els.todayReservations.appendChild(reservationRowEl(r)));

    const topUnchecked = (eatsValue) =>
      state.eats
        .filter(
          (r) =>
            r.Priority === 1 &&
            r.Eats === eatsValue &&
            r.Park.toLowerCase().includes(state.park.toLowerCase()) &&
            !state.checked.get(r.Key)
        )
        .slice(0, 6);

    const foodPicks = topUnchecked(1);
    els.todayPicksFood.innerHTML = "";
    els.todayPicksFoodEmpty.hidden = foodPicks.length !== 0;
    foodPicks.forEach((r) => els.todayPicksFood.appendChild(pickRowEl(r)));

    const adventurePicks = topUnchecked(0);
    els.todayPicksAdventures.innerHTML = "";
    els.todayPicksAdventuresEmpty.hidden = adventurePicks.length !== 0;
    adventurePicks.forEach((r) => els.todayPicksAdventures.appendChild(pickRowEl(r)));
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
    els.addEntryBtn.hidden = isReservations;

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

    els.addEntryBtn.addEventListener("click", openAddDialog);
    els.addEntryCancel.addEventListener("click", () => els.addEntryDialog.close());
    els.addEntryForm.addEventListener("submit", submitAddEntry);
    els.addEntryDialog.addEventListener("click", (event) => {
      if (event.target === els.addEntryDialog) els.addEntryDialog.close();
    });
    els.addTypeToggle.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        els.addTypeToggle.querySelectorAll(".seg").forEach((b) => b.classList.toggle("active", b === btn));
      });
    });
  }

  function applySeasonalTheme() {
    if (!SEASONAL_THEME) return;
    document.body.classList.add(`theme-${SEASONAL_THEME}`);
    const favicon = SEASONAL_FAVICONS[SEASONAL_THEME];
    const link = document.querySelector('link[rel="icon"]');
    if (favicon && link) link.href = favicon;
  }

  // ─────────────────────────  INIT  ─────────────────────────
  async function init() {
    applySeasonalTheme();
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
