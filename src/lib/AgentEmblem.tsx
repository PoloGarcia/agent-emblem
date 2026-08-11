import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAgentEmblemAIState } from "./ai";
import { useAgentEmblemColors } from "./color";
import type { AgentEmblemProps, AgentEmblemShape, DotPoint, ThinkingStyle } from "./types";

const TAU = Math.PI * 2;
const RASTER_SIDE = 1024;
const SOURCE_FIT = 0.96;
const MARK_LIVE_AREA = 0.84;
const TRANSPARENT_ALPHA = 12;
const CONTENT_ALPHA = 10;
const SOURCE_CACHE_LIMIT = 6;
// Agent moments need to read quickly at compact UI sizes. Keep the signal loops
// brisk while leaving the idle drift deliberately quiet.
const THINKING_TRACE_PERIOD_MS = 2600;
const THINKING_BOUNCE_PERIOD_MS = 900;
const LOADING_PERIOD_MS = 2200;
const COMPOSING_PERIOD_MS = 2000;
// Researching benefits from a slower, more deliberate inspection than the
// other agent moments: each direction gets time to illuminate the full mark.
const RESEARCHING_PERIOD_MS = 4800;

function sourceToUrl(source: string) {
  const trimmed = source.trim();
  if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }
  return source;
}

function isSvgSource(source: string) {
  const trimmed = source.trim().toLowerCase();
  return (
    trimmed.startsWith("<svg") ||
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("data:image/svg+xml") ||
    /\.svg(?:[?#]|$)/.test(trimmed)
  );
}

type SampledMark = { points: DotPoint[]; density: number; spacing: number };
type RasterBounds = { left: number; top: number; right: number; bottom: number };
type PreparedSource = { inkMask: Uint8Array; side: number; bounds: RasterBounds | null; complexity: number };

const preparedSourceCache = new Map<string, Promise<PreparedSource>>();

function clampDensity(density: number) {
  return Math.round(Math.max(4, Math.min(64, Number.isFinite(density) ? density : 20)));
}

function smoothstep(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Returns an anti-aliased ink mask. Transparent artwork keeps its alpha exactly;
 * fully opaque sources get a conservative corner-matte removal when one is evident.
 */
function getInkMask(pixels: Uint8ClampedArray, side: number, sourceBounds: RasterBounds) {
  const pixelCount = side * side;
  const alphaMask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    alphaMask[index] = pixels[index * 4 + 3];
  }
  let transparentPixels = 0;
  for (let y = sourceBounds.top; y < sourceBounds.bottom; y += 1) {
    for (let x = sourceBounds.left; x < sourceBounds.right; x += 1) {
      if (alphaMask[y * side + x] <= TRANSPARENT_ALPHA) transparentPixels += 1;
    }
  }
  const sourcePixelCount = Math.max(1, (sourceBounds.right - sourceBounds.left) * (sourceBounds.bottom - sourceBounds.top));
  // Alpha is the least surprising source of truth for normal transparent SVGs/PNGs.
  if (transparentPixels > sourcePixelCount * 0.002) return alphaMask;

  const cornerValues: number[][] = [[], [], []];
  const inset = Math.max(2, Math.round(Math.min(sourceBounds.right - sourceBounds.left, sourceBounds.bottom - sourceBounds.top) * 0.025));
  const sampleCorner = (startX: number, startY: number) => {
    for (let y = startY; y < startY + inset; y += 2) {
      for (let x = startX; x < startX + inset; x += 2) {
        const offset = (y * side + x) * 4;
        cornerValues[0].push(pixels[offset]);
        cornerValues[1].push(pixels[offset + 1]);
        cornerValues[2].push(pixels[offset + 2]);
      }
    }
  };
  sampleCorner(sourceBounds.left, sourceBounds.top);
  sampleCorner(sourceBounds.right - inset, sourceBounds.top);
  sampleCorner(sourceBounds.left, sourceBounds.bottom - inset);
  sampleCorner(sourceBounds.right - inset, sourceBounds.bottom - inset);
  const background = cornerValues.map(median);
  const matteMask = new Uint8Array(pixelCount);
  let inkPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const difference = Math.hypot(
      pixels[offset] - background[0],
      pixels[offset + 1] - background[1],
      pixels[offset + 2] - background[2],
    );
    const coverage = smoothstep(18, 64, difference) * (alphaMask[index] / 255);
    matteMask[index] = Math.round(coverage * 255);
    if (coverage > 0.08) inkPixels += 1;
  }
  // Do not mistake a full-bleed illustration, gradient, or single-color source for a matte.
  return inkPixels > 4 && inkPixels < sourcePixelCount * 0.9 ? matteMask : alphaMask;
}

function measureComplexity(inkMask: Uint8Array, side: number, bounds: RasterBounds) {
  const step = Math.max(4, Math.round(Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) / 96));
  const columns = Math.ceil((bounds.right - bounds.left) / step);
  const rows = Math.ceil((bounds.bottom - bounds.top) / step);
  const coarseMask = new Uint8Array(columns * rows);
  let filled = 0;
  let transitions = 0;
  for (let row = 0; row < rows; row += 1) {
    const top = bounds.top + row * step;
    const bottom = Math.min(bounds.bottom, top + step);
    for (let column = 0; column < columns; column += 1) {
      const left = bounds.left + column * step;
      const right = Math.min(bounds.right, left + step);
      let mass = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) mass += inkMask[y * side + x];
      }
      const occupied = mass / Math.max(1, (right - left) * (bottom - top) * 255) > 0.025;
      coarseMask[row * columns + column] = occupied ? 1 : 0;
      if (occupied) filled += 1;
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const current = coarseMask[row * columns + column];
      const right = column + 1 < columns ? coarseMask[row * columns + column + 1] : 0;
      const below = row + 1 < rows ? coarseMask[(row + 1) * columns + column] : 0;
      if (current !== right) transitions += 1;
      if (current !== below) transitions += 1;
    }
  }
  let components = 0;
  const visited = new Uint8Array(coarseMask.length);
  for (let index = 0; index < coarseMask.length; index += 1) {
    if (!coarseMask[index] || visited[index]) continue;
    components += 1;
    const queue = [index];
    visited[index] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor];
      const x = cell % columns;
      const y = Math.floor(cell / columns);
      for (const next of [cell - 1, cell + 1, cell - columns, cell + columns]) {
        const isAdjacentRow = next >= 0 && next < coarseMask.length && Math.abs((next % columns) - x) + Math.abs(Math.floor(next / columns) - y) === 1;
        if (isAdjacentRow && coarseMask[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
    }
  }
  const contourRatio = transitions / Math.max(filled * 2, 1);
  return Math.max(0, Math.min(1, (contourRatio - 0.025) / 0.25 + Math.max(0, components - 1) * 0.08));
}

