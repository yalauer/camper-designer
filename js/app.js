// Camper-Planner — App-Logik (State, UI, Drag & Drop, Persistenz)

const STORAGE_KEY = "camper-planner-v1";
const SNAP = 10; // mm Raster beim Verschieben (Alt-Taste: 1 mm)

const BOX_PALETTE = ["#e8b04b", "#7fb069", "#6c9bd1", "#d17a7a", "#9b8bc4", "#5fb3a3", "#c98f5e", "#8a9a5b"];

const PRESETS = [
  { name: "Bett", l: 1900, w: 1350, h: 400 },
  { name: "Küchenblock", l: 1000, w: 500, h: 900 },
  { name: "Kühlbox", l: 600, w: 400, h: 450 },
  { name: "Schrank", l: 500, w: 400, h: 1100 },
  { name: "Wassertank", l: 600, w: 300, h: 350 },
  { name: "Eurobox", l: 600, w: 400, h: 320 },
];

const state = {
  vehicleId: VEHICLES[0].id,
  variantId: VEHICLES[0].variants[0].id,
  view: "top",
  orbit: { az: -32, el: 26 }, // Kamerawinkel der frei drehbaren 3D-Ansicht
  renderMode: "solid",
  boxes: [],
  extraWindows: [], // benutzerdefinierte Fenster (inkl. Dachfenster, side:"roof")
  doors: [],          // editierbare Türen, aus der Variante initialisiert
  doorsVariantId: null, // zu welcher Variante state.doors gehört
  groupNames: {},     // optionale Namen je groupId ({ "g1": "Küchenzeile" })
  collapsedGroups: [], // eingeklappte Gruppen in der Möbelliste (nur Anzeige)
  selectedBoxId: null,    // primäre Auswahl (steuert Edit-Panel)
  selectedBoxIds: [],     // Mehrfachauswahl (für Verbinden); enthält selectedBoxId
  selectedWindowId: null,
  selectedDoorId: null,
  bench: null,            // Schnierle SL3 auf Bodenschienen (null = keine)
  benchSelected: false,   // Bank ist die aktuelle Auswahl (statt einer Box)
  showWeight: false,      // Gewicht/Schwerpunkt-Anzeige
  showDims: true,         // Maßketten der gewählten Box
  showClash: true,        // Kollisionen rot hervorheben (abschaltbar)
  // Frei definierbare Filter über das ganze Fahrzeug (Strom, Wasser, Gas, …).
  // Nicht zu verwechseln mit groupId ("⛓ Verbinden") — das ist eine geometrische
  // Baugruppe. Ein Filter ist eine reine Markierung, n:m, ohne Geometriewirkung.
  filters: [],            // [{ id, name, color }]
  activeFilterIds: [],    // mehrere gleichzeitig möglich; leer = kein Filter aktiv
  lastFilterIds: [],      // zuletzt aktive Auswahl (für den Toolbar-Schalter)
  nextFilterNum: 1,
  snap: true,             // Einrasten an Wänden/Nachbarboxen
  nextBoxNum: 1,
  nextWindowNum: 1,
  nextGroupNum: 1,
  nextDoorNum: 1,
};

// Fahrzeug-Gewichtsdaten (Leergewicht / zul. Gesamtgewicht in kg) je Modell.
// Richtwerte für die Zuladungsrechnung; pro Variante ähnlich genug.
const VEHICLE_WEIGHTS = {
  "vw-t5": { kerb: 1900, gross: 3000 },
  "trafic-3": { kerb: 1900, gross: 3070 },
  "master": { kerb: 2100, gross: 3500 },
  "transit": { kerb: 2080, gross: 3500 },
};

const SNAP_DIST = 40; // mm Fangabstand fürs Einrasten

// Undo/Redo: Schnappschüsse des planbaren Zustands.
const history = { past: [], future: [], limit: 60 };
let suspendHistory = false;

let renderer;

function currentVehicle() {
  return VEHICLES.find((v) => v.id === state.vehicleId) || VEHICLES[0];
}
function currentVariant() {
  const v = currentVehicle();
  return v.variants.find((x) => x.id === state.variantId) || v.variants[0];
}
function selectedBox() {
  return state.boxes.find((b) => b.id === state.selectedBoxId) || null;
}

// Auswahl setzen: primär = id, Mehrfachauswahl optional erweitern (Strg/Shift)
function selectBox(id, additive) {
  state.selectedWindowId = null;
  state.selectedDoorId = null;
  state.benchSelected = false;
  if (!id) {
    if (!additive) { state.selectedBoxId = null; state.selectedBoxIds = []; }
    return;
  }
  if (additive) {
    const i = state.selectedBoxIds.indexOf(id);
    if (i >= 0) {
      state.selectedBoxIds.splice(i, 1); // erneutes Klicken hebt Auswahl auf
      state.selectedBoxId = state.selectedBoxIds[state.selectedBoxIds.length - 1] || null;
    } else {
      state.selectedBoxIds.push(id);
      state.selectedBoxId = id;
    }
  } else {
    state.selectedBoxId = id;
    state.selectedBoxIds = [id];
  }
}

function isSelected(id) {
  return state.selectedBoxIds.includes(id);
}

// Boxen einer Gruppe (gleiche groupId). Boxen ohne groupId sind allein.
function groupMembers(box) {
  if (!box || box.groupId == null) return box ? [box] : [];
  return state.boxes.filter((b) => b.groupId === box.groupId);
}

// Die aktuell für Verschiebung relevanten Boxen: bei Gruppe alle Mitglieder.
function moveSiblings(box) {
  return groupMembers(box);
}

// Frische Gruppen-ID, abgesichert gegen bestehende groupIds (z.B. nach Import,
// wo nextGroupNum hinter den vorhandenen Gruppen liegen kann).
function nextGroupId() {
  for (const b of state.boxes) {
    const m = /^g(\d+)$/.exec(b.groupId || "");
    if (m) state.nextGroupNum = Math.max(state.nextGroupNum, +m[1] + 1);
  }
  return "g" + state.nextGroupNum++;
}

function connectSelected() {
  const ids = state.selectedBoxIds;
  if (ids.length < 2) return;
  pushHistory();
  const gid = nextGroupId();
  for (const b of state.boxes) if (ids.includes(b.id)) b.groupId = gid;
  refresh();
}

function disconnectSelected() {
  const box = selectedBox();
  if (!box || box.groupId == null) return;
  ungroup(box.groupId);
}

// Eine Gruppe anhand ihrer ID auflösen (groupId von allen Mitgliedern entfernen).
function ungroup(gid) {
  if (gid == null) return;
  pushHistory();
  for (const b of state.boxes) if (b.groupId === gid) delete b.groupId;
  if (state.groupNames) delete state.groupNames[gid];
  state.collapsedGroups = state.collapsedGroups.filter((g) => g !== gid);
  refresh();
}

// Ein-/Ausklappen einer Gruppe in der Möbelliste. Reiner Anzeigezustand —
// bewusst nicht im Undo-Snapshot, sonst würde Strg+Z das Aufklappen rückgängig
// machen statt der letzten Planänderung.
function isGroupCollapsed(gid) {
  return state.collapsedGroups.includes(gid);
}

function toggleGroupCollapsed(gid) {
  if (isGroupCollapsed(gid)) {
    state.collapsedGroups = state.collapsedGroups.filter((g) => g !== gid);
  } else {
    state.collapsedGroups.push(gid);
  }
  refresh();
}

// Anzeigename einer Gruppe: benutzerdefiniert oder Standard "Gruppe N".
function groupDisplayName(gid, index) {
  const custom = state.groupNames && state.groupNames[gid];
  return custom && custom.trim() ? custom : `Gruppe ${index + 1}`;
}

// Gruppe umbenennen (leerer Name → Standardname wiederherstellen).
function renameGroup(gid, name) {
  if (!state.groupNames) state.groupNames = {};
  const v = (name || "").trim();
  if (v) state.groupNames[gid] = v; else delete state.groupNames[gid];
  save();
}

// Mehrere Boxen um ein gemeinsames Delta bewegen, begrenzt, sodass keine das
// Bauraum-Volumen verlässt (Gruppe bewegt sich als Block).
function moveBoxesBy(boxes, dx, dy, dz) {
  const c = currentVariant().cargo;
  for (const b of boxes) {
    dx = Math.max(-b.x, Math.min(dx, Math.max(0, c.length - b.l) - b.x));
    dy = Math.max(-b.y, Math.min(dy, Math.max(0, c.width - b.w) - b.y));
    dz = Math.max(-b.z, Math.min(dz, Math.max(0, c.height - b.h) - b.z));
  }
  for (const b of boxes) { b.x += dx; b.y += dy; b.z += dz; }
}

function deleteSelectedBoxes() {
  const ids = state.selectedBoxIds.length ? state.selectedBoxIds.slice() : (state.selectedBoxId ? [state.selectedBoxId] : []);
  if (!ids.length) return;
  pushHistory();
  state.boxes = state.boxes.filter((b) => !ids.includes(b.id));
  state.selectedBoxId = null;
  state.selectedBoxIds = [];
  refresh();
}

// Box aus altem Speicherstand mit Defaults für neue Felder versehen
function normalizeBox(b) {
  if (typeof b.opacity !== "number") b.opacity = 1;
  if (typeof b.subtract !== "boolean") b.subtract = false;
  if (typeof b.hidden !== "boolean") b.hidden = false;
  if (typeof b.weight !== "number") b.weight = 0;
  if (!Array.isArray(b.tags)) b.tags = [];
  // Migration: das frühere Häkchen „Braucht Strom" wird ein normaler Filter.
  if (b.power) {
    const f = ensureFilter("Strom", "#e0a800");
    if (!b.tags.includes(f.id)) b.tags.push(f.id);
  }
  delete b.power;
  b.pullout = normalizePullout(b.pullout, b);
  return b;
}

