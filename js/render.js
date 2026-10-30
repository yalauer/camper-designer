// Rendering für alle Ansichten.
//
// Jede Ansicht ist eine orthographische Kamera, definiert durch drei
// Einheitsvektoren: dir (Blickrichtung zur Szene), right (Bildschirm-rechts),
// up (Bildschirm-oben). Projektion: sx = p·right, sy = -p·up (in mm).
// camDist = -p·dir — je größer, desto näher am Betrachter (Painter-Sortierung
// aufsteigend = fern zuerst).

const DEG = Math.PI / 180;

function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function norm3(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

function makeIsoView(azimuthDeg, elevationDeg) {
  // Kamera steht bei Azimut a (0° = hinter dem Heck, gemessen um die z-Achse)
  // und Elevation e über dem Horizont, Blick auf die Szene.
  const a = azimuthDeg * DEG, e = elevationDeg * DEG;
  const dir = [-Math.cos(e) * Math.cos(a), -Math.cos(e) * Math.sin(a), -Math.sin(e)];
  const right = [-Math.sin(a), Math.cos(a), 0];
  // up = right × dir — zeigt nach Welt-oben (up_z > 0), damit "oben" auch
  // am Bildschirm oben landet und die Iso nicht auf dem Kopf steht.
  const up = [
    right[1] * dir[2] - right[2] * dir[1],
    right[2] * dir[0] - right[0] * dir[2],
    right[0] * dir[1] - right[1] * dir[0],
  ];
  return { dir, right, up };
}

// Seiten-Konvention: y=0 = linke Fahrzeugseite (Fahrer), y=W = rechte
// Fahrzeugseite (Beifahrer, Schiebetür). In der Draufsicht (Blick von oben)
// liegt durch up=[0,1,0] das größere y oben — also Schiebetür oben,
// Fahrerseite unten. (door/window side:"left" => y=0, side:"right" => y=W.)
const VIEWS = {
  // Draufsicht von oben: Front links, Schiebetür (y=W) oben, Fahrerseite unten
  top: { dir: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], is2d: true },
  // Blick aus der Fahrzeugmitte auf die rechte Wand/Schiebetür (Front links)
  "side-right": { dir: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1], is2d: true },
  // Blick aus der Fahrzeugmitte auf die linke Wand/Fahrerseite (Front rechts)
  "side-left": { dir: [0, -1, 0], right: [-1, 0, 0], up: [0, 0, 1], is2d: true },
  // Heckansicht: Blick von hinten in den Laderaum (Kamera hinter dem Heck,
  // Blick in -x). y quer (Fahrerseite y=0 rechts am Bild), z Höhe. Türen offen.
  rear: { dir: [-1, 0, 0], right: [0, -1, 0], up: [0, 0, 1], is2d: true },
  // Kamera hinten links oben → man sieht in den offenen Laderaum auf die
  // Schiebetürwand (rechts) von innen
  "iso-rear": makeIsoView(-32, 26),
  // Kamera vorne rechts oben → Blick auf linke Wand und Heckwand von innen
  "iso-front": makeIsoView(180 - 32, 26),
};

// Die für state.view gültigen Kameravektoren. Die frei drehbare 3D-Ansicht
// ("orbit") wird aus den aktuellen Orbit-Winkeln (state.orbit) berechnet.
function resolveView(state) {
  if (state.view === "orbit") {
    const o = state.orbit || { az: -32, el: 26 };
    return makeIsoView(o.az, o.el);
  }
  return VIEWS[state.view];
}

const COLORS = {
  // Bemaßung der Auswahl: blau = Abstand zur Nachbarbox, grün = zur Innenwand
  dimBox: "#1f6feb",
  dimWall: "#2f8f5b",
  // Auszüge (ausgefahrener Freiraum) und Sitzbank/Bodenschienen
  pullout: "#b5651d",
  pulloutFill: "#e0b48a",
  bench: "#7d8a99",
  benchLine: "#4a5563",
  rail: "#b9bec4",
  railLine: "#6f757b",
  bg: "#f5f3ee",
  hullFill: "#e7e2d8",
  hullLine: "#5b564c",
  floorFill: "#efe9dd",
  arch: "#b8b0a1",
  archLine: "#7a7263",
  door: "#d98e32",
  doorFill: "rgba(217,142,50,0.18)",
  window: "#5b9bd5",
  windowFill: "rgba(120,180,230,0.30)",
  windowCustom: "#3f7fbf",
  roofWindowFill: "rgba(120,180,230,0.45)",
  dim: "#8a857a",
  grid: "rgba(0,0,0,0.05)",
  select: "#1f6feb",
  collide: "#d63031",
  text: "#444",
};

