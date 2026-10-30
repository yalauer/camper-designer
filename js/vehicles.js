// Fahrzeugdaten für den Camper-Planner.
//
// Koordinatensystem (alle Maße in mm):
//   x: Fahrzeuglängsrichtung, 0 = Vorderkante Laderaum (Trennwand hinter den
//      Vordersitzen), positiv Richtung Heck
//   y: Querrichtung, 0 = linke Innenwand (Fahrerseite), positiv zur rechten Wand
//   z: Höhe, 0 = Ladeboden, positiv nach oben
//
// Türen:  x = Vorderkante der lichten Öffnung (bei Hecktüren entfällt x)
// Fenster: x = Vorderkante, zBottom = Unterkante über Ladeboden
//          (bei side:'rear' ist x der Abstand von der linken Wand)
// wheelArch: gilt symmetrisch für beide Seiten; Breite je Seite ergibt sich
//            aus (cargo.width - widthBetweenArches) / 2

const VEHICLES = [
  {
    id: "vw-t5",
    name: "VW T5",
    years: "2003–2015",
    variants: [
      {
        id: "t5-kr-nd",
        label: "Kurzer Radstand, Normaldach",
        cargo: { length: 2572, width: 1692, height: 1410 },
        widthBetweenArches: 1244,
        wheelArch: { x: 1120, length: 1100, height: 260 },
        doors: [
          { type: "sliding", side: "right", x: 60, width: 1020, height: 1284 },
          { type: "tailgate", side: "rear", width: 1486, height: 1306 },
        ],
        windows: [
          { side: "right", x: 120, width: 880, height: 540, zBottom: 650 },
          { side: "right", x: 1180, width: 1150, height: 540, zBottom: 650 },
          { side: "left", x: 1180, width: 1150, height: 540, zBottom: 650 },
          { side: "rear", x: 200, width: 1290, height: 500, zBottom: 720 },
        ],
      },
      {
        id: "t5-kr-mhd",
        label: "Kurzer Radstand, Mittelhochdach",
        cargo: { length: 2572, width: 1692, height: 1635 },
        widthBetweenArches: 1244,
        wheelArch: { x: 1120, length: 1100, height: 260 },
        doors: [
          { type: "sliding", side: "right", x: 60, width: 1020, height: 1284 },
          { type: "rear-doors", side: "rear", width: 1486, height: 1306 },
        ],
        windows: [
          { side: "right", x: 120, width: 880, height: 540, zBottom: 650 },
          { side: "right", x: 1180, width: 1150, height: 540, zBottom: 650 },
          { side: "left", x: 1180, width: 1150, height: 540, zBottom: 650 },
        ],
      },
      {
        id: "t5-lr-nd",
        label: "Langer Radstand, Normaldach",
        cargo: { length: 2975, width: 1692, height: 1410 },
        widthBetweenArches: 1244,
        wheelArch: { x: 1520, length: 1100, height: 260 },
        doors: [
          { type: "sliding", side: "right", x: 60, width: 1020, height: 1284 },
          { type: "tailgate", side: "rear", width: 1486, height: 1306 },
        ],
        windows: [
          { side: "right", x: 120, width: 880, height: 540, zBottom: 650 },
          { side: "right", x: 1180, width: 1500, height: 540, zBottom: 650 },
          { side: "left", x: 1180, width: 1500, height: 540, zBottom: 650 },
          { side: "rear", x: 200, width: 1290, height: 500, zBottom: 720 },
        ],
      },
      {
        id: "t5-lr-mhd",
        label: "Langer Radstand, Mittelhochdach",
        cargo: { length: 2975, width: 1692, height: 1635 },
        widthBetweenArches: 1244,
        wheelArch: { x: 1520, length: 1100, height: 260 },
        doors: [
          { type: "sliding", side: "right", x: 60, width: 1020, height: 1284 },
          { type: "rear-doors", side: "rear", width: 1486, height: 1306 },
        ],
        windows: [
          { side: "right", x: 120, width: 880, height: 540, zBottom: 650 },
          { side: "right", x: 1180, width: 1500, height: 540, zBottom: 650 },
          { side: "left", x: 1180, width: 1500, height: 540, zBottom: 650 },
        ],
      },
      {
        id: "t5-lr-hd",
        label: "Langer Radstand, Hochdach",
        cargo: { length: 2975, width: 1692, height: 1940 },
        widthBetweenArches: 1244,
        wheelArch: { x: 1520, length: 1100, height: 260 },
        doors: [
          { type: "sliding", side: "right", x: 60, width: 1020, height: 1284 },
          { type: "rear-doors", side: "rear", width: 1486, height: 1306 },
        ],
        windows: [
          { side: "right", x: 120, width: 880, height: 540, zBottom: 650 },
        ],
      },
    ],
  },
  {
    id: "trafic-3",
    name: "Renault Trafic III",
    years: "ab 2014",
    variants: [
      {
        id: "trafic3-l1h1",
        label: "L1H1 (kurzer Radstand, Normaldach)",
        cargo: { length: 2537, width: 1662, height: 1387 },
        widthBetweenArches: 1268,
        wheelArch: { x: 1080, length: 1000, height: 255 },
        doors: [
          { type: "sliding", side: "right", x: 30, width: 1030, height: 1284 },
          { type: "rear-doors", side: "rear", width: 1391, height: 1320 },
        ],
        windows: [
          { side: "right", x: 90, width: 900, height: 530, zBottom: 640 },
          { side: "right", x: 1140, width: 1100, height: 530, zBottom: 640 },
          { side: "left", x: 1140, width: 1100, height: 530, zBottom: 640 },
          { side: "rear", x: 180, width: 1300, height: 480, zBottom: 700 },
        ],
      },
      {
        id: "trafic3-l2h1",
        label: "L2H1 (langer Radstand, Normaldach)",
        cargo: { length: 2937, width: 1662, height: 1387 },
        widthBetweenArches: 1268,
        wheelArch: { x: 1480, length: 1000, height: 255 },
        doors: [
          { type: "sliding", side: "right", x: 30, width: 1030, height: 1284 },
          { type: "rear-doors", side: "rear", width: 1391, height: 1320 },
        ],
        windows: [
          { side: "right", x: 90, width: 900, height: 530, zBottom: 640 },
          { side: "right", x: 1140, width: 1450, height: 530, zBottom: 640 },
          { side: "left", x: 1140, width: 1450, height: 530, zBottom: 640 },
          { side: "rear", x: 180, width: 1300, height: 480, zBottom: 700 },
        ],
      },
      // Maße geprüft gegen die offizielle Renault-Preisliste "Trafic Kastenwagen"
      // Nr. 10.1 (CH, ab 01/2019), bestätigt durch die Renault-Maßanhänge FR/EN:
      //   Laderaumlänge 2937 · Breite max. 1662 · zwischen Radkästen 1268
      //   Höhe H2 1898 · Schiebetür 1030 × 1284 · Hecktüren 1391 × 1820
      // Achtung: Die Hecktür ist beim Hochdach 500 mm höher als bei H1 (1820
      // statt 1320) — mehrere Fachportale führen fälschlich den H1-Wert.
      {
        id: "trafic3-l2h2",
        label: "L2H2 (langer Radstand, Hochdach)",
        cargo: { length: 2937, width: 1662, height: 1898 },
        widthBetweenArches: 1268,
        // Radkastenmaße sind von Renault NICHT publiziert (auch nicht im Body
        // Builder Guide). x/length/height hier sind eine Abschätzung: die
        // Hinterachsmitte liegt rechnerisch ~2070 mm hinter der Trennwand
        // (Radstand 3498, Überhang hinten 968), der Kasten also etwa mittig
        // darum. Vor dem Möbelbau am Fahrzeug nachmessen.
        wheelArch: { x: 1480, length: 1000, height: 255 },
        doors: [
          { type: "sliding", side: "right", x: 30, width: 1030, height: 1284 },
          { type: "rear-doors", side: "rear", width: 1391, height: 1820 },
        ],
        windows: [
          { side: "right", x: 90, width: 900, height: 530, zBottom: 640 },
        ],
      },
    ],
  },
  {
    id: "master",
    name: "Renault Master",
    years: "2010–2024 (Frontantrieb; baugleich Opel Movano / Nissan NV400)",
    variants: [
      {
        id: "master-l1h1",
        label: "L1H1 (kurzer Radstand, Normaldach)",
        cargo: { length: 2583, width: 1765, height: 1700 },
        widthBetweenArches: 1380,
        wheelArch: { x: 1450, length: 1050, height: 280 },
        doors: [
          { type: "sliding", side: "right", x: 350, width: 1050, height: 1582 },
          { type: "rear-doors", side: "rear", width: 1580, height: 1627 },
        ],
        windows: [
          { side: "right", x: 450, width: 800, height: 500, zBottom: 950 },
          { side: "left", x: 450, width: 800, height: 500, zBottom: 950 },
        ],
      },
      {
        id: "master-l2h2",
        label: "L2H2 (mittlerer Radstand, Hochdach)",
        cargo: { length: 3083, width: 1765, height: 1894 },
        widthBetweenArches: 1380,
        wheelArch: { x: 1750, length: 1050, height: 280 },
        doors: [
          { type: "sliding", side: "right", x: 700, width: 1050, height: 1820 },
          { type: "rear-doors", side: "rear", width: 1580, height: 1820 },
        ],
        windows: [
          { side: "right", x: 800, width: 900, height: 550, zBottom: 1050 },
          { side: "left", x: 800, width: 900, height: 550, zBottom: 1050 },
        ],
      },
      {
        id: "master-l3h2",
        label: "L3H2 (langer Radstand, Hochdach)",
        cargo: { length: 3733, width: 1765, height: 1894 },
        widthBetweenArches: 1380,
        wheelArch: { x: 2050, length: 1100, height: 280 },
        doors: [
          { type: "sliding", side: "right", x: 750, width: 1050, height: 1820 },
          { type: "rear-doors", side: "rear", width: 1580, height: 1820 },
        ],
        windows: [
          { side: "right", x: 850, width: 900, height: 550, zBottom: 1050 },
          { side: "left", x: 850, width: 900, height: 550, zBottom: 1050 },
        ],
      },
    ],
  },
  {
    id: "transit",
    name: "Ford Transit",
    years: "ab 2014 (V363, großer Kastenwagen)",
    variants: [
      {
        id: "transit-l2h2",
        label: "L2H2 (mittlerer Radstand, Mitteldach)",
        cargo: { length: 3044, width: 1784, height: 1786 },
        widthBetweenArches: 1392,
        wheelArch: { x: 1500, length: 1100, height: 280 },
        doors: [
          { type: "sliding", side: "right", x: 150, width: 1300, height: 1700 },
          { type: "rear-doors", side: "rear", width: 1565, height: 1648 },
        ],
        windows: [
          { side: "right", x: 2100, width: 700, height: 500, zBottom: 1050 },
          { side: "left", x: 1200, width: 900, height: 500, zBottom: 1050 },
          { side: "rear", x: 200, width: 1300, height: 480, zBottom: 750 },
        ],
      },
      {
        id: "transit-l3h2",
        label: "L3H2 (langer Radstand, Mitteldach)",
        cargo: { length: 3494, width: 1784, height: 1886 },
        widthBetweenArches: 1392,
        wheelArch: { x: 1700, length: 1100, height: 280 },
        doors: [
          { type: "sliding", side: "right", x: 300, width: 1300, height: 1700 },
          { type: "rear-doors", side: "rear", width: 1565, height: 1748 },
        ],
        windows: [
          { side: "right", x: 2100, width: 700, height: 500, zBottom: 1150 },
          { side: "left", x: 1300, width: 1000, height: 500, zBottom: 1150 },
          { side: "rear", x: 200, width: 1300, height: 480, zBottom: 750 },
        ],
      },
      {
        id: "transit-l4h3",
        label: "L4H3 (extralanger Radstand, Hochdach)",
        cargo: { length: 4217, width: 1784, height: 2125 },
        widthBetweenArches: 1392,
        wheelArch: { x: 1900, length: 1150, height: 300 },
        doors: [
          { type: "sliding", side: "right", x: 550, width: 1300, height: 1700 },
          { type: "rear-doors", side: "rear", width: 1565, height: 1887 },
        ],
        windows: [
          { side: "right", x: 2100, width: 700, height: 550, zBottom: 1300 },
          { side: "left", x: 1300, width: 1000, height: 550, zBottom: 1300 },
        ],
      },
    ],
  },
];

