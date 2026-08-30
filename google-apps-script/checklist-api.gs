/**
 * Disney Eats & Adventures — shared "tried it" checklist backend.
 *
 * Bind this script to the Eats/Adventures Google Sheet (the one with
 * Park, Area, Food, Location, Priority, Eats? columns). It reads
 * and writes a "Checked" column so everyone in the group sees the same
 * checkmarks, kept in sync through the sheet itself.
 *
 * Setup:
 *   1. Open the Eats/Adventures Google Sheet.
 *   2. Extensions > Apps Script.
 *   3. Delete any starter code and paste this file's contents in. Save.
 *   4. Deploy > New deployment > select type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Copy the deployment URL (ends in /exec) and paste it into
 *      CHECKLIST_API_URL near the top of assets/app.js.
 *
 * Note: "Anyone" access means anyone with the URL can toggle checkmarks
 * (no login required) — fine for a private trip list shared only with
 * your group, but don't post the URL publicly.
 */

var SHEET_NAME = 'Sheet1'; // change if your Eats/Adventures tab is named differently
var CHECKED_COLUMN = 'Checked';

// The Reservations sheet is a separate spreadsheet from the one this
// script is bound to. This ID must match RESV_SHEET_ID in assets/app.js.
// The script runs "as Me", so whoever deploys it needs edit access to
// this spreadsheet too (not just the Eats/Adventures one).
var RESV_SHEET_ID = '1ErgL07yP9WRYNYWGNDxO0HcIesfilckC94NFlYX5pzU';
var RESV_SHEET_NAME = 'Sheet1'; // change if your Reservations tab is named differently

function doGet(e) {
  var action = e.parameter.action || 'list';
  if (action === 'set') {
    return jsonResponse(setChecked(e.parameter.key, e.parameter.checked === 'true'));
  }
  if (action === 'add') {
    return jsonResponse(addRow(e.parameter));
  }
  if (action === 'update') {
    return jsonResponse(updateRow(e.parameter));
  }
  if (action === 'resv_update') {
    return jsonResponse(updateReservationRow(e.parameter));
  }
  return jsonResponse(listChecked());
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function getResvSheet_() {
  var ss = SpreadsheetApp.openById(RESV_SHEET_ID);
  return ss.getSheetByName(RESV_SHEET_NAME) || ss.getSheets()[0];
}

// Case-insensitive header lookup — the Reservations sheet's documented
// columns are lowercase ("reservation", "area", ...) but "User" was added
// separately and may not match that convention.
function findCol_(headerMap, name) {
  var target = name.toLowerCase();
  var found = Object.keys(headerMap).find(function (k) { return k.toLowerCase() === target; });
  return found ? headerMap[found] : undefined;
}

function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) {
    map[String(h).trim()] = i + 1;
  });
  return map;
}

function ensureCheckedColumn_(sheet, headerMap) {
  if (headerMap[CHECKED_COLUMN]) return headerMap[CHECKED_COLUMN];
  var col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue(CHECKED_COLUMN);
  headerMap[CHECKED_COLUMN] = col;
  return col;
}

// Mirrors the key derivation in assets/app.js (itemKey/cleanEatsRow) exactly —
// keep these in sync if either side changes.
function cleanStr_(v, fallback) {
  var s = (v === null || v === undefined) ? '' : String(v).trim();
  return s.length ? s : fallback;
}

function buildKey_(park, area, food) {
  return [
    cleanStr_(park, 'Not listed'),
    cleanStr_(area, 'Not listed'),
    cleanStr_(food, 'Unnamed Item'),
  ].join('::').toLowerCase();
}

function listChecked() {
  var sheet = getSheet_();
  var headerMap = getHeaderMap_(sheet);
  var checkedCol = ensureCheckedColumn_(sheet, headerMap);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { items: [] };

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var items = values.map(function (row) {
    var key = buildKey_(row[headerMap['Park'] - 1], row[headerMap['Area'] - 1], row[headerMap['Food'] - 1]);
    var raw = row[checkedCol - 1];
    var checked = raw === true || String(raw).toUpperCase() === 'TRUE';
    return { key: key, checked: checked };
  });
  return { items: items };
}