// ---------------------------------------------------------------------------
// Renderer: hält Canvas, Transformation (Auto-Fit + Zoom/Pan) und Picking.
// ---------------------------------------------------------------------------
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.picks = [];      // [{boxId, polygon: [[px,py],...]}] in Zeichenreihenfolge
    this.transform = { scale: 1, ox: 0, oy: 0 };
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = r.width;
    this.cssH = r.height;
  }

  project(view, x, y, z) {
    return {
      sx: x * view.right[0] + y * view.right[1] + z * view.right[2],
      sy: -(x * view.up[0] + y * view.up[1] + z * view.up[2]),
      camDist: -(x * view.dir[0] + y * view.dir[1] + z * view.dir[2]),
    };
  }

  toPx(p) {
    const t = this.transform;
    return [t.ox + p.sx * t.scale, t.oy + p.sy * t.scale];
  }

  // Quaderecken [x0..x1, y0..y1, z0..z1] projizieren
  projectBoxCorners(view, b) {
    const c = [];
    for (const x of [b.x0, b.x1])
      for (const y of [b.y0, b.y1])
        for (const z of [b.z0, b.z1])
          c.push(this.project(view, x, y, z));
    return c;
  }

  fitToHull(view, variant) {
    const { length: L, width: W, height: H } = variant.cargo;
    const corners = this.projectBoxCorners(view, { x0: 0, y0: 0, z0: 0, x1: L, y1: W, z1: H });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of corners) {
      minX = Math.min(minX, p.sx); maxX = Math.max(maxX, p.sx);
      minY = Math.min(minY, p.sy); maxY = Math.max(maxY, p.sy);
    }
    const pad = 90;
    const scale = Math.min(
      (this.cssW - 2 * pad) / Math.max(1, maxX - minX),
      (this.cssH - 2 * pad) / Math.max(1, maxY - minY)
    ) * this.zoom;
    this.transform = {
      scale,
      ox: this.cssW / 2 - ((minX + maxX) / 2) * scale + this.pan.x,
      oy: this.cssH / 2 - ((minY + maxY) / 2) * scale + this.pan.y,
    };
  }

  pxToWorldDelta(viewName, dpx, dpy, shiftKey, state) {
    // Bildschirm-Delta (px) → Welt-Delta (mm) für Drag.
    // Für die frei drehbare 3D-Ansicht die aktuellen Orbit-Vektoren auflösen.
    const view = viewName === "orbit" && state ? resolveView(state) : VIEWS[viewName];
    const s = this.transform.scale;
    const dsx = dpx / s, dsy = dpy / s;
    // top: right=[1,0,0], up=[0,1,0] → sx=x, sy=-y ⇒ dx=dsx, dy=-dsy
    if (viewName === "top") return { dx: dsx, dy: -dsy, dz: 0 };
    if (viewName === "side-right") return { dx: dsx, dy: 0, dz: -dsy };
    if (viewName === "side-left") return { dx: -dsx, dy: 0, dz: -dsy };
    // rear: right=[0,-1,0] → sx=-y ⇒ dy=-dsx; up=[0,0,1] → sy=-z ⇒ dz=-dsy
    if (viewName === "rear") return { dx: 0, dy: -dsx, dz: -dsy };
    // Iso: ohne Shift auf der Bodenebene (dz=0) verschieben, mit Shift nur Höhe.
    if (shiftKey) {
      const uz = view.up[2] || 1e-9;
      return { dx: 0, dy: 0, dz: -dsy / uz };
    }
    // Löse  dsx = rx*dx + ry*dy ;  dsy = -(ux*dx + uy*dy)
    const a = view.right[0], b = view.right[1];
    const c = -view.up[0], d = -view.up[1];
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) return { dx: 0, dy: 0, dz: 0 };
    return { dx: (dsx * d - b * dsy) / det, dy: (a * dsy - dsx * c) / det, dz: 0 };
  }

  hitTest(px, py) {
    // Picking-Polygone in umgekehrter Zeichenreihenfolge (vorderste zuerst)
    for (let i = this.picks.length - 1; i >= 0; i--) {
      if (pointInPolygon(px, py, this.picks[i].polygon)) return this.picks[i].boxId;
    }
    return null;
  }

  // Getrennt von hitTest, damit Möbel-Picking Vorrang behält: die Bank wird
  // nur getroffen, wenn an der Stelle keine Box liegt.
  hitTestBench(px, py) {
    for (let i = this.benchPicks.length - 1; i >= 0; i--) {
      if (pointInPolygon(px, py, this.benchPicks[i])) return true;
    }
    return false;
  }

  // ===========================================================================
  // Hauptzeichnung
  // ===========================================================================
  render(state, variant, collisions) {
    const ctx = this.ctx;
    this.picks = [];
    this.benchPicks = [];
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const view = resolveView(state);
    this.fitToHull(view, variant);
    const wire = state.renderMode === "wire";
    // Kollisions-Hervorhebung abschaltbar: bei showClash=false leere Menge ans
    // Zeichnen geben, sodass nichts rot markiert wird (Status zeigt sie weiter).
    const drawCol = state.showClash === false ? new Set() : collisions;

    if (state.view === "top") this.renderTop(state, variant, wire, drawCol);
    else if (state.view === "side-right" || state.view === "side-left")
      this.renderSide(state, variant, wire, drawCol, state.view === "side-right" ? "right" : "left");
    else if (state.view === "rear") this.renderRear(state, variant, wire, drawCol);
    else this.renderIso(state, variant, wire, drawCol); // iso-rear/iso-front/orbit

    // Sitzbank/Schienen hängen in Iso in der Tiefensortierung (renderIso) und
    // in der Draufsicht in der Höhensortierung (renderTop). Nur in den
    // Wandansichten bleibt ein Overlay über dem Boden.
    if (view && view.is2d && state.view !== "top") this.drawBench(state, variant, wire);
    // Auszüge liegen als Freiraum-Markierung immer obenauf
    this.drawPullouts(state, variant, wire);

    // Overlays über der Szene — beide nur für die aktuelle Auswahl
    if (state.showDims) {
      this.drawChainDims(state, variant); // Koordinatenkette der gewählten Box
      this.drawDimChains(state, variant); // Abstände Box ↔ Nachbarbox
    }
    if (state.showWeight) this.drawCenterOfMass(state, variant);
  }

  // Ausgefahrene Auszüge als gestricheltes Volumen — der Freiraum, den der
  // Auszug beim Öffnen braucht. So fällt beim Planen sofort auf, wenn ein
  // Auszug gegen ein Nachbarmöbel oder eine Wand läuft.
  drawPullouts(state, variant, wire) {
    const view = resolveView(state);
    if (!view) return;
    for (const b of state.boxes) {
      if (b.hidden) continue;
      const a = pulloutAabb(b);
      if (!a) continue;
      const sel = b.id === state.selectedBoxId;
      this.ctx.globalAlpha = matchesFilter(state, b) ? (sel ? 0.9 : 0.55) : 0.1;
      this.drawIsoUnit(view, [a], {
        fill: COLORS.pulloutFill,
        stroke: sel ? COLORS.select : COLORS.pullout,
        lineWidth: sel ? 2 : 1.2,
        // Der Auszug markiert Freiraum, kein Volumen — er darf in der
        // Drahtansicht nichts verdecken.
        wire, outlineParts: [a], dash: [6, 4], occlude: false,
      });
      this.ctx.globalAlpha = 1;
      const c = this.toPx(this.project(view, (a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, (a.z0 + a.z1) / 2));
      this.label(`⇤ ${Math.round(b.pullout.depth)}`, c[0], c[1], { size: 9, color: COLORS.pullout, bold: true });
    }
  }

  // Schnierle SL3 auf Bodenschienen. Die Schienen liegen flach auf dem
  // Ladeboden und begrenzen den Verschiebeweg der Bank.
  drawBench(state, variant, wire) {
    const bench = state.bench;
    if (!bench || !bench.on) return;
    const view = resolveView(state);
    if (!view) return;
    const g = benchSolids(bench, variant);
    const sel = !!state.benchSelected;
    // Die Bank trägt wie ein Möbel eine Filter-Zuordnung und tritt bei
    // aktivem Filter genauso zurück, wenn sie nicht dazugehört.
    this.ctx.globalAlpha = matchesFilter(state, bench) ? 1 : 0.12;
    // Schienen zuerst — sie liegen unter der Bank
    this.drawIsoUnit(view, g.rails, {
      fill: COLORS.rail, stroke: COLORS.railLine, lineWidth: 1.2, wire, outlineParts: g.rails,
    });
    this.drawIsoUnit(view, g.parts, {
      fill: COLORS.bench, stroke: sel ? COLORS.select : COLORS.benchLine,
      lineWidth: sel ? 2.5 : 1.5, wire, outlineParts: g.parts,
    });
    this.ctx.globalAlpha = 1;
    // Picking über die Silhouette der Bankteile (nicht der Schienen)
    for (const p of g.parts) {
      for (const poly of this.drawCuboid(view, p, { fill: null, stroke: null, wire: true, pickOnly: true })) {
        this.benchPicks.push(poly);
      }
    }
    const a = g.aabb;
    const c = this.toPx(this.project(view, (a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, a.z1));
    this.label(bench.mode === "bed" ? "SL3 · Liege" : "SL3 · Sitzbank", c[0], c[1] - 12,
      { size: 10, bold: true, color: sel ? COLORS.select : COLORS.benchLine });
  }

  // Koordinaten-Maßkette entlang der beiden sichtbaren Achsen — NUR für die
  // aktuell ausgewählte(n) Box(en), inkl. Wände. Ohne Auswahl wird nichts
  // gezeichnet; der Plan bleibt sauber. Die Bauraum-Gesamtmaße (dimLine) sind
  // davon unberührt und immer sichtbar.
  drawChainDims(state, variant) {
    const view = VIEWS[state.view];
    if (!view || !view.is2d) return; // Iso/Orbit: Ketten wären unlesbar
    const c = variant.cargo;
    const boxes = selectedBoxes(state, variant);
    if (boxes.length === 0) return;

    // Kantenpositionen auf einer Achse sammeln (lo+hi jeder Box), mit Wänden,
    // entdoppeln (Toleranz 2 mm) und sortieren.
    const edgeSet = (axisLo, axisSize, max) => {
      const vals = [0, max];
      for (const b of boxes) { vals.push(b[axisLo]); vals.push(b[axisLo] + b[axisSize]); }
      vals.sort((p, q) => p - q);
      const out = [];
      for (const v of vals) if (!out.length || v - out[out.length - 1] > 2) out.push(v);
      return out;
    };
    // Eigenausdehnung der Auswahl auf einer Achse — diese Segmente werden als
    // "äußeres Maß der Box" hervorgehoben, die übrigen sind Abstände.
    const spanSet = (axisLo, axisSize) =>
      boxes.map((b) => [b[axisLo], b[axisLo] + b[axisSize]]);

    // Die Box-Ketten an die GEGENÜBERLIEGENDE Seite der Bauraum-Gesamtbemaßung
    // legen (die sitzt bei y=W und x=0): x-Kette an y=0, y-Kette an x=L.
    const cargoMid = state.view === "top" ? [c.length / 2, c.width / 2, 0]
      : state.view === "rear" ? [0, c.width / 2, c.height / 2]
      : [c.length / 2, 0, c.height / 2];
    if (state.view === "top") {
      this.drawChainAxis(view, edgeSet("x", "l", c.length), "x", 0, cargoMid, spanSet("x", "l"));
      this.drawChainAxis(view, edgeSet("y", "w", c.width), "y", c.length, cargoMid, spanSet("y", "w"));
    } else if (state.view.startsWith("side")) {
      // Bauraum-Bemaßung sitzt bei z=0 (Länge) und an einer x-Seite (Höhe).
      // Box-Ketten an z=H (Längs) und an die andere x-Seite (Höhe).
      this.drawChainAxis(view, edgeSet("x", "l", c.length), "xSideTop", c.height, cargoMid, spanSet("x", "l"));
      this.drawChainAxis(view, edgeSet("z", "h", c.height), "zSide", c.length, cargoMid, spanSet("z", "h"));
    } else if (state.view === "rear") {
      // Bauraum-Bemaßung sitzt unten (Breite) und rechts bei y=0 (Höhe).
      // Box-Ketten ans Dach (Breite) und an die Seite y=W (Höhe).
      this.drawChainAxis(view, edgeSet("y", "w", c.width), "yRear", c.height, cargoMid, spanSet("y", "w"));
      this.drawChainAxis(view, edgeSet("z", "h", c.height), "zRear", c.width, cargoMid, spanSet("z", "h"));
    }
  }

  // Zeichnet eine Koordinaten-Maßlinie entlang einer Achse. coords = sortierte
  // Kantenpositionen (mm). axis bestimmt, wie die mm-Koordinate in Weltpunkte
  // übersetzt wird; cargoMid (Welt) dient dazu, den Versatz IMMER vom Bauraum
  // weg nach außen zu legen — robust für alle Ansichten.
  drawChainAxis(view, coords, axis, otherMax, cargoMid, spans = []) {
    if (coords.length < 2) return;
    const ctx = this.ctx;
    // Weltpunkt für eine Achsenkoordinate v (die andere Achse am Anker = otherMax)
    const worldAt = (v) => {
      if (axis === "x") return [v, otherMax, 0];       // top: x-Kette an y=otherMax (=0, Fahrerseite)
      if (axis === "y") return [otherMax, v, 0];       // top: y-Kette an x=otherMax (=L, Heck)
      if (axis === "xSideTop") return [v, 0, otherMax]; // side: x-Kette an z=otherMax (=H, Dach)
      if (axis === "yRear") return [0, v, otherMax];    // rear: y-Kette an z=otherMax (=H, Dach)
      if (axis === "zRear") return [0, otherMax, v];    // rear: z-Kette an y=otherMax (=W)
      return [otherMax, 0, v];                          // zSide: z-Kette an x=otherMax (=L, Heck)
    };
    // Liegt das Segment [a,b] innerhalb der Eigenausdehnung einer Auswahl-Box?
    const isOwnSpan = (a, b) => spans.some(([lo, hi]) => a >= lo - 2 && b <= hi + 2);
    const offPx = 22;
    const pts = coords.map((v) => this.toPx(this.project(view, ...worldAt(v))));
    const dirX = pts[pts.length - 1][0] - pts[0][0];
    const dirY = pts[pts.length - 1][1] - pts[0][1];
    const len = Math.hypot(dirX, dirY) || 1;
    let nx = -dirY / len, ny = dirX / len; // Normale (Einheitsvektor)
    // Versatzrichtung so wählen, dass die Maßlinie VOM Bauraum-Mittelpunkt
    // weg zeigt (Skalarprodukt der Normalen mit (Kantenmitte - Mitte)).
    const midPx = this.toPx(this.project(view, ...cargoMid));
    const edgeMidPx = pts[Math.floor(pts.length / 2)];
    const outward = (edgeMidPx[0] - midPx[0]) * nx + (edgeMidPx[1] - midPx[1]) * ny;
    const sign = outward >= 0 ? 1 : -1;
    nx *= sign * offPx; ny *= sign * offPx;
    const off = pts.map((p) => [p[0] + nx, p[1] + ny]);

    ctx.strokeStyle = "#9a7b3a"; ctx.lineWidth = 1; ctx.setLineDash([]);
    // durchgehende Maßlinie + Hilfslinien an jede Kante
    ctx.beginPath();
    ctx.moveTo(off[0][0], off[0][1]); ctx.lineTo(off[off.length - 1][0], off[off.length - 1][1]);
    for (let i = 0; i < pts.length; i++) {
      ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(off[i][0], off[i][1]);
    }
    ctx.stroke();
    // Tick + Maßzahl je Segment. Das Eigenmaß der Box wird kräftiger gesetzt,
    // die Abstände zu Wand/Nachbar bleiben dezent.
    for (let i = 0; i < coords.length - 1; i++) {
      const seg = Math.round(coords[i + 1] - coords[i]);
      if (seg <= 0) continue;
      const mx = (off[i][0] + off[i + 1][0]) / 2, my = (off[i][1] + off[i + 1][1]) / 2;
      // nur beschriften, wenn das Segment am Bildschirm breit genug ist
      const segPx = Math.hypot(off[i + 1][0] - off[i][0], off[i + 1][1] - off[i][1]);
      if (segPx <= 16) continue;
      const own = isOwnSpan(coords[i], coords[i + 1]);
      this.label(`${seg}`, mx, my,
        own ? { size: 11, color: "#5c4413", bold: true } : { size: 9, color: "#7a5f2a" });
    }
  }

  // Abstände der ausgewählten Box — je Richtung ZWEI Maße:
  //   (1) blau  = zur nächsten Nachbarbox (nur wenn dort eine liegt)
  //   (2) grün  = zur Innenwand des Laderaums
  // Die beiden liegen quer versetzt (t=0.32 / t=0.68 über die Box-Ausdehnung),
  // damit sie sich nicht überdecken. Iso/Orbit ausgelassen (unlesbar).
  drawDimChains(state, variant) {
    const view = VIEWS[state.view];
    if (!view || !view.is2d) return;
    const box = selectedBoxes(state, variant)[0];
    if (!box) return;
    const c = variant.cargo;
    // Nachbarn: alle anderen Möbel — und für eine Box zusätzlich die Sitzbank,
    // damit auch der Abstand Box↔Bank bemaßt wird.
    const others = state.boxes.filter((b) => b.id !== box.id && !b.hidden);
    if (box.id !== BENCH_DIM_ID && state.bench && state.bench.on) {
      const a = benchSolids(state.bench, variant).bodyAabb;
      others.push({ id: BENCH_DIM_ID, x: a.x0, y: a.y0, z: a.z0,
        l: a.x1 - a.x0, w: a.y1 - a.y0, h: a.z1 - a.z0 });
    }

    // Nächste Nachbarkante vor/hinter der Box auf einer Achse (null = keine).
    // Gezählt wird nur, was sich auf den beiden anderen Achsen überlappt.
    const nearestBefore = (lo, axisLo, axisSize) => {
      let best = null;
      for (const o of others) {
        const oHi = o[axisLo] + o[axisSize];
        if (oHi <= lo + 0.5 && overlapsOtherAxes(box, o, axisLo) && (best === null || oHi > best)) best = oHi;
      }
      return best;
    };
    const nearestAfter = (hi, axisLo, axisSize) => {
      let best = null;
      for (const o of others) {
        const oLo = o[axisLo];
        if (oLo >= hi - 0.5 && overlapsOtherAxes(box, o, axisLo) && (best === null || oLo < best)) best = oLo;
      }
      return best;
    };

    // Eine Achse bemaßen. at(v, t) baut den Weltpunkt bei Achsenkoordinate v
    // und Querposition t (0..1 über die Box-Ausdehnung quer zur Achse).
    const axisDims = (axisLo, axisSize, axisMax, at) => {
      const lo = box[axisLo], hi = lo + box[axisSize];
      const nb = nearestBefore(lo, axisLo, axisSize);
      const na = nearestAfter(hi, axisLo, axisSize);
      // zur Innenwand
      this.dimGap(view, at(lo, 0.68), at(0, 0.68), Math.round(lo), COLORS.dimWall);
      this.dimGap(view, at(hi, 0.68), at(axisMax, 0.68), Math.round(axisMax - hi), COLORS.dimWall);
      // zur Nachbarbox
      if (nb !== null) this.dimGap(view, at(lo, 0.32), at(nb, 0.32), Math.round(lo - nb), COLORS.dimBox);
      if (na !== null) this.dimGap(view, at(hi, 0.32), at(na, 0.32), Math.round(na - hi), COLORS.dimBox);
    };

    if (state.view === "top") {
      axisDims("x", "l", c.length, (v, t) => [v, box.y + box.w * t, 0]);
      axisDims("y", "w", c.width, (v, t) => [box.x + box.l * t, v, 0]);
    } else if (state.view.startsWith("side")) {
      axisDims("x", "l", c.length, (v, t) => [v, 0, box.z + box.h * t]);
      axisDims("z", "h", c.height, (v, t) => [box.x + box.l * t, 0, v]);
    } else if (state.view === "rear") {
      axisDims("y", "w", c.width, (v, t) => [0, v, box.z + box.h * t]);
      axisDims("z", "h", c.height, (v, t) => [0, box.y + box.w * t, v]);
    }
  }

  // Eine kurze Maß-Hilfslinie zwischen zwei Weltpunkten mit Beschriftung (mm).
  dimGap(view, pa, pb, value, color = COLORS.dimBox) {
    if (value <= 0) return;
    const a = this.toPx(this.project(view, ...pa));
    const b = this.toPx(this.project(view, ...pb));
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    // Endstriche, damit klar ist, worauf sich die Zahl bezieht
    ctx.setLineDash([]);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * 3, ny = dx / len * 3;
    ctx.beginPath();
    for (const p of [a, b]) { ctx.moveTo(p[0] - nx, p[1] - ny); ctx.lineTo(p[0] + nx, p[1] + ny); }
    ctx.stroke();
    this.label(`${value}`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 7, { size: 10, color, bold: true });
  }

  // Schwerpunkt (gewichtet) in der Draufsicht als Fadenkreuz markieren.
  drawCenterOfMass(state, variant) {
    if (state.view !== "top") return;
    const boxes = state.boxes.filter((b) => !b.hidden && (b.weight || 0) > 0);
    let total = 0, mx = 0, my = 0;
    for (const b of boxes) {
      const w = b.weight; total += w;
      mx += w * (b.x + b.l / 2); my += w * (b.y + b.w / 2);
    }
    if (total <= 0) return;
    const view = VIEWS.top;
    const p = this.toPx(this.project(view, mx / total, my / total, 0));
    const ctx = this.ctx;
    ctx.strokeStyle = "#c0392b"; ctx.fillStyle = "rgba(192,57,43,0.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p[0] - 16, p[1]); ctx.lineTo(p[0] + 16, p[1]);
    ctx.moveTo(p[0], p[1] - 16); ctx.lineTo(p[0], p[1] + 16);
    ctx.stroke();
    this.label("Schwerpunkt", p[0], p[1] - 22, { size: 10, color: "#c0392b", bold: true });
  }

  // --- Hilfen ---------------------------------------------------------------
  poly(pts, fill, stroke, lineWidth = 1.5, dash = null) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  rectPx(x0, y0, x1, y1) {
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }

  worldRect(view, corners3d) {
    // 4 Weltpunkte → Pixel-Polygon
    return corners3d.map((p) => this.toPx(this.project(view, p[0], p[1], p[2])));
  }

  label(text, px, py, opts = {}) {
    const ctx = this.ctx;
    ctx.font = `${opts.bold ? "600 " : ""}${opts.size || 12}px system-ui, sans-serif`;
    ctx.fillStyle = opts.color || COLORS.text;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, px, py);
  }

  dimLine(p1, p2, text, offset = 28) {
    // Maßlinie mit Endstrichen parallel zur Strecke p1→p2, versetzt um offset px
    const ctx = this.ctx;
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const a = [p1[0] + nx * offset, p1[1] + ny * offset];
    const b = [p2[0] + nx * offset, p2[1] + ny * offset];
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]); ctx.lineTo(a[0], a[1]);
    ctx.moveTo(p2[0], p2[1]); ctx.lineTo(b[0], b[1]);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    const tick = 4;
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.moveTo(p[0] - (dx / len) * tick - nx * tick, p[1] - (dy / len) * tick - ny * tick);
      ctx.lineTo(p[0] + (dx / len) * tick + nx * tick, p[1] + (dy / len) * tick + ny * tick);
      ctx.stroke();
    }
    this.label(text, (a[0] + b[0]) / 2 + nx * 12, (a[1] + b[1]) / 2 + ny * 12, { size: 11, color: "#777" });
  }

  boxStroke(box, selected, colliding, wire) {
    if (colliding) return COLORS.collide;
    if (selected) return COLORS.select;
    // Drahtmodus: Kanten in der reinen Boxfarbe; Vollmodus: abgedunkelte Kontur
    return wire ? box.color : shade(box.color, -0.35);
  }

  // ===========================================================================
  // Draufsicht
  // ===========================================================================
  renderTop(state, variant, wire, collisions) {
    const view = VIEWS.top;
    const { length: L, width: W } = variant.cargo;
    const o = this.toPx(this.project(view, 0, 0, 0));
    const e = this.toPx(this.project(view, L, W, 0));
    const s = this.transform.scale;

    // Boden / Umriss
    this.poly(this.rectPx(o[0], o[1], e[0], e[1]), wire ? null : COLORS.floorFill, COLORS.hullLine, 2.5);
    if (!wire) this.drawGrid(o, e, s);

    // Radkästen mit abgerundeten inneren Ecken (Draufsicht = Grundriss)
    for (const a of wheelArchBoxes(variant)) {
      this.drawArchTop(view, a, wire);
    }

    // Türen und Fenster an den Wandlinien markieren
    for (const d of allDoors(state, variant)) {
      this.ctx.lineWidth = d.id && d.id === state.selectedDoorId ? 8 : 6;
      this.ctx.strokeStyle = d.id && d.id === state.selectedDoorId ? COLORS.select : COLORS.door;
      this.ctx.beginPath();
      if (d.side === "rear") {
        const p0 = this.toPx(this.project(view, L, d.x, 0));
        const p1 = this.toPx(this.project(view, L, d.x + d.width, 0));
        this.ctx.moveTo(p0[0], p0[1]); this.ctx.lineTo(p1[0], p1[1]);
      } else {
        const y = d.side === "left" ? 0 : W;
        const p0 = this.toPx(this.project(view, d.x, y, 0));
        const p1 = this.toPx(this.project(view, d.x + d.width, y, 0));
        this.ctx.moveTo(p0[0], p0[1]); this.ctx.lineTo(p1[0], p1[1]);
      }
      this.ctx.stroke();
    }
    for (const w of allWindows(state, variant)) {
      if (w.side === "roof") {
        // Dachfenster: Rechteck auf der Dachfläche, von oben sichtbar
        const p = this.worldRect(view, [
          [w.x, w.y, 0], [w.x + w.width, w.y, 0],
          [w.x + w.width, w.y + w.length, 0], [w.x, w.y + w.length, 0],
        ]);
        this.poly(p, wire ? null : COLORS.roofWindowFill, COLORS.window, 1.5, [4, 3]);
        continue;
      }
      this.ctx.lineWidth = 3.5;
      this.ctx.strokeStyle = w.custom ? COLORS.windowCustom : COLORS.window;
      this.ctx.beginPath();
      let p0, p1;
      if (w.side === "rear") {
        p0 = this.toPx(this.project(view, L, w.x, 0));
        p1 = this.toPx(this.project(view, L, w.x + w.width, 0));
      } else {
        const y = w.side === "left" ? 0 : W;
        p0 = this.toPx(this.project(view, w.x, y, 0));
        p1 = this.toPx(this.project(view, w.x + w.width, y, 0));
      }
      this.ctx.moveTo(p0[0], p0[1]); this.ctx.lineTo(p1[0], p1[1]);
      this.ctx.stroke();
    }

    // Boxen als Einheiten (gruppierte gleichfarbige verschmelzen); oberste
    // (höchste Oberkante) zuletzt.
    const subtractors = effectiveSubtractors(state, variant);
    // Boxen UND Sitzbank gemeinsam nach Oberkante sortieren. Würde die Bank —
    // wie früher — erst danach als Overlay gezeichnet, verdeckte sie in der
    // Draufsicht auch Möbel, die über ihr hängen.
    const drawables = buildBoxUnits(state, subtractors).map((u) => ({ u, z: u.aabb.z1 }));
    if (state.bench && state.bench.on) {
      drawables.push({ bench: true, z: benchSolids(state.bench, variant).bodyAabb.z1 });
    }
    drawables.sort((a, b) => a.z - b.z);
    for (const d of drawables) {
      if (d.bench) { this.drawBench(state, variant, wire); continue; }
      const u = d.u;
      const sel = u.boxIds.some((id) => id === state.selectedBoxId);
      const col = u.boxIds.some((id) => collisions.has(id));
      const stroke = this.boxStroke({ color: u.color }, sel, col, wire);
      const lw = sel || col ? 2.5 : 1.5;
      if (u.subtract) {
        for (const b of u.boxes) {
          const fp = this.worldRect(view, [
            [b.x, b.y, 0], [b.x + b.l, b.y, 0], [b.x + b.l, b.y + b.w, 0], [b.x, b.y + b.w, 0],
          ]);
          this.poly(fp, null, stroke, sel ? 2.5 : 1.5, [6, 4]);
        }
      } else {
        const toRect = (pt) => [
          [pt.x0, pt.y0, 0], [pt.x1, pt.y0, 0], [pt.x1, pt.y1, 0], [pt.x0, pt.y1, 0],
        ];
        const rects = u.parts.map(toRect);
        const fills = u.colored.map((c) => ({ color: c.color, rects: c.parts.map(toRect) }));
        const outlineRects = u.boxes.map((b) => toRect({ x0: b.x, y0: b.y, x1: b.x + b.l, y1: b.y + b.w }));
        this.ctx.globalAlpha = unitAlpha(state, u);
        this.drawUnit2D(view, rects, { fills: wire ? null : fills, stroke, lineWidth: lw, wire, outlineRects });
        this.ctx.globalAlpha = 1;
      }
      // Beschriftung + Picking je Box
      for (const b of u.boxes) {
        const fp = this.worldRect(view, [
          [b.x, b.y, 0], [b.x + b.l, b.y, 0], [b.x + b.l, b.y + b.w, 0], [b.x, b.y + b.w, 0],
        ]);
        const cx = (fp[0][0] + fp[2][0]) / 2, cy = (fp[0][1] + fp[2][1]) / 2;
        if ((b.l * s) > 40) this.label(b.name, cx, cy, { size: 11, bold: b.id === state.selectedBoxId });
        this.picks.push({ boxId: b.id, polygon: fp });
      }
    }

    // Beschriftung + Maße
    // o = (x=0,y=0) → unten links (Fahrerseite/Front); e = (x=L,y=W) → oben rechts
    this.label("FRONT", o[0] - 35, (o[1] + e[1]) / 2, { bold: true, color: "#999", size: 11 });
    this.label("HECK", e[0] + 32, (o[1] + e[1]) / 2, { bold: true, color: "#999", size: 11 });
    this.label("Beifahrerseite (Schiebetür)", (o[0] + e[0]) / 2, e[1] - 18, { color: "#999", size: 11 });
    this.label("Fahrerseite", (o[0] + e[0]) / 2, o[1] + 18, { color: "#999", size: 11 });
    this.dimLine([o[0], e[1]], [e[0], e[1]], `${L} mm`, 38);
    this.dimLine([o[0], e[1]], [o[0], o[1]], `${W} mm`, 38);
    const wa = variant.wheelArch;
    const aw = archSideWidth(variant);
    const m0 = this.toPx(this.project(view, wa.x + wa.length / 2, aw, 0));
    const m1 = this.toPx(this.project(view, wa.x + wa.length / 2, W - aw, 0));
    this.dimLine(m0, m1, `${variant.widthBetweenArches} mm`, 0);
  }

  drawGrid(o, e, s) {
    // 100-mm-Raster
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const step = 100 * s;
    if (step < 6) return;
    ctx.beginPath();
    for (let x = Math.min(o[0], e[0]) + step; x < Math.max(o[0], e[0]); x += step) {
      ctx.moveTo(x, Math.min(o[1], e[1])); ctx.lineTo(x, Math.max(o[1], e[1]));
    }
    for (let y = Math.min(o[1], e[1]) + step; y < Math.max(o[1], e[1]); y += step) {
      ctx.moveTo(Math.min(o[0], e[0]), y); ctx.lineTo(Math.max(o[0], e[0]), y);
    }
    ctx.stroke();
  }

  // ===========================================================================
  // Wand-Innenansicht (Schnitt in Fahrzeugmitte)
  // ===========================================================================
  renderSide(state, variant, wire, collisions, wall) {
    const view = VIEWS[wall === "right" ? "side-right" : "side-left"];
    const { length: L, width: W, height: H } = variant.cargo;
    const o = this.toPx(this.project(view, 0, 0, H));
    const e = this.toPx(this.project(view, L, 0, 0));
    const x0 = Math.min(o[0], e[0]), x1 = Math.max(o[0], e[0]);
    const s = this.transform.scale;

    // Wandfläche
    this.poly(this.rectPx(x0, o[1], x1, e[1]), wire ? null : COLORS.hullFill, COLORS.hullLine, 2.5);
    if (!wire) this.drawGrid([x0, o[1]], [x1, e[1]], s);

    // Radkasten dieser Wand: Längs-Silhouette aus DEMSELBEN Höhenprofil wie der
    // Iso-Körper (Tonnenform: senkrecht hoch, flaches Dach, gerundete Enden) —
    // so stimmen Wand- und Iso-Ansicht exakt überein.
    const wa = variant.wheelArch;
    const ctx = this.ctx;
    const aH = wa.height;
    const xs = archLengthProfile(variant);     // [{x, hz}, ...] entlang der Länge
    ctx.beginPath();
    let started = false;
    const lineTo3d = (x, z) => {
      const p = this.toPx(this.project(view, x, 0, z));
      if (started) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); started = true; }
    };
    lineTo3d(xs[0].x, 0);                       // linker Fuß am Boden
    for (const { x, hz } of xs) lineTo3d(x, aH * hz); // Oberkante entlang Profil
    lineTo3d(xs[xs.length - 1].x, 0);           // rechter Fuß am Boden
    ctx.closePath();
    if (!wire) { ctx.fillStyle = COLORS.arch; ctx.fill(); }
    ctx.strokeStyle = COLORS.archLine; ctx.lineWidth = 1.5; ctx.stroke();
    const lp = this.toPx(this.project(view, (xs[0].x + xs[xs.length - 1].x) / 2, 0, aH * 0.4));
    this.label("Radkasten", lp[0], lp[1], { size: 10, color: "#6d675c" });

    // Türen und Fenster dieser Wand
    for (const d of allDoors(state, variant)) {
      if (d.side !== wall) continue;
      const zBottom = d.zBottom || 0;
      const p = this.worldRect(view, [[d.x, 0, zBottom], [d.x + d.width, 0, zBottom], [d.x + d.width, 0, zBottom + d.height], [d.x, 0, zBottom + d.height]]);
      const selected = d.id && d.id === state.selectedDoorId;
      this.poly(p, wire ? null : COLORS.doorFill, selected ? COLORS.select : COLORS.door, selected ? 3 : 2, [7, 4]);
      this.label(doorLabel(d), (p[0][0] + p[2][0]) / 2, p[2][1] - 10, { size: 10, color: selected ? COLORS.select : COLORS.door });
    }
    for (const w of allWindows(state, variant)) {
      if (w.side !== wall) continue; // roof- und gegenüberliegende Wand überspringen
      const p = this.worldRect(view, [
        [w.x, 0, w.zBottom], [w.x + w.width, 0, w.zBottom],
        [w.x + w.width, 0, w.zBottom + w.height], [w.x, 0, w.zBottom + w.height],
      ]);
      this.poly(p, wire ? null : COLORS.windowFill, w.custom ? COLORS.windowCustom : COLORS.window, 1.5);
    }

    // Box-Einheiten: NUR die zeigen, die diese Wand berühren (deren y-Ausdehnung
    // die Wandebene erreicht). Toleranz WALL_TOUCH mm für nahezu bündige Möbel.
    const WALL_TOUCH = 60;
    const touchesWall = (u) => wall === "right"
      ? u.aabb.y1 >= W - WALL_TOUCH
      : u.aabb.y0 <= WALL_TOUCH;
    const subtractors = effectiveSubtractors(state, variant);
    const units = buildBoxUnits(state, subtractors)
      .filter(touchesWall)
      .map((u) => ({ u, cy: (u.aabb.y0 + u.aabb.y1) / 2 }))
      .sort((a, b) => {
        const ca = this.project(view, 0, a.cy, 0).camDist;
        const cb = this.project(view, 0, b.cy, 0).camDist;
        return ca - cb;
      });
    for (const { u } of units) {
      const sel = u.boxIds.some((id) => id === state.selectedBoxId);
      const col = u.boxIds.some((id) => collisions.has(id));
      const stroke = this.boxStroke({ color: u.color }, sel, col, wire);
      const lw = sel || col ? 2.5 : 1.5;
      if (u.subtract) {
        for (const b of u.boxes) {
          const fp = this.worldRect(view, [
            [b.x, 0, b.z], [b.x + b.l, 0, b.z], [b.x + b.l, 0, b.z + b.h], [b.x, 0, b.z + b.h],
          ]);
          this.poly(fp, null, stroke, sel ? 2.5 : 1.5, [6, 4]);
        }
      } else {
        const toRect = (pt) => [
          [pt.x0, 0, pt.z0], [pt.x1, 0, pt.z0], [pt.x1, 0, pt.z1], [pt.x0, 0, pt.z1],
        ];
        const rects = u.parts.map(toRect);
        const fills = u.colored.map((c) => ({ color: c.color, rects: c.parts.map(toRect) }));
        const outlineRects = u.boxes.map((b) => toRect({ x0: b.x, z0: b.z, x1: b.x + b.l, z1: b.z + b.h }));
        ctx.globalAlpha = unitAlpha(state, u);
        this.drawUnit2D(view, rects, { fills: wire ? null : fills, stroke, lineWidth: lw, wire, outlineRects });
        ctx.globalAlpha = 1;
      }
      for (const b of u.boxes) {
        const fp = this.worldRect(view, [
          [b.x, 0, b.z], [b.x + b.l, 0, b.z], [b.x + b.l, 0, b.z + b.h], [b.x, 0, b.z + b.h],
        ]);
        if ((b.l * s) > 40) this.label(b.name, (fp[0][0] + fp[2][0]) / 2, (fp[0][1] + fp[2][1]) / 2, { size: 11, bold: b.id === state.selectedBoxId });
        this.picks.push({ boxId: b.id, polygon: fp });
      }
    }

    // Beschriftung + Maße
    const frontLeft = wall === "right";
    this.label("FRONT", frontLeft ? x0 - 35 : x1 + 35, (o[1] + e[1]) / 2, { bold: true, color: "#999", size: 11 });
    this.label("HECK", frontLeft ? x1 + 32 : x0 - 32, (o[1] + e[1]) / 2, { bold: true, color: "#999", size: 11 });
    this.label(wall === "right" ? "Rechte Wand (Beifahrerseite) — nur anliegende Möbel"
                                 : "Linke Wand (Fahrerseite) — nur anliegende Möbel",
      (x0 + x1) / 2, o[1] - 30, { color: "#888", size: 12, bold: true });
    this.dimLine([x0, e[1]], [x1, e[1]], `${L} mm`, 38);
    this.dimLine([frontLeft ? x0 : x1, e[1]], [frontLeft ? x0 : x1, o[1]], `${H} mm`, frontLeft ? 38 : -38);
  }

  // ===========================================================================
  // Heckansicht: Blick von hinten in den Laderaum, Hecktüren offen
  // ===========================================================================
  renderRear(state, variant, wire, collisions) {
    const view = VIEWS.rear;
    const { length: L, width: W, height: H } = variant.cargo;
    const ctx = this.ctx;
    const s = this.transform.scale;
    // Eckpunkte der Heck-Öffnung (x=L): (y=0,z=0) und (y=W,z=H)
    const c00 = this.toPx(this.project(view, L, 0, 0));
    const cWH = this.toPx(this.project(view, L, W, H));
    const px0 = Math.min(c00[0], cWH[0]), px1 = Math.max(c00[0], cWH[0]);
    const py0 = Math.min(c00[1], cWH[1]), py1 = Math.max(c00[1], cWH[1]);

    // Offene Hecktüren als Flügel neben/über der ECHTEN Türöffnung andeuten.
    this.drawRearDoorsOpen(state, variant, wire);

    // Heck-Öffnung (Innenraum sichtbar)
    this.poly(this.rectPx(px0, py0, px1, py1), wire ? null : COLORS.floorFill, COLORS.hullLine, 2.5);
    if (!wire) this.drawGrid([px0, py0], [px1, py1], s);

    // Radkästen als KOMPLETT RECHTECKIGER Querschnitt links und rechts: von der
    // Außenwand bis zur Innenkante, senkrecht über die volle Höhe. Kräftig
    // eingefärbt.
    const aw = archSideWidth(variant);
    const aH = variant.wheelArch.height;
    for (const side of ["left", "right"]) {
      const yOuter = side === "left" ? 0 : W;
      const yInner = side === "left" ? aw : W - aw;
      const rect = this.worldRect(view, [
        [L, yOuter, 0], [L, yInner, 0], [L, yInner, aH], [L, yOuter, aH],
      ]);
      this.poly(rect, wire ? null : shade(COLORS.arch, -0.12), COLORS.archLine, 2);
      const dir = side === "left" ? 1 : -1;
      const lbl = this.toPx(this.project(view, L, yOuter + dir * aw * 0.5, aH * 0.5));
      this.label("Radkasten", lbl[0], lbl[1], { size: 9, color: "#5b554a" });
    }

    // Fenster der Seitenwände: am Heck als kurze Höhenmarkierung an der
    // jeweiligen Seitenkante (das Fenster selbst liegt weiter vorn in der Wand).
    for (const w of allWindows(state, variant)) {
      if (w.side !== "left" && w.side !== "right") continue;
      const y = w.side === "left" ? 0 : W;
      const a = this.toPx(this.project(view, L, y, w.zBottom));
      const b = this.toPx(this.project(view, L, y, w.zBottom + w.height));
      ctx.strokeStyle = w.custom ? COLORS.windowCustom : COLORS.window; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // Boxen: hinten (großes x, nah am Heck) zuletzt zeichnen. y-z-Grundriss.
    const subtractors = effectiveSubtractors(state, variant);
    const units = buildBoxUnits(state, subtractors)
      .map((u) => ({ u, cx: (u.aabb.x0 + u.aabb.x1) / 2 }))
      .sort((a, b) => a.cx - b.cx); // kleines x (vorn) zuerst → großes x (Heck) oben
    for (const { u } of units) {
      const sel = u.boxIds.some((id) => id === state.selectedBoxId);
      const col = u.boxIds.some((id) => collisions.has(id));
      const stroke = this.boxStroke({ color: u.color }, sel, col, wire);
      const lw = sel || col ? 2.5 : 1.5;
      if (u.subtract) {
        for (const b of u.boxes) {
          const fp = this.worldRect(view, [
            [L, b.y, b.z], [L, b.y + b.w, b.z], [L, b.y + b.w, b.z + b.h], [L, b.y, b.z + b.h],
          ]);
          this.poly(fp, null, stroke, sel ? 2.5 : 1.5, [6, 4]);
        }
      } else {
        // y-z-Grundriss der Teile (Projektion entlang x)
        const toRect = (pt) => [
          [L, pt.y0, pt.z0], [L, pt.y1, pt.z0], [L, pt.y1, pt.z1], [L, pt.y0, pt.z1],
        ];
        const rects = u.parts.map(toRect);
        const fills = u.colored.map((c) => ({ color: c.color, rects: c.parts.map(toRect) }));
        const outlineRects = u.boxes.map((b) => toRect({ y0: b.y, z0: b.z, y1: b.y + b.w, z1: b.z + b.h }));
        ctx.globalAlpha = unitAlpha(state, u);
        this.drawUnit2D(view, rects, { fills: wire ? null : fills, stroke, lineWidth: lw, wire, outlineRects });
        ctx.globalAlpha = 1;
      }
      for (const b of u.boxes) {
        const fp = this.worldRect(view, [
          [L, b.y, b.z], [L, b.y + b.w, b.z], [L, b.y + b.w, b.z + b.h], [L, b.y, b.z + b.h],
        ]);
        if ((b.w * s) > 40) this.label(b.name, (fp[0][0] + fp[2][0]) / 2, (fp[0][1] + fp[2][1]) / 2, { size: 11, bold: b.id === state.selectedBoxId });
        this.picks.push({ boxId: b.id, polygon: fp });
      }
    }

    // Beschriftung + Maße. right=[0,-1,0] ⇒ y=0 (Fahrerseite) rechts, y=W links.
    this.label("Heckansicht (Türen offen)", (px0 + px1) / 2, py0 - 30, { color: "#888", size: 12, bold: true });
    this.label("Fahrerseite", px1 + 8, (py0 + py1) / 2, { color: "#999", size: 10, align: "left" });
    this.label("Beifahrerseite", px0 - 8, (py0 + py1) / 2, { color: "#999", size: 10, align: "right" });
    this.dimLine([px0, py1], [px1, py1], `${W} mm`, 38);
    this.dimLine([px1, py1], [px1, py0], `${H} mm`, -38);
  }

  // Offene Hecktüren/Heckklappe als Flügel um die ECHTE Türöffnung herum
  // andeuten. Die Türmaße (x = Abstand von linker Wand, width, height, zBottom)
  // werden respektiert — die Tür ist i.d.R. schmaler als die volle Innenbreite.
  drawRearDoorsOpen(state, variant, wire) {
    const view = VIEWS.rear;
    const { length: L, height: H } = variant.cargo;
    const fill = wire ? null : COLORS.doorFill;
    const rears = allDoors(state, variant).filter((d) => d.side === "rear");
    for (const d of rears) {
      const selected = d.id && d.id === state.selectedDoorId;
      const st = selected ? COLORS.select : COLORS.door;
      const lwd = selected ? 3 : 2;
      const z0 = d.zBottom || 0;
      const z1 = z0 + d.height;
      const yA = d.x, yB = d.x + d.width;   // tatsächliche Türbreite in y
      // Pixel der vier Eckpunkte der ECHTEN Türöffnung (x=L)
      const P = (y, z) => this.toPx(this.project(view, L, y, z));
      // Öffnungsrechteck (gestrichelt) markieren, wo die Tür tatsächlich sitzt
      const op = [P(yA, z0), P(yB, z0), P(yB, z1), P(yA, z1)];
      this.poly(op, null, shade(st, 0.1), 1, [3, 3]);
      // Bildschirm-Spanne der Tür für die Flügelgröße
      const sxA = P(yA, (z0 + z1) / 2)[0], sxB = P(yB, (z0 + z1) / 2)[0];
      const oy0 = Math.min(P(yA, z0)[1], P(yA, z1)[1]);
      const oy1 = Math.max(P(yA, z0)[1], P(yA, z1)[1]);
      const xL = Math.min(sxA, sxB), xR = Math.max(sxA, sxB);
      if (d.type === "tailgate") {
        // Heckklappe schwingt nach oben: ein Flügel in Türbreite über der Öffnung.
        const flapH = Math.min((oy1 - oy0) * 0.55, 120);
        const p = this.rectPx(xL, oy0 - 8 - flapH, xR, oy0 - 8);
        this.poly(p, fill, st, lwd, [7, 4]);
        this.label("Heckklappe ↑", (xL + xR) / 2, oy0 - 8 - flapH / 2, { size: 10, color: st });
      } else {
        // Hecktüren: zwei Flügel je halbe Türbreite, seitlich aufgeschwungen.
        const flapW = Math.min((xR - xL) * 0.46, 130);
        const pl = this.rectPx(xL - 8 - flapW, oy0, xL - 8, oy1);
        const pr = this.rectPx(xR + 8, oy0, xR + 8 + flapW, oy1);
        this.poly(pl, fill, st, lwd, [7, 4]);
        this.poly(pr, fill, st, lwd, [7, 4]);
        this.label("Tür", xL - 8 - flapW / 2, (oy0 + oy1) / 2, { size: 10, color: st });
        this.label("Tür", xR + 8 + flapW / 2, (oy0 + oy1) / 2, { size: 10, color: st });
      }
    }
  }

  // ===========================================================================
  // Isometrische Ansicht
  // ===========================================================================
  renderIso(state, variant, wire, collisions) {
    const view = resolveView(state);
    const { length: L, width: W, height: H } = variant.cargo;

    this.drawIsoHull(view, state, variant, wire);

    const subtractors = effectiveSubtractors(state, variant);
    // Boxen zu "Einheiten" zusammenfassen: gruppierte Boxen GLEICHER FARBE
    // bilden einen Körper ohne interne Trennlinien. Subtraktions-Boxen und
    // ungruppierte/andersfarbige Boxen sind je eine eigene Einheit.
    const units = buildBoxUnits(state, subtractors);

    // Radkästen + Box-Einheiten gemeinsam tiefensortiert (fern zuerst)
    const solids = [];
    for (const a of wheelArchBoxes(variant)) solids.push({ kind: "arch", aabb: a });
    for (const u of units) solids.push({ kind: "unit", unit: u, aabb: u.aabb });
    if (state.bench && state.bench.on) {
      solids.push({ kind: "bench", aabb: benchSolids(state.bench, variant).aabb });
    }
    sortSolidsByDepth(solids, view, (s) => s.aabb);

    for (const s of solids) {
      if (s.kind === "arch") {
        this.drawArchIso(view, variant, s.aabb.side, wire);
        continue;
      }
      if (s.kind === "bench") {
        this.drawBench(state, variant, wire);
        continue;
      }
      const u = s.unit;
      const sel = u.boxIds.some((id) => id === state.selectedBoxId);
      const col = u.boxIds.some((id) => collisions.has(id));
      const stroke = this.boxStroke({ color: u.color }, sel, col, wire);
      const lineWidth = sel || col ? 2.5 : 1.2;
      if (u.subtract) {
        // Subtraktions-Einheit: nur gestrichelte Hülle je Box
        for (const b of u.boxes) {
          this.ctx.globalAlpha = unitAlpha(state, u);
          this.drawCuboid(view, boxToAabb(b), { fill: null, stroke, lineWidth, wire: true });
        }
        this.ctx.globalAlpha = 1;
      } else {
        this.ctx.globalAlpha = unitAlpha(state, u);
        // Kontur über die UNGESCHNITTENEN Boxen → keine Drahtlinien an Hohlräumen
        const outlineParts = u.boxes.map(boxToAabb);
        this.drawIsoUnit(view, u.parts, { colored: u.colored, fill: u.color, stroke, lineWidth, wire, outlineParts });
        this.ctx.globalAlpha = 1;
      }
      // Picking-Polygone je Box (volle Bounding-Box, Flächen vorn)
      for (const b of u.boxes) {
        for (const poly of this.drawCuboid(view, boxToAabb(b), { fill: null, stroke: null, wire: true, pickOnly: true })) {
          this.picks.push({ boxId: b.id, polygon: poly });
        }
      }
      if (sel || col) {
        const a = u.aabb;
        const g = this.worldRect(view, [
          [a.x0, a.y0, 0], [a.x1, a.y0, 0], [a.x1, a.y1, 0], [a.x0, a.y1, 0],
        ]);
        this.poly(g, null, col ? COLORS.collide : COLORS.select, 1, [4, 4]);
      }
    }

    const t = state.view === "orbit" ? "3D — frei drehbar (linke Maustaste ziehen)"
            : state.view === "iso-rear" ? "Isometrie — Blick von hinten"
            : "Isometrie — Blick von vorne";
    this.label(t, this.cssW / 2, 24, { color: "#888", size: 13, bold: true });
  }

  // Radkasten-Grundriss (Draufsicht) mit abgerundeten inneren Ecken — die zur
  // Fahrzeugmitte zeigende Längskante wird an beiden Enden verrundet.
  drawArchTop(view, a, wire) {
    const ctx = this.ctx;
    const inner = a.side === "left" ? a.y1 : a.y0; // y der zur Mitte zeigenden Kante
    const outer = a.side === "left" ? a.y0 : a.y1;
    const r = Math.min((a.x1 - a.x0) * 0.18, Math.abs(inner - outer) * 0.6);
    // Eckpunkte in 3D → Pixel
    const P = (x, y) => this.toPx(this.project(view, x, y, 0));
    const o_f = P(a.x0, outer), o_b = P(a.x1, outer);   // Außenkante vorn/hinten
    const i_f = P(a.x0, inner), i_b = P(a.x1, inner);    // Innenkante vorn/hinten
    // Verrundungspunkte entlang x und y an der Innenkante
    const i_f_x = P(a.x0 + r, inner), i_b_x = P(a.x1 - r, inner);
    const i_f_y = P(a.x0, inner + (a.side === "left" ? -r : r));
    const i_b_y = P(a.x1, inner + (a.side === "left" ? -r : r));
    ctx.beginPath();
    ctx.moveTo(o_f[0], o_f[1]);
    ctx.lineTo(o_b[0], o_b[1]);
    ctx.lineTo(i_b_y[0], i_b_y[1]);
    ctx.quadraticCurveTo(i_b[0], i_b[1], i_b_x[0], i_b_x[1]);
    ctx.lineTo(i_f_x[0], i_f_x[1]);
    ctx.quadraticCurveTo(i_f[0], i_f[1], i_f_y[0], i_f_y[1]);
    ctx.closePath();
    if (!wire) { ctx.fillStyle = COLORS.arch; ctx.fill(); }
    ctx.strokeStyle = COLORS.archLine; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // Radkasten in Iso als geschlossener Volumenkörper (Halbtonne) mit gerundeten
  // Enden, wie am echten Radkasten: das y–z-Profil (archDomeProfile) wird entlang
  // x verfahren, an Vorder- und Hinterende auf 0 Höhe heruntergezogen (gerundete
  // Kappen). Die Unterseite (z=0) schließt den Körper nach unten. Backface-
  // Culling: nur Flächen mit dot(n, dir) < 0 sind dem Betrachter zugewandt.
  drawArchIso(view, variant, side, wire) {
    const wa = variant.wheelArch;
    const x0 = wa.x, x1 = wa.x + wa.length;
    const baseProf = archDomeProfile(variant, side); // [[y,z], ...]
    const W = variant.cargo.width;
    const cy = side === "left" ? 0 : W, cz = 0;

    // Querschnitte entlang x: der y–z-Querschnitt wird verfahren, die Höhe folgt
    // dem gemeinsamen Längsprofil (Tonnenform mit gerundeten Enden), das auch die
    // Wandansicht nutzt — so stimmen Iso und Seitenansicht exakt überein.
    const xs = archLengthProfile(variant);
    const sections = xs.map(({ x, hz }) => baseProf.map(([y, z]) => [x, y, z * hz]));
    const n = baseProf.length;

    const faces = [];
    // vordere Endkappe (Profil bei kleinstem x), Normale -x
    faces.push({ pts: sections[0].slice(), n: [-1, 0, 0] });
    // hintere Endkappe (Profil bei größtem x), Normale +x
    faces.push({ pts: sections[sections.length - 1].slice().reverse(), n: [1, 0, 0] });
    // Unterseite (z=0): Rechteck Außenkante↔Innenkante über die volle Länge.
    const yO = baseProf[0][1], yI = baseProf[n - 1][1];
    faces.push({ pts: [[x0, yO, 0], [x0, yI, 0], [x1, yI, 0], [x1, yO, 0]], n: [0, 0, -1] });
    // Mantel: zwischen aufeinanderfolgenden Querschnitten je ein Facettenring.
    for (let s = 0; s < sections.length - 1; s++) {
      const A = sections[s], B = sections[s + 1];
      for (let i = 0; i < n - 1; i++) {
        const pa = A[i], pb = A[i + 1], qb = B[i + 1], qa = B[i];
        // Außennormale als gemittelte Flächennormale, nach außen orientiert.
        const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
        const vx = qa[0] - pa[0], vy = qa[1] - pa[1], vz = qa[2] - pa[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
        const mx = (pa[0] + qb[0]) / 2, my = (pa[1] + qb[1]) / 2, mz = (pa[2] + qb[2]) / 2;
        if ((mx - (x0 + x1) / 2) * nx + (my - cy) * ny + (mz - cz) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        faces.push({ pts: [pa, pb, qb, qa], n: [nx, ny, nz] });
      }
    }

    // Sichtbare (zugewandte) Flächen
    const front = faces.filter((f) => vdot(f.n, view.dir) < -0.001);

    if (wire) {
      // Im Drahtmodus nur die ECHTE Außensilhouette zeichnen (geteilte
      // Facettenkanten zwischen benachbarten Mantelflächen entfallen), sonst
      // erscheint die Kuppel als gestreifter flacher Streifen.
      const ctx = this.ctx;
      const edges = new Map();
      const r = (v) => Math.round(v * 1000) / 1000;
      const key = (p, q) => {
        const a = p.map(r).join(","), b = q.map(r).join(",");
        return a < b ? a + "|" + b : b + "|" + a;
      };
      for (const f of front) {
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i], q = f.pts[(i + 1) % f.pts.length];
          const k = key(p, q);
          const e = edges.get(k);
          if (e) e.count++; else edges.set(k, { p, q, count: 1 });
        }
      }
      ctx.strokeStyle = COLORS.archLine; ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath();
      for (const { p, q, count } of edges.values()) {
        if (count > 1) continue;
        const a = this.toPx(this.project(view, ...p));
        const b = this.toPx(this.project(view, ...q));
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
      return;
    }

    // Solide: Facetten fern→nah füllen (ohne Konturstrich, sonst Streifen),
    // danach die echte Außensilhouette als eine Kontur darüber.
    const drawList = front
      .map((f) => ({ f, c: avgCamDist(this, view, f.pts) }))
      .sort((a, b) => a.c - b.c);
    for (const { f } of drawList) {
      const lum = f.n[2] > 0.3 ? 0.16 : Math.abs(f.n[1]) > 0.5 ? -0.12 : f.n[0] !== 0 ? -0.05 : 0.05;
      this.poly(this.worldRect(view, f.pts), shade(COLORS.arch, lum), null);
    }
    // Silhouette (geteilte Facettenkanten weglassen)
    {
      const ctx = this.ctx;
      const edges = new Map();
      const r = (v) => Math.round(v * 1000) / 1000;
      const key = (p, q) => {
        const a = p.map(r).join(","), b = q.map(r).join(",");
        return a < b ? a + "|" + b : b + "|" + a;
      };
      for (const f of front) {
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i], q = f.pts[(i + 1) % f.pts.length];
          const k = key(p, q);
          const e = edges.get(k);
          if (e) e.count++; else edges.set(k, { p, q, count: 1 });
        }
      }
      ctx.strokeStyle = COLORS.archLine; ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath();
      for (const { p, q, count } of edges.values()) {
        if (count > 1) continue;
        const a = this.toPx(this.project(view, ...p));
        const b = this.toPx(this.project(view, ...q));
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
  }

  // Bauraumhülle als "offene Kiste": nur vom Betrachter abgewandte Flächen
  // (deren Innenseite man sieht), danach Türen/Fenster auf diesen Flächen.
  drawIsoHull(view, state, variant, wire) {
    const { length: L, width: W, height: H } = variant.cargo;
    const faces = [
      { n: [0, 0, -1], pts: [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]], kind: "floor" },
      { n: [0, 0, 1], pts: [[0, 0, H], [L, 0, H], [L, W, H], [0, W, H]], kind: "roof" },
      { n: [-1, 0, 0], pts: [[0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H]], kind: "front" },
      { n: [1, 0, 0], pts: [[L, 0, 0], [L, W, 0], [L, W, H], [L, 0, H]], kind: "rear" },
      { n: [0, -1, 0], pts: [[0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H]], kind: "left" },
      { n: [0, 1, 0], pts: [[0, W, 0], [L, W, 0], [L, W, H], [0, W, H]], kind: "right" },
    ];

    if (wire) {
      // Drahtmodus: alle 12 Kanten
      const E = [[0,0,0],[L,0,0],[L,W,0],[0,W,0],[0,0,H],[L,0,H],[L,W,H],[0,W,H]];
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      const ctx = this.ctx;
      ctx.strokeStyle = COLORS.hullLine; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [i, j] of edges) {
        const p = this.toPx(this.project(view, ...E[i]));
        const q = this.toPx(this.project(view, ...E[j]));
        ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      this.drawIsoOpenings(view, state, variant, faces, true);
      return;
    }

    const visible = faces.filter((f) => vdot(f.n, view.dir) > 0.001 && f.kind !== "roof");
    visible.sort((f1, f2) => {
      const c1 = avgCamDist(this, view, f1.pts), c2 = avgCamDist(this, view, f2.pts);
      return c1 - c2;
    });
    for (const f of visible) {
      const p = this.worldRect(view, f.pts);
      this.poly(p, f.kind === "floor" ? COLORS.floorFill : COLORS.hullFill, COLORS.hullLine, 2);
    }
    // Dachkanten zur Orientierung gestrichelt
    const roofPts = [[0, 0, H], [L, 0, H], [L, W, H], [0, W, H]];
    this.poly(this.worldRect(view, roofPts), null, "#b9b3a6", 1, [5, 5]);

    this.drawIsoOpenings(view, state, variant, faces, false);
  }

  drawIsoOpenings(view, state, variant, faces, wire) {
    const { length: L, width: W, height: H } = variant.cargo;
    const drawnKinds = wire
      ? new Set(["left", "right", "rear", "front", "floor"])
      : new Set(faces.filter((f) => vdot(f.n, view.dir) > 0.001 && f.kind !== "roof").map((f) => f.kind));

    const wallRect = (side, x, w, z0, h) => {
      // Rechteck auf einer Wandfläche in 3D
      if (side === "left") return [[x, 0, z0], [x + w, 0, z0], [x + w, 0, z0 + h], [x, 0, z0 + h]];
      if (side === "right") return [[x, W, z0], [x + w, W, z0], [x + w, W, z0 + h], [x, W, z0 + h]];
      // rear: x = Abstand von linker Wand
      return [[L, x, z0], [L, x + w, z0], [L, x + w, z0 + h], [L, x, z0 + h]];
    };

    for (const d of allDoors(state, variant)) {
      if (!drawnKinds.has(d.side)) continue;
      const selected = d.id && d.id === state.selectedDoorId;
      const stroke = selected ? COLORS.select : COLORS.door;
      const z0 = d.zBottom || 0;
      this.poly(this.worldRect(view, wallRect(d.side, d.x, d.width, z0, d.height)),
        wire ? null : COLORS.doorFill, stroke, selected ? 3 : 2, [7, 4]);
    }
    const roofVisible = wire || vdot([0, 0, 1], view.dir) > 0.001; // Dach von oben sichtbar?
    for (const w of allWindows(state, variant)) {
      const stroke = w.custom ? COLORS.windowCustom : COLORS.window;
      if (w.side === "roof") {
        // Dachfenster: Rechteck auf der Dachfläche (z = H)
        const pts = [[w.x, w.y, H], [w.x + w.width, w.y, H], [w.x + w.width, w.y + w.length, H], [w.x, w.y + w.length, H]];
        this.poly(this.worldRect(view, pts), wire ? null : COLORS.roofWindowFill, stroke, 1.5, roofVisible ? null : [4, 3]);
        continue;
      }
      if (!drawnKinds.has(w.side === "rear" ? "rear" : w.side)) continue;
      this.poly(this.worldRect(view, wallRect(w.side, w.x, w.width, w.zBottom, w.height)),
        wire ? null : COLORS.windowFill, stroke, 1.5);
    }
  }


  // Eine "Einheit" aus mehreren AABB-Teilen (z.B. die Subquader EINER
  // ausgehöhlten Box, oder alle gleichfarbigen Boxen einer Gruppe) ohne interne
  // Trennlinien zeichnen: Flächen werden gefüllt (ohne Kontur), anschließend
  // nur die ECHTE Außenkontur gestrichen. Eine Kante, die von zwei zugewandten
  // Flächen der Einheit geteilt wird, ist innen und entfällt.
  drawIsoUnit(view, parts, opts) {
    const ctx = this.ctx;
    // 1) zugewandte Flächen aller Teile sammeln. Jede Fläche trägt ihre
    // Füllfarbe (für gruppierte Körper unterschiedlicher Farbe: opts.colored).
    const faces = [];
    const collect = (aabbs, color) => {
      for (const b of aabbs) {
        for (const f of cuboidFaces(b)) {
          if (vdot(f.n, view.dir) < -0.001) faces.push({ ...f, color });
        }
      }
    };
    if (opts.colored) {
      for (const g of opts.colored) collect(g.parts, g.color);
    } else {
      collect(parts, opts.fill);
    }
    if (faces.length === 0) return;
    // 2) Füllungen fern→nah, ohne Konturstrich (je Fläche in ihrer Boxfarbe).
    //    Die Füllung folgt den AUSGEHÖHLTEN Teilen (der Schnitt bleibt leer).
    //    In der Drahtansicht wird stattdessen deckend in Hintergrundfarbe
    //    gefüllt: zusammen mit der Tiefensortierung verdeckt ein näher
    //    liegender Körper die Kanten der dahinterliegenden, statt dass sie
    //    durchscheinen (Hidden-Line über den Painter-Algorithmus).
    faces
      .map((f) => ({ f, c: avgCamDist(this, view, f.pts) }))
      .sort((a, b) => a.c - b.c)
      .forEach(({ f }) => {
        if (opts.wire) {
          if (opts.occlude !== false) this.poly(this.worldRect(view, f.pts), COLORS.bg, null);
          return;
        }
        const lum = f.n[2] !== 0 ? 0.18 : f.n[1] !== 0 ? 0 : -0.14;
        this.poly(this.worldRect(view, f.pts), shade(f.color, lum), null);
      });
    // 3) Außenkontur: NUR die äußerste Silhouette der UNGESCHNITTENEN Körper.
    //    So entstehen keine Drahtlinien an den herausgeschnittenen Hohlräumen;
    //    geteilte Kanten zwischen verbundenen Körpern entfallen ebenfalls.
    if (opts.stroke) {
      const outlineSrc = opts.outlineParts || parts;
      const ofaces = [];
      for (const b of outlineSrc) {
        for (const f of cuboidFaces(b)) {
          if (vdot(f.n, view.dir) < -0.001) ofaces.push(f);
        }
      }
      const edges = new Map();
      const key = (p, q) => {
        const a = p.join(","), b = q.join(",");
        return a < b ? a + "|" + b : b + "|" + a;
      };
      for (const f of ofaces) {
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i], q = f.pts[(i + 1) % f.pts.length];
          const k = key(p, q);
          const e = edges.get(k);
          if (e) e.count++; else edges.set(k, { p, q, count: 1 });
        }
      }
      ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.lineWidth || 1.2;
      ctx.setLineDash(opts.dash || []);
      ctx.beginPath();
      for (const { p, q, count } of edges.values()) {
        // count > 1 = Kante zwischen zwei zugewandten Flächen. In der
        // Vollansicht weglassen (die Flächenschattierung zeigt die Ecke, und
        // verbundene Körper sollen keine Trennlinie haben). In der
        // Drahtansicht dagegen zeichnen — ohne sie wirkt ein Quader wie ein
        // flaches Sechseck, weil die drei Kanten der Nahecke fehlen.
        if (count > 1 && !opts.wire) continue;
        const a = this.toPx(this.project(view, ...p));
        const c = this.toPx(this.project(view, ...q));
        ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 2D-Pendant zu drawIsoUnit (Drauf-/Wandansicht): mehrere achsparallele
  // Rechtecke (in Weltkoordinaten, je 4 Eckpunkte) als EIN Körper ohne interne
  // Trennlinien zeichnen. Füllung pro Rechteck, danach nur die Außenkontur —
  // Kanten, die von zwei Rechtecken geteilt werden, entfallen.
  // rects: alle Teil-Rechtecke der Einheit (für die GEMEINSAME Außenkontur).
  // opts.fill: einheitliche Füllfarbe ODER opts.fills: [{color, rects}] für
  // farbige Füllung je (Teil-)Gruppe. Die Kontur entsteht immer über alle rects,
  // sodass verbundene Körper nur ihre äußere Hülle zeigen (keine Trennlinie).
  drawUnit2D(view, rects, opts) {
    const ctx = this.ctx;
    if (!opts.wire) {
      if (opts.fills) {
        for (const g of opts.fills)
          for (const rc of g.rects) this.poly(this.worldRect(view, rc), g.color, null);
      } else if (opts.fill) {
        for (const rc of rects) this.poly(this.worldRect(view, rc), opts.fill, null);
      }
    } else if (opts.occlude !== false) {
      // Drahtansicht: deckend in Hintergrundfarbe füllen, damit die Kanten
      // dahinterliegender Boxen nicht durchscheinen (siehe drawIsoUnit).
      for (const rc of rects) this.poly(this.worldRect(view, rc), COLORS.bg, null);
    }
    if (!opts.stroke) return;
    const edges = new Map();
    const key = (p, q) => {
      const a = p.join(","), b = q.join(",");
      return a < b ? a + "|" + b : b + "|" + a;
    };
    const r = (v) => Math.round(v * 1000) / 1000;
    // Kontur über die UNGESCHNITTENEN Rechtecke (sofern angegeben), damit an
    // herausgeschnittenen Hohlräumen keine Linien gezeichnet werden — nur die
    // äußere Hülle der Körper. In der Wandansicht können mehrere Teile auf
    // dasselbe projizierte Rechteck fallen → erst entdoppeln.
    const outline = opts.outlineRects || rects;
    const seenRect = new Set();
    const uniqRects = [];
    for (const rc of outline) {
      const c = rc.map((p) => [r(p[0]), r(p[1]), r(p[2])]);
      const rk = c.map((p) => p.join(",")).join(";");
      if (seenRect.has(rk)) continue;
      seenRect.add(rk);
      uniqRects.push(c);
    }
    for (const c of uniqRects) {
      for (let i = 0; i < 4; i++) {
        const p = c[i], q = c[(i + 1) % 4], k = key(p, q);
        const e = edges.get(k);
        if (e) e.count++; else edges.set(k, { p, q, count: 1 });
      }
    }
    ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.lineWidth || 1.5;
    ctx.setLineDash(opts.dash || []);
    ctx.beginPath();
    for (const { p, q, count } of edges.values()) {
      if (count > 1) continue;
      const a = this.toPx(this.project(view, ...p));
      const b = this.toPx(this.project(view, ...q));
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Quader zeichnen; gibt die gezeichneten Pixel-Polygone zurück (für Picking)
  drawCuboid(view, b, opts) {
    const faces = [
      { n: [0, 0, -1], pts: [[b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x0, b.y1, b.z0]] },
      { n: [0, 0, 1], pts: [[b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]] },
      { n: [-1, 0, 0], pts: [[b.x0, b.y0, b.z0], [b.x0, b.y1, b.z0], [b.x0, b.y1, b.z1], [b.x0, b.y0, b.z1]] },
      { n: [1, 0, 0], pts: [[b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x1, b.y0, b.z1]] },
      { n: [0, -1, 0], pts: [[b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y0, b.z1], [b.x0, b.y0, b.z1]] },
      { n: [0, 1, 0], pts: [[b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]] },
    ];
    const out = [];
    if (opts.pickOnly) {
      // Nichts zeichnen, nur Picking-Polygone der vorderen Flächen liefern
      for (const f of faces) {
        if (vdot(f.n, view.dir) < -0.001) out.push(this.worldRect(view, f.pts));
      }
      return out;
    }
    if (opts.wire) {
      const E = [
        [b.x0,b.y0,b.z0],[b.x1,b.y0,b.z0],[b.x1,b.y1,b.z0],[b.x0,b.y1,b.z0],
        [b.x0,b.y0,b.z1],[b.x1,b.y0,b.z1],[b.x1,b.y1,b.z1],[b.x0,b.y1,b.z1],
      ];
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      const ctx = this.ctx;
      if (opts.stroke) {
        ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.lineWidth || 1.2;
        ctx.beginPath();
        for (const [i, j] of edges) {
          const p = this.toPx(this.project(view, ...E[i]));
          const q = this.toPx(this.project(view, ...E[j]));
          ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
        }
        ctx.stroke();
      }
      // Picking über die Silhouette der sichtbaren Flächen
      for (const f of faces) {
        if (vdot(f.n, view.dir) < -0.001) out.push(this.worldRect(view, f.pts));
      }
      return out;
    }
    for (const f of faces) {
      if (vdot(f.n, view.dir) >= -0.001) continue; // Rückseiten weg
      const p = this.worldRect(view, f.pts);
      // einfache Flächenschattierung nach Orientierung
      const lum = f.n[2] !== 0 ? 0.18 : f.n[1] !== 0 ? 0 : -0.14;
      this.poly(p, shade(opts.fill, lum), opts.stroke, opts.lineWidth || 1.2);
      out.push(p);
    }
    return out;
  }
}

function avgCamDist(renderer, view, pts) {
  let s = 0;
  for (const p of pts) s += renderer.project(view, p[0], p[1], p[2]).camDist;
  return s / pts.length;
}

// Korrekte Painter-Reihenfolge für achsparallele Quader (AABBs) in einer
// orthographischen Ansicht. Reine Mittelpunkt-camDist-Sortierung versagt, wenn
// sich Boxen unterschiedlicher Größe überlappen/verschachteln; hier wird für
// jedes Paar geprüft, welcher Körper VOR dem anderen liegt, und das Ergebnis
// per topologischer Sortierung in eine fern→nah-Reihenfolge gebracht.
//
// getA(item) -> AABB {x0,y0,z0,x1,y1,z1}. Sortiert `items` in-place.
function sortSolidsByDepth(items, view, getA) {
  const n = items.length;
  if (n < 2) return items;
  const A = items.map(getA);
  // Pro Welt-Achse: zeigt die Kamera in −Richtung (dir[k] < 0), sind größere
  // Koordinaten näher; sonst kleinere. sep[k] = +1 wenn "größer = näher".
  const near = [view.dir[0] < 0 ? 1 : -1, view.dir[1] < 0 ? 1 : -1, view.dir[2] < 0 ? 1 : -1];
  const lo = ["x0", "y0", "z0"], hi = ["x1", "y1", "z1"];

  // inFront(i, j): liegt i vor j (näher an der Kamera)?
  // Für AABBs: überlappen sie sich in zwei Achsen, entscheidet die dritte.
  // Allgemein: i ist vor j, wenn in allen separierenden Achsen i näher liegt.
  const inFront = (i, j) => {
    const a = A[i], b = A[j];
    // Achsen, in denen die Projektionen sich NICHT überlappen, trennen die
    // Reihenfolge. Wir prüfen für jede Achse, ob a eindeutig näher/ferner ist.
    let score = 0;
    for (let k = 0; k < 3; k++) {
      const aLo = a[lo[k]], aHi = a[hi[k]], bLo = b[lo[k]], bHi = b[hi[k]];
      if (aHi <= bLo) {
        // a liegt vollständig auf der kleineren Seite von b in Achse k
        score += near[k] < 0 ? 1 : -1; // kleiner=näher ⇒ a vorne
      } else if (bHi <= aLo) {
        score += near[k] > 0 ? 1 : -1;
      }
    }
    return score > 0;
  };

  // Kanten i->j bedeuten "i muss VOR j gezeichnet werden" (i ist ferner).
  // i ferner als j  ⇔  j inFront i.
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!aabbOverlap2D(A[i], A[j], view)) continue; // nur überlappende Paare ordnen
      if (inFront(i, j)) { adj[j].push(i); indeg[i]++; }      // j fern → j vor i
      else if (inFront(j, i)) { adj[i].push(j); indeg[j]++; } // i fern → i vor j
    }
  }
  // Topologische Sortierung (Kahn); bei Zyklen Fallback auf Mittelpunkt-camDist.
  const midDist = A.map((a) => {
    const mx = (a.x0 + a.x1) / 2, my = (a.y0 + a.y1) / 2, mz = (a.z0 + a.z1) / 2;
    return -(mx * view.dir[0] + my * view.dir[1] + mz * view.dir[2]);
  });
  const order = [];
  const ready = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
  const indegLeft = indeg.slice();
  const used = new Array(n).fill(false);
  while (order.length < n) {
    if (ready.length === 0) {
      // Zyklus: nimm den fernsten noch nicht platzierten Knoten
      let best = -1;
      for (let i = 0; i < n; i++) if (!used[i] && (best < 0 || midDist[i] < midDist[best])) best = i;
      ready.push(best);
    }
    // unter den bereit-Knoten den fernsten zuerst (stabilere Optik)
    ready.sort((p, q) => midDist[p] - midDist[q]);
    const i = ready.shift();
    if (used[i]) continue;
    used[i] = true;
    order.push(i);
    for (const j of adj[i]) {
      if (--indegLeft[j] === 0 && !used[j]) ready.push(j);
    }
  }
  const sorted = order.map((i) => items[i]);
  items.length = 0;
  for (const s of sorted) items.push(s);
  return items;
}

// Überlappen sich zwei AABBs in ihrer 2D-Projektion (Bildschirm)? Konservativ
// über die projizierten Bounding-Boxen der 8 Ecken.
function aabbOverlap2D(a, b, view) {
  const ba = projBounds(a, view), bb = projBounds(b, view);
  return ba.minx < bb.maxx && bb.minx < ba.maxx && ba.miny < bb.maxy && bb.miny < ba.maxy;
}

function projBounds(a, view) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const x of [a.x0, a.x1]) for (const y of [a.y0, a.y1]) for (const z of [a.z0, a.z1]) {
    const sx = x * view.right[0] + y * view.right[1] + z * view.right[2];
    const sy = -(x * view.up[0] + y * view.up[1] + z * view.up[2]);
    if (sx < minx) minx = sx; if (sx > maxx) maxx = sx;
    if (sy < miny) miny = sy; if (sy > maxy) maxy = sy;
  }
  return { minx, maxx, miny, maxy };
}