function suggestDensity(complexity: number, size: number) {
  // The base densities keep simple silhouettes calm. A bounded detail budget is
  // spent only on intricate outlines, thin strokes, holes, or separate modules.
  const baseDensity = Math.max(7, size <= 24 ? Math.round(size / 2.25) : Math.max(12, Math.round(size / 3)));
  const detailBudget = size <= 24 ? Math.max(2, Math.round(size / 6)) : Math.max(4, Math.round(size / 5));
  return Math.min(34, baseDensity + Math.round(detailBudget * complexity));
}

function prepareSource(source: string): Promise<PreparedSource> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      try {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) throw new Error("AgentEmblem received an image with no drawable dimensions.");
        const side = RASTER_SIDE;
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("AgentEmblem could not create a sampling canvas.");

        // A high-resolution probe gives SVG and PNG inputs one stable coverage space.
        // The small inset prevents antialiasing at the source edge from being clipped.
        const ratio = Math.min(side / sourceWidth, side / sourceHeight) * SOURCE_FIT;
        const width = Math.max(1, Math.round(sourceWidth * ratio));
        const height = Math.max(1, Math.round(sourceHeight * ratio));
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        const drawX = (side - width) / 2;
        const drawY = (side - height) / 2;
        let bitmap: ImageBitmap | undefined;
        try {
          // Let the canvas rasterizer resolve vectors directly at the 1024px probe size.
          // Some browsers accept legacy SVGs as images but return a blank ImageBitmap.
          if (isSvgSource(source)) {
            context.drawImage(image, drawX, drawY, width, height);
          } else {
            // Raster sources get an explicit high-quality bitmap resize before sampling.
            bitmap = await createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
            context.drawImage(bitmap, drawX, drawY);
          }
        } catch {
          context.drawImage(image, drawX, drawY, width, height);
        } finally {
          bitmap?.close();
        }
        let pixels = context.getImageData(0, 0, side, side).data;
        // A few browser decoders resolve an SVG-backed ImageBitmap without throwing,
        // yet return a fully transparent frame. Detect that silent failure and retry
        // from the decoded image element, which also covers SVGs behind blob URLs.
        let bitmapHasVisiblePixels = !bitmap;
        if (bitmap) {
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] <= TRANSPARENT_ALPHA) continue;
            bitmapHasVisiblePixels = true;
            break;
          }
        }
        if (!bitmapHasVisiblePixels) {
          context.clearRect(0, 0, side, side);
          context.drawImage(image, drawX, drawY, width, height);
          pixels = context.getImageData(0, 0, side, side).data;
        }
        const inkMask = getInkMask(pixels, side, {
          left: Math.max(0, Math.floor(drawX)),
          top: Math.max(0, Math.floor(drawY)),
          right: Math.min(side, Math.ceil(drawX + width)),
          bottom: Math.min(side, Math.ceil(drawY + height)),
        });
        let minContentX = side;
        let minContentY = side;
        let maxContentX = -1;
        let maxContentY = -1;
        for (let y = 0; y < side; y += 1) {
          for (let x = 0; x < side; x += 1) {
            if (inkMask[y * side + x] <= CONTENT_ALPHA) continue;
            minContentX = Math.min(minContentX, x);
            minContentY = Math.min(minContentY, y);
            maxContentX = Math.max(maxContentX, x);
            maxContentY = Math.max(maxContentY, y);
          }
        }
        if (maxContentX < 0) return resolve({ inkMask, side, bounds: null, complexity: 0 });

        const bounds = {
          left: minContentX,
          top: minContentY,
          right: maxContentX + 1,
          bottom: maxContentY + 1,
        };
        resolve({ inkMask, side, bounds, complexity: measureComplexity(inkMask, side, bounds) });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("AgentEmblem could not sample this image."));
      }
    };
    image.onerror = () => reject(new Error("AgentEmblem could not read this image."));
    image.src = sourceToUrl(source);
  });
}

