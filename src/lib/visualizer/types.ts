export type VisualizerLayerType = "wall" | "ceiling" | "trim" | "custom";
export type VisualizerLayerSource =
  | "gallery-approved"
  | "four-point"
  | "rectangle"
  | "polygon"
  | "ai-suggested";
export type VisualizerFinish = "matt" | "silk" | "gloss" | "texture";
export type VisualizerBlendMode = "multiply" | "overlay" | "color" | "soft-light";
export type MaskStatus = "draft" | "needs_review" | "approved";
export type VisualizerPoint = [number, number];

export type VisualizerLayerPaint = {
  shadeId: string;
  shadeCode: string;
  shadeName: string;
  shadeHex: string;
  finish: VisualizerFinish;
  opacity: number;
  blendMode: VisualizerBlendMode;
  brightness: number;
  contrast: number;
  preserveShadows: boolean;
};

export type VisualizerMaskLayer = {
  id: string;
  name: string;
  type: VisualizerLayerType;
  source: VisualizerLayerSource;
  points?: VisualizerPoint[];
  alphaMaskUrl?: string;
  originalImageWidth: number;
  originalImageHeight: number;
  confidence?: number;
  needsReview: boolean;
  locked?: boolean;
  visible: boolean;
  paint?: VisualizerLayerPaint;
};

export type VisualizerMaskDocument = {
  version: 2;
  status: MaskStatus;
  imageWidth: number;
  imageHeight: number;
  layers: VisualizerMaskLayer[];
  masks: VisualizerMaskLayer[];
  updatedAt?: string;
  updatedBy?: string;
};

export type CanvasViewport = {
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};
