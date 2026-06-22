import type {
  CanvasViewport,
  VisualizerMaskLayer,
  VisualizerPoint,
} from "./types";

export function createContainViewport(
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
  zoom = 1,
): CanvasViewport {
  const safeImageWidth = Math.max(1, imageWidth);
  const safeImageHeight = Math.max(1, imageHeight);
  const containScale = Math.min(
    canvasWidth / safeImageWidth,
    canvasHeight / safeImageHeight,
  ) * zoom;
  const renderedWidth = safeImageWidth * containScale;
  const renderedHeight = safeImageHeight * containScale;
  return {
    canvasWidth,
    canvasHeight,
    imageWidth: safeImageWidth,
    imageHeight: safeImageHeight,
    renderedWidth,
    renderedHeight,
    scaleX: containScale,
    scaleY: containScale,
    offsetX: (canvasWidth - renderedWidth) / 2,
    offsetY: (canvasHeight - renderedHeight) / 2,
  };
}

export function originalToCanvasPoint(
  point: VisualizerPoint,
  viewport: CanvasViewport,
): VisualizerPoint {
  return [
    viewport.offsetX + point[0] * viewport.scaleX,
    viewport.offsetY + point[1] * viewport.scaleY,
  ];
}

export function canvasToOriginalPoint(
  point: VisualizerPoint,
  viewport: CanvasViewport,
): VisualizerPoint {
  return [
    Math.max(0, Math.min(
      viewport.imageWidth,
      (point[0] - viewport.offsetX) / viewport.scaleX,
    )),
    Math.max(0, Math.min(
      viewport.imageHeight,
      (point[1] - viewport.offsetY) / viewport.scaleY,
    )),
  ];
}

export function scalePolygonToCanvas(
  points: VisualizerPoint[],
  viewport: CanvasViewport,
) {
  return points.map((point) => originalToCanvasPoint(point, viewport));
}

export function unscalePolygonToOriginal(
  points: VisualizerPoint[],
  viewport: CanvasViewport,
) {
  return points.map((point) => canvasToOriginalPoint(point, viewport));
}

export function pointInPolygon(point: VisualizerPoint, polygon: VisualizerPoint[]) {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (
        (b[0] - a[0]) * (point[1] - a[1])
        / ((b[1] - a[1]) || 0.00001)
        + a[0]
      );
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonBoundingBox(points: VisualizerPoint[]) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function perpendicularDistance(
  point: VisualizerPoint,
  start: VisualizerPoint,
  end: VisualizerPoint,
) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(
    1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy)
    / (dx * dx + dy * dy),
  ));
  return Math.hypot(
    point[0] - (start[0] + t * dx),
    point[1] - (start[1] + t * dy),
  );
}

export function simplifyPolygon(points: VisualizerPoint[], tolerance = 2) {
  if (points.length <= 4) return points;
  const simplify = (input: VisualizerPoint[]): VisualizerPoint[] => {
    if (input.length <= 2) return input;
    let maxDistance = 0;
    let index = 0;
    for (let current = 1; current < input.length - 1; current++) {
      const distance = perpendicularDistance(
        input[current],
        input[0],
        input[input.length - 1],
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        index = current;
      }
    }
    if (maxDistance <= tolerance) return [input[0], input[input.length - 1]];
    return [
      ...simplify(input.slice(0, index + 1)).slice(0, -1),
      ...simplify(input.slice(index)),
    ];
  };
  const closed = [...points, points[0]];
  const simplified = simplify(closed).slice(0, -1);
  return simplified.length >= 3 ? simplified : points;
}

export function snapPolygonToRoomEdges(
  points: VisualizerPoint[],
  imageWidth: number,
  imageHeight: number,
  thresholdRatio = 0.018,
) {
  const threshold = Math.min(imageWidth, imageHeight) * thresholdRatio;
  return points.map(([x, y]) => [
    x <= threshold ? 0 : x >= imageWidth - threshold ? imageWidth : x,
    y <= threshold ? 0 : y >= imageHeight - threshold ? imageHeight : y,
  ] as VisualizerPoint);
}

export function cleanWallPolygon(
  points: VisualizerPoint[],
  imageWidth: number,
  imageHeight: number,
) {
  const clipped = points.map(([x, y]) => [
    Math.round(Math.max(0, Math.min(imageWidth, x))),
    Math.round(Math.max(0, Math.min(imageHeight, y))),
  ] as VisualizerPoint);
  const deduplicated = clipped.filter((point, index) => {
    const previous = clipped[(index - 1 + clipped.length) % clipped.length];
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 2;
  });
  return snapPolygonToRoomEdges(
    simplifyPolygon(deduplicated, Math.max(2, Math.min(imageWidth, imageHeight) * 0.003)),
    imageWidth,
    imageHeight,
  );
}

export function validateMaskLayer(layer: VisualizerMaskLayer) {
  const points = layer.points || [];
  if (points.length < 3) return { valid: false, reason: "Add at least three points." };
  const box = polygonBoundingBox(points);
  const imageArea = layer.originalImageWidth * layer.originalImageHeight;
  const boxArea = box.width * box.height;
  if (box.width < layer.originalImageWidth * 0.025 || box.height < layer.originalImageHeight * 0.025) {
    return { valid: false, reason: "The wall area is too narrow." };
  }
  if (boxArea > imageArea * 0.88) {
    return { valid: false, reason: "The mask is too close to the full image." };
  }
  return { valid: true, reason: "" };
}

export function validatePolygon(
  points: VisualizerPoint[],
  imageWidth: number,
  imageHeight: number,
) {
  return validateMaskLayer({
    id: "validation",
    name: "Wall",
    type: "wall",
    source: "polygon",
    points,
    originalImageWidth: imageWidth,
    originalImageHeight: imageHeight,
    visible: true,
    locked: false,
    needsReview: true,
  });
}

export function closePolygon(points: VisualizerPoint[]) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? points.slice(0, -1)
    : points;
}

export function insertPointOnEdge(
  points: VisualizerPoint[],
  edgeIndex: number,
  point?: VisualizerPoint,
) {
  if (points.length < 2) return points;
  const start = points[edgeIndex % points.length];
  const end = points[(edgeIndex + 1) % points.length];
  const inserted = point || [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
  ] as VisualizerPoint;
  const result = [...points];
  result.splice(edgeIndex + 1, 0, inserted);
  return result;
}

export function removePoint(points: VisualizerPoint[], index: number) {
  return points.length <= 3
    ? points
    : points.filter((_, pointIndex) => pointIndex !== index);
}

export function movePoint(
  points: VisualizerPoint[],
  index: number,
  point: VisualizerPoint,
) {
  return points.map((current, pointIndex) => (
    pointIndex === index ? point : current
  ));
}

export function nearestPointIndex(
  points: VisualizerPoint[],
  target: VisualizerPoint,
  radius: number,
) {
  let nearest = -1;
  let distance = radius;
  points.forEach((point, index) => {
    const next = Math.hypot(point[0] - target[0], point[1] - target[1]);
    if (next <= distance) {
      distance = next;
      nearest = index;
    }
  });
  return nearest;
}