function getPreparedSource(source: string) {
  const cached = preparedSourceCache.get(source);
  if (cached) return cached;
  const prepared = prepareSource(source).catch((error) => {
    preparedSourceCache.delete(source);
    throw error;
  });
  preparedSourceCache.set(source, prepared);
  if (preparedSourceCache.size > SOURCE_CACHE_LIMIT) {
    const oldestSource = preparedSourceCache.keys().next().value;
    if (oldestSource) preparedSourceCache.delete(oldestSource);
  }
  return prepared;
}

async function getPoints(source: string, requestedDensity: number | "auto", size: number): Promise<SampledMark> {
  const { inkMask, side, bounds, complexity } = await getPreparedSource(source);
  const density = clampDensity(typeof requestedDensity === "number" ? requestedDensity : suggestDensity(complexity, size));
  const normalizedSpacing = MARK_LIVE_AREA / density;
  if (!bounds) return { points: [], density, spacing: normalizedSpacing };

  const contentWidth = bounds.right - bounds.left;
  const contentHeight = bounds.bottom - bounds.top;
  const contentExtent = Math.max(contentWidth, contentHeight);
  const spacing = Math.max(2, contentExtent / density);
  const columns = Math.ceil(contentWidth / spacing);
  const rows = Math.ceil(contentHeight / spacing);
  const candidates: Array<Omit<DotPoint, "x" | "y" | "u" | "v" | "edge"> & { sourceX: number; sourceY: number; gridX: number; gridY: number }> = [];
  const occupied = new Set<string>();

  // Every cell integrates all of its pixels, then places one dot at the ink-weighted centroid.
  // This preserves narrow strokes and diagonals without turning the mark into a literal raster trace.
  for (let gridY = 0; gridY < rows; gridY += 1) {
    const top = Math.floor(bounds.top + gridY * spacing);
    const bottom = Math.min(bounds.bottom, Math.floor(bounds.top + (gridY + 1) * spacing));
    for (let gridX = 0; gridX < columns; gridX += 1) {
      const left = Math.floor(bounds.left + gridX * spacing);
      const right = Math.min(bounds.right, Math.floor(bounds.left + (gridX + 1) * spacing));
      let mass = 0;
      let weightedX = 0;
      let weightedY = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const coverage = inkMask[y * side + x] / 255;
          mass += coverage;
          weightedX += (x + 0.5) * coverage;
          weightedY += (y + 0.5) * coverage;
        }
      }
      const area = Math.max(1, (right - left) * (bottom - top));
      const coverage = mass / area;
      if (coverage < 0.012) continue;
      candidates.push({
        sourceX: weightedX / mass,
        sourceY: weightedY / mass,
        weight: 0.7 + Math.sqrt(Math.min(1, coverage)) * 0.3,
        seed: ((gridX * 19 + gridY * 31) % 997) / 997,
        gridX,
        gridY,
      });
      occupied.add(`${gridX}:${gridY}`);
    }
  }
  if (!candidates.length) return { points: [], density, spacing: normalizedSpacing };
  const contentCenterX = (bounds.left + bounds.right) / 2;
  const contentCenterY = (bounds.top + bounds.bottom) / 2;
  const positioned = candidates.map((point) => ({
    ...point,
    x: 0.5 + ((point.sourceX - contentCenterX) / contentExtent) * MARK_LIVE_AREA,
    y: 0.5 + ((point.sourceY - contentCenterY) / contentExtent) * MARK_LIVE_AREA,
  }));
  const minX = Math.min(...positioned.map((point) => point.x));
  const maxX = Math.max(...positioned.map((point) => point.x));
  const minY = Math.min(...positioned.map((point) => point.y));
  const maxY = Math.max(...positioned.map((point) => point.y));
  const visibleWidth = Math.max(maxX - minX, 0.001);
  const visibleHeight = Math.max(maxY - minY, 0.001);
  return {
    density,
    spacing: normalizedSpacing,
    points: positioned.map(({ gridX, gridY, sourceX: _sourceX, sourceY: _sourceY, ...point }) => ({
      ...point,
      u: (point.x - minX) / visibleWidth,
      v: (point.y - minY) / visibleHeight,
      edge: [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, y]) => !occupied.has(`${gridX + x}:${gridY + y}`)),
    })),
  };
}