// Auszug: on/side + depth/w/h + u/v.
//   depth = Auszugsweg senkrecht zur Fläche
//   w/h   = Breite quer bzw. Höhe des Auszugs; 0 = so groß wie die Box
//   u/v   = Lage auf der Fläche, gemessen ab deren unterer/linker Kante
//           (u quer zur Auszugsrichtung, v nach oben ab Boxunterkante)
// box (optional) dient nur der Migration: früher saß der Auszug quer immer
// mittig, das wird beim ersten Laden in ein explizites u übersetzt.
function normalizePullout(p, box) {
  const out = { on: false, side: "rear", depth: 400, w: 0, h: 0, u: 0, v: 0 };
  if (!p || typeof p !== "object") return out;
  out.on = !!p.on;
  if (["front", "rear", "left", "right"].indexOf(p.side) >= 0) out.side = p.side;
  if (Number.isFinite(p.depth) && p.depth > 0) out.depth = p.depth;
  // "size" war der alte Name der Querbreite
  const w = Number.isFinite(p.w) ? p.w : p.size;
  if (Number.isFinite(w) && w >= 0) out.w = w;
  if (Number.isFinite(p.h) && p.h >= 0) out.h = p.h;
  if (Number.isFinite(p.u) && p.u >= 0) out.u = p.u;
  else if (box && out.w > 0) out.u = Math.max(0, (pulloutSpanU(out.side, box) - out.w) / 2);
  if (Number.isFinite(p.v) && p.v >= 0) out.v = p.v;
  return out;
}

// Auszug auf seine Fläche klemmen: Breite/Höhe nicht größer als die Box, und
// der Versatz so, dass der Auszug innerhalb der Fläche bleibt. Wird nach jeder
// Eingabe und nach Größenänderungen der Box angewendet.
function clampPullout(b) {
  const p = b.pullout;
  if (!p) return;
  const spanU = pulloutSpanU(p.side, b);
  p.w = Math.max(0, Math.min(p.w, spanU));
  p.h = Math.max(0, Math.min(p.h, b.h));
  p.u = p.w > 0 ? Math.max(0, Math.min(p.u, spanU - p.w)) : 0;
  p.v = p.h > 0 ? Math.max(0, Math.min(p.v, b.h - p.h)) : 0;
}

// ---------------------------------------------------------------------------
// Filter (frei definierbare Kategorien)
// ---------------------------------------------------------------------------
const FILTER_PALETTE = ["#e0a800", "#3f8ad8", "#4caf7d", "#c9576f", "#8a6fc4", "#c98f5e"];

function nextFilterId() {
  for (const f of state.filters) {
    const m = /^f(\d+)$/.exec(f.id || "");
    if (m) state.nextFilterNum = Math.max(state.nextFilterNum, +m[1] + 1);
  }
  return "f" + state.nextFilterNum++;
}

// Filter mit diesem Namen holen oder anlegen (idempotent — trägt die Migration).
function ensureFilter(name, color) {
  const found = state.filters.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (found) return found;
  const f = { id: nextFilterId(), name, color: color || FILTER_PALETTE[state.filters.length % FILTER_PALETTE.length] };
  state.filters.push(f);
  return f;
}

function addFilter(name) {
  const v = (name || "").trim();
  if (!v) return null;
  if (state.filters.some((f) => f.name.toLowerCase() === v.toLowerCase())) return null;
  pushHistory();
  const f = ensureFilter(v);
  refresh();
  return f;
}

function deleteFilter(id) {
  pushHistory();
  state.filters = state.filters.filter((f) => f.id !== id);
  for (const b of state.boxes) b.tags = (b.tags || []).filter((t) => t !== id);
  if (state.bench) state.bench.tags = (state.bench.tags || []).filter((t) => t !== id);
  state.activeFilterIds = state.activeFilterIds.filter((t) => t !== id);
  state.lastFilterIds = state.lastFilterIds.filter((t) => t !== id);
  refresh();
}

// Einzelnen Filter ein-/ausschalten. Mehrere dürfen gleichzeitig aktiv sein;
// ein Möbel bleibt sichtbar, sobald es zu EINEM aktiven Filter gehört.
function toggleFilterActive(id, on) {
  state.activeFilterIds = state.activeFilterIds.filter((t) => t !== id);
  if (on) state.activeFilterIds.push(id);
  state.lastFilterIds = state.activeFilterIds.slice();
  refresh();
}

function renameFilter(id, name) {
  const f = state.filters.find((x) => x.id === id);
  if (!f) return;
  const v = (name || "").trim();
  if (v) f.name = v;
  save();
}

// Zuordnung setzen — funktioniert für Boxen UND für die Sitzbank, beide
// tragen dieselbe `tags`-Liste.
function toggleBoxTag(target, id, on) {
  if (!target) return;
  pushHistory();
  target.tags = (target.tags || []).filter((t) => t !== id);
  if (on) target.tags.push(id);
  refresh();
}

// Das Objekt, dessen Filter-Zuordnung gerade bearbeitet wird: die Bank, wenn
// sie ausgewählt ist, sonst die gewählte Box.
function tagTarget() {
  if (state.benchSelected && state.bench && state.bench.on) return state.bench;
  return selectedBox();
}

function filterCount(id) {
  let n = state.boxes.filter((b) => (b.tags || []).includes(id)).length;
  if (state.bench && state.bench.on && (state.bench.tags || []).includes(id)) n++;
  return n;
}

function isValidWindow(w) {
  if (!w || typeof w.x !== "number") return false;
  if (w.side === "roof") return typeof w.y === "number" && w.width > 0 && w.length > 0;
  return ["left", "right", "rear"].includes(w.side) && w.width > 0 && w.height > 0 && typeof w.zBottom === "number";
}

function isValidFilter(f) {
  return f && typeof f.id === "string" && typeof f.name === "string" && f.name.trim() !== "";
}

// Aktive Filter aus einem gespeicherten Stand lesen. `single` trägt die
// Migration älterer Stände, die nur einen einzelnen aktiven Filter kannten.
function readFilterIds(many, single) {
  const raw = Array.isArray(many) ? many : (typeof single === "string" ? [single] : []);
  return raw.filter((id) => typeof id === "string");
}

function isValidDoor(d) {
  return d && typeof d.x === "number" && ["left", "right", "rear"].includes(d.side)
    && d.width > 0 && d.height > 0;
}

// ---------------------------------------------------------------------------
// Persistenz
// ---------------------------------------------------------------------------
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      vehicleId: state.vehicleId,
      variantId: state.variantId,
      view: state.view,
      orbit: state.orbit,
      renderMode: state.renderMode,
      showWeight: state.showWeight,
      showDims: state.showDims,
      showClash: state.showClash,
      filters: state.filters,
      activeFilterIds: state.activeFilterIds,
      lastFilterIds: state.lastFilterIds,
      nextFilterNum: state.nextFilterNum,
      snap: state.snap,
      bench: state.bench,
      boxes: state.boxes,
      extraWindows: state.extraWindows,
      doors: state.doors,
      doorsVariantId: state.doorsVariantId,
      groupNames: state.groupNames,
      collapsedGroups: state.collapsedGroups,
      selectedDoorId: state.selectedDoorId,
      nextBoxNum: state.nextBoxNum,
      nextWindowNum: state.nextWindowNum,
      nextGroupNum: state.nextGroupNum,
      nextDoorNum: state.nextDoorNum,
    }));
  } catch (e) { /* z.B. Speicher voll — Planung läuft ohne Persistenz weiter */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.vehicleId && VEHICLES.some((v) => v.id === d.vehicleId)) state.vehicleId = d.vehicleId;
    const veh = currentVehicle();
    if (d.variantId && veh.variants.some((v) => v.id === d.variantId)) state.variantId = d.variantId;
    if (d.view && (VIEWS[d.view] || d.view === "orbit")) state.view = d.view;
    if (d.orbit && typeof d.orbit.az === "number" && typeof d.orbit.el === "number") {
      state.orbit = { az: d.orbit.az, el: d.orbit.el };
    }
    if (d.renderMode === "wire" || d.renderMode === "solid") state.renderMode = d.renderMode;
    if (typeof d.showWeight === "boolean") state.showWeight = d.showWeight;
    if (typeof d.showDims === "boolean") state.showDims = d.showDims;
    if (typeof d.showClash === "boolean") state.showClash = d.showClash;
    if (Array.isArray(d.filters)) state.filters = d.filters.filter(isValidFilter);
    if (Number.isFinite(d.nextFilterNum)) state.nextFilterNum = d.nextFilterNum;
    // Mehrfachauswahl; ältere Stände hatten je einen einzelnen Filter
    state.activeFilterIds = readFilterIds(d.activeFilterIds, d.activeFilterId);
    state.lastFilterIds = readFilterIds(d.lastFilterIds, d.lastFilterId);
    if (typeof d.snap === "boolean") state.snap = d.snap;
    if (d.bench && typeof d.bench === "object") state.bench = clampBench(d.bench, currentVariant());
    if (Array.isArray(d.boxes)) state.boxes = d.boxes.filter((b) => b && typeof b.x === "number").map(normalizeBox);
    if (Array.isArray(d.extraWindows)) state.extraWindows = d.extraWindows.filter(isValidWindow);
    // Türen nur übernehmen, wenn sie zur geladenen Variante passen
    if (Array.isArray(d.doors) && d.doorsVariantId === state.variantId) {
      state.doors = d.doors.filter(isValidDoor);
      state.doorsVariantId = d.doorsVariantId;
    }
    if (d.groupNames && typeof d.groupNames === "object") state.groupNames = d.groupNames;
    // Nur Gruppen behalten, die es nach dem Laden wirklich noch gibt — sonst
    // sammeln sich Einträge aufgelöster Gruppen unbegrenzt an.
    if (Array.isArray(d.collapsedGroups)) {
      const live = new Set(state.boxes.map((b) => b.groupId).filter((g) => g != null));
      state.collapsedGroups = d.collapsedGroups.filter((g) => live.has(g));
    }
    if (typeof d.selectedDoorId === "string") state.selectedDoorId = d.selectedDoorId;
    if (typeof d.nextBoxNum === "number") state.nextBoxNum = d.nextBoxNum;
    if (typeof d.nextWindowNum === "number") state.nextWindowNum = d.nextWindowNum;
    if (typeof d.nextGroupNum === "number") state.nextGroupNum = d.nextGroupNum;
    if (typeof d.nextDoorNum === "number") state.nextDoorNum = d.nextDoorNum;
  } catch (e) { /* defekte Daten ignorieren */ }
}

// ---------------------------------------------------------------------------
// Boxen
// ---------------------------------------------------------------------------
// Position klemmen, sodass die Box im Bauraum bleibt — OHNE die Box-Maße zu
// verändern. So überleben Boxen einen Wechsel zu einem kleineren Fahrzeug und
// kehren beim Zurückwechseln unversehrt zurück. Passt eine Box (zu groß) nicht
// hinein, wird sie an Front/Boden/linke Wand gesetzt (x/y/z = 0).
function clampBoxPosition(box, variant) {
  const c = variant.cargo;
  box.x = Math.max(0, Math.min(box.x, Math.max(0, c.length - box.l)));
  box.y = Math.max(0, Math.min(box.y, Math.max(0, c.width - box.w)));
  box.z = Math.max(0, Math.min(box.z, Math.max(0, c.height - box.h)));
}