// Die sechs Flächen eines AABB als {n:[..], pts:[[x,y,z]×4]} mit Außennormalen.
// Eckkoordinaten werden auf 1e-3 gerundet, damit geteilte Kanten zwischen
// benachbarten Teilen exakt denselben Schlüssel ergeben (Kantenauslöschung).
function cuboidFaces(b) {
  const r = (v) => Math.round(v * 1000) / 1000;
  const x0 = r(b.x0), y0 = r(b.y0), z0 = r(b.z0), x1 = r(b.x1), y1 = r(b.y1), z1 = r(b.z1);
  return [
    { n: [0, 0, -1], pts: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]] },
    { n: [0, 0, 1], pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [-1, 0, 0], pts: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] },
    { n: [1, 0, 0], pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { n: [0, -1, 0], pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { n: [0, 1, 0], pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
  ];
}

// AABB als {x0,y0,z0,x1,y1,z1}
function boxToAabb(b) {
  return { x0: b.x, y0: b.y, z0: b.z, x1: b.x + b.l, y1: b.y + b.w, z1: b.z + b.h };
}

function aabbOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1;
}

// Gehört ein Objekt (Box oder Sitzbank) zu mindestens EINEM aktiven Filter?
// Ohne aktiven Filter gilt alles als sichtbar.
function matchesFilter(state, b) {
  const act = state.activeFilterIds;
  if (!act || act.length === 0) return true;
  const tags = b.tags;
  if (!tags || tags.length === 0) return false;
  return act.some((id) => tags.indexOf(id) >= 0);
}