function fillPixelAlignedRect(context: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number, pixelScale: number) {
  const snappedLeft = Math.round(left * pixelScale) / pixelScale;
  const snappedTop = Math.round(top * pixelScale) / pixelScale;
  const snappedRight = Math.round(right * pixelScale) / pixelScale;
  const snappedBottom = Math.round(bottom * pixelScale) / pixelScale;
  context.fillRect(
    snappedLeft,
    snappedTop,
    Math.max(1 / pixelScale, snappedRight - snappedLeft),
    Math.max(1 / pixelScale, snappedBottom - snappedTop),
  );
}

function drawPoint(context: CanvasRenderingContext2D, shape: AgentEmblemShape, x: number, y: number, radius: number, pixelScale: number, alignToPixels: boolean) {
  if (shape === "square") {
    if (alignToPixels) fillPixelAlignedRect(context, x - radius, y - radius, x + radius, y + radius, pixelScale);
    else context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    return;
  }
  if (shape === "diamond") {
    context.beginPath();
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
    context.closePath();
    context.fill();
    return;
  }
  if (shape === "plus") {
    const arm = radius * 0.48;
    if (alignToPixels) {
      fillPixelAlignedRect(context, x - radius, y - arm, x + radius, y + arm, pixelScale);
      fillPixelAlignedRect(context, x - arm, y - radius, x + arm, y + radius, pixelScale);
    } else {
      context.fillRect(x - radius, y - arm, radius * 2, arm * 2);
      context.fillRect(x - arm, y - radius, arm * 2, radius * 2);
    }
    return;
  }
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
}

function bounceLift(time: number, point: DotPoint) {
  // A continuous phase rolls across the mark rather than stepping between rigid columns.
  const organicPhase = Math.sin(time * 0.0011 + point.seed * TAU) * 0.035;
  const phase = TAU * (time / THINKING_BOUNCE_PERIOD_MS - point.u * 0.72 - point.v * 0.06 + organicPhase);
  const lift = (Math.sin(phase) + 1) / 2;
  // Smoothstep gives a zero-velocity takeoff and landing for every particle.
  const organicHeight = 0.92 + Math.sin(time * 0.0008 + point.seed * TAU * 1.7) * 0.08;
  return lift * lift * (3 - 2 * lift) * organicHeight;
}

