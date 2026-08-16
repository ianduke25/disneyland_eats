(() => {
  "use strict";

  const SHEET_ID = "1RdbRqKf16xl57QhQau1UuLr4Hj2OEiy4etDsbLIF9fw";
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

  const state = {
    tab: "eats", // "eats" | "adventures"
    park: "Disneyland",
    selectedAreas: { eats: new Set(), adventures: new Set() },
    rows: [],
  };

  const els = {
    tabButtons: document.querySelectorAll(".tab"),
    parkToggle: document.getElementById("park-toggle"),
    areaChips: document.getElementById("area-chips"),
    resultsTitle: document.getElementById("results-title"),
    resultCount: document.getElementById("result-count"),
    cardGrid: document.getElementById("card-grid"),
    emptyState: document.getElementById("empty-state"),
    status: document.getElementById("status"),
    lastUpdated: document.getElementById("last-updated"),
  };

  function setStatus(message, isError = false) {
    if (!message) {
      els.status.hidden = true;
      return;
    }
    els.status.hidden = false;
    els.status.textContent = message;
    els.status.classList.toggle("is-error", isError);
  }

  function cleanRow(raw) {
    const num = (val, fallback) => {
      const n = parseFloat(val);
      return Number.isFinite(n) ? n : fallback;
    };
    const str = (val, fallback) => {
      const s = (val ?? "").toString().trim();
      return s.length ? s : fallback;
    };
    return {
      Park: str(raw.Park, "Not listed"),
      Area: str(raw.Area, "Not listed"),
      Food: str(raw.Food, "Unnamed Item"),
      Location: str(raw.Location, "Not listed"),
      Price: num(raw.Price, 0),
      Priority: Math.round(num(raw.Priority, 3)),
      Eats: Math.round(num(raw["Eats?"], 1)),
    };
  }

  async function loadData() {
    setStatus("Loading menu data…");
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Failed to load data (HTTP ${res.status})`);
    const csvText = await res.text();

    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (parsed.errors && parsed.errors.length) {
      console.warn("CSV parse warnings:", parsed.errors);
    }
    state.rows = parsed.data.map(cleanRow);
    els.lastUpdated.textContent = new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
    setStatus(null);
  }

  function prioBadge(p) {
    const clamped = [1, 2, 3].includes(p) ? p : 3;
    return `<span class="prio prio-${clamped}">${clamped}</span>`;
  }

  function getFilteredByParkAndTab() {
    const eatsValue = state.tab === "eats" ? 1 : 0;
    return state.rows.filter(
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
    els.emptyState.hidden = rows.length !== 0;

    const sorted = [...rows].sort((a, b) => a.Priority - b.Priority);

    for (const row of sorted) {
      const card = document.createElement("article");
      card.className = "food-card";
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
      `;
      els.cardGrid.appendChild(card);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    const scoped = getFilteredByParkAndTab();
    const areas = [...new Set(scoped.map((r) => r.Area))].sort((a, b) => a.localeCompare(b));

    renderAreaChips(areas);

    const selected = state.selectedAreas[state.tab];
    const effectiveAreas = selected.size ? [...selected] : areas;
    const filtered = scoped.filter((r) => effectiveAreas.includes(r.Area));

    els.resultsTitle.textContent = state.tab === "eats" ? "So you should try…" : "So you should explore…";
    els.resultCount.textContent = filtered.length === 1 ? "1 item" : `${filtered.length} items`;

    renderCards(filtered);
  }

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
        render();
      });
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadData();
      render();
    } catch (err) {
      console.error(err);
      setStatus(`Couldn't load the menu data. ${err.message || ""}`.trim(), true);
    }
  }

  init();
})();