function filterActive(state) {
  return !!state.activeFilterIds && state.activeFilterIds.length > 0;
}

// Deckkraft einer Box-Einheit. Bei aktivem Filter treten nicht zugeordnete
// Möbel stark zurück, sodass nur die der Filter lesbar bleiben.
function unitAlpha(state, u) {
  const base = u.opacity != null ? u.opacity : 1;
  if (!filterActive(state)) return base;
  return u.boxes.some((b) => matchesFilter(state, b)) ? base : Math.min(base, 0.12);
}

// Ausdehnung der Auszugsfläche quer zur Auszugsrichtung: bei front/rear ist
// das die Boxbreite (y), bei left/right die Boxlänge (x).
function pulloutSpanU(side, b) {
  return (side === "left" || side === "right") ? b.l : b.w;
}

// Ausgefahrenes Volumen eines Auszugs als AABB (oder null, wenn keiner aktiv).
// side: "front" = −x (Trennwand), "rear" = +x (Heck), "left" = −y, "right" = +y.
// p.depth = Auszugsweg, p.w/p.h = Breite quer bzw. Höhe (0 = wie die Box),
// p.u/p.v = Lage auf der Fläche ab deren unterer/linker Kante. u/v werden hier
// geklemmt, damit der Auszug die Fläche nie verlässt.
function pulloutAabb(b) {
  const p = b.pullout;
  if (!p || !p.on || !(p.depth > 0)) return null;
  const d = p.depth;
  const spanU = pulloutSpanU(p.side, b);
  const uSize = p.w > 0 ? Math.min(p.w, spanU) : spanU;
  const u0 = p.w > 0 ? Math.max(0, Math.min(p.u || 0, spanU - uSize)) : 0;
  const vSize = p.h > 0 ? Math.min(p.h, b.h) : b.h;
  const v0 = p.h > 0 ? Math.max(0, Math.min(p.v || 0, b.h - vSize)) : 0;
  const z0 = b.z + v0, z1 = z0 + vSize;
  if (p.side === "left" || p.side === "right") {
    // quer = entlang x, u ab der vorderen Boxkante
    const ax0 = b.x + u0, ax1 = ax0 + uSize;
    const y0 = b.y, y1 = b.y + b.w;
    return p.side === "left"
      ? { x0: ax0, x1: ax1, y0: y0 - d, y1: y0, z0, z1 }
      : { x0: ax0, x1: ax1, y0: y1, y1: y1 + d, z0, z1 };
  }
  // quer = entlang y, u ab der Fahrerseiten-Kante der Box
  const ay0 = b.y + u0, ay1 = ay0 + uSize;
  const x0 = b.x, x1 = b.x + b.l;
  return p.side === "front"
    ? { x0: x0 - d, x1: x0, y0: ay0, y1: ay1, z0, z1 }
    : { x0: x1, x1: x1 + d, y0: ay0, y1: ay1, z0, z1 };
}