// Maße UND Position klemmen — nur bei expliziter Nutzereingabe von l/w/h.
function clampBox(box, variant) {
  const c = variant.cargo;
  box.l = Math.max(10, Math.min(box.l, c.length));
  box.w = Math.max(10, Math.min(box.w, c.width));
  box.h = Math.max(10, Math.min(box.h, c.height));
  clampBoxPosition(box, variant);
}

function addBox(name, l, w, h) {
  pushHistory();
  const variant = currentVariant();
  const box = {
    id: "b" + Math.random().toString(36).slice(2, 9),
    name: name || `Box ${state.nextBoxNum}`,
    l, w, h,
    x: 0, y: 0, z: 0,
    color: BOX_PALETTE[(state.nextBoxNum - 1) % BOX_PALETTE.length],
    opacity: 1,
    subtract: false,
    hidden: false,
    weight: 0,
    tags: [],
    pullout: { on: false, side: "rear", depth: 400, w: 0, h: 0, u: 0, v: 0 },
  };
  state.nextBoxNum++;
  // freie Stelle suchen: hinter dem Radkasten beginnen, sonst Mitte
  box.x = Math.min(variant.wheelArch.x + variant.wheelArch.length, Math.max(0, variant.cargo.length - l));
  box.y = (variant.cargo.width - w) / 2;
  clampBox(box, variant);
  state.boxes.push(box);
  selectBox(box.id, false);
  refresh();
}

function deleteBox(id) {
  pushHistory();
  state.boxes = state.boxes.filter((b) => b.id !== id);
  state.selectedBoxIds = state.selectedBoxIds.filter((x) => x !== id);
  if (state.selectedBoxId === id) state.selectedBoxId = state.selectedBoxIds[state.selectedBoxIds.length - 1] || null;
  refresh();
}

function toggleBoxHidden(id) {
  const b = state.boxes.find((x) => x.id === id);
  if (b) { pushHistory(); b.hidden = !b.hidden; refresh(); }
}

// Ganze Gruppe ein-/ausblenden: alle Mitglieder auf denselben Zustand setzen
// (umgeschaltet relativ dazu, ob die Gruppe aktuell ganz sichtbar ist).
function toggleGroupHidden(gid) {
  const members = state.boxes.filter((b) => b.groupId === gid);
  if (!members.length) return;
  pushHistory();
  const anyVisible = members.some((b) => !b.hidden);
  for (const b of members) b.hidden = anyVisible; // sichtbar → alle aus, sonst alle an
  refresh();
}

function duplicateBox(id) {
  const src = state.boxes.find((b) => b.id === id);
  if (!src) return;
  pushHistory();
  // Tiefe Kopie der verschachtelten Felder — sonst teilen sich Original und
  // Kopie dasselbe pullout-Objekt bzw. dieselbe tags-Liste.
  const copy = {
    ...src,
    id: "b" + Math.random().toString(36).slice(2, 9),
    name: src.name + " (Kopie)",
    x: src.x + 50, y: src.y + 50,
    tags: (src.tags || []).slice(),
    pullout: { ...normalizePullout(src.pullout, src) },
  };
  delete copy.groupId; // Kopie startet ungruppiert
  clampBox(copy, currentVariant());
  state.boxes.push(copy);
  selectBox(copy.id, false);
  refresh();
}

// Box um 90° um die Hochachse drehen: Länge/Breite tauschen, um den Mittelpunkt
// in der x-y-Ebene, damit die Box "an Ort und Stelle" rotiert. Bei Gruppen
// werden alle Mitglieder um den gemeinsamen Mittelpunkt gedreht.
function rotateBox90(id) {
  const box = state.boxes.find((b) => b.id === id);
  if (!box) return;
  pushHistory();
  const variant = currentVariant();
  const members = moveSiblings(box);
  // gemeinsamer x-y-Mittelpunkt der Gruppe
  let cx = 0, cy = 0;
  for (const b of members) { cx += b.x + b.l / 2; cy += b.y + b.w / 2; }
  cx /= members.length; cy /= members.length;
  for (const b of members) {
    const mx = b.x + b.l / 2, my = b.y + b.w / 2;
    // Position des Mittelpunkts um (cx,cy) um 90° drehen: (dx,dy)->(-dy,dx)
    const ndx = -(my - cy), ndy = (mx - cx);
    const nmx = cx + ndx, nmy = cy + ndy;
    [b.l, b.w] = [b.w, b.l]; // Maße tauschen
    b.x = nmx - b.l / 2;
    b.y = nmy - b.w / 2;
    // Auszugsrichtung mitdrehen, sonst zeigt der Auszug nach der Drehung
    // in die falsche Richtung.
    if (b.pullout && b.pullout.on) {
      const turn = { rear: "left", left: "front", front: "right", right: "rear" };
      b.pullout.side = turn[b.pullout.side] || b.pullout.side;
    }
    clampBox(b, variant);
    clampPullout(b); // Fläche hat nach der Drehung eine andere Ausdehnung
  }
  refresh();
}

// ---------------------------------------------------------------------------
// Gewicht & Schwerpunkt
// ---------------------------------------------------------------------------
function weightSummary() {
  const boxes = state.boxes.filter((b) => !b.hidden);
  let total = 0, mx = 0, my = 0;
  for (const b of boxes) {
    const wkg = b.weight || 0;
    total += wkg;
    mx += wkg * (b.x + b.l / 2);
    my += wkg * (b.y + b.w / 2);
  }
  // Sitzbank zählt mit — sie ist ein erheblicher Anteil der Zuladung
  if (state.bench && state.bench.on) {
    const g = benchSolids(state.bench, currentVariant()).aabb;
    const wkg = state.bench.weight || SL3.weight;
    total += wkg;
    mx += wkg * (g.x0 + g.x1) / 2;
    my += wkg * (g.y0 + g.y1) / 2;
  }
  const com = total > 0 ? { x: mx / total, y: my / total } : null;
  const wv = VEHICLE_WEIGHTS[state.vehicleId];
  const payload = wv ? wv.gross - wv.kerb : null; // max. Zuladung
  return { total, com, kerb: wv ? wv.kerb : null, gross: wv ? wv.gross : null, payload };
}

