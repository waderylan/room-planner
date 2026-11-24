/** All parts stay inside the measured footprint and height, including after unit conversion. */
export interface FurniturePart {
  shape: "box" | "ellipsoid" | "pot";
  center: [number, number, number];
  size: [number, number, number];
  tone: number;
}

export function furnitureParts(presetId: string | undefined, w: number, d: number, h: number): FurniturePart[] {
  const parts: FurniturePart[] = [];
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number, tone = 0) => parts.push({ shape: "box", center: [x * w, y * h, z * d], size: [width * w, height * h, depth * d], tone });
  const legs = (height: number, width = .07, depth = .1) => {
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(x * (.44 - width / 2), height / 2, z * (.44 - depth / 2), width, height, depth, -.5);
  };

  if (["sofa", "loveseat", "armchair"].includes(presetId ?? "")) {
    legs(.18);
    box(0, .25, 0, 1, .22, 1, -.1);
    box(0, .63, -.42, 1, .74, .16, -.03);
    for (const x of [-.44, .44]) box(x, .49, .04, .12, .44, .92, .03);
    const seats = presetId === "sofa" ? 3 : presetId === "loveseat" ? 2 : 1;
    for (let i = 0; i < seats; i++) {
      const x = -.38 + (.76 / seats) * (i + .5);
      box(x, .43, .07, .76 / seats - .012, .16, .7, .12);
      box(x, .72, -.29, .76 / seats - .014, .4, .12, .08);
    }
  } else if (presetId?.startsWith("bed-")) {
    legs(.12);
    box(0, .22, 0, 1, .22, 1, -.25);
    box(0, .55, -.46, 1, .9, .08, -.2);
    box(0, .45, .015, .96, .3, .93, .38);
    box(0, .61, .15, .96, .1, .64, .1);
    for (const x of [-.235, .235]) box(x, .67, -.305, .4, .13, .22, .65);
  } else if (["desk", "coffee-table", "dining-table"].includes(presetId ?? "")) {
    legs(.91, .055, .08);
    box(0, .955, 0, 1, .09, 1, .1);
    if (presetId === "desk") {
      box(.32, .52, -.02, .26, .78, .8, -.03);
      for (const y of [.35, .58, .81]) box(.32, y, .384, .23, .008, .008, -.3);
    }
  } else if (presetId === "dining-chair") {
    legs(.48, .09, .1);
    box(0, .51, 0, 1, .1, 1, .08);
    box(0, .775, -.44, 1, .45, .12, -.02);
  } else if (presetId === "bookshelf") {
    box(0, .5, -.47, 1, 1, .06, -.16);
    for (const x of [-.47, .47]) box(x, .5, 0, .06, 1, 1, -.06);
    for (const y of [.02, .26, .5, .74, .98]) box(0, y, 0, .94, .04, 1, .04);
    for (const shelf of [.04, .28, .52, .76]) for (let i = 0; i < 4; i++) box(-.29 + i * .14, shelf + .075, -.04, .09, .15, .56, -.12 + i * .12);
  } else if (["nightstand", "dresser", "wardrobe", "tv-stand", "fridge"].includes(presetId ?? "")) {
    legs(.06);
    box(0, .53, 0, 1, .94, 1, .02);
    const drawers = presetId === "wardrobe" ? 0 : presetId === "dresser" ? 3 : 2;
    if (drawers) for (let i = 1; i < drawers; i++) box(0, .06 + .94 * i / drawers, .497, .94, .006, .006, -.35);
    if (presetId === "wardrobe" || presetId === "tv-stand") box(0, .53, .497, .006, .88, .006, -.35);
    if (presetId === "wardrobe") for (const x of [-.04, .04]) box(x, .53, .497, .016, .16, .006, -.5);
    else if (presetId === "fridge") box(.39, .63, .497, .016, .3, .006, -.5);
    else for (let i = 0; i < drawers; i++) box(0, .06 + .94 * (i + .5) / drawers, .497, .12, .016, .006, -.5);
  } else if (presetId === "kitchen-island") {
    box(0, .45, 0, .92, .9, .9, -.1);
    box(0, .95, 0, 1, .1, 1, .25);
    box(0, .45, .448, .006, .8, .004, -.4);
  } else if (presetId === "plant") {
    parts.push({ shape: "pot", center: [0, h * .16, 0], size: [w * .52, h * .32, d * .52], tone: -.35 });
    parts.push({ shape: "ellipsoid", center: [0, h * .65, 0], size: [w, h * .7, d], tone: 0 });
    parts.push({ shape: "ellipsoid", center: [w * .18, h * .61, d * .08], size: [w * .55, h * .52, d * .6], tone: .12 });
    parts.push({ shape: "ellipsoid", center: [-w * .16, h * .69, -d * .1], size: [w * .6, h * .5, d * .64], tone: -.1 });
  } else if (presetId === "rug") {
    box(0, .5, 0, 1, 1, 1, .08);
    for (const x of [-.43, .43]) box(x, .95, 0, .012, .1, .92, .25);
  } else if (presetId === "bathtub") {
    box(0, .08, 0, 1, .16, 1, .2);
    for (const x of [-.45, .45]) box(x, .5, 0, .1, 1, 1, .2);
    for (const z of [-.45, .45]) box(0, .5, z, .8, 1, .1, .2);
  } else if (presetId === "sink") {
    box(0, .4, 0, .94, .8, .94, -.12);
    box(0, .86, 0, 1, .12, 1, .35);
    parts.push({ shape: "ellipsoid", center: [0, h * .95, 0], size: [w * .66, h * .1, d * .66], tone: -.22 });
  } else if (presetId === "toilet") {
    box(0, .65, -.35, .78, .7, .3, .3);
    box(0, .2, .1, .5, .4, .55, .2);
    parts.push({ shape: "ellipsoid", center: [0, h * .48, d * .12], size: [w, h * .28, d * .76], tone: .35 });
  }
  return parts;
}