// ===========================================================================
// Schnierle SL3, 2er-Sitzbank (Korpusbreite 970 mm) auf Rail-In-Bodenschienen
// ===========================================================================
// Maße in mm aus dem Herstellerdatenblatt (Datenblatt_SL3.pdf, Ausgabe 06.2026)
// und der Bedienungsanleitung BA-KD-015 Rev. 05. Die Zeichnungen bemaßen ab
// UNTERKANTE KORPUS — Werte ab Boden sind daher Fußhöhe + Zeichnungsmaß.
//
// Herkunft der Werte:
//   BEMASST   = steht als Maßzahl in der Zeichnung
//   GEMESSEN  = aus der Zeichnung abgegriffen (Pixelmessung). Kalibriert über
//               zwei unabhängige Maßketten (904 waagerecht, 831 senkrecht), die
//               auf 0,18 % übereinstimmen → 0,8505 mm/px. Gegenprobe: die so
//               gemessene Sitztiefe ergibt 486 mm gegen bemaßte 485 mm.
//   SCHÄTZUNG = in keinem Schnierle-Dokument bemaßt und nicht messbar
const SL3 = {
  label: "Schnierle SL3 · 2er (970 mm)",
  widthOverall: 1005,      // BEMASST 1005 ± 5 (Gesamtbreite über alles)
  seatWidth: 910,          // BEMASST 910 ± 10 (Sitz-/Liegefläche)
  depthOverall: 904,       // BEMASST 904 ± 10
  seatDepth: 485,          // BEMASST 485
  corpusHeight: 831,       // BEMASST 831 ± 10 (UK Korpus → OK Lehne)
  seatTopOverBase: 190,    // BEMASST — 450 ab Boden bei 260er Fuß
  bedLength: 1877,         // BEMASST 1877 (536 hinten + 705 Fuß + 636 vorn)
  bedTopOverBase: 164,     // BEMASST — 424 ab Boden bei 260er Fuß
  bedFrontOverhang: 636,   // BEMASST; GEMESSEN 635 → Überstand auf der Sitzseite
  bedRearOverhang: 536,    // BEMASST; GEMESSEN 534 → Überstand hinter der Lehne
  // Längslage des Korpus zum Fußgestell. NICHT bemaßt, aber eindeutig messbar:
  // Korpus x=234..1295 px, Fußträger x=322..1151 px (Seitenansicht m_2er_side).
  // Der Korpus sitzt also NICHT mittig über den Füßen — er kragt auf der
  // Sitzseite deutlich weiter aus als hinter der Lehne. Summe = 904.
  seatFrontOverhang: 123,  // GEMESSEN 122,5 (Sitzseite)
  seatRearOverhang: 76,    // GEMESSEN 74,8 (Lehnenseite)
  // Aufbau des Korpus in Sitzposition. Die Lehne ist KEIN massiver Block über
  // die ganze Resttiefe, sondern eine ~290 mm dicke, um 9° nach hinten geneigte
  // Platte auf einem 810 mm tiefen Sitzsockel. Gemessen an der Silhouette der
  // Seitenansicht: Sockel-Oberkante bei 190 über UK, Lehne von 529..819 unten
  // und 614..904 oben (jeweils ab Sitzvorderkante).
  seatBaseDepth: 810,      // GEMESSEN — Tiefe des Sitzsockels (z 0..190 über UK)
  backrestThickness: 290,  // GEMESSEN 269…296 über die Höhe
  backrestLean: 85,        // GEMESSEN — Versatz nach hinten von unten nach oben (≈9°)
  footRun: 705,            // BEMASST; GEMESSEN 706 bzw. 708 in der Liegezeichnung
  footWidth: 121.8,        // BEMASST 121,8; GEMESSEN 121,8 links / 122,7 rechts
  footHeights: [260, 300], // BEMASST (die Seitenansicht zeigt die 300er Variante)
  // Schienen-Mittenabstand. Die Zeichnung bemaßt den LICHTEN Abstand der Füße
  // mit "min. 300 / max. 540" — das ist die Einbau-Spanne des Fußsystems, keine
  // Verstellung an der fertigen Bank. Gezeichnet ist die Maximalstellung
  // (gemessen 532 licht, Fuß-Außenkanten 777 → Soll 540 bzw. 783,6).
  // Hier fest auf die gezeichnete Stellung gesetzt.
  railGap: 661.8,          // = 540 licht + 121,8 Fußbreite (Mitte zu Mitte)
  railLength: 1250,        // Rail-In Standardschiene (Schnierle SL3-Angebot)
  railHolePitch: 25,       // GEMESSEN 24,7 (Lochraster im Boden, Airline-Standard)
  railWidth: 48,           // SCHÄTZUNG — Profilbreite nirgends bemaßt/messbar
  railHeight: 12,          // SCHÄTZUNG — Aufbauhöhe nirgends bemaßt/messbar
  weight: 80,              // SCHÄTZUNG 75–85 kg (belegt: 94 kg für den 3er/1200)
};

