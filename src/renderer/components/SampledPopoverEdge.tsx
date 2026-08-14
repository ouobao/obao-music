import type { CSSProperties } from 'react';

interface SampledPopoverEdgeProps {
  imageUrl: string;
  rect: {
    width: number;
    height: number;
  };
  spread: number;
  style?: CSSProperties;
}

interface DrawSampledPopoverEdgeOptions {
  width: number;
  height: number;
  spread: number;
}

export function SampledPopoverEdge({ imageUrl, rect, spread, style }: SampledPopoverEdgeProps) {
  void imageUrl;
  void rect;
  void spread;
  void style;

  return null;
}

export function drawSampledPopoverEdge(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  options: DrawSampledPopoverEdgeOptions
) {
  void context;
  void image;
  void options;
}
