import assert from "node:assert/strict";
import { test } from "node:test";
import { createFromTemplate } from "../../src/model/templates";
import { createFloorPlanSvg } from "../../src/lib/floorPlan";
import { convertRoom } from "../../src/model/units";

test("floor plan export draws the complete saved layout without a mounted editor", () => {
  const room = createFromTemplate("living").rooms[0];
  room.selectedItemId = room.items[0].id;
  const drawing = createFloorPlanSvg(room);
  assert.match(drawing, /<svg[^>]+width="1600"[^>]+height="1200"/);
  assert.match(drawing, /Sofa/);
  assert.match(drawing, /Coffee table/);
  assert.match(drawing, /18&apos;0&quot;/);
  assert.doesNotMatch(drawing, /var\(|data-editor-only|tabindex|onpointer/);
  room.items[0].hidden = true;
  assert.doesNotMatch(createFloorPlanSvg(room), /Sofa/);
});

test("exported names are XML escaped and cannot add elements or attributes", () => {
  const room = createFromTemplate("bedroom").rooms[0];
  room.name = 'Bedroom & "office" <script>alert(1)</script>';
  room.items[0].name = 'Bed <image href="https://example.com"/> & pillows';
  const drawing = createFloorPlanSvg(room);
  assert.match(drawing, /&amp; &quot;office&quot; &lt;script&gt;/);
  assert.match(drawing, /Bed &lt;image href=&quot;/);
  assert.doesNotMatch(drawing, /<script|<image/);
});

test("metric floor plan exports use converted geometry and metric dimensions", () => {
  const room = convertRoom(createFromTemplate("office").rooms[0], "m");
  const drawing = createFloorPlanSvg(room);
  assert.match(drawing, /4\.27m/);
  assert.match(drawing, /3\.35m/);
  assert.match(drawing, /Desk/);
  assert.doesNotMatch(drawing, /&#39;/);
});