// Die aktuell bemaßten Körper. Das ist entweder die Box-Auswahl ODER — wenn die
// Sitzbank ausgewählt ist — die Bank selbst, als Pseudo-Box mit denselben
// Feldern (x/y/z + l/w/h), sodass die Maßketten unverändert darauf laufen.
// Für die Bank zählt nur der Korpus, nicht die längeren Bodenschienen.
function selectedBoxes(state, variant) {
  if (state.benchSelected && state.bench && state.bench.on && variant) {
    const a = benchSolids(state.bench, variant).bodyAabb;
    return [{
      id: BENCH_DIM_ID, name: SL3.label,
      x: a.x0, y: a.y0, z: a.z0,
      l: a.x1 - a.x0, w: a.y1 - a.y0, h: a.z1 - a.z0,
    }];
  }
  const ids = state.selectedBoxIds && state.selectedBoxIds.length
    ? state.selectedBoxIds
    : (state.selectedBoxId ? [state.selectedBoxId] : []);
  return state.boxes.filter((b) => !b.hidden && ids.includes(b.id));
}

// Pseudo-ID der Bank in den Maßketten — kollidiert nicht mit echten Box-IDs
// ("b" + Zufall), sodass die Nachbarsuche die Bank nie mit sich selbst vergleicht.
const BENCH_DIM_ID = "__bench";