function composingStroke(point: DotPoint, time: number, size: number) {
  const progress = (time % COMPOSING_PERIOD_MS) / COMPOSING_PERIOD_MS;
  // Preserve the handwriting metaphor at every optical tier: tiny marks need
  // fewer, longer strokes while larger marks can resolve more lines of ink.
  const lineCount = size <= 20 ? 2 : size <= 32 ? 3 : 4;
  const lineIndex = Math.min(lineCount - 1, Math.floor(point.v * lineCount));
  const positionInLine = point.v * lineCount - lineIndex;
  // Keep the broad strokes, but open a small soft gutter between them so the
  // result reads as separate lines of writing instead of one continuous block.
  const gapInset = size <= 20 ? 0.055 : size <= 32 ? 0.07 : 0.085;
  const organicGap = gapInset * (0.9 + Math.sin(point.u * TAU * 1.25 + lineIndex * 1.4) * 0.1);
  const topEdge = lineIndex === 0 ? 1 : smoothstep(0, organicGap, positionInLine);
  const bottomEdge = lineIndex === lineCount - 1 ? 1 : 1 - smoothstep(1 - organicGap, 1, positionInLine);
  const lineBlock = topEdge * bottomEdge;
  const linePhase = progress * lineCount - lineIndex;
  // Subtle accelerations and hesitations keep the nib moving forward while
  // avoiding the mechanically identical velocity of a perfect digital sweep.
  const activePhase = Math.max(0, Math.min(1, linePhase));
  const rhythmEnvelope = Math.sin(activePhase * Math.PI);
  const handRhythm = rhythmEnvelope * (
    Math.sin(activePhase * TAU * 1.6 + lineIndex * 1.25) * 0.026
    + Math.sin(activePhase * TAU * 3.1 + lineIndex * 0.45) * 0.01
  );
  const penProgress = smoothstep(0.02, 0.82, linePhase + handRhythm);
  const isWriting = smoothstep(-0.02, 0.04, linePhase) * (1 - smoothstep(0.82, 0.94, linePhase));
  const distanceFromNib = point.u - penProgress;
  const nib = Math.exp(-(distanceFromNib * distanceFromNib) / 0.0035) * isWriting * lineBlock;
  const wetInkDistance = point.u - (penProgress - 0.075);
  const wetInk = Math.exp(-(wetInkDistance * wetInkDistance) / 0.016) * isWriting * lineBlock;
  const lineHasStarted = smoothstep(-0.035, 0.025, linePhase);
  const written = smoothstep(-0.12, 0.015, penProgress - point.u) * lineHasStarted * lineBlock;
  // Fade only after the last stroke has nearly completed so the next sheet can
  // begin without a visible snap at the loop boundary.
  const pageFade = 1 - smoothstep(0.94, 1, progress);
  return { lineIndex, nib, pageFade, penProgress, wetInk, written };
}

function researchingBeam(point: DotPoint, time: number) {
  const progress = (time % RESEARCHING_PERIOD_MS) / RESEARCHING_PERIOD_MS;
  const returning = progress >= 0.5;
  const travel = returning ? (1 - progress) * 2 : progress * 2;
  // Each pass keeps moving forward but has its own small accelerations and
  // hesitations. The envelope returns the variation to zero at both ends so
  // the flashlight turns around without a jump or a clipped arc.
  const rhythmOffset = returning ? 1.35 : 0.2;
  const rhythmEnvelope = Math.sin(travel * Math.PI);
  const organicRhythm = rhythmEnvelope * (
    Math.sin(travel * TAU * 1.2 + rhythmOffset) * 0.025
    + Math.sin(travel * TAU * 2.8 + rhythmOffset * 0.7) * 0.008
  );
  const organicTravel = Math.max(0, Math.min(1, travel + organicRhythm));
  const sweep = smoothstep(0, 1, organicTravel);
  // Keep the flashlight aimed into the emblem so the whole pass reveals
  // something, instead of spending most of a 180° rotation outside the mark.
  const sourceX = 0.5
    + Math.sin(progress * TAU) * 0.014
    + Math.sin(progress * TAU * 3 + 0.8) * 0.005;
  const sourceY = 1.28 + Math.sin(progress * TAU * 2 + 0.4) * 0.008;
  const aimX = 0.08 + sweep * 0.84;
  const aimY = 0.18 + Math.sin(progress * TAU * 2 + 0.4) * 0.018;
  const beamAngle = Math.atan2(aimY - sourceY, aimX - sourceX);
  const pointAngle = Math.atan2(point.v - sourceY, point.u - sourceX);
  const angleDelta = Math.atan2(Math.sin(pointAngle - beamAngle), Math.cos(pointAngle - beamAngle));
  const core = Math.exp(-(angleDelta * angleDelta) / 0.0065);
  const spill = Math.exp(-(angleDelta * angleDelta) / 0.04);
  return Math.min(1, core * 0.82 + spill * 0.34);
}