// Standard-Bank mittig im Laderaum, Schiene möglichst weit vorn.
function defaultBench(variant) {
  const c = variant.cargo;
  return {
    on: true,
    mode: "seat",          // "seat" | "bed"
    footHeight: 260,
    railX: Math.max(0, Math.min(300, c.length - SL3.railLength)),
    yCenter: c.width / 2,
    benchOffset: Math.round((SL3.railLength - SL3.footRun) / 2), // Sitz auf der Schiene
    faceFront: true,       // Blickrichtung nach vorn (−x, Richtung Trennwand)
    weight: SL3.weight,
    tags: [],              // Filter-Zuordnung, wie bei den Boxen
  };
}

// Überstand des Korpus vor/hinter der Fuß-Aufstandsfläche (mm). In
// Liegeposition ist er deutlich größer als die Fußlänge — deshalb muss beim
// Ausklappen nachgeführt werden, sonst ragt die Liege aus dem Laderaum.
function benchOverhang(bench) {
  const o = bench.mode === "bed"
    ? { front: SL3.bedFrontOverhang, rear: SL3.bedRearOverhang }
    : { front: SL3.seatFrontOverhang, rear: SL3.seatRearOverhang };
  return bench.faceFront ? o : { front: o.rear, rear: o.front };
}

// Bank + Schienen in den Bauraum klemmen. Begrenzt wird nicht nur die Schiene,
// sondern der tatsächlich belegte Korpus — inklusive Überstand in Liegeposition.
function clampBench(bench, variant) {
  const c = variant.cargo;
  if (SL3.footHeights.indexOf(bench.footHeight) < 0) bench.footHeight = SL3.footHeights[0];
  if (bench.mode !== "bed") bench.mode = "seat";
  if (typeof bench.faceFront !== "boolean") bench.faceFront = true;
  if (!Number.isFinite(bench.weight) || bench.weight < 0) bench.weight = SL3.weight;
  if (!Array.isArray(bench.tags)) bench.tags = [];
  delete bench.railGap; // Fußabstand ist fix (SL3.railGap) — Altstände bereinigen

  // Zulässiger Bereich der vorderen Fuß-Kante, damit der Korpus im Raum bleibt
  const ext = benchOverhang(bench);
  let fLo = ext.front;
  let fHi = c.length - SL3.footRun - ext.rear;
  if (fHi < fLo) { const m = (fLo + fHi) / 2; fLo = m; fHi = m; } // Bank länger als der Raum

  const travel = Math.max(0, SL3.railLength - SL3.footRun);
  bench.railX = clampNum(bench.railX, 0, Math.max(0, c.length - SL3.railLength));
  bench.benchOffset = clampNum(bench.benchOffset, 0, travel);
  const footX0 = bench.railX + bench.benchOffset;
  if (footX0 < fLo || footX0 > fHi) {
    // Erst über den Schienenweg ausgleichen, erst dann die Schiene mitziehen
    const want = clampNum(footX0, fLo, fHi);
    bench.benchOffset = clampNum(want - bench.railX, 0, travel);
    bench.railX = clampNum(want - bench.benchOffset, 0, Math.max(0, c.length - SL3.railLength));
  }

  // Quermitte: der Korpus (breiter als der Schienenabstand) muss zwischen die Wände
  const halfBody = Math.max(SL3.widthOverall / 2, SL3.railGap / 2 + SL3.railWidth / 2);
  bench.yCenter = clampNum(bench.yCenter, Math.min(halfBody, c.width / 2),
                                          Math.max(c.width - halfBody, c.width / 2));
  return bench;
}