// Überlappen sich zwei Boxen in den beiden Achsen AUSSER der angegebenen?
// axisLo ist "x"|"y"|"z"; box-Felder sind x/y/z (lo) und l/w/h (size).
function overlapsOtherAxes(a, b, axisLo) {
  const axes = [["x", "l"], ["y", "w"], ["z", "h"]];
  for (const [lo, sz] of axes) {
    if (lo === axisLo) continue;
    const aLo = a[lo], aHi = a[lo] + a[sz], bLo = b[lo], bHi = b[lo] + b[sz];
    if (aHi <= bLo || bHi <= aLo) return false; // keine Überlappung auf dieser Achse
  }
  return true;
}

// Boolesche Differenz A − B für achsparallele Quader.
// Ergebnis ist eine Menge disjunkter Subquader, die A ohne den Schnitt mit B
// abdecken (klassische 6-Scheiben-Zerlegung). Liefert [A] zurück, wenn sich B
// und A nicht überschneiden.
function subtractAabb(a, b) {
  if (!aabbOverlap(a, b)) return [a];
  // Schnittbereich auf A geklemmt
  const cx0 = Math.max(a.x0, b.x0), cx1 = Math.min(a.x1, b.x1);
  const cy0 = Math.max(a.y0, b.y0), cy1 = Math.min(a.y1, b.y1);
  const cz0 = Math.max(a.z0, b.z0), cz1 = Math.min(a.z1, b.z1);
  const out = [];
  const push = (x0, y0, z0, x1, y1, z1) => {
    if (x1 - x0 > 0.5 && y1 - y0 > 0.5 && z1 - z0 > 0.5) out.push({ x0, y0, z0, x1, y1, z1 });
  };
  // unten / oben (volle x-y-Ausdehnung)
  push(a.x0, a.y0, a.z0, a.x1, a.y1, cz0);
  push(a.x0, a.y0, cz1, a.x1, a.y1, a.z1);
  // vorn / hinten in x (nur innerhalb der z-Scheibe des Schnitts)
  push(a.x0, a.y0, cz0, cx0, a.y1, cz1);
  push(cx1, a.y0, cz0, a.x1, a.y1, cz1);
  // links / rechts in y (innerhalb der x- und z-Scheibe des Schnitts)
  push(cx0, a.y0, cz0, cx1, cy0, cz1);
  push(cx0, cy1, cz0, cx1, a.y1, cz1);
  return out;
}

