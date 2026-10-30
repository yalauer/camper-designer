# Camper-Planner

Interaktiver 2D/Iso-Planer für den Camper-Ausbau — ohne Installation, einfach
`index.html` im Browser öffnen (Doppelklick).

## Funktionen

- **Fahrzeuge:** VW T5 (kurzer/langer Radstand × Normal-/Mittelhoch-/Hochdach),
  Renault Trafic III (L1H1 / L2H1 / L2H2), Renault Master (L1H1 / L2H2 / L3H2)
  und Ford Transit (L2H2 / L3H2 / L4H3).
  Maßstabsgetreue Bauräume inkl. realistisch gerundeter Radkästen (Kuppel),
  Türen und Fenster.
  **Möbel bleiben beim Fahrzeug-/Modellwechsel erhalten** (keine Größenänderung).
- **Ansichten:** Draufsicht, Innenansicht beider Wände (zeigt **nur die an die
  jeweilige Wand anliegenden Möbel**), **Heckansicht mit offenen Türen**,
  Isometrie von hinten und von vorne sowie eine **frei drehbare 3D-Ansicht
  („3D ⟲")** — mit gedrückter linker Maustaste auf freier Fläche um die Szene
  rotieren. Umschaltbar zwischen Voll- und Drahtansicht.
- **Möbel:** Rechteckige Körper anlegen (Maße in mm), per Drag & Drop platzieren,
  duplizieren, umfärben, **um 90° drehen** (Taste R), pro Box **Transparenz**,
  **Gewicht** und **Ausblenden**. Überlappende Boxen werden rot markiert; die
  Hervorhebung lässt sich per „⚠ Kollision"-Schalter ein-/ausblenden.
- **Gewicht & Schwerpunkt:** Pro Box ein Gewicht eingeben; per „⚖ Gewicht"-Schalter
  werden Gesamtgewicht, Zuladungsreserve (Leer-/zul. Gesamtgewicht je Fahrzeug)
  und der Schwerpunkt in der Draufsicht eingeblendet.
- **Maßketten:** Per „⊞ Maße"-Schalter zeigt die gewählte Box ihre freien Abstände
  zu Wänden und Nachbarboxen an.
- **Einrasten (Snap):** Boxen rasten beim Ziehen an Wänden und Nachbarkanten ein
  (per „⌁ Snap" abschaltbar, Alt beim Ziehen deaktiviert es kurzzeitig).
- **Rückgängig/Wiederholen:** Strg+Z / Strg+Y oder die Pfeil-Buttons.
- **PNG-Export:** Aktuelle Ansicht als Bild speichern („🖼 PNG").
- **Boolesche Subtraktion:** Eine Box per Häkchen zum Subtraktionskörper machen —
  ihr Schnittvolumen wird aus überlappenden Boxen herausgeschnitten (CSG-Differenz)
  statt als Kollision markiert. Die Subtraktion wirkt **nur innerhalb derselben
  Gruppe**: ein Subtraktionskörper schneidet ausschließlich aus Boxen, die mit ihm
  verbunden (gleiche Gruppe) sind; Überlappungen mit fremden Boxen gelten weiter
  als Kollision. **Radkästen** wirken davon unabhängig immer auf alle Möbel: ragt
  eine Box über einen Radkasten, wird das Schnittvolumen sauber herausgeschnitten.
- **Boxen verbinden & Gruppen:** Mehrere Boxen mit Shift-/Strg-Klick markieren
  und über „⛓ Verbinden" gruppieren — gruppierte Boxen lassen sich gemeinsam
  verschieben. Verbundene Boxen werden als **ein zusammenhängender Körper**
  gezeichnet (nur die gemeinsame Außenkontur, keine Trennlinie durch den Verbund)
  — unabhängig von der Farbe; jede Box behält ihre eigene Füllfarbe. In der
  Möbelliste erscheint je Gruppe ein Kopf mit **frei umbenennbarem Namen**, plus
  Sammel-Aktionen: **ganze Gruppe ein-/ausblenden** (👁), **auflösen** (✂) und
  das ⛓-Symbol wählt alle Mitglieder aus. „✂ Trennen" löst die Gruppe ebenfalls auf.
- **Fenster & Dachfenster:** Eigene Fenster in linke/rechte Wand, Heck oder Dach
  einfügen, frei positionieren und bemaßen.
- **Speichern:** Stand bleibt automatisch im Browser erhalten (localStorage);
  zusätzlich Export/Import als JSON-Datei.

## Bedienung

| Aktion | Eingabe |
| --- | --- |
| Box auswählen | Klick |
| Box verschieben | Ziehen (in Iso: auf Bodenebene, Shift = Höhe) |
| Fein verschieben | Pfeiltasten (Alt = 1-mm-Schritte) |
| Box um 90° drehen | R |
| Rückgängig / Wiederholen | Strg+Z / Strg+Y |
| Mehrfachauswahl | Shift-/Strg-Klick |
| Zoom / Ansicht schieben | Mausrad / rechte Maustaste ziehen |
| 3D-Ansicht drehen | Linke Maustaste auf freier Fläche ziehen (nur „3D ⟲") |
| Box löschen | Entf |

## Koordinatensystem

Alle Maße in mm. `x` längs (0 = Trennwand hinter den Sitzen, Richtung Heck),
`y` quer (0 = linke Wand/Fahrerseite), `z` Höhe ab Ladeboden.

## Dateien

- [index.html](index.html) — Oberfläche
- [js/vehicles.js](js/vehicles.js) — Fahrzeugdaten (Bauräume, Radkästen, Türen, Fenster)
- [js/render.js](js/render.js) — Projektionen und Zeichnung aller Ansichten
- [js/app.js](js/app.js) — State, Interaktion, Persistenz