function stateOffset(point: DotPoint, state: NonNullable<AgentEmblemProps["state"]>, time: number, size: number, thinkingStyle: ThinkingStyle) {
  const phase = point.seed * TAU;
  const cx = point.x - 0.5;
  const cy = point.y - 0.5;
  const radius = Math.sqrt(cx * cx + cy * cy);
  const unit = size / 480;

  if (state === "thinking") {
    if (thinkingStyle === "bounce") {
      return { x: 0, y: -bounceLift(time, point) * 7 * unit };
    }
    const drift = Math.sin(time * 0.0016 + phase + radius * 10) * (2.5 + point.seed * 3.2) * unit;
    return { x: Math.cos(phase + time * 0.0012) * drift, y: Math.sin(phase + time * 0.0012) * drift };
  }
  if (state === "loading") {
    // The mark is drawn from its centre outward, with only the fresh ink lifting.
    const progress = (time % LOADING_PERIOD_MS) / LOADING_PERIOD_MS;
    const drawProgress = smoothstep(0.02, 0.8, progress);
    const radialOrder = Math.min(1, radius / 0.72);
    const freshInk = Math.exp(-((radialOrder - drawProgress) * (radialOrder - drawProgress)) / 0.008);
    return { x: 0, y: -freshInk * 1.6 * unit };
  }
  if (state === "composing") {
    const stroke = composingStroke(point, time, size);
    const nibWobble = Math.sin(stroke.penProgress * TAU * 1.7 + stroke.lineIndex * 1.1) * 0.72
      + Math.sin(stroke.penProgress * TAU * 4.3 + stroke.lineIndex * 0.55) * 0.28;
    const baselineDrift = (
      Math.sin(point.u * TAU * 1.15 + stroke.lineIndex * 1.35) * 0.34
      + Math.sin(point.u * TAU * 2.9 + point.seed * 0.7) * 0.11
    ) * stroke.written * stroke.pageFade;
    const inkTexture = Math.sin(point.u * TAU * 4.8 + stroke.lineIndex * 1.4 + point.seed) * stroke.wetInk;
    return {
      x: stroke.nib * (1.08 + Math.sin(stroke.penProgress * TAU * 2.6 + stroke.lineIndex) * 0.18) * unit,
      y: (stroke.nib * (-2.55 + nibWobble * 0.62) + baselineDrift + inkTexture * 0.18) * unit,
    };
  }
  if (state === "talking") {
    // Speech radiates horizontally from the centre, like successive syllables
    // leaving the mark. Keeping the vertical component small preserves its form.
    const syllable = Math.max(0, Math.sin(time * 0.006 - Math.abs(cx) * 42 + phase * 0.18));
    const direction = cx === 0 ? 0 : Math.sign(cx);
    return {
      x: direction * syllable * (4.8 + point.seed * 2.2) * unit,
      y: Math.sin(time * 0.006 - Math.abs(cx) * 42 + phase) * 0.45 * unit,
    };
  }
  if (state === "researching") {
    // The moving beam carries this state; the underlying mark stays still and readable.
    return { x: 0, y: 0 };
  }
  if (state === "listening") {
    // Listening gathers gently inward: a calm, receptive counterpoint to talking.
    const incoming = Math.max(0, Math.sin(time * 0.0044 + radius * 30 + phase * 0.12));
    const pull = incoming * (2.9 + point.seed * 1.2) * unit;
    return { x: radius ? -(cx / radius) * pull : 0, y: radius ? -(cy / radius) * pull : 0 };
  }
  return {
    x: Math.sin(time * 0.001 + phase) * 0.65 * unit,
    y: Math.cos(time * 0.0009 + phase) * 0.65 * unit,
  };
}