function setChecked(key, checked) {
  if (!key) return { ok: false, error: 'Missing key' };

  var sheet = getSheet_();
  var headerMap = getHeaderMap_(sheet);
  var checkedCol = ensureCheckedColumn_(sheet, headerMap);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'No data rows' };

  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    var rowKey = buildKey_(
      values[i][headerMap['Park'] - 1],
      values[i][headerMap['Area'] - 1],
      values[i][headerMap['Food'] - 1]
    );
    if (rowKey === key) {
      sheet.getRange(i + 2, checkedCol).setValue(checked);
      return { ok: true, key: key, checked: checked };
    }
  }
  return { ok: false, error: 'Key not found' };
}

// Appends a new row from the "Add to the list" form in the app. Takes a
// script lock so two people adding an entry at the same moment can't both
// read the same "last row" and overwrite each other.
function addRow(fields) {
  var food = cleanStr_(fields.food, '');
  if (!food) return { ok: false, error: 'Missing name' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: 'Sheet is busy, try again' };
  }

  try {
    var sheet = getSheet_();
    var headerMap = getHeaderMap_(sheet);
    ensureCheckedColumn_(sheet, headerMap);

    var lastCol = sheet.getLastColumn();
    var rowValues = new Array(lastCol).fill('');

    var setField = function (name, value) {
      var col = headerMap[name];
      if (col) rowValues[col - 1] = value;
    };

    setField('Park', cleanStr_(fields.park, 'Not listed'));
    setField('Area', cleanStr_(fields.area, 'Not listed'));
    setField('Food', food);
    setField('Location', cleanStr_(fields.location, 'Not listed'));
    setField('Priority', fields.priority || '3');
    setField('Eats?', fields.eats === '0' ? '0' : '1');

    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, lastCol).setValues([rowValues]);

    return { ok: true, key: buildKey_(fields.park, fields.area, food) };
  } finally {
    lock.releaseLock();
  }
}

// Updates an existing Eats/Adventures row in place, located by the
// Park/Area/Food it had before the edit (fields.originalKey) — mirrors how
// setChecked locates a row, so renaming an item updates it rather than
// creating a duplicate.
function updateRow(fields) {
  var food = cleanStr_(fields.food, '');
  if (!food) return { ok: false, error: 'Missing name' };
  if (!fields.originalKey) return { ok: false, error: 'Missing original item' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: 'Sheet is busy, try again' };
  }

  try {
    var sheet = getSheet_();
    var headerMap = getHeaderMap_(sheet);
    ensureCheckedColumn_(sheet, headerMap);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'No data rows' };

    var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < values.length; i++) {
      var rowKey = buildKey_(
        values[i][headerMap['Park'] - 1],
        values[i][headerMap['Area'] - 1],
        values[i][headerMap['Food'] - 1]
      );
      if (rowKey !== fields.originalKey) continue;

      var rowNum = i + 2;
      var setCell = function (name, value) {
        var col = headerMap[name];
        if (col) sheet.getRange(rowNum, col).setValue(value);
      };
      setCell('Park', cleanStr_(fields.park, 'Not listed'));
      setCell('Area', cleanStr_(fields.area, 'Not listed'));
      setCell('Food', food);
      setCell('Location', cleanStr_(fields.location, 'Not listed'));
      setCell('Priority', fields.priority || '3');
      setCell('Eats?', fields.eats === '0' ? '0' : '1');

      return { ok: true, key: buildKey_(fields.park, fields.area, food) };
    }
    return { ok: false, error: "Couldn't find that item anymore — it may have changed. Refresh and try again." };
  } finally {
    lock.releaseLock();
  }
}