function clampNum(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// Geometrie der Bank als achsparallele Quader {x0,y0,z0,x1,y1,z1}.
// Rückgabe: { rails, parts, aabb } — rails = Bodenschienen (immer sichtbar,
// auch wenn die Bank verschoben wird), parts = Füße + Korpus bzw. Liegefläche.
function benchSolids(bench, variant) {
  const yC = bench.yCenter;
  const fh = bench.footHeight;
  const half = SL3.railGap / 2;
  const rails = [];
  for (const s of [-1, 1]) {
    rails.push({
      x0: bench.railX, x1: bench.railX + SL3.railLength,
      y0: yC + s * half - SL3.railWidth / 2, y1: yC + s * half + SL3.railWidth / 2,
      z0: 0, z1: SL3.railHeight,
    });
  }

  // Fuß-Aufstandsfläche auf der Schiene
  const footX0 = bench.railX + bench.benchOffset;
  const footX1 = footX0 + SL3.footRun;
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push({
      x0: footX0, x1: footX1,
      y0: yC + s * half - SL3.footWidth / 2, y1: yC + s * half + SL3.footWidth / 2,
      z0: SL3.railHeight, z1: fh,
    });
  }

  // Vorzeichen der Blickrichtung: +1 = Bank schaut nach vorn (−x).
  // "vorn" der Bank liegt damit bei kleinerem x.
  const dir = bench.faceFront ? 1 : -1;
  // Von der Fuß-Aufstandsfläche aus nach vorn/hinten messen
  const fwd = (d) => (dir > 0 ? footX0 - d : footX1 + d);
  const back = (d) => (dir > 0 ? footX1 + d : footX0 - d);
  const span = (a, b) => ({ x0: Math.min(a, b), x1: Math.max(a, b) });

  if (bench.mode === "bed") {
    // Ausgeklappt: durchgehende Liegefläche, sie wächst nach vorn UND hinten.
    // Breite bleibt die Korpusbreite (1005) — beim Ausklappen fallen weder
    // Seitenteile noch Rahmen weg. SL3.seatWidth (910) ist nur die nutzbare
    // Liegefläche, nicht der belegte Bauraum.
    const s = span(fwd(SL3.bedFrontOverhang), back(SL3.bedRearOverhang));
    parts.push({
      x0: s.x0, x1: s.x1,
      y0: yC - SL3.widthOverall / 2, y1: yC + SL3.widthOverall / 2,
      z0: fh, z1: fh + SL3.bedTopOverBase,
    });
  } else {
    // Sitzposition: Korpus asymmetrisch über der Fuß-Aufstandsfläche — auf der
    // Sitzseite kragt er 123 mm aus, hinter der Lehne nur 76 mm (aus der
    // Seitenansicht gemessen, siehe SL3.seatFrontOverhang).
    const cs = span(fwd(SL3.seatFrontOverhang), back(SL3.seatRearOverhang));
    // Alle Tiefen ab Sitzvorderkante messen; "at" dreht sie in Weltkoordinaten.
    const front = dir > 0 ? cs.x0 : cs.x1;
    const at = (d) => (dir > 0 ? front + d : front - d);
    const yLo = yC - SL3.widthOverall / 2, yHi = yC + SL3.widthOverall / 2;

    // Sitzsockel — trägt die Sitzfläche, reicht NICHT bis zur hinteren Kante
    const base = span(at(0), at(SL3.seatBaseDepth));
    parts.push({ x0: base.x0, x1: base.x1, y0: yLo, y1: yHi,
      z0: fh, z1: fh + SL3.seatTopOverBase });

    // Lehne: ~290 mm dicke Platte, um 85 mm nach hinten geneigt. Als Treppe aus
    // drei Scheiben modelliert — die Renderer verschmelzen sie ohne Trennlinien,
    // sodass die Neigung sichtbar wird, statt eines massiven Klotzes.
    const zLo = fh + SL3.seatTopOverBase, zHi = fh + SL3.corpusHeight;
    const N = 4;
    // Vorderkante der Lehne als Funktion der relativen Höhe t (0 = unten)
    const faceAt = (t) => SL3.depthOverall - SL3.backrestThickness - SL3.backrestLean * (1 - t);
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      // Hüllquader der geneigten Platte über diesen Höhenabschnitt: vorne die
      // Kante am unteren Rand, hinten die am oberen. So bleibt die Gesamttiefe
      // exakt 904 und die Näherung füllt eher zu viel als zu wenig.
      const sl = span(at(faceAt(t0)), at(faceAt(t1) + SL3.backrestThickness));
      parts.push({ x0: sl.x0, x1: sl.x1, y0: yLo, y1: yHi,
        z0: zLo + (zHi - zLo) * t0, z1: zLo + (zHi - zLo) * t1 });
    }
  }

  const hull = (list) => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const p of list) {
      x0 = Math.min(x0, p.x0); y0 = Math.min(y0, p.y0); z0 = Math.min(z0, p.z0);
      x1 = Math.max(x1, p.x1); y1 = Math.max(y1, p.y1); z1 = Math.max(z1, p.z1);
    }
    return { x0, y0, z0, x1, y1, z1 };
  };
  // aabb = alles inkl. Schienen (fürs Tiefensortieren), bodyAabb = nur die Bank
  // (für Bemaßung und Abstände — die Schiene ist länger als die Bank).
  return { rails, parts, aabb: hull(parts.concat(rails)), bodyAabb: hull(parts) };
}