// ---------------------------------------------------------------------------
// Snapping: Box-Kante an Wände / Nachbarbox-Kanten einrasten
// ---------------------------------------------------------------------------
// Liefert eine eingerastete Koordinate für die führende Box-Kante entlang einer
// Achse. lo/hi = aktuelle Box-Kanten, cargoMax = Wand, others = Kantenlisten.
function snapAxis(lo, size, cargoMax, edges) {
  const candidates = [0, cargoMax - size, ...edges.map((e) => e), ...edges.map((e) => e - size)];
  let best = lo, bestD = SNAP_DIST + 1;
  for (const c of candidates) {
    const d = Math.abs(c - lo);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= SNAP_DIST ? best : lo;
}

// Kanten aller anderen (sichtbaren) Boxen entlang einer Achse sammeln.
function neighborEdges(box, axisLo, axisSize) {
  const out = [];
  for (const b of state.boxes) {
    if (b.id === box.id || b.hidden) continue;
    out.push(b[axisLo], b[axisLo] + b[axisSize]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------
function planSnapshot() {
  // Nur planbare Daten (kein Auswahl-/Toggle-State).
  return JSON.stringify({
    boxes: state.boxes, extraWindows: state.extraWindows,
    doors: state.doors, doorsVariantId: state.doorsVariantId,
    vehicleId: state.vehicleId, variantId: state.variantId,
    bench: state.bench,
    filters: state.filters,
    nextBoxNum: state.nextBoxNum, nextWindowNum: state.nextWindowNum,
    nextGroupNum: state.nextGroupNum, nextDoorNum: state.nextDoorNum,
    nextFilterNum: state.nextFilterNum,
  });
}

function pushHistory() {
  if (suspendHistory) return;
  history.past.push(planSnapshot());
  if (history.past.length > history.limit) history.past.shift();
  history.future.length = 0; // neue Aktion verwirft Redo-Stack
}

function restoreSnapshot(snap) {
  const d = JSON.parse(snap);
  // Filter VOR den Boxen zurückspielen — normalizeBox migriert altes `power`
  // und würde sonst einen zweiten „Strom"-Filter anlegen.
  if (Array.isArray(d.filters)) state.filters = d.filters.filter(isValidFilter);
  if (Number.isFinite(d.nextFilterNum)) state.nextFilterNum = d.nextFilterNum;
  state.activeFilterIds = state.activeFilterIds.filter((id) => state.filters.some((f) => f.id === id));
  state.boxes = (d.boxes || []).map(normalizeBox);
  state.extraWindows = d.extraWindows || [];
  state.doors = d.doors || [];
  state.doorsVariantId = d.doorsVariantId || null;
  if (d.vehicleId) state.vehicleId = d.vehicleId;
  if (d.variantId) state.variantId = d.variantId;
  state.nextBoxNum = d.nextBoxNum || 1;
  state.nextWindowNum = d.nextWindowNum || 1;
  state.nextGroupNum = d.nextGroupNum || 1;
  state.nextDoorNum = d.nextDoorNum || 1;
  state.bench = d.bench ? clampBench(d.bench, currentVariant()) : null;
  state.selectedBoxId = null; state.selectedBoxIds = [];
  state.selectedWindowId = null; state.selectedDoorId = null;
  state.benchSelected = false;
}

function undo() {
  if (!history.past.length) return;
  history.future.push(planSnapshot());
  restoreSnapshot(history.past.pop());
  fillVehicleSelects();
  el("variant-select").value = state.variantId;
  suspendHistory = true; refresh(); suspendHistory = false;
}

function redo() {
  if (!history.future.length) return;
  history.past.push(planSnapshot());
  restoreSnapshot(history.future.pop());
  fillVehicleSelects();
  el("variant-select").value = state.variantId;
  suspendHistory = true; refresh(); suspendHistory = false;
}

// ---------------------------------------------------------------------------
// Fenster (benutzerdefiniert, inkl. Dachfenster)
// ---------------------------------------------------------------------------
function clampWindow(w, variant) {
  const c = variant.cargo;
  if (w.side === "roof") {
    w.width = Math.max(50, Math.min(w.width, c.length));
    w.length = Math.max(50, Math.min(w.length, c.width));
    w.x = Math.max(0, Math.min(w.x, c.length - w.width));
    w.y = Math.max(0, Math.min(w.y, c.width - w.length));
  } else {
    // Längsausdehnung an Wand: left/right entlang x, rear entlang y
    const span = w.side === "rear" ? c.width : c.length;
    w.width = Math.max(50, Math.min(w.width, span));
    w.height = Math.max(50, Math.min(w.height, c.height));
    w.x = Math.max(0, Math.min(w.x, span - w.width));
    w.zBottom = Math.max(0, Math.min(w.zBottom, c.height - w.height));
  }
}

function addWindow(side) {
  pushHistory();
  const variant = currentVariant();
  const c = variant.cargo;
  let w;
  if (side === "roof") {
    w = { side: "roof", x: Math.round(c.length / 2 - 350), y: Math.round(c.width / 2 - 250), width: 700, length: 500 };
  } else {
    const span = side === "rear" ? c.width : c.length;
    w = { side, x: Math.round(span / 2 - 300), width: 600, height: 450, zBottom: 700 };
  }
  w.id = "w" + Math.random().toString(36).slice(2, 9);
  w.name = (side === "roof" ? "Dachfenster" : "Fenster") + " " + state.nextWindowNum;
  state.nextWindowNum++;
  clampWindow(w, variant);
  state.extraWindows.push(w);
  clearOtherSelections("window");
  state.selectedWindowId = w.id;
  refresh();
}

function deleteWindow(id) {
  pushHistory();
  state.extraWindows = state.extraWindows.filter((w) => w.id !== id);
  if (state.selectedWindowId === id) state.selectedWindowId = null;
  refresh();
}

function selectedWindow() {
  return state.extraWindows.find((w) => w.id === state.selectedWindowId) || null;
}

function updateWindowField(field, value) {
  const w = selectedWindow();
  if (!w) return;
  const v = parseInt(value, 10);
  if (Number.isFinite(v)) {
    pushHistory();
    w[field] = v;
    clampWindow(w, currentVariant());
  }
  refresh();
}

// ---------------------------------------------------------------------------
// Türen (editierbar; je Variante aus den Werksdaten initialisiert)
// ---------------------------------------------------------------------------
// state.doors gilt für genau eine Variante (state.doorsVariantId). Beim
// Variantenwechsel werden die Türen aus der neuen Variante neu geladen, damit
// fahrzeugspezifische Türmaße nicht vermischt werden.
function syncDoorsToVariant(force) {
  const variant = currentVariant();
  if (!force && state.doorsVariantId === variant.id && state.doors.length) return;
  state.doors = variant.doors.map((d, i) => ({
    id: "d" + Math.random().toString(36).slice(2, 9),
    name: doorTypeName(d.type) + " " + (i + 1),
    type: d.type,
    side: d.side,
    x: d.side === "rear" && typeof d.x !== "number"
      ? Math.round((variant.cargo.width - d.width) / 2) : d.x,
    width: d.width,
    height: d.height,
    zBottom: d.zBottom || 0,
  }));
  state.doorsVariantId = variant.id;
  state.selectedDoorId = null;
}

function doorTypeName(type) {
  return ({ sliding: "Schiebetür", "rear-doors": "Hecktüren", tailgate: "Heckklappe" })[type] || "Tür";
}

// span einer Tür entlang ihrer Wand: left/right entlang Länge, rear entlang Breite
function doorSpan(d, variant) {
  return d.side === "rear" ? variant.cargo.width : variant.cargo.length;
}

function clampDoor(d, variant) {
  const c = variant.cargo;
  const span = doorSpan(d, variant);
  d.width = Math.max(100, Math.min(d.width, span));
  d.height = Math.max(100, Math.min(d.height, c.height));
  d.x = Math.max(0, Math.min(d.x, span - d.width));
  d.zBottom = Math.max(0, Math.min(d.zBottom || 0, c.height - d.height));
}

function addDoor(side) {
  pushHistory();
  const variant = currentVariant();
  syncDoorsToVariant(false);
  const span = doorSpan({ side }, variant);
  const type = side === "rear" ? "rear-doors" : "sliding";
  const d = {
    id: "d" + Math.random().toString(36).slice(2, 9),
    name: doorTypeName(type) + " " + state.nextDoorNum,
    type, side,
    x: Math.round(span / 2 - 500),
    width: 1000,
    height: Math.round(variant.cargo.height * 0.9),
    zBottom: 0,
  };
  state.nextDoorNum++;
  clampDoor(d, variant);
  state.doors.push(d);
  clearOtherSelections("door");
  state.selectedDoorId = d.id;
  refresh();
}

function deleteDoor(id) {
  pushHistory();
  state.doors = state.doors.filter((d) => d.id !== id);
  if (state.selectedDoorId === id) state.selectedDoorId = null;
  refresh();
}

function selectedDoor() {
  return state.doors.find((d) => d.id === state.selectedDoorId) || null;
}

function updateDoorField(field, value) {
  const d = selectedDoor();
  if (!d) return;
  pushHistory();
  if (field === "type") {
    d.type = value;
    d.side = value === "rear-doors" || value === "tailgate" ? "rear" : d.side;
  } else {
    const v = parseInt(value, 10);
    if (Number.isFinite(v)) d[field] = v;
  }
  clampDoor(d, currentVariant());
  refresh();
}

// Auswahl-States gegenseitig ausschließen (nur ein Panel offen)
function clearOtherSelections(keep) {
  if (keep !== "box") { state.selectedBoxId = null; state.selectedBoxIds = []; }
  if (keep !== "window") state.selectedWindowId = null;
  if (keep !== "door") state.selectedDoorId = null;
  if (keep !== "bench") state.benchSelected = false;
}

// AABB-Kollisionen: Box↔Box und Box↔Radkasten.
// Boxen mit aktiver boolescher Subtraktion (box.subtract) lösen KEINE Kollision
// aus — ihr Schnitt mit anderen Boxen wird herausgelöscht statt rot markiert.
// Eine normale Box, die NUR mit Subtraktions-Boxen überlappt, gilt als frei.
function computeCollisions() {
  const colliding = new Set();
  const aabbs = state.boxes.filter((b) => !b.hidden).map((b) => ({
    id: b.id, subtract: !!b.subtract, groupId: b.groupId != null ? b.groupId : null,
    x0: b.x, y0: b.y, z0: b.z, x1: b.x + b.l, y1: b.y + b.w, z1: b.z + b.h,
  }));
  // Radkästen wirken wie Subtraktionskörper: ihr Schnitt wird aus der Box
  // herausgeschnitten, daher lösen sie KEINE Kollision aus (hier nicht gelistet).
  const overlaps = (a, b) =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1;
  // Eine Subtraktionsbox schneidet nur innerhalb IHRER Gruppe — daher ist ihr
  // Überlapp nur dort „erlaubt". Überlappt sie eine Box außerhalb ihrer Gruppe,
  // wird dort nichts ausgeschnitten → das ist eine echte Kollision.
  const carves = (sub, other) =>
    sub.subtract && sub.groupId != null && sub.groupId === other.groupId;
  for (let i = 0; i < aabbs.length; i++) {
    if (aabbs[i].subtract) continue; // Subtraktionsbox selbst wird nie markiert
    for (let j = 0; j < aabbs.length; j++) {
      if (i === j) continue;
      // Überlapp ist erlaubt, wenn j eine Subtraktionsbox ist, die i ausschneidet
      if (carves(aabbs[j], aabbs[i])) continue;
      if (overlaps(aabbs[i], aabbs[j])) { colliding.add(aabbs[i].id); colliding.add(aabbs[j].id); }
    }
  }
  return colliding;
}

// ---------------------------------------------------------------------------
// UI-Aufbau
// ---------------------------------------------------------------------------
function el(id) { return document.getElementById(id); }

function fillVehicleSelects() {
  const vs = el("vehicle-select");
  vs.innerHTML = "";
  for (const v of VEHICLES) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = `${v.name} (${v.years})`;
    vs.appendChild(o);
  }
  vs.value = state.vehicleId;
  fillVariantSelect();
}

function fillVariantSelect() {
  const vs = el("variant-select");
  vs.innerHTML = "";
  for (const v of currentVehicle().variants) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.label;
    vs.appendChild(o);
  }
  if (!currentVehicle().variants.some((v) => v.id === state.variantId)) {
    state.variantId = currentVehicle().variants[0].id;
  }
  vs.value = state.variantId;
}

function renderBoxList() {
  const list = el("box-list");
  list.innerHTML = "";
  if (state.boxes.length === 0) {
    const d = document.createElement("div");
    d.className = "empty-hint";
    d.textContent = "Noch keine Möbel — oben eine Box anlegen oder eine Vorlage wählen.";
    list.appendChild(d);
  }
  // Reihenfolge der Gruppen für die Nummerierung der Marker
  const groupIds = [...new Set(state.boxes.map((b) => b.groupId).filter((g) => g != null))];

  // Eine Box-Zeile bauen (optional eingerückt, wenn sie zu einer Gruppe gehört).
  const boxRow = (b, indented) => {
    const item = document.createElement("div");
    item.className = "box-item" + (isSelected(b.id) ? " selected" : "") + (indented ? " in-group" : "");
    item.addEventListener("click", (e) => {
      selectBox(b.id, e.shiftKey || e.ctrlKey || e.metaKey);
      refresh();
    });
    if (b.hidden) item.classList.add("box-hidden");
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = b.color;
    const txt = document.createElement("span");
    txt.className = "box-item-text";
    txt.textContent = `${b.name} — ${b.l}×${b.w}×${b.h}`;
    const hide = document.createElement("button");
    hide.className = "icon-btn";
    hide.title = b.hidden ? "Einblenden" : "Ausblenden";
    hide.textContent = b.hidden ? "🙈" : "👁";
    hide.addEventListener("click", (e) => { e.stopPropagation(); toggleBoxHidden(b.id); });
    const dup = document.createElement("button");
    dup.className = "icon-btn";
    dup.title = "Duplizieren";
    dup.textContent = "⧉";
    dup.addEventListener("click", (e) => { e.stopPropagation(); duplicateBox(b.id); });
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.title = "Löschen";
    del.textContent = "✕";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteBox(b.id); });
    // Farbpunkte der zugeordneten Filter — flex:none, damit sie das Ellipsis
    // des Namens nicht verschluckt.
    const tags = document.createElement("span");
    tags.className = "box-tags";
    for (const f of state.filters) {
      if (!(b.tags || []).includes(f.id)) continue;
      const dot = document.createElement("i");
      dot.style.background = f.color;
      dot.title = f.name;
      tags.appendChild(dot);
    }
    item.append(sw, txt, tags, hide, dup, del);
    return item;
  };

  // Gruppenkopf mit Sammel-Aktionen (gesamte Gruppe ein-/ausblenden, trennen).
  const groupHeader = (gid, members) => {
    const head = document.createElement("div");
    const collapsed = isGroupCollapsed(gid);
    const hasSelected = members.some((b) => isSelected(b.id));
    head.className = "group-header" + (collapsed ? " collapsed" : "")
      // Ist die Gruppe zu und darin etwas ausgewählt, sonst sähe man es nicht
      + (collapsed && hasSelected ? " has-selected" : "");
    const allHidden = members.every((b) => b.hidden);
    if (allHidden) head.classList.add("box-hidden");
    // Ein-/Ausklappen
    const caret = document.createElement("button");
    caret.className = "group-caret";
    caret.textContent = collapsed ? "▸" : "▾";
    caret.title = collapsed ? "Gruppe aufklappen" : "Gruppe einklappen";
    caret.addEventListener("click", (e) => { e.stopPropagation(); toggleGroupCollapsed(gid); });
    // Auswahl-Icon: Klick wählt alle Mitglieder aus (für Trennen/Verschieben)
    const chain = document.createElement("span");
    chain.className = "group-chain";
    chain.textContent = "⛓";
    chain.title = "Alle Mitglieder auswählen";
    chain.addEventListener("click", () => {
      state.selectedBoxIds = members.map((b) => b.id);
      state.selectedBoxId = members[members.length - 1].id;
      state.selectedWindowId = null; state.selectedDoorId = null;
      refresh();
    });
    // Editierbarer Gruppenname
    const name = document.createElement("input");
    name.className = "group-name-input";
    name.type = "text";
    name.value = groupDisplayName(gid, groupIds.indexOf(gid));
    name.title = "Gruppenname (zum Umbenennen klicken)";
    name.addEventListener("click", (e) => e.stopPropagation());
    name.addEventListener("change", () => { renameGroup(gid, name.value); refresh(); });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); });
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `(${members.length})`;
    const hide = document.createElement("button");
    hide.className = "icon-btn";
    hide.title = allHidden ? "Gruppe einblenden" : "Gruppe ausblenden";
    hide.textContent = allHidden ? "🙈" : "👁";
    hide.addEventListener("click", (e) => { e.stopPropagation(); toggleGroupHidden(gid); });
    const split = document.createElement("button");
    split.className = "icon-btn";
    split.title = "Gruppe auflösen";
    split.textContent = "✂";
    split.addEventListener("click", (e) => { e.stopPropagation(); ungroup(gid); });
    head.append(caret, chain, name, count, hide, split);
    return head;
  };

  // Erst gruppierte Boxen (je Gruppe ein Kopf + eingerückte Mitglieder), dann
  // ungruppierte Boxen flach — in der Reihenfolge ihres ersten Vorkommens.
  const renderedGroups = new Set();
  for (const b of state.boxes) {
    if (b.groupId != null) {
      if (renderedGroups.has(b.groupId)) continue;
      renderedGroups.add(b.groupId);
      const members = state.boxes.filter((x) => x.groupId === b.groupId);
      list.appendChild(groupHeader(b.groupId, members));
      // Eingeklappt: Mitglieder gar nicht erst erzeugen
      if (!isGroupCollapsed(b.groupId)) {
        for (const m of members) list.appendChild(boxRow(m, true));
      }
    } else {
      list.appendChild(boxRow(b, false));
    }
  }

  // Verbinden/Trennen-Buttons aktivieren/deaktivieren
  const canConnect = state.selectedBoxIds.length >= 2;
  const sel = selectedBox();
  const canDisconnect = sel && sel.groupId != null;
  el("connect-btn").disabled = !canConnect;
  el("disconnect-btn").disabled = !canDisconnect;
}

