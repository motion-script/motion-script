import { Scene, createRef, Grid, Rect, Ellipse, Polygon, Polygram, Path, Line, Text, parallel, sequence, wait, easeInOutQuad, easeOutBack, easeOutQuad } from "@motion-script/core";

const easeBack = easeOutBack();

const CARD = "#1e2430";
const ACCENT = "#5ea8d8";
const SHADOW = "#000000";
const SIZE = 100;

const PATH_D = `M 151.34904,307.20455 L 264.34904,307.20455 C 264.34904,291.14096 263.2021,287.95455 236.59904,287.95455 C 240.84904,275.20455 258.12424,244.35808 267.72404,244.35808 C 276.21707,244.35808 286.34904,244.82592 286.34904,264.20455 C 286.34904,286.20455 323.37171,321.67547 332.34904,307.20455 C 345.72769,285.63897 309.34904,292.21514 309.34904,240.20455 C 309.34904,169.05135 350.87417,179.18071 350.87417,139.20455 C 350.87417,119.20455 345.34904,116.50374 345.34904,102.20455 C 345.34904,83.30695 361.99717,84.403577 358.75805,68.734879 C 356.52061,57.911656 354.76962,49.23199 353.46516,36.143889 C 352.53959,26.857305 352.24452,16.959398 342.59855,17.357382 C 331.26505,17.824992 326.96549,37.77419 309.34904,39.204549 C 291.76851,40.631991 276.77834,24.238028 269.97404,26.579549 C 263.22709,28.901334 265.34904,47.204549 269.34904,60.204549 C 275.63588,80.636771 289.34904,107.20455 264.34904,111.20455 C 239.34904,115.20455 196.34904,119.20455 165.34904,160.20455 C 134.34904,201.20455 135.49342,249.3212 123.34904,264.20455 C 82.590696,314.15529 40.823919,293.64625 40.823919,335.20455 C 40.823919,353.81019 72.349045,367.20455 77.349045,361.20455 C 82.349045,355.20455 34.863764,337.32587 87.995492,316.20455 C 133.38711,298.16014 137.43914,294.47663 151.34904,307.20455 z`;

const LINE_POINTS = [
  { x: 0, y: SIZE / 2 },
  { x: SIZE / 2, y: 0 },
  { x: SIZE, y: SIZE / 2 },
  { x: SIZE / 2, y: SIZE },
];