// Reservation Date/Time cells may come back from getValues() as real Date
// objects (if the column is formatted as a date/time) or as plain text,
// depending on how the sheet is set up. These normalize either form into
// the same canonical shape the app already computes on the client
// (dateKey "YYYY-MM-DD" and minutes-since-midnight), so a row can be
// matched by content regardless of cell formatting.
function pad2_(v) {
  var s = String(v);
  return s.length < 2 ? '0' + s : s;
}

function normalizeDate_(raw) {
  if (Object.prototype.toString.call(raw) === '[object Date]') {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + pad2_(m[1]) + '-' + pad2_(m[2]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  return s;
}

function normalizeMinutes_(raw) {
  if (Object.prototype.toString.call(raw) === '[object Date]') {
    return raw.getHours() * 60 + raw.getMinutes();
  }
  var s = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if (!s) return -1;
  var ampm = s.match(/^(\d{1,2}):?(\d{2})?\s*([AaPp][Mm])$/);
  if (ampm) {
    var h = parseInt(ampm[1], 10) % 12;
    var mnt = parseInt(ampm[2] || '0', 10);
    if (/p/i.test(ampm[3])) h += 12;
    return h * 60 + mnt;
  }
  var colon = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  var digits = s.replace(/\D/g, '');
  if (digits.length === 3) return parseInt(digits[0], 10) * 60 + parseInt(digits.slice(1), 10);
  if (digits.length === 4) return parseInt(digits.slice(0, 2), 10) * 60 + parseInt(digits.slice(2), 10);
  return -1;
}

// Updates an existing Reservations row in place. Located by the
// reservation/area/date/time it had before the edit — sent by the app as
// the same canonical values it already displays (originalReservation,
// originalArea, originalDateKey, originalMinutes) rather than raw sheet
// text, since Date/Time cells may not round-trip as the same string.
function updateReservationRow(fields) {
  var reservation = cleanStr_(fields.reservation, '');
  if (!reservation) return { ok: false, error: 'Missing reservation name' };
  if (!fields.originalReservation) return { ok: false, error: 'Missing original reservation' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return { ok: false, error: 'Sheet is busy, try again' };
  }

  try {
    var sheet = getResvSheet_();
    var headerMap = getHeaderMap_(sheet);
    var resvCol = findCol_(headerMap, 'reservation');
    var areaCol = findCol_(headerMap, 'area');
    var dateCol = findCol_(headerMap, 'date');
    var timeCol = findCol_(headerMap, 'time');
    var userCol = findCol_(headerMap, 'user');
    if (!resvCol || !areaCol || !dateCol || !timeCol) {
      return { ok: false, error: 'Reservations sheet is missing an expected column' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: false, error: 'No data rows' };

    var origReservation = fields.originalReservation.trim().toLowerCase();
    var origArea = cleanStr_(fields.originalArea, 'Not listed').toLowerCase();
    var origDateKey = fields.originalDateKey || '';
    var origMinutes = (fields.originalMinutes !== undefined && fields.originalMinutes !== '')
      ? parseInt(fields.originalMinutes, 10) : -1;

    var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var matches =
        cleanStr_(row[resvCol - 1], '').trim().toLowerCase() === origReservation &&
        cleanStr_(row[areaCol - 1], 'Not listed').toLowerCase() === origArea &&
        normalizeDate_(row[dateCol - 1]) === origDateKey &&
        normalizeMinutes_(row[timeCol - 1]) === origMinutes;
      if (!matches) continue;

      var rowNum = i + 2;
      sheet.getRange(rowNum, resvCol).setValue(reservation);
      sheet.getRange(rowNum, areaCol).setValue(cleanStr_(fields.area, 'Not listed'));
      sheet.getRange(rowNum, dateCol).setValue(cleanStr_(fields.date, ''));
      sheet.getRange(rowNum, timeCol).setValue(cleanStr_(fields.time, ''));
      if (userCol) sheet.getRange(rowNum, userCol).setValue(cleanStr_(fields.user, ''));

      return { ok: true };
    }
    return { ok: false, error: "Couldn't find that reservation anymore — it may have changed. Refresh and try again." };
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