function renderEditPanel() {
  const panel = el("edit-panel");
  const box = selectedBox();
  panel.style.display = box ? "" : "none";
  if (!box) return;
  el("edit-name").value = box.name;
  el("edit-color").value = toHex(box.color);
  for (const f of ["x", "y", "z", "l", "w", "h"]) {
    el("edit-" + f).value = Math.round(box[f]);
  }
  el("edit-weight").value = box.weight || 0;
  const op = box.opacity != null ? box.opacity : 1;
  el("edit-opacity").value = Math.round(op * 100);
  el("edit-opacity-val").textContent = Math.round(op * 100) + "%";
  el("edit-subtract").checked = !!box.subtract;
  el("edit-hidden").checked = !!box.hidden;
  renderTagChips("edit-tags", box, selectedBox);
  const p = normalizePullout(box.pullout, box);
  el("edit-pullout").checked = !!p.on;
  el("edit-pullout-row").style.display = p.on ? "" : "none";
  el("edit-pullout-side").value = p.side;
  el("edit-pullout-depth").value = Math.round(p.depth);
  el("edit-pullout-w").value = Math.round(p.w);
  el("edit-pullout-h").value = Math.round(p.h);
  el("edit-pullout-u").value = Math.round(p.u);
  el("edit-pullout-v").value = Math.round(p.v);
  // Versatz nur dort anbieten, wo er etwas bewirkt (Vollmaß = keine Lage)
  el("edit-pullout-u").disabled = !(p.w > 0);
  el("edit-pullout-v").disabled = !(p.h > 0);
}

// Filter-Zuordnung eines Objekts (Box oder Sitzbank) als anklickbare Chips.
// getTarget wird beim Klick neu ausgewertet, damit der Chip nicht auf ein
// veraltetes Objekt zeigt, wenn sich die Auswahl zwischenzeitlich ändert.
function renderTagChips(containerId, obj, getTarget) {
  const wrap = el(containerId);
  wrap.innerHTML = "";
  if (state.filters.length === 0) {
    const d = document.createElement("span");
    d.className = "empty-hint";
    d.textContent = "Noch keine Filter — im Panel „Filter“ anlegen.";
    wrap.appendChild(d);
    return;
  }
  for (const f of state.filters) {
    const on = (obj.tags || []).includes(f.id);
    const chip = document.createElement("label");
    chip.className = "tag-chip" + (on ? " on" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = on;
    cb.addEventListener("change", () => toggleBoxTag(getTarget(), f.id, cb.checked));
    const dot = document.createElement("span");
    dot.className = "swatch";
    dot.style.background = f.color;
    dot.style.width = dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    chip.append(cb, dot, document.createTextNode(f.name));
    wrap.appendChild(chip);
  }
}

// Panel „Filter": jeder Filter einzeln zuschaltbar (mehrere gleichzeitig
// möglich) + Verwaltung von Name, Farbe und Löschen.
function renderFilterPanel() {
  const list = el("filter-list");
  list.innerHTML = "";
  if (state.filters.length === 0) {
    const d = document.createElement("div");
    d.className = "empty-hint";
    d.textContent = "Noch keine Filter angelegt.";
    list.appendChild(d);
  }
  for (const f of state.filters) {
    const active = state.activeFilterIds.includes(f.id);
    const row = document.createElement("div");
    row.className = "filter-row" + (active ? " active" : "");
    // Einzelschalter: nur dieser Filter
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = active;
    cb.className = "filter-active";
    cb.title = "Diesen Filter anzeigen";
    cb.addEventListener("change", () => toggleFilterActive(f.id, cb.checked));
    const sw = document.createElement("input");
    sw.type = "color";
    sw.value = f.color;
    sw.className = "filter-color";
    sw.title = "Farbe";
    sw.addEventListener("change", () => { pushHistory(); f.color = sw.value; refresh(); });
    const name = document.createElement("input");
    name.type = "text";
    name.value = f.name;
    name.title = "Filter umbenennen";
    name.addEventListener("change", () => { renameFilter(f.id, name.value); refresh(); });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); });
    const count = document.createElement("span");
    count.className = "filter-count";
    count.textContent = `${filterCount(f.id)}×`;
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.title = "Filter löschen (Zuordnungen gehen verloren)";
    del.textContent = "✕";
    del.addEventListener("click", () => deleteFilter(f.id));
    row.append(cb, sw, name, count, del);
    list.appendChild(row);
  }
  const n = state.activeFilterIds.length;
  el("filter-status").textContent = n === 0
    ? "Kein Filter aktiv — alle Möbel voll sichtbar."
    : `${n} Filter aktiv — sichtbar bleibt, was zu mindestens einem davon gehört.`;
}

// Sitzbank-Panel: Sichtbarkeit der Felder + Werte + Kurzinfo zu den Maßen.
function renderBenchPanel() {
  const b = state.bench;
  const on = !!(b && b.on);
  el("bench-on").checked = on;
  el("bench-fields").style.display = on ? "" : "none";
  if (!on) return;
  const foot = el("bench-foot");
  if (foot.options.length !== SL3.footHeights.length) {
    foot.innerHTML = "";
    for (const h of SL3.footHeights) {
      const o = document.createElement("option");
      o.value = String(h);
      o.textContent = `${h} mm`;
      foot.appendChild(o);
    }
  }
  foot.value = String(b.footHeight);
  renderTagChips("bench-tags", b, () => state.bench);
  el("bench-bed").checked = b.mode === "bed";
  el("bench-face").checked = !!b.faceFront;
  el("bench-railx").value = Math.round(b.railX);
  el("bench-y").value = Math.round(b.yCenter);
  el("bench-offset").value = Math.round(b.benchOffset);
  el("bench-weight").value = Math.round(b.weight || SL3.weight);
  const travel = Math.max(0, SL3.railLength - SL3.footRun);
  const g = benchSolids(b, currentVariant());
  const seatTop = b.footHeight + SL3.seatTopOverBase;
  const bedTop = b.footHeight + SL3.bedTopOverBase;
  const bd = g.bodyAabb;
  el("bench-info").innerHTML =
    `Schiene ${SL3.railLength}&nbsp;mm · Verschiebeweg der Bank 0–${travel}&nbsp;mm<br>` +
    `Sitzhöhe ${seatTop}&nbsp;mm · Liegehöhe ${bedTop}&nbsp;mm · Liegelänge ${SL3.bedLength}&nbsp;mm<br>` +
    `Füße fest: je ${String(SL3.footWidth).replace(".", ",")}&nbsp;mm breit, ` +
    `540&nbsp;mm licht dazwischen (außen ${Math.round(SL3.railGap + SL3.footWidth)}&nbsp;mm)<br>` +
    `Bank belegt x ${Math.round(bd.x0)}–${Math.round(bd.x1)}&nbsp;mm, ` +
    `y ${Math.round(bd.y0)}–${Math.round(bd.y1)}&nbsp;mm<br>` +
    `<em>Schienenprofil und Bankgewicht sind geschätzt (nicht im Datenblatt bemaßt).</em>`;
}