// Eine Box nach Abzug aller aktiven Subtraktoren in Subquader zerlegen.
// subtractors: Mischung aus Boxen ({id,x,y,z,l,w,h}) und reinen AABBs
// ({x0,y0,z0,x1,y1,z1}, z.B. Radkästen). Subtraktions-Boxen werden selbst nicht
// zerlegt (sie füllen kein Volumen). Eine Box wird nie von sich selbst abgezogen.
//
// Gruppen-Regel: eine BENUTZER-Subtraktionsbox (hat eine id) schneidet nur aus
// Körpern DERSELBEN Gruppe (gleiche, nicht-leere groupId). Radkästen (reine
// AABBs ohne id) wirken weiterhin global auf alle Boxen.
function carveBox(box, subtractors) {
  let parts = [boxToAabb(box)];
  for (const sub of subtractors) {
    if (sub.id != null) {
      if (sub.id === box.id) continue;                 // nie von sich selbst
      // Benutzer-Subtraktionsbox: nur innerhalb derselben Gruppe anwenden
      if (sub.groupId == null || sub.groupId !== box.groupId) continue;
    }
    const subA = sub.x0 != null ? sub : boxToAabb(sub);
    const next = [];
    for (const p of parts) next.push(...subtractAabb(p, subA));
    parts = next;
    if (parts.length === 0) break;
  }
  return parts;
}