function stateEmphasis(point: DotPoint, state: NonNullable<AgentEmblemProps["state"]>, time: number, size: number, animateVisibility: boolean, thinkingStyle: ThinkingStyle) {
  if (!animateVisibility || state === "idle") return 0;
  const radius = Math.hypot(point.u - 0.5, point.v - 0.5);
  if (state === "thinking") {
    if (thinkingStyle === "bounce") {
      return bounceLift(time, point);
    }
    // A focused tracer travels the sampled outer contour of the mark.
    const tracer = (time % THINKING_TRACE_PERIOD_MS) / THINKING_TRACE_PERIOD_MS;
    const angle = (Math.atan2(point.v - 0.5, point.u - 0.5) / TAU + 1) % 1;
    const distance = Math.min(Math.abs(angle - tracer), 1 - Math.abs(angle - tracer));
    const contourTrace = point.edge ? Math.exp(-(distance * distance) / 0.012) : 0;
    return contourTrace;
  }
  if (state === "loading") {
    // Each pass materializes the actual sampled mark, then lets it rest before reset.
    const progress = (time % LOADING_PERIOD_MS) / LOADING_PERIOD_MS;
    const drawProgress = smoothstep(0.02, 0.8, progress);
    const radialOrder = Math.min(1, radius / 0.72);
    const drawn = smoothstep(radialOrder - 0.085, radialOrder + 0.025, drawProgress);
    const settle = 1 - smoothstep(0.8, 1, progress);
    return drawn * settle;
  }
  if (state === "composing") {
    const stroke = composingStroke(point, time, size);
    const penPressure = 0.84
      + Math.sin(stroke.penProgress * TAU * 1.8 + stroke.lineIndex * 0.9) * 0.1
      + Math.sin(stroke.penProgress * TAU * 4.1 + point.seed * 0.8) * 0.05;
    return Math.max(stroke.nib * penPressure, stroke.wetInk * 0.62, stroke.written * 0.36) * stroke.pageFade;
  }
  if (state === "talking") {
    const syllable = (Math.sin(time * 0.006 - Math.abs(point.u - 0.5) * 46 + point.seed * 0.35) + 1) / 2;
    return Math.pow(syllable, 3.2);
  }
  if (state === "researching") {
    return researchingBeam(point, time);
  }
  if (state === "listening") {
    // Highlight rings travel from the edge toward the centre, then resolve softly.
    const incoming = (Math.sin(time * 0.0044 + radius * 34 + point.seed * 0.2) + 1) / 2;
    return Math.pow(incoming, 2.8);
  }
  const pulse = (Math.sin(time * 0.005 - radius * 28) + 1) / 2;
  return Math.pow(pulse, 2.2);
}

/**
 * Converts transparent SVG or PNG artwork into a canvas-rendered agent emblem.
 * It has no runtime dependencies beyond React.
 */
