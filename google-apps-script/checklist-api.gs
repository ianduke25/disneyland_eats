/**
 * Disney Eats & Adventures — shared "tried it" checklist backend.
 *
 * Bind this script to the Eats/Adventures Google Sheet (the one with
 * Park, Area, Food, Location, Price, Priority, Eats? columns). It reads
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

function doGet(e) {
  var action = e.parameter.action || 'list';
  if (action === 'set') {
    return jsonResponse(setChecked(e.parameter.key, e.parameter.checked === 'true'));
  }
  return jsonResponse(listChecked());
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
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

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