function toHex(c) {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#cccccc";
}

const SIDE_LABEL = { left: "links", right: "rechts", rear: "Heck", roof: "Dach" };

function renderWindowList() {
  const list = el("window-list");
  list.innerHTML = "";
  if (state.extraWindows.length === 0) {
    const d = document.createElement("div");
    d.className = "empty-hint";
    d.textContent = "Keine eigenen Fenster. Über die Buttons hinzufügen.";
    list.appendChild(d);
    return;
  }
  for (const w of state.extraWindows) {
    const item = document.createElement("div");
    item.className = "box-item" + (w.id === state.selectedWindowId ? " selected" : "");
    item.addEventListener("click", () => {
      clearOtherSelections("window"); state.selectedWindowId = w.id; refresh();
    });
    const txt = document.createElement("span");
    txt.className = "box-item-text";
    const size = w.side === "roof" ? `${w.width}×${w.length}` : `${w.width}×${w.height}`;
    txt.textContent = `${w.name} (${SIDE_LABEL[w.side]}) — ${size}`;
    const del = document.createElement("button");
    del.className = "icon-btn"; del.title = "Löschen"; del.textContent = "✕";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteWindow(w.id); });
    item.append(txt, del);
    list.appendChild(item);
  }
}

const DOOR_TYPE_OPTIONS = [
  { value: "sliding", label: "Schiebetür" },
  { value: "rear-doors", label: "Hecktüren" },
  { value: "tailgate", label: "Heckklappe" },
];

function renderDoorList() {
  const list = el("door-list");
  list.innerHTML = "";
  if (state.doors.length === 0) {
    const d = document.createElement("div");
    d.className = "empty-hint";
    d.textContent = "Keine Türen. Über die Buttons hinzufügen.";
    list.appendChild(d);
    return;
  }
  for (const dr of state.doors) {
    const item = document.createElement("div");
    item.className = "box-item" + (dr.id === state.selectedDoorId ? " selected" : "");
    item.addEventListener("click", () => {
      clearOtherSelections("door"); state.selectedDoorId = dr.id; refresh();
    });
    const txt = document.createElement("span");
    txt.className = "box-item-text";
    txt.textContent = `${dr.name} (${SIDE_LABEL[dr.side]}) — ${dr.width}×${dr.height}`;
    const del = document.createElement("button");
    del.className = "icon-btn"; del.title = "Löschen"; del.textContent = "✕";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteDoor(dr.id); });
    item.append(txt, del);
    list.appendChild(item);
  }
}

function renderDoorEditPanel() {
  const panel = el("door-edit-panel");
  const d = selectedDoor();
  panel.style.display = d ? "" : "none";
  if (!d) return;
  el("dedit-title").textContent = `${d.name} — Wand: ${SIDE_LABEL[d.side]}`;
  // Typ-Auswahl
  const typeSel = el("dedit-type");
  typeSel.value = d.type;
  // Positions-Label je nach Wand
  setLabelText("dedit-x-label", d.side === "rear" ? "Pos. ab links (mm)" : "x ab Front (mm)");
  el("dedit-x").value = Math.round(d.x);
  el("dedit-z").value = Math.round(d.zBottom || 0);
  el("dedit-w").value = Math.round(d.width);
  el("dedit-h").value = Math.round(d.height);
}

function renderWindowEditPanel() {
  const panel = el("window-edit-panel");
  const w = selectedWindow();
  panel.style.display = w ? "" : "none";
  if (!w) return;
  el("wedit-title").textContent = `${w.name} — Wand: ${SIDE_LABEL[w.side]}`;
  const roof = w.side === "roof";
  // Feld-Beschriftungen je nach Fenstertyp anpassen
  el("wedit-pos-row").style.display = "";
  el("wedit-x").value = Math.round(w.x);
  // .firstChild = Textknoten vor dem <input> — nur den Text ändern, nicht das
  // ganze <label> überschreiben (sonst würde das enthaltene Input entfernt).
  setLabelText("wedit-x-label", roof ? "x (Länge, mm)" : (w.side === "rear" ? "Pos. ab links (mm)" : "x ab Front (mm)"));
  if (roof) {
    el("wedit-second").value = Math.round(w.y);
    setLabelText("wedit-second-label", "y (quer, mm)");
    el("wedit-w").value = Math.round(w.width);
    setLabelText("wedit-w-label", "Länge x (mm)");
    el("wedit-h").value = Math.round(w.length);
    setLabelText("wedit-h-label", "Breite y (mm)");
  } else {
    el("wedit-second").value = Math.round(w.zBottom);
    setLabelText("wedit-second-label", "Unterkante z (mm)");
    el("wedit-w").value = Math.round(w.width);
    setLabelText("wedit-w-label", "Breite (mm)");
    el("wedit-h").value = Math.round(w.height);
    setLabelText("wedit-h-label", "Höhe (mm)");
  }
}

// Nur den führenden Textknoten eines <label> ersetzen; ein enthaltenes <input>
// bleibt erhalten. Legt den Textknoten an, falls keiner existiert.
function setLabelText(id, text) {
  const lab = el(id);
  if (lab.firstChild && lab.firstChild.nodeType === Node.TEXT_NODE) {
    lab.firstChild.textContent = text;
  } else {
    lab.insertBefore(document.createTextNode(text), lab.firstChild);
  }
}

function renderStatus(collisions) {
  const v = currentVariant();
  const box = selectedBox();
  let s = `Bauraum: ${v.cargo.length} × ${v.cargo.width} × ${v.cargo.height} mm · zwischen Radkästen: ${v.widthBetweenArches} mm`;
  const win = selectedWindow();
  const door = selectedDoor();
  if (box) {
    s += `  |  ${box.name}: Position x=${Math.round(box.x)} y=${Math.round(box.y)} z=${Math.round(box.z)} · Maße ${box.l}×${box.w}×${box.h} mm`;
    if (box.weight) s += ` · ${box.weight} kg`;
    if (box.subtract) s += "  ⊘ Subtraktion aktiv";
    else if (collisions.has(box.id)) s += "  ⚠ Kollision!";
  } else if (win) {
    s += `  |  ${win.name} (${SIDE_LABEL[win.side]})`;
  } else if (door) {
    s += `  |  ${door.name} (${SIDE_LABEL[door.side]}) · ${door.width}×${door.height} mm`;
  } else if (state.benchSelected && state.bench) {
    const bn = state.bench;
    const travel = Math.max(0, SL3.railLength - SL3.footRun);
    s += `  |  ${SL3.label} · ${bn.mode === "bed" ? "Liege" : "Sitz"}`
      + ` · Schiene x=${Math.round(bn.railX)} · Bank ${Math.round(bn.benchOffset)}/${travel} mm`
      + `  (Ziehen = Bank, Shift+Ziehen = Schienen)`;
  } else if (collisions.size > 0) {
    s += `  |  ⚠ ${collisions.size} Box(en) mit Kollision`;
  }
  // Gewichts-Übersicht
  if (state.showWeight) {
    const ws = weightSummary();
    s += `  |  Gewicht: ${ws.total} kg`;
    if (ws.payload != null) {
      const rest = ws.payload - ws.total;
      s += ` / Zuladung ${ws.payload} kg (${rest >= 0 ? "noch " + rest : "⚠ " + (-rest) + " über"} kg)`;
    }
  }
  el("statusbar").textContent = s;
}