export function AgentEmblem({
  source,
  state = "idle",
  activity,
  color: colorProp = "#f5f5f0",
  inactiveColor: inactiveColorProp,
  colorMode = "system",
  size = 240,
  density = "auto",
  dotScale = 0.28,
  shape = "circle",
  thinkingStyle = "trace",
  animateVisibility = false,
  animateMotion = false,
  label = "Agent emblem",
  className,
}: AgentEmblemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<SampledMark>({ points: [], density: 8, spacing: MARK_LIVE_AREA / 8 });
  const [sampleRevision, setSampleRevision] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const activityState = useAgentEmblemAIState(activity);
  const resolvedState = activity ? activityState : state;
  const { color, inactiveColor, hasSecondaryInk, resolvedMode } = useAgentEmblemColors(colorProp, inactiveColorProp, colorMode);

  useEffect(() => {
    let active = true;
    getPoints(source, density, size)
      .then((mark) => {
        if (active) {
          pointsRef.current = mark;
          setSampleRevision((revision) => revision + 1);
        }
      })
      .catch(() => {
        if (active) {
          pointsRef.current = { points: [], density: 8, spacing: MARK_LIVE_AREA / 8 };
          setSampleRevision((revision) => revision + 1);
        }
      });
    return () => { active = false; };
  }, [source, density, size]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let raf = 0;
    // State changes start at a meaningful first frame instead of inheriting an
    // arbitrary phase from the page-wide requestAnimationFrame clock.
    const animationStartedAt = performance.now();

    const draw = (now: number) => {
      raf = 0;
      const scaleX = canvas.width / size;
      const scaleY = canvas.height / size;
      const pixelScale = Math.max(0.5, Math.min(scaleX, scaleY));
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      // Canvas state survives hot reloads and interrupted frames; never inherit a dimmed layer.
      context.globalAlpha = 1;
      const compactScale = size <= 40 ? Math.min(dotScale, 0.24) : dotScale;
      const pointSpacing = pointsRef.current.spacing * size;
      const shapeScale = shape === "diamond" ? 1.16 : shape === "plus" ? 1.04 : 1;
      const minimumRadius = size <= 24 ? Math.max(0.5, 0.75 / pixelScale) : Math.max(0.42, 0.7 / pixelScale);
      const distinctRadius = pointSpacing * (shape === "circle" ? 0.4 : shape === "square" ? 0.38 : 0.43);
      const baseDot = Math.min(distinctRadius, Math.max(minimumRadius, pointSpacing * compactScale) * shapeScale);
      const motionTime = reducedMotion ? 0 : Math.max(0, now - animationStartedAt);
      const points = pointsRef.current.points;
      for (const point of points) {
        const offset = animateMotion ? stateOffset(point, resolvedState, motionTime, size, thinkingStyle) : { x: 0, y: 0 };
        const x = point.x * size + offset.x;
        const y = point.y * size + offset.y;
        const pulse = resolvedState === "talking" ? 0.86 + Math.sin(motionTime * 0.009 + point.seed * 12) * 0.14 : 1;
        const emphasis = stateEmphasis(point, resolvedState, motionTime, size, animateVisibility, thinkingStyle);
        const radius = baseDot * point.weight * pulse;
        // The complete silhouette is always rendered first in the inactive ink.
        context.fillStyle = animateVisibility ? inactiveColor ?? color : color;
        const baseOpacityFloor = hasSecondaryInk
          ? resolvedState === "researching" ? 0.26 : resolvedState === "thinking" ? 0.38 : resolvedState === "loading" ? 0.4 : resolvedState === "composing" ? 0.42 : 0.48
          : resolvedState === "researching" ? 0.12 : resolvedState === "thinking" ? 0.18 : resolvedState === "loading" ? 0.2 : resolvedState === "composing" ? 0.21 : 0.24;
        const baseCompactOpacityBoost = hasSecondaryInk
          ? size <= 20 ? 0.2 : size <= 24 ? 0.13 : size <= 32 ? 0.06 : 0
          : size <= 20 ? 0.1 : size <= 24 ? 0.07 : size <= 32 ? 0.03 : 0;
        // Dark ink over a light surface retains more perceived contrast than the
        // same numeric alpha of light ink over a dark surface. A modest light-mode
        // reduction makes the resting silhouette feel equally quiet in both themes.
        const lightModeFloorScale = hasSecondaryInk ? 0.86 : 0.78;
        const lightModeBoostScale = hasSecondaryInk ? 0.85 : 0.7;
        const opacityFloor = baseOpacityFloor * (resolvedMode === "light" ? lightModeFloorScale : 1);
        const compactOpacityBoost = baseCompactOpacityBoost * (resolvedMode === "light" ? lightModeBoostScale : 1);
        const opacityCap = resolvedMode === "light"
          ? hasSecondaryInk ? 0.6 : 0.3
          : hasSecondaryInk ? 0.7 : 0.36;
        const inactiveOpacity = Math.min(opacityCap, opacityFloor + compactOpacityBoost);
        context.globalAlpha = animateVisibility ? inactiveOpacity : 1;
        drawPoint(context, shape, x, y, radius, pixelScale, !animateMotion || reducedMotion);
        // Then active particles are promoted into the primary ink without removing the base mark.
        if (animateVisibility && emphasis > 0.01) {
          context.fillStyle = color;
          context.globalAlpha = emphasis;
          const emphasisGrowth = size <= 24 ? 0.12 : size <= 40 ? 0.2 : 0.28;
          drawPoint(context, shape, x, y, radius * (1 + emphasis * emphasisGrowth), pixelScale, !animateMotion || reducedMotion);
        }
      }
      context.globalAlpha = 1;
      if (!reducedMotion) raf = requestAnimationFrame(draw);
    };

    const requestDraw = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const resizeBackingStore = (width: number, height: number) => {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      requestDraw();
    };
    const syncBackingStore = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      resizeBackingStore(bounds.width * dpr, bounds.height * dpr);
    };

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const deviceSize = entry?.devicePixelContentBoxSize?.[0];
        if (deviceSize) resizeBackingStore(deviceSize.inlineSize, deviceSize.blockSize);
        else syncBackingStore();
      });
      try {
        resizeObserver.observe(canvas, { box: "device-pixel-content-box" });
      } catch {
        resizeObserver.observe(canvas);
      }
    }
    window.addEventListener("resize", syncBackingStore);
    syncBackingStore();
    requestDraw();
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncBackingStore);
    };
  }, [animateMotion, animateVisibility, color, dotScale, hasSecondaryInk, inactiveColor, reducedMotion, resolvedMode, sampleRevision, shape, size, resolvedState, thinkingStyle]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={label}
      style={{ width: size, height: size, display: "block" } as CSSProperties}
    />
  );
}