export class ShapeScene extends Scene {
  *build() {
    this.set({ fill: "#0D0F15", padding: 80 });

    // Polygon refs
    const polygonStroke = createRef<Polygon>();
    const polygonFill = createRef<Polygon>();
    const polygonShadow = createRef<Polygon>();

    // Polygram refs
    const polygramStroke = createRef<Polygram>();
    const polygramFill = createRef<Polygram>();
    const polygramShadow = createRef<Polygram>();

    // Rect refs
    const rectStroke = createRef<Rect>();
    const rectFill = createRef<Rect>();
    const rectShadow = createRef<Rect>();

    // Ellipse refs
    const ellipseStroke = createRef<Ellipse>();
    const ellipseFill = createRef<Ellipse>();
    const ellipseShadow = createRef<Ellipse>();

    // Path refs
    const pathStroke = createRef<Path>();
    const pathFill = createRef<Path>();
    const pathShadow = createRef<Path>();

    // Line refs
    const lineStroke = createRef<Line>();
    const lineFill = createRef<Line>();
    const lineShadow = createRef<Line>();

    const row = (children: any) => (
      <Rect group="row" gap={12} alignment={{ x: 0, y: 0 }}>
        {children}
      </Rect>
    );

    const cell = (label: string, children: any) => (
      <Rect group="column" gap={12} fill={CARD} cornerRadius={16} padding={24} alignment={{ x: 0, y: 0 }}>
        {row(children)}
        <Text text={label} fontSize={20} fill="white" fontFamily="Inter" />
      </Rect>
    );

    this.add(
      <Grid columns={3} gap={20} width={"fill"} height={"fill"}>
        {cell("Polygon", <>
          <Polygon ref={polygonStroke} width={SIZE} height={SIZE} fill="transparent" stroke={{ fill: ACCENT, weight: 6, dash: [12, 8], align: -1 }} sides={3} cornerRadius={0} />
          <Polygon ref={polygonFill} width={SIZE} height={SIZE} fill={ACCENT} sides={3} cornerRadius={0} />
          <Polygon ref={polygonShadow} width={SIZE} height={SIZE} fill={ACCENT} stroke={{ fill: "transparent", weight: 6 }} shadow={{ fill: SHADOW, blur: 0, dx: 0, dy: 0 }} sides={3} cornerRadius={0} />
        </>)}

        {cell("Polygram", <>
          <Polygram ref={polygramStroke} width={SIZE} height={SIZE} fill="transparent" stroke={{ fill: ACCENT, weight: 6, dash: [12, 8], align: -1 }} sides={5} ratio={0.5} cornerRadius={0} />
          <Polygram ref={polygramFill} width={SIZE} height={SIZE} fill={ACCENT} sides={5} ratio={0.5} cornerRadius={0} />
          <Polygram ref={polygramShadow} width={SIZE} height={SIZE} fill={ACCENT} stroke={{ fill: "transparent", weight: 6 }} shadow={{ fill: SHADOW, blur: 0, dx: 0, dy: 0 }} sides={5} ratio={0.5} cornerRadius={0} />
        </>)}

        {cell("Rect", <>
          <Rect ref={rectStroke} width={SIZE} height={SIZE} fill="transparent" stroke={{ fill: ACCENT, weight: 6, dash: [12, 8], align: -1 }} cornerRadius={0} />
          <Rect ref={rectFill} width={SIZE} height={SIZE} fill={ACCENT} cornerRadius={0} />
          <Rect ref={rectShadow} width={SIZE} height={SIZE} fill={ACCENT} stroke={{ fill: "transparent", weight: 6 }} shadow={{ fill: SHADOW, blur: 0, dx: 0, dy: 0 }} cornerRadius={0} />
        </>)}

        {cell("Ellipse", <>
          <Ellipse ref={ellipseStroke} width={SIZE} height={SIZE} fill="transparent" stroke={{ fill: ACCENT, weight: 6, dash: [12, 8], align: -1 }} ratio={1} startAngle={0} sweep={360} />
          <Ellipse ref={ellipseFill} width={SIZE} height={SIZE} fill={ACCENT} ratio={1} startAngle={0} sweep={360} />
          <Ellipse ref={ellipseShadow} width={SIZE} height={SIZE} fill={ACCENT} stroke={{ fill: "transparent", weight: 6 }} shadow={{ fill: SHADOW, blur: 0, dx: 0, dy: 0 }} ratio={1} startAngle={0} sweep={360} />
        </>)}

        {cell("Path", <>
          <Path ref={pathStroke} fill="transparent" stroke={{ fill: ACCENT, weight: 6, dash: [12, 8], align: -1 }} d={PATH_D} />
          <Path ref={pathFill} fill={ACCENT} d={PATH_D} start={0} end={0} />
          <Path ref={pathShadow} fill={ACCENT} stroke={{ fill: "transparent", weight: 6 }} shadow={{ fill: SHADOW, blur: 0, dx: 0, dy: 0 }} d={PATH_D} />
        </>)}

        {cell("Line", <>
          <Line ref={lineStroke} stroke={{ fill: ACCENT, weight: 6, dash: [12, 8], align: -1 }} points={LINE_POINTS} closed radius={0} />
          <Line ref={lineFill} fill={ACCENT} stroke={{ fill: ACCENT, weight: 6 }} points={LINE_POINTS} closed radius={0} />
          <Line ref={lineShadow} fill={ACCENT} stroke={{ fill: "transparent", weight: 6 }} shadow={{ fill: SHADOW, blur: 0, dx: 0, dy: 0 }} points={LINE_POINTS} closed radius={0} />
        </>)}
      </Grid>,
    );

    yield* wait(0.5);

    yield* parallel(
      // ---- Polygon ----
      sequence(
        polygonFill().to({ sides: 8 }, 0.8, easeInOutQuad),
        polygonFill().to({ cornerRadius: 24 }, 0.6, easeBack),
      ),
      sequence(
        polygonStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: -1 } }, 1.2, easeInOutQuad),
        polygonStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: 1 } }, 0.8, easeInOutQuad),
      ),
      sequence(
        polygonShadow().to({ shadow: { fill: SHADOW, blur: 16, dx: 12, dy: 12 } }, 0.8, easeOutQuad),
        polygonShadow().to({ fill: "transparent", stroke: { fill: ACCENT, weight: 6 }, shadow: { fill: SHADOW, blur: 16, dx: -12, dy: 12 } }, 0.8, easeOutQuad),
      ),

      // ---- Polygram ----
      sequence(
        polygramFill().to({ sides: 8 }, 0.8, easeInOutQuad),
        polygramFill().to({ ratio: 0.25 }, 0.6, easeInOutQuad),
        polygramFill().to({ cornerRadius: 12 }, 0.6, easeBack),
      ),
      sequence(
        polygramStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: -1 } }, 1.2, easeInOutQuad),
        polygramStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: 1 } }, 0.8, easeInOutQuad),
      ),
      sequence(
        polygramShadow().to({ shadow: { fill: SHADOW, blur: 16, dx: 12, dy: 12 } }, 0.8, easeOutQuad),
        polygramShadow().to({ fill: "transparent", stroke: { fill: ACCENT, weight: 6 }, shadow: { fill: SHADOW, blur: 16, dx: -12, dy: 12 } }, 0.8, easeOutQuad),
      ),

      // ---- Rect ----
      sequence(
        rectFill().to({ cornerRadius: 30 }, 0.8, easeBack),
        rectFill().to({ rotation: 180 }, 0.8, easeInOutQuad),
      ),
      sequence(
        rectStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: -1 } }, 1.2, easeInOutQuad),
        rectStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: 1 } }, 0.8, easeInOutQuad),
      ),
      sequence(
        rectShadow().to({ shadow: { fill: SHADOW, blur: 16, dx: 12, dy: 12 } }, 0.8, easeOutQuad),
        rectShadow().to({ fill: "transparent", stroke: { fill: ACCENT, weight: 6 }, shadow: { fill: SHADOW, blur: 16, dx: -12, dy: 12 } }, 0.8, easeOutQuad),
      ),

      // ---- Ellipse ----
      sequence(
        ellipseFill().to({ ratio: 0.4 }, 0.8, easeInOutQuad),
        ellipseFill().to({ sweep: 270 }, 0.6, easeInOutQuad),
        ellipseFill().to({ startAngle: 360 }, 0.8, easeInOutQuad),
      ),
      sequence(
        ellipseStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: -1 } }, 1.2, easeInOutQuad),
        ellipseStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: 1 } }, 0.8, easeInOutQuad),
      ),
      sequence(
        ellipseShadow().to({ shadow: { fill: SHADOW, blur: 16, dx: 12, dy: 12 } }, 0.8, easeOutQuad),
        ellipseShadow().to({ fill: "transparent", stroke: { fill: ACCENT, weight: 6 }, shadow: { fill: SHADOW, blur: 16, dx: -12, dy: 12 } }, 0.8, easeOutQuad),
      ),

      // ---- Path ----
      sequence(
        pathFill().to({ end: 1 }, 1, easeInOutQuad),
        pathFill().to({ start: 0.3 }, 0.6, easeInOutQuad),
      ),
      sequence(
        pathStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: -1 } }, 1.2, easeInOutQuad),
        pathStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: 1 } }, 0.8, easeInOutQuad),
      ),
      sequence(
        pathShadow().to({ shadow: { fill: SHADOW, blur: 16, dx: 12, dy: 12 } }, 0.8, easeOutQuad),
        pathShadow().to({ fill: "transparent", stroke: { fill: ACCENT, weight: 6 }, shadow: { fill: SHADOW, blur: 16, dx: -12, dy: 12 } }, 0.8, easeOutQuad),
      ),

      // ---- Line ----
      sequence(
        lineFill().to({ radius: 24 }, 0.8, easeBack),
        lineFill().to({ scale: 1.2 }, 0.6, easeInOutQuad),
      ),
      sequence(
        lineStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: -1 } }, 1.2, easeInOutQuad),
        lineStroke().to({ stroke: { fill: ACCENT, weight: 6, dash: [12, 8], dashOffset: -40, align: 1 } }, 0.8, easeInOutQuad),
      ),
      sequence(
        lineShadow().to({ shadow: { fill: SHADOW, blur: 16, dx: 12, dy: 12 } }, 0.8, easeOutQuad),
        lineShadow().to({ fill: "transparent", shadow: { fill: SHADOW, blur: 16, dx: -12, dy: 12 } }, 0.8, easeOutQuad),
      ),
    );

    yield* wait(0.5);
  }
};