function archSideWidth(variant) {
  return (variant.cargo.width - variant.widthBetweenArches) / 2;
}

// Radkästen als Bounding-Quader [x0,y0,z0,x1,y1,z1] für beide Seiten.
// Dient der AABB-Kollision; die gezeichnete Form ist abgeschrägt (siehe unten).
function wheelArchBoxes(variant) {
  const aw = archSideWidth(variant);
  const wa = variant.wheelArch;
  const W = variant.cargo.width;
  return [
    { side: "left", x0: wa.x, y0: 0, z0: 0, x1: wa.x + wa.length, y1: aw, z1: wa.height },
    { side: "right", x0: wa.x, y0: W - aw, z0: 0, x1: wa.x + wa.length, y1: W, z1: wa.height },
  ];
}

// Radkasten-Querschnitt (in der y–z-Ebene, Blick in Fahrtrichtung) als
// gerundete Kuppel: Boden bei z=0 von y=outer bis y=inner, dann eine
// Viertelkreis-/Ellipsen-Wölbung von der Innenkante hinauf zur Wand. Liefert
// Punkte [y,z] von der Außenwand (y=outer, z=H) über die Kuppel zur Innenkante
// (y=inner, z=0). `steps` bestimmt die Facettierung.
//   side="left":  outer=0,   inner=aw     (Wölbung von y=aw nach y=0 hin)
//   side="right": outer=W,   inner=W-aw
// Querschnitt in der y–z-Ebene (Blick in Fahrtrichtung): eine volle Wölbung wie
// am echten Radkasten — senkrecht an der Außenwand hoch, oben gerundet und
// innen wieder zum Boden herab (Halbtonnen-Form). Liefert Punkte [y,z] von der
// Außenwand-Bodenkante über die Wölbung zur Innenkante am Boden.
//   side="left":  outer=0,   inner=aw
//   side="right": outer=W,   inner=W-aw
function archDomeProfile(variant, side, steps = 16) {
  const aw = archSideWidth(variant);
  const W = variant.cargo.width;
  const H = variant.wheelArch.height;
  const yOuter = side === "left" ? 0 : W;
  const yInner = side === "left" ? aw : W - aw;
  const span = yInner - yOuter;     // vorzeichenbehaftet (left: +aw, right: -aw)
  // Halbtonnen-Querschnitt: an der Außenwand senkrecht eine Schulter hoch,
  // dann ein glatter Ellipsenbogen über den Scheitel (z=H) hinab zur
  // Innenkante am Boden — wie am echten Radkasten.
  const shoulder = H * 0.5;         // Höhe der senkrechten Wand-Schulter
  const pts = [];
  pts.push([yOuter, 0]);            // Außenwand, Boden
  pts.push([yOuter, shoulder]);     // Schulter an der Wand
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;            // 0 = Schulter (an Wand), 1 = Innenkante (Boden)
    const y = yOuter + span * t;
    // glatter Bogen: Start auf Schulterhöhe, Scheitel H knapp nach dem Start,
    // Ende auf 0. Halbe Kosinuswelle, auf [shoulder..0] skaliert + Überhöhung.
    const arch = Math.sin(Math.PI * (0.5 + 0.5 * t)); // 1 → 0  (Viertelwelle)
    const lift = Math.sin(Math.PI * t);               // 0 → 1 → 0 (Überhöhung)
    const z = shoulder * arch + (H - shoulder) * lift;
    pts.push([y, Math.max(0, z)]);
  }
  return pts;
}