// Sichtbare Boxen zu Zeichen-Einheiten zusammenfassen. Gruppierte Boxen mit
// GLEICHER groupId UND gleicher Farbe verschmelzen zu einem Körper (keine
// internen Trennlinien). Subtraktions-Boxen und alle übrigen Boxen sind je eine
// eigene Einheit. Jede Einheit trägt ihre ausgehöhlten Teile (CSG) und eine
// Gesamt-Bounding-Box für Tiefensortierung und Auswahlmarkierung.
function buildBoxUnits(state, subtractors) {
  const boxes = state.boxes.filter((b) => !b.hidden);
  const groups = new Map(); // groupId -> box[]
  const singles = [];
  for (const b of boxes) {
    // Verbundene Boxen verschmelzen UNABHÄNGIG von der Farbe zu einer Einheit;
    // nur Subtraktions-Boxen bleiben einzeln.
    if (b.subtract || b.groupId == null) { singles.push([b]); continue; }
    if (!groups.has(b.groupId)) groups.set(b.groupId, []);
    groups.get(b.groupId).push(b);
  }
  const make = (members) => {
    const first = members[0];
    const parts = [];   // alle Teile (für die gemeinsame Außenkontur)
    // Pro Box ihre Farbe + Teile getrennt halten, damit die Füllung je Box in
    // ihrer eigenen Farbe bleibt, die KONTUR aber über die ganze Gruppe geht.
    const colored = [];
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const b of members) {
      const bp = b.subtract ? [] : carveBox(b, subtractors);
      parts.push(...bp);
      colored.push({ box: b, color: b.color, parts: bp });
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); z0 = Math.min(z0, b.z);
      x1 = Math.max(x1, b.x + b.l); y1 = Math.max(y1, b.y + b.w); z1 = Math.max(z1, b.z + b.h);
    }
    return {
      boxes: members,
      boxIds: members.map((b) => b.id),
      colored,                 // [{box, color, parts}] für farbige Füllung je Box
      color: first.color,      // Referenzfarbe (z.B. für Konturschattierung)
      subtract: !!first.subtract,
      opacity: first.opacity != null ? first.opacity : 1,
      parts,                   // vereinte Teile für die Außenkontur
      aabb: { x0, y0, z0, x1, y1, z1 },
    };
  };
  const units = [];
  for (const m of singles) units.push(make(m));
  for (const m of groups.values()) units.push(make(m));
  return units;
}

// Effektive Subtraktoren für eine Szene: alle Boxen mit box.subtract === true
// PLUS die Radkästen des Fahrzeugs (diese schneiden sich immer aus den Möbeln).
function effectiveSubtractors(state, variant) {
  const boxes = state.boxes.filter((b) => b.subtract && !b.hidden);
  return boxes.concat(wheelArchBoxes(variant));
}

// Alle Fenster einer Szene: aus der Variante plus benutzerdefinierte.
// roof-Fenster haben side === "roof" und liegen in der x–y-Ebene auf Dachhöhe.
function allWindows(state, variant) {
  const base = variant.windows.map((w) => ({ ...w, custom: false }));
  const extra = (state.extraWindows || []).map((w) => ({ ...w, custom: true }));
  return base.concat(extra);
}

// Türen einer Szene: editierbare state.doors (vom App-Code aus der Variante
// initialisiert), sonst die Variant-Defaults. Heck-Türen ohne x werden
// zentriert (Abwärtskompatibilität mit alten Daten).
function allDoors(state, variant) {
  const src = (state.doors && state.doorsVariantId === variant.id)
    ? state.doors : variant.doors;
  return src.map((d) => {
    if (d.side === "rear" && typeof d.x !== "number") {
      return { ...d, x: Math.round((variant.cargo.width - d.width) / 2) };
    }
    return d;
  });
}

const DOOR_TYPE_LABEL = { sliding: "Schiebetür", "rear-doors": "Hecktüren", tailgate: "Heckklappe" };
function doorLabel(d) {
  return DOOR_TYPE_LABEL[d.type] || "Tür";
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Farbe aufhellen (amt > 0) oder abdunkeln (amt < 0); erwartet #rrggbb
function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  if (amt >= 0) {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  } else {
    r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