// ---------------------------------------------------------------------------
// Haupt-Refresh
// ---------------------------------------------------------------------------
function refresh() {
  const variant = currentVariant();
  syncDoorsToVariant(false);
  for (const b of state.boxes) clampBoxPosition(b, variant);
  for (const w of state.extraWindows) clampWindow(w, variant);
  for (const d of state.doors) clampDoor(d, variant);
  if (state.bench) clampBench(state.bench, variant);
  const collisions = computeCollisions();
  renderer.render(state, variant, collisions);
  renderBoxList();
  renderWindowList();
  renderDoorList();
  renderEditPanel();
  renderFilterPanel();
  renderBenchPanel();
  renderWindowEditPanel();
  renderDoorEditPanel();
  renderStatus(collisions);
  document.querySelectorAll(".view-tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === state.view));
  el("mode-toggle").textContent = state.renderMode === "solid" ? "◧ Drahtansicht" : "■ Vollansicht";
  // Toggle-Buttons spiegeln ihren Zustand
  el("weight-toggle").classList.toggle("active", state.showWeight);
  el("dims-toggle").classList.toggle("active", state.showDims);
  el("clash-toggle").classList.toggle("active", state.showClash);
  el("snap-toggle").classList.toggle("active", state.snap);
  el("filter-toggle").classList.toggle("active", state.activeFilterIds.length > 0);
  el("undo-btn").disabled = history.past.length === 0;
  el("redo-btn").disabled = history.future.length === 0;
  save();
}

// ---------------------------------------------------------------------------
// Maus-Interaktion (Auswahl, Drag & Drop, Zoom, Pan)
// ---------------------------------------------------------------------------
function setupCanvasEvents(canvas) {
  let drag = null; // {boxId, lastX, lastY, restX, restY, restZ} oder {pan:true,...}

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (e.button === 1 || e.button === 2 || e.ctrlKey) {
      drag = { pan: true, lastX: e.clientX, lastY: e.clientY };
      e.preventDefault();
      return;
    }
    const hit = renderer.hitTest(px, py);
    // Sitzbank greifen — aber nur, wenn an der Stelle keine Box liegt.
    // Ziehen = Bank auf der Schiene, Shift+Ziehen = ganze Schiene im Boden.
    if (!hit && state.bench && state.bench.on && renderer.hitTestBench(px, py)) {
      clearOtherSelections("bench");
      state.benchSelected = true;
      pushHistory();
      drag = {
        bench: true, lastX: e.clientX, lastY: e.clientY, ax: 0, ay: 0,
        railX0: state.bench.railX, yC0: state.bench.yCenter, off0: state.bench.benchOffset,
      };
      canvas.style.cursor = "grabbing";
      refresh();
      return;
    }
    // 3D-Orbit: linke Maustaste auf leere Fläche dreht die Kamera.
    if (state.view === "orbit" && !hit) {
      drag = { orbit: true, lastX: e.clientX, lastY: e.clientY };
      canvas.style.cursor = "grabbing";
      return;
    }
    const additive = e.shiftKey; // Shift+Klick = Mehrfachauswahl
    selectBox(hit, additive);
    if (hit) {
      pushHistory(); // ein Undo-Punkt pro Drag-Vorgang
      // Alle mitzubewegenden Boxen (Gruppe der getroffenen Box) mit ihren
      // ungesnappten Startpositionen merken, damit Snapping nicht driftet.
      const b = state.boxes.find((x) => x.id === hit);
      const siblings = moveSiblings(b).map((s) => ({ box: s, x0: s.x, y0: s.y, z0: s.z }));
      drag = { boxId: hit, single: siblings.length === 1, lastX: e.clientX, lastY: e.clientY, ax: 0, ay: 0, az: 0, siblings };
      canvas.style.cursor = "grabbing";
    }
    refresh();
  });

  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    if (drag.orbit) {
      // Kamera drehen: horizontal = Azimut, vertikal = Elevation (begrenzt).
      state.orbit.az = (state.orbit.az - (e.clientX - drag.lastX) * 0.5) % 360;
      state.orbit.el = Math.max(-85, Math.min(85, state.orbit.el + (e.clientY - drag.lastY) * 0.5));
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      refresh();
      return;
    }
    if (drag.pan) {
      renderer.pan.x += e.clientX - drag.lastX;
      renderer.pan.y += e.clientY - drag.lastY;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      refresh();
      return;
    }
    if (drag.bench) {
      const bench = state.bench;
      if (!bench) return;
      // Immer in der Bodenebene rechnen (kein Höhen-Modus), Shift ist hier der
      // Umschalter Bank↔Schiene und darf nicht als Höhe interpretiert werden.
      const bd = renderer.pxToWorldDelta(state.view, e.clientX - drag.lastX, e.clientY - drag.lastY, false, state);
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      drag.ax += bd.dx; drag.ay += bd.dy;
      const step = e.altKey ? 1 : SNAP;
      const sx = Math.round(drag.ax / step) * step;
      const sy = Math.round(drag.ay / step) * step;
      if (e.shiftKey) {
        // ganze Schienen im Fahrzeugboden verschieben (Bank fährt mit)
        bench.railX = drag.railX0 + sx;
        bench.yCenter = drag.yC0 + sy;
      } else {
        // Bank längs auf der Schiene verschieben
        bench.benchOffset = drag.off0 + sx;
      }
      clampBench(bench, currentVariant());
      refresh();
      return;
    }
    const variant = currentVariant();
    const c = variant.cargo;
    const d = renderer.pxToWorldDelta(state.view, e.clientX - drag.lastX, e.clientY - drag.lastY, e.shiftKey, state);
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    // akkumuliertes ungesnapptes Delta seit Drag-Start
    drag.ax += d.dx; drag.ay += d.dy; drag.az += d.dz;
    const snap = e.altKey ? 1 : SNAP;
    let sx = Math.round(drag.ax / snap) * snap;
    let sy = Math.round(drag.ay / snap) * snap;
    let sz = Math.round(drag.az / snap) * snap;
    // gemeinsames Delta so begrenzen, dass KEIN Mitglied aus dem Raum fällt
    for (const s of drag.siblings) {
      sx = Math.max(-s.x0, Math.min(sx, Math.max(0, c.length - s.box.l) - s.x0));
      sy = Math.max(-s.y0, Math.min(sy, Math.max(0, c.width - s.box.w) - s.y0));
      sz = Math.max(-s.z0, Math.min(sz, Math.max(0, c.height - s.box.h) - s.z0));
    }
    for (const s of drag.siblings) {
      s.box.x = s.x0 + sx;
      s.box.y = s.y0 + sy;
      s.box.z = s.z0 + sz;
    }
    // Einrasten an Wänden/Nachbarn (nur Einzelbox, nicht bei Alt-Feinmodus)
    if (state.snap && !e.altKey && drag.single) {
      const b = drag.siblings[0].box;
      if (state.view === "top") {
        b.x = snapAxis(b.x, b.l, c.length, neighborEdges(b, "x", "l"));
        b.y = snapAxis(b.y, b.w, c.width, neighborEdges(b, "y", "w"));
      } else if (state.view.startsWith("side")) {
        b.x = snapAxis(b.x, b.l, c.length, neighborEdges(b, "x", "l"));
        b.z = snapAxis(b.z, b.h, c.height, neighborEdges(b, "z", "h"));
      } else {
        b.x = snapAxis(b.x, b.l, c.length, neighborEdges(b, "x", "l"));
        b.y = snapAxis(b.y, b.w, c.width, neighborEdges(b, "y", "w"));
      }
      clampBoxPosition(b, variant);
    }
    refresh();
  });

  window.addEventListener("mouseup", () => {
    if (drag && !drag.pan) canvas.style.cursor = "";
    if (drag && drag.orbit) save(); // gedrehte Ansicht merken
    drag = null;
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    renderer.zoom = Math.max(0.3, Math.min(6, renderer.zoom * f));
    refresh();
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    // Undo/Redo (unabhängig von der Auswahl)
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault(); redo(); return;
    }
    const b = selectedBox();
    if (!b) return;
    if (e.key === "Delete" || e.key === "Backspace") { deleteSelectedBoxes(); return; }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotateBox90(b.id); return; }
    const step = e.altKey ? 1 : SNAP;
    const k = e.key;
    let dx = 0, dy = 0, dz = 0, moved = true;
    // Pfeile bewegen in der Bildlogik der aktiven Ansicht
    if (state.view === "top") {
      // Draufsicht: Schiebetür (großes y) oben ⇒ ArrowUp erhöht y
      if (k === "ArrowLeft") dx = -step; else if (k === "ArrowRight") dx = step;
      else if (k === "ArrowUp") dy = step; else if (k === "ArrowDown") dy = -step;
      else moved = false;
    } else if (state.view.startsWith("side")) {
      const sgn = state.view === "side-left" ? -1 : 1;
      if (k === "ArrowLeft") dx = -sgn * step; else if (k === "ArrowRight") dx = sgn * step;
      else if (k === "ArrowUp") dz = step; else if (k === "ArrowDown") dz = -step;
      else moved = false;
    } else if (state.view === "rear") {
      // Heck: sx=-y (rechts = Fahrerseite, kleineres y), sy=-z
      if (k === "ArrowLeft") dy = step; else if (k === "ArrowRight") dy = -step;
      else if (k === "ArrowUp") dz = step; else if (k === "ArrowDown") dz = -step;
      else moved = false;
    } else {
      if (k === "ArrowLeft") dx = -step; else if (k === "ArrowRight") dx = step;
      else if (k === "ArrowUp") dz = step; else if (k === "ArrowDown") dz = -step;
      else moved = false;
    }
    if (moved) {
      e.preventDefault();
      pushHistory();
      moveBoxesBy(moveSiblings(b), dx, dy, dz);
      refresh();
    }
  });
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------
function exportJson() {
  const data = JSON.stringify({
    vehicleId: state.vehicleId, variantId: state.variantId,
    boxes: state.boxes, extraWindows: state.extraWindows,
    doors: state.doors, doorsVariantId: state.doorsVariantId,
    groupNames: state.groupNames,
    bench: state.bench,
    filters: state.filters,
  }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "camper-plan.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

// Aktuelle Ansicht als PNG exportieren. Vor dem Export auf weißen Hintergrund
// rendern, damit das Bild nicht transparent/dunkel wird.
function exportPng() {
  const canvas = el("canvas");
  // Offscreen-Canvas mit weißem Grund, dann das Live-Canvas darüberkopieren.
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `camper-${currentVehicle().id}-${state.view}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.vehicleId && VEHICLES.some((v) => v.id === d.vehicleId)) state.vehicleId = d.vehicleId;
      fillVehicleSelects();
      if (d.variantId && currentVehicle().variants.some((v) => v.id === d.variantId)) state.variantId = d.variantId;
      el("variant-select").value = state.variantId;
      // Filter vor den Boxen — normalizeBox migriert altes `power` in einen Filter
      state.filters = Array.isArray(d.filters) ? d.filters.filter(isValidFilter) : [];
      state.activeFilterIds = [];
      state.lastFilterIds = [];
      state.nextFilterNum = 1;
      if (Array.isArray(d.boxes)) state.boxes = d.boxes.filter((b) => b && typeof b.x === "number").map(normalizeBox);
      state.bench = d.bench && typeof d.bench === "object" ? clampBench(d.bench, currentVariant()) : state.bench;
      state.extraWindows = Array.isArray(d.extraWindows) ? d.extraWindows.filter(isValidWindow) : [];
      state.groupNames = (d.groupNames && typeof d.groupNames === "object") ? d.groupNames : {};
      // Türen übernehmen, falls sie zur importierten Variante passen; sonst neu laden
      if (Array.isArray(d.doors) && d.doorsVariantId === state.variantId) {
        state.doors = d.doors.filter(isValidDoor);
        state.doorsVariantId = d.doorsVariantId;
      } else {
        state.doorsVariantId = null; // erzwingt Neuladen in refresh→syncDoorsToVariant
      }
      state.bench = (d.bench && typeof d.bench === "object")
        ? clampBench(d.bench, currentVariant()) : null;
      state.selectedBoxId = null;
      state.selectedBoxIds = [];
      state.selectedWindowId = null;
      state.selectedDoorId = null;
      state.benchSelected = false;
      syncDoorsToVariant(false);
      refresh();
    } catch (err) {
      alert("Datei konnte nicht gelesen werden: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  load();
  const canvas = el("canvas");
  renderer = new Renderer(canvas);
  renderer.resize();

  fillVehicleSelects();

  el("vehicle-select").addEventListener("change", (e) => {
    pushHistory();
    state.vehicleId = e.target.value;
    state.variantId = currentVehicle().variants[0].id;
    fillVariantSelect();
    refresh();
  });
  el("variant-select").addEventListener("change", (e) => {
    pushHistory();
    state.variantId = e.target.value;
    refresh();
  });

  el("undo-btn").addEventListener("click", undo);
  el("redo-btn").addEventListener("click", redo);
  el("weight-toggle").addEventListener("click", () => {
    state.showWeight = !state.showWeight;
    refresh();
  });
  el("dims-toggle").addEventListener("click", () => {
    state.showDims = !state.showDims;
    refresh();
  });
  el("clash-toggle").addEventListener("click", () => {
    state.showClash = !state.showClash;
    refresh();
  });
  el("snap-toggle").addEventListener("click", () => {
    state.snap = !state.snap;
    refresh();
  });
  // Toolbar: alle Filter auf einmal aus- und wieder einschalten. Die einzelne
  // Auswahl passiert in der Filterliste; das hier ist nur der Schnellschalter.
  el("filter-toggle").addEventListener("click", () => {
    if (state.activeFilterIds.length) {
      state.lastFilterIds = state.activeFilterIds.slice();
      state.activeFilterIds = [];
    } else {
      const back = state.lastFilterIds.filter((id) => state.filters.some((f) => f.id === id));
      state.activeFilterIds = back.length ? back
        : (state.filters[0] ? [state.filters[0].id] : []);
    }
    refresh();
  });
  el("png-btn").addEventListener("click", exportPng);

  // --- Filter ---------------------------------------------------------------
  el("filter-add-btn").addEventListener("click", () => {
    const inp = el("filter-new");
    if (!addFilter(inp.value)) {
      if (inp.value.trim()) alert("Es gibt bereits einen Filter mit diesem Namen.");
      return;
    }
    inp.value = "";
  });
  el("filter-new").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); el("filter-add-btn").click(); }
  });

  // --- Auszug am ausgewählten Möbel -----------------------------------------
  el("edit-pullout").addEventListener("change", (e) => {
    const box = selectedBox();
    if (!box) return;
    pushHistory();
    box.pullout = normalizePullout(box.pullout, box);
    box.pullout.on = e.target.checked;
    refresh();
  });
  el("edit-pullout-side").addEventListener("change", (e) => {
    const box = selectedBox();
    if (!box) return;
    pushHistory();
    box.pullout = normalizePullout(box.pullout, box);
    box.pullout.side = e.target.value;
    // Die Fläche wechselt von der y- auf die x-Ausdehnung (oder umgekehrt)
    clampPullout(box);
    refresh();
  });
  // Tiefe muss > 0 sein; Breite/Höhe/Versatz dürfen 0 sein
  // (Breite/Höhe 0 = so groß wie die Box).
  for (const f of ["depth", "w", "h", "u", "v"]) {
    el("edit-pullout-" + f).addEventListener("change", (e) => {
      const box = selectedBox();
      if (!box) return;
      const v = parseInt(e.target.value, 10);
      if (Number.isFinite(v) && v >= 0) {
        pushHistory();
        box.pullout = normalizePullout(box.pullout, box);
        box.pullout[f] = f === "depth" ? Math.max(10, v) : v;
        clampPullout(box);
      }
      refresh();
    });
  }

  // --- Sitzbank Schnierle SL3 ----------------------------------------------
  el("bench-on").addEventListener("change", (e) => {
    pushHistory();
    if (e.target.checked) {
      state.bench = clampBench(state.bench || defaultBench(currentVariant()), currentVariant());
      state.bench.on = true;
    } else if (state.bench) {
      state.bench.on = false;
      state.benchSelected = false;
    }
    refresh();
  });
  el("bench-bed").addEventListener("change", (e) => {
    if (!state.bench) return;
    pushHistory();
    state.bench.mode = e.target.checked ? "bed" : "seat";
    refresh();
  });
  el("bench-face").addEventListener("change", (e) => {
    if (!state.bench) return;
    pushHistory();
    state.bench.faceFront = e.target.checked;
    refresh();
  });
  el("bench-foot").addEventListener("change", (e) => {
    if (!state.bench) return;
    pushHistory();
    state.bench.footHeight = parseInt(e.target.value, 10);
    clampBench(state.bench, currentVariant());
    refresh();
  });
  // Zahlenfelder der Bank: alle nach demselben Muster auf das State-Feld
  for (const [id, field] of [["bench-railx", "railX"],
                             ["bench-y", "yCenter"], ["bench-offset", "benchOffset"],
                             ["bench-weight", "weight"]]) {
    el(id).addEventListener("change", (e) => {
      if (!state.bench) return;
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) {
        pushHistory();
        state.bench[field] = v;
        clampBench(state.bench, currentVariant());
      }
      refresh();
    });
  }

  document.querySelectorAll(".view-tab").forEach((t) =>
    t.addEventListener("click", () => {
      state.view = t.dataset.view;
      renderer.pan = { x: 0, y: 0 };
      refresh();
    }));

  el("mode-toggle").addEventListener("click", () => {
    state.renderMode = state.renderMode === "solid" ? "wire" : "solid";
    refresh();
  });
  el("zoom-reset").addEventListener("click", () => {
    renderer.zoom = 1;
    renderer.pan = { x: 0, y: 0 };
    refresh();
  });

  el("add-box-btn").addEventListener("click", () => {
    const l = parseInt(el("new-l").value, 10);
    const w = parseInt(el("new-w").value, 10);
    const h = parseInt(el("new-h").value, 10);
    if (!(l > 0 && w > 0 && h > 0)) { alert("Bitte gültige Maße (mm) eingeben."); return; }
    addBox(el("new-name").value.trim(), l, w, h);
    el("new-name").value = "";
  });

  const presetWrap = el("presets");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "preset-btn";
    b.textContent = p.name;
    b.title = `${p.l}×${p.w}×${p.h} mm`;
    b.addEventListener("click", () => addBox(p.name, p.l, p.w, p.h));
    presetWrap.appendChild(b);
  }

  // Edit-Panel: numerische Eingaben
  for (const f of ["x", "y", "z", "l", "w", "h"]) {
    el("edit-" + f).addEventListener("change", (e) => {
      const box = selectedBox();
      if (!box) return;
      const v = parseInt(e.target.value, 10);
      if (Number.isFinite(v)) {
        pushHistory();
        box[f] = v;
        clampBox(box, currentVariant());
        clampPullout(box); // kleinere Box → Auszug und sein Versatz nachführen
      }
      refresh();
    });
  }
  el("edit-weight").addEventListener("change", (e) => {
    const box = selectedBox();
    if (!box) return;
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) { pushHistory(); box.weight = v; }
    refresh();
  });
  el("edit-name").addEventListener("change", (e) => {
    const box = selectedBox();
    if (box) { pushHistory(); box.name = e.target.value.trim() || box.name; refresh(); }
  });
  // Farbe & Transparenz mutieren live (input) für die Vorschau. Den
  // History-Punkt schreiben wir beim change, indem wir kurz auf den beim
  // ersten input gemerkten Startwert zurücksetzen, pushen und neu setzen —
  // sonst enthielte der Snapshot bereits den neuen Wert (Undo wirkungslos).
  let colorStart = null;
  el("edit-color").addEventListener("input", (e) => {
    const box = selectedBox();
    if (!box) return;
    if (colorStart === null) colorStart = box.color;
    box.color = e.target.value;
    refresh();
  });
  el("edit-color").addEventListener("change", (e) => {
    const box = selectedBox();
    if (box && colorStart !== null && colorStart !== e.target.value) {
      const nw = e.target.value;
      box.color = colorStart; pushHistory(); box.color = nw; refresh();
    }
    colorStart = null;
  });

  let opacityStart = null;
  el("edit-opacity").addEventListener("input", (e) => {
    const box = selectedBox();
    if (!box) return;
    if (opacityStart === null) opacityStart = box.opacity;
    box.opacity = Math.max(0.1, Math.min(1, parseInt(e.target.value, 10) / 100));
    el("edit-opacity-val").textContent = Math.round(box.opacity * 100) + "%";
    refresh();
  });
  el("edit-opacity").addEventListener("change", () => {
    const box = selectedBox();
    if (box && opacityStart !== null && opacityStart !== box.opacity) {
      const nw = box.opacity;
      box.opacity = opacityStart; pushHistory(); box.opacity = nw; refresh();
    }
    opacityStart = null;
  });
  el("edit-subtract").addEventListener("change", (e) => {
    const box = selectedBox();
    if (box) { pushHistory(); box.subtract = e.target.checked; refresh(); }
  });
  el("edit-hidden").addEventListener("change", (e) => {
    const box = selectedBox();
    if (box) { pushHistory(); box.hidden = e.target.checked; refresh(); }
  });
  el("edit-rotate").addEventListener("click", () => {
    const box = selectedBox();
    if (box) rotateBox90(box.id);
  });
  el("edit-delete").addEventListener("click", () => {
    const box = selectedBox();
    if (box) deleteBox(box.id);
  });

  el("connect-btn").addEventListener("click", connectSelected);
  el("disconnect-btn").addEventListener("click", disconnectSelected);

  // Fenster hinzufügen
  for (const side of ["left", "right", "rear", "roof"]) {
    el("add-window-" + side).addEventListener("click", () => addWindow(side));
  }
  // Fenster-Edit-Felder: x, zweites Feld (z bzw. y), Breite, Höhe/Länge
  el("wedit-x").addEventListener("change", (e) => updateWindowField("x", e.target.value));
  el("wedit-second").addEventListener("change", (e) => {
    const w = selectedWindow();
    if (w) updateWindowField(w.side === "roof" ? "y" : "zBottom", e.target.value);
  });
  el("wedit-w").addEventListener("change", (e) => updateWindowField("width", e.target.value));
  el("wedit-h").addEventListener("change", (e) => {
    const w = selectedWindow();
    if (w) updateWindowField(w.side === "roof" ? "length" : "height", e.target.value);
  });
  el("wedit-delete").addEventListener("click", () => {
    const w = selectedWindow();
    if (w) deleteWindow(w.id);
  });

  // Türen hinzufügen
  for (const side of ["left", "right", "rear"]) {
    el("add-door-" + side).addEventListener("click", () => addDoor(side));
  }
  // Tür-Typ-Select befüllen
  const dtype = el("dedit-type");
  for (const o of DOOR_TYPE_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = o.value; opt.textContent = o.label;
    dtype.appendChild(opt);
  }
  dtype.addEventListener("change", (e) => updateDoorField("type", e.target.value));
  el("dedit-x").addEventListener("change", (e) => updateDoorField("x", e.target.value));
  el("dedit-z").addEventListener("change", (e) => updateDoorField("zBottom", e.target.value));
  el("dedit-w").addEventListener("change", (e) => updateDoorField("width", e.target.value));
  el("dedit-h").addEventListener("change", (e) => updateDoorField("height", e.target.value));
  el("dedit-delete").addEventListener("click", () => {
    const d = selectedDoor();
    if (d) deleteDoor(d.id);
  });

  el("export-btn").addEventListener("click", exportJson);
  el("import-input").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });

  setupCanvasEvents(canvas);

  window.addEventListener("resize", () => { renderer.resize(); refresh(); });
  refresh();
});