// Höhenverlauf des Radkastens entlang der Fahrzeuglänge x (Tonnenform):
// senkrecht hoch, gerundete Endkappe, flaches Dach über die Mitte, am anderen
// Ende wieder gerundet herab. Liefert Stützstellen {x, hz} mit hz ∈ [0..1]
// (Höhenfaktor). Wird von der Iso (Querschnitt-Verschiebung) UND der
// Wandansicht (Längs-Silhouette) genutzt, damit beide exakt übereinstimmen.
function archLengthProfile(variant, nEnd = 4) {
  const wa = variant.wheelArch;
  const x0 = wa.x, x1 = wa.x + wa.length;
  const round = Math.min((x1 - x0) * 0.18, 160); // Radius der Endrundung
  const xs = [];
  for (let i = 0; i <= nEnd; i++) {               // vordere Rundung (Viertelkreis)
    const t = i / nEnd;
    xs.push({ x: x0 + round * t, hz: Math.sin((Math.PI / 2) * t) });
  }
  xs.push({ x: (x0 + x1) / 2, hz: 1 });           // Mitte: volle Höhe (flaches Dach)
  for (let i = nEnd; i >= 0; i--) {               // hintere Rundung
    const t = i / nEnd;
    xs.push({ x: x1 - round * t, hz: Math.sin((Math.PI / 2) * t) });
  }
  return xs;
}
