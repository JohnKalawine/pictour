import { APP_VERSION } from '../lib/appVersion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChromaAsset, ChromaComposition, Photo, PhotoSession, SaveChromaRenderInput } from '../lib/types';
import { ProtectedPreview } from '../components/ProtectedPreview';
import { backgroundRemovalModes, removeBackgroundWithAi, type BackgroundRemovalMode } from '../lib/backgroundRemoval';

type ChromaStudioProps = {
  sessions: PhotoSession[];
  selectedSessionCode: string;
  photos: Photo[];
  allowAiBackgroundRemoval?: boolean;
  chromaAssets?: ChromaAsset[];
  companyName?: string;
  currentLocationName?: string;
  onSessionChange: (sessionCode: string) => void;
  onSaveChromaRender: (input: SaveChromaRenderInput) => Promise<void>;
};

type BackgroundPreset = {
  id: string;
  name: string;
  description: string;
  category: 'turismo' | 'premium' | 'aventura' | 'editorial' | 'custom';
  accent: string;
  recommendedTemplate?: string;
};

type OutputPreset = {
  id: string;
  name: string;
  width: number;
  height: number;
  description: string;
};

type TemplateOverlay = 'none' | 'classic-postcard' | 'premium-poster' | 'adventure-frame' | 'luxury-cover';

type StudioTemplate = {
  id: string;
  name: string;
  description: string;
  badge: string;
  backgroundId: string;
  outputPresetId: string;
  overlay: TemplateOverlay;
  controls: Partial<ChromaControls>;
};

type ChromaControls = {
  subjectX: number;
  subjectY: number;
  subjectScale: number;
  subjectRotation: number;
  backgroundX: number;
  backgroundY: number;
  backgroundScale: number;
  backgroundBlur: number;
  keyThreshold: number;
  keySoftness: number;
  spillReduction: number;
  edgeCleanup: number;
  edgeFeather: number;
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  shadow: number;
  overlayIntensity: number;
  overlayX: number;
  overlayY: number;
  overlayScale: number;
  overlayRotation: number;
};

type RenderOptions = {
  output: OutputPreset;
  overlay: TemplateOverlay;
  companyName?: string;
  customBackgroundImage?: HTMLImageElement | null;
  customOverlayImage?: HTMLImageElement | null;
  compareOriginal?: boolean;
};

const outputPresets: OutputPreset[] = [
  { id: 'digital-wide', name: 'Digital 3:2', width: 1440, height: 960, description: 'Padrão para download digital.' },
  { id: 'vertical-story', name: 'Story 9:16', width: 1080, height: 1920, description: 'Ideal para Instagram/WhatsApp.' },
  { id: 'square-feed', name: 'Feed quadrado', width: 1200, height: 1200, description: 'Formato social e lembrança digital.' },
  { id: 'print-10x15', name: 'Impressão 10x15', width: 1800, height: 1200, description: 'Proporção de foto impressa.' },
  { id: 'print-15x20', name: 'Impressão 15x20', width: 2400, height: 1800, description: 'Formato ampliado 4:3 para venda premium.' }
];

const backgroundPresets: BackgroundPreset[] = [
  { id: 'falls-blue', name: 'Cataratas azul', description: 'Céu claro, água e queda ao fundo', category: 'turismo', accent: 'linear-gradient(135deg, #66d9ff, #0759c7)', recommendedTemplate: 'iguazu-postcard' },
  { id: 'falls-night', name: 'Cataratas noturna', description: 'Quedas com luz azul e atmosfera premium', category: 'premium', accent: 'linear-gradient(135deg, #111827, #2563eb)', recommendedTemplate: 'premium-night' },
  { id: 'jungle-premium', name: 'Selva premium', description: 'Folhagem escura com luz cinematográfica', category: 'aventura', accent: 'linear-gradient(135deg, #19a974, #063b24)', recommendedTemplate: 'jungle-adventure' },
  { id: 'sunset-boat', name: 'Barco pôr do sol', description: 'Rio quente com sol baixo', category: 'turismo', accent: 'linear-gradient(135deg, #ffb703, #c2410c)', recommendedTemplate: 'sunset-poster' },
  { id: 'snow-mountain', name: 'Montanha nevada', description: 'Cenário frio com montanhas', category: 'editorial', accent: 'linear-gradient(135deg, #e0f2fe, #2563eb)' },
  { id: 'studio-white', name: 'Estúdio branco', description: 'Fundo clean para foto premium', category: 'editorial', accent: 'linear-gradient(135deg, #ffffff, #dbeafe)', recommendedTemplate: 'luxury-clean' }
];

const studioTemplates: StudioTemplate[] = [];

const defaultControls: ChromaControls = {
  subjectX: 0,
  subjectY: 30,
  subjectScale: 86,
  subjectRotation: 0,
  backgroundX: 0,
  backgroundY: 0,
  backgroundScale: 100,
  backgroundBlur: 0,
  keyThreshold: 46,
  keySoftness: 34,
  spillReduction: 64,
  edgeCleanup: 56,
  edgeFeather: 18,
  brightness: 102,
  contrast: 104,
  saturation: 104,
  temperature: 0,
  shadow: 54,
  overlayIntensity: 68,
  overlayX: 0,
  overlayY: 0,
  overlayScale: 100,
  overlayRotation: 0
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não consegui carregar a imagem.'));
    image.src = src;
  });
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return loadImage(canvas.toDataURL('image/png'));
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, canvasWidth: number, canvasHeight: number, scaleMultiplier = 1, offsetX = 0, offsetY = 0) {
  const sourceWidth = image instanceof HTMLImageElement ? (image.naturalWidth || image.width) : Number((image as HTMLCanvasElement).width);
  const sourceHeight = image instanceof HTMLImageElement ? (image.naturalHeight || image.height) : Number((image as HTMLCanvasElement).height);
  const coverScale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight) * scaleMultiplier;
  const drawWidth = sourceWidth * coverScale;
  const drawHeight = sourceHeight * coverScale;
  const x = (canvasWidth - drawWidth) / 2 + offsetX;
  const y = (canvasHeight - drawHeight) / 2 + offsetY;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawBackground(ctx: CanvasRenderingContext2D, preset: BackgroundPreset, controls: ChromaControls, width: number, height: number, customBackgroundImage?: HTMLImageElement | null) {
  ctx.save();
  ctx.fillStyle = '#0759c7';
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2 + controls.backgroundX, height / 2 + controls.backgroundY);
  const backgroundScale = controls.backgroundScale / 100;
  ctx.scale(backgroundScale, backgroundScale);
  ctx.translate(-width / 2, -height / 2);

  if (customBackgroundImage) {
    ctx.save();
    if (controls.backgroundBlur > 0) ctx.filter = `blur(${controls.backgroundBlur}px)`;
    drawCoverImage(ctx, customBackgroundImage, width, height, 1.02, 0, 0);
    ctx.restore();
  } else if (preset.id === 'falls-night') {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#030712');
    sky.addColorStop(0.44, '#0f2a59');
    sky.addColorStop(1, '#020617');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 120; index += 1) {
      const x = (index * 97) % width;
      const y = (index * 41) % Math.floor(height * 0.5);
      ctx.fillStyle = `rgba(255,255,255,${0.08 + (index % 7) * 0.025})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.1 + (index % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const glow = ctx.createRadialGradient(width * 0.58, height * 0.34, 20, width * 0.58, height * 0.34, width * 0.56);
    glow.addColorStop(0, 'rgba(56,189,248,0.38)');
    glow.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 4; index += 1) {
      const x = width * (0.32 + index * 0.12);
      ctx.fillStyle = `rgba(219,234,254,${0.58 - index * 0.08})`;
      ctx.fillRect(x, height * 0.18 + index * 28, width * 0.07, height * 0.55);
    }

    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.70);
    ctx.lineTo(width * 0.18, height * 0.52);
    ctx.lineTo(width * 0.42, height * 0.65);
    ctx.lineTo(width * 0.68, height * 0.48);
    ctx.lineTo(width, height * 0.66);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  } else if (preset.id === 'jungle-premium') {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0f5132');
    sky.addColorStop(0.5, '#0b2f24');
    sky.addColorStop(1, '#03180f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 26; index += 1) {
      const x = (index * 83) % width;
      const y = 80 + ((index * 67) % Math.max(420, height - 120));
      const size = 110 + ((index * 29) % 160);
      ctx.fillStyle = index % 2 ? 'rgba(28, 185, 112, 0.34)' : 'rgba(8, 83, 52, 0.72)';
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.38, size * 0.18, (index % 8) * 0.44, 0, Math.PI * 2);
      ctx.fill();
    }

    const light = ctx.createRadialGradient(width * 0.52, height * 0.22, 30, width * 0.52, height * 0.22, 520);
    light.addColorStop(0, 'rgba(255,255,210,0.38)');
    light.addColorStop(1, 'rgba(255,255,210,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
  } else if (preset.id === 'sunset-boat') {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#6d28d9');
    sky.addColorStop(0.38, '#fb7185');
    sky.addColorStop(0.62, '#f97316');
    sky.addColorStop(1, '#1e293b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(width * 0.72, height * 0.34, Math.min(90, width * 0.07), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(3, 7, 18, 0.64)';
    ctx.fillRect(0, height * 0.56, width, height * 0.44);
    for (let y = height * 0.61; y < height; y += 28) {
      ctx.strokeStyle = 'rgba(255, 237, 213, 0.23)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * 0.25, y - 26, width * 0.55, y + 26, width, y - 10);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.beginPath();
    ctx.moveTo(width * 0.18, height * 0.70);
    ctx.lineTo(width * 0.34, height * 0.70);
    ctx.lineTo(width * 0.29, height * 0.76);
    ctx.lineTo(width * 0.21, height * 0.76);
    ctx.closePath();
    ctx.fill();
  } else if (preset.id === 'snow-mountain') {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#dff7ff');
    sky.addColorStop(0.56, '#93c5fd');
    sky.addColorStop(1, '#f8fafc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 7; index += 1) {
      const baseX = index * (width / 5) - width * 0.2;
      const peakY = height * (0.15 + (index % 2) * 0.08);
      ctx.fillStyle = index % 2 ? '#2563eb' : '#1e40af';
      ctx.beginPath();
      ctx.moveTo(baseX, height * 0.82);
      ctx.lineTo(baseX + width * 0.18, peakY);
      ctx.lineTo(baseX + width * 0.39, height * 0.82);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.moveTo(baseX + width * 0.18, peakY);
      ctx.lineTo(baseX + width * 0.13, peakY + height * 0.15);
      ctx.lineTo(baseX + width * 0.23, peakY + height * 0.12);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, height * 0.78, width, height * 0.22);
  } else if (preset.id === 'studio-white') {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.55, '#eff6ff');
    bg.addColorStop(1, '#c7d2fe');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const halo = ctx.createRadialGradient(width * 0.5, height * 0.42, 30, width * 0.5, height * 0.42, width * 0.45);
    halo.addColorStop(0, 'rgba(59,130,246,0.16)');
    halo.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.ellipse(width / 2, height * 0.83, width * 0.3, height * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#83d5ff');
    sky.addColorStop(0.42, '#d9f3ff');
    sky.addColorStop(0.43, '#0870b9');
    sky.addColorStop(1, '#043c68');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(width * 0.48, height * 0.22, width * 0.15, height * 0.56);
    ctx.fillStyle = 'rgba(255,255,255,0.56)';
    ctx.fillRect(width * 0.35, height * 0.30, width * 0.10, height * 0.40);
    ctx.fillRect(width * 0.66, height * 0.28, width * 0.09, height * 0.36);

    ctx.fillStyle = 'rgba(8, 84, 52, 0.68)';
    ctx.beginPath();
    ctx.moveTo(0, height * 0.52);
    ctx.lineTo(width * 0.22, height * 0.36);
    ctx.lineTo(width * 0.42, height * 0.53);
    ctx.lineTo(width * 0.7, height * 0.34);
    ctx.lineTo(width, height * 0.51);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function refineAlphaCanvas(canvas: HTMLCanvasElement, controls: ChromaControls) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const cleanup = controls.edgeCleanup / 100;
  const feather = controls.edgeFeather / 100;
  const spillPower = controls.spillReduction / 100;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    const maxNonGreen = Math.max(red, blue);

    if (alpha > 0 && alpha < 255) {
      const normalized = alpha / 255;
      const refined = Math.pow(normalized, 1 + cleanup * 0.55);
      const softened = refined * (1 - feather * 0.28) + Math.sqrt(normalized) * feather * 0.28;
      pixels[index + 3] = Math.round(clamp(softened * 255, 0, 255));
    }

    if (alpha > 0 && green > maxNonGreen + 12) {
      const allowedGreen = maxNonGreen + 8 + (1 - spillPower) * 42;
      pixels[index + 1] = Math.min(green, allowedGreen);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function createKeyedCanvas(image: HTMLImageElement, controls: ChromaControls) {
  const sourceCanvas = document.createElement('canvas');
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  sourceCanvas.width = naturalWidth;
  sourceCanvas.height = naturalHeight;

  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) return sourceCanvas;

  sourceCtx.drawImage(image, 0, 0, naturalWidth, naturalHeight);
  const imageData = sourceCtx.getImageData(0, 0, naturalWidth, naturalHeight);
  const pixels = imageData.data;
  const greenGap = 16 + controls.keyThreshold * 1.25;
  const softness = 8 + controls.keySoftness * 0.9;
  const spillPower = controls.spillReduction / 100;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const maxNonGreen = Math.max(red, blue);
    const greenDelta = green - maxNonGreen;
    const greenDominance = green > 72 && green > red * 1.1 && green > blue * 1.1;

    if (greenDominance && greenDelta > greenGap) {
      const fade = clamp((greenDelta - greenGap) / softness, 0, 1);
      pixels[index + 3] = Math.round(pixels[index + 3] * (1 - fade));
    }

    if (pixels[index + 3] > 0 && greenDominance) {
      const allowedGreen = maxNonGreen + 12 + (1 - spillPower) * 60;
      pixels[index + 1] = Math.min(green, allowedGreen);
    }
  }

  sourceCtx.putImageData(imageData, 0, 0);
  return refineAlphaCanvas(sourceCanvas, controls);
}

async function polishAiCutoutDataUrl(dataUrl: string, controls: ChromaControls) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  refineAlphaCanvas(canvas, controls);
  return canvas.toDataURL('image/png');
}

function drawOverlay(ctx: CanvasRenderingContext2D, overlay: TemplateOverlay, controls: ChromaControls, width: number, height: number, companyName = 'PicTour') {
  const intensity = controls.overlayIntensity / 100;
  if (overlay === 'none' || intensity <= 0) return;

  ctx.save();
  if (overlay === 'classic-postcard') {
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(12, Math.min(width, height) * 0.018);
    ctx.strokeRect(width * 0.035, height * 0.04, width * 0.93, height * 0.90);

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillRect(width * 0.035, height * 0.84, width * 0.93, height * 0.10);
    ctx.fillStyle = '#0f172a';
    ctx.font = `900 ${Math.max(30, width * 0.035)}px Inter, Arial`;
    ctx.fillText(companyName.toUpperCase(), width * 0.065, height * 0.905);
    ctx.font = `700 ${Math.max(18, width * 0.016)}px Inter, Arial`;
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fillText('LEMBRANÇA DIGITAL', width * 0.66, height * 0.905);
  }

  if (overlay === 'premium-poster') {
    const top = ctx.createLinearGradient(0, 0, 0, height * 0.38);
    top.addColorStop(0, `rgba(2,6,23,${0.65 * intensity})`);
    top.addColorStop(1, 'rgba(2,6,23,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, width, height * 0.46);

    const bottom = ctx.createLinearGradient(0, height * 0.65, 0, height);
    bottom.addColorStop(0, 'rgba(2,6,23,0)');
    bottom.addColorStop(1, `rgba(2,6,23,${0.72 * intensity})`);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);

    ctx.globalAlpha = intensity;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `900 ${Math.max(54, width * 0.055)}px Inter, Arial`;
    ctx.fillText(companyName.toUpperCase(), width * 0.08, height * 0.13);
    ctx.font = `700 ${Math.max(24, width * 0.024)}px Inter, Arial`;
    ctx.fillText('EXPERIÊNCIA MEMORÁVEL', width * 0.08, height * 0.18);
  }

  if (overlay === 'adventure-frame') {
    ctx.globalAlpha = intensity;
    ctx.strokeStyle = 'rgba(250,204,21,0.78)';
    ctx.lineWidth = Math.max(8, Math.min(width, height) * 0.012);
    ctx.setLineDash([28, 18]);
    ctx.strokeRect(width * 0.045, height * 0.055, width * 0.91, height * 0.89);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(2,6,23,0.68)';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width * 0.42, height);
    ctx.lineTo(width * 0.26, height * 0.86);
    ctx.lineTo(0, height * 0.91);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde047';
    ctx.font = `900 ${Math.max(28, width * 0.027)}px Inter, Arial`;
    ctx.fillText('AVENTURA', width * 0.06, height * 0.94);
  }

  if (overlay === 'luxury-cover') {
    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.26, width / 2, height / 2, width * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${0.28 * intensity})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = intensity;
    ctx.strokeStyle = 'rgba(255,255,255,0.50)';
    ctx.lineWidth = 2;
    ctx.strokeRect(width * 0.055, height * 0.06, width * 0.89, height * 0.88);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `800 ${Math.max(20, width * 0.019)}px Inter, Arial`;
    ctx.fillText(companyName.toUpperCase(), width * 0.065, height * 0.105);
  }
  ctx.restore();
}

function drawCustomOverlay(ctx: CanvasRenderingContext2D, overlayImage: HTMLImageElement | null | undefined, controls: ChromaControls, width: number, height: number) {
  if (!overlayImage || controls.overlayIntensity <= 0) return;

  const sourceWidth = overlayImage.naturalWidth || overlayImage.width;
  const sourceHeight = overlayImage.naturalHeight || overlayImage.height;
  if (!sourceWidth || !sourceHeight) return;

  const baseScale = Math.min(width / sourceWidth, height / sourceHeight);
  const finalScale = baseScale * (controls.overlayScale / 100);
  const drawWidth = sourceWidth * finalScale;
  const drawHeight = sourceHeight * finalScale;

  ctx.save();
  ctx.globalAlpha = controls.overlayIntensity / 100;
  ctx.translate(width / 2 + controls.overlayX, height / 2 + controls.overlayY);
  ctx.rotate((controls.overlayRotation * Math.PI) / 180);
  ctx.drawImage(overlayImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

function drawColorGrade(ctx: CanvasRenderingContext2D, controls: ChromaControls, width: number, height: number) {
  if (controls.temperature !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(0.22, Math.abs(controls.temperature) / 100);
    ctx.fillStyle = controls.temperature > 0 ? '#ffb86b' : '#7dd3fc';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.25, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function renderComposition(canvas: HTMLCanvasElement, image: HTMLImageElement, preset: BackgroundPreset, controls: ChromaControls, segmentationMode: BackgroundRemovalMode = 'CHROMA_COLOR', aiCutoutImage: HTMLImageElement | null = null, options?: Partial<RenderOptions>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const output = options?.output || outputPresets[0];
  const width = output.width;
  const height = output.height;
  canvas.width = width;
  canvas.height = height;

  drawBackground(ctx, preset, controls, width, height, options?.customBackgroundImage || null);

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const foregroundSource = segmentationMode === 'AI_PERSON' && aiCutoutImage ? aiCutoutImage : createKeyedCanvas(image, controls);
  const baseScale = Math.min(width / naturalWidth, height / naturalHeight) * 0.86;
  const subjectScale = baseScale * (controls.subjectScale / 100);
  const drawWidth = naturalWidth * subjectScale;
  const drawHeight = naturalHeight * subjectScale;
  const x = (width - drawWidth) / 2 + controls.subjectX;
  const y = (height - drawHeight) / 2 + controls.subjectY;
  const centerX = x + drawWidth / 2;
  const centerY = y + drawHeight / 2;

  if (controls.shadow > 0) {
    ctx.save();
    ctx.globalAlpha = controls.shadow / 100;
    ctx.fillStyle = 'rgba(0,0,0,0.44)';
    ctx.filter = `blur(${18 + controls.edgeFeather * 0.08}px)`;
    ctx.beginPath();
    ctx.ellipse(width / 2 + controls.subjectX * 0.7, y + drawHeight * 0.92, drawWidth * 0.26, Math.max(24, height * 0.035), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((controls.subjectRotation * Math.PI) / 180);
  ctx.filter = `brightness(${controls.brightness}%) contrast(${controls.contrast}%) saturate(${controls.saturation}%)`;
  ctx.drawImage(foregroundSource, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();

  drawColorGrade(ctx, controls, width, height);
  drawOverlay(ctx, options?.overlay || 'none', controls, width, height, options?.companyName);
  drawCustomOverlay(ctx, options?.customOverlayImage || null, controls, width, height);

  if (options?.compareOriginal) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.rect(0, 0, width / 2, height);
    ctx.clip();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width / 2, height);
    drawCoverImage(ctx, image, width / 2, height, 1, -width * 0.25, 0);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.fillRect(width / 2 - 3, 0, 6, height);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.max(18, width * 0.014)}px Inter, Arial`;
    ctx.fillText('ORIGINAL', width * 0.035, height * 0.06);
    ctx.fillText('FINAL', width * 0.535, height * 0.06);
    ctx.restore();
  }
}

export function ChromaStudio({ sessions, selectedSessionCode, photos, allowAiBackgroundRemoval = false, chromaAssets = [], companyName = 'PicTour', currentLocationName = '', onSessionChange, onSaveChromaRender }: ChromaStudioProps) {
  const hasOpenSessions = sessions.length > 0;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState('');
  const [selectedBackgroundId, setSelectedBackgroundId] = useState(backgroundPresets[0].id);
  const [selectedTemplateId, setSelectedTemplateId] = useState('manual-pro');
  const [selectedOutputId, setSelectedOutputId] = useState(outputPresets[0].id);
  const [selectedOverlay, setSelectedOverlay] = useState<TemplateOverlay>('none');
  const [controls, setControls] = useState<ChromaControls>(defaultControls);
  const [segmentationMode, setSegmentationMode] = useState<BackgroundRemovalMode>('CHROMA_COLOR');
  const [aiCutoutImage, setAiCutoutImage] = useState<HTMLImageElement | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [customBackgroundName, setCustomBackgroundName] = useState('');
  const [customBackgroundImage, setCustomBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [selectedOfficialAssetId, setSelectedOfficialAssetId] = useState('');
  const [officialAssetImage, setOfficialAssetImage] = useState<HTMLImageElement | null>(null);
  const [selectedOfficialOverlayId, setSelectedOfficialOverlayId] = useState('');
  const [officialOverlayImage, setOfficialOverlayImage] = useState<HTMLImageElement | null>(null);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [studioMessage, setStudioMessage] = useState('Escolha uma foto da sessão para começar.');
  const [isSaving, setIsSaving] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  const editablePhotos = useMemo(() => photos.filter((photo) => photo.status !== 'PURCHASED'), [photos]);
  const selectedPhoto = editablePhotos.find((photo) => photo.id === selectedPhotoId) ?? editablePhotos[0];
  const selectedBackground = backgroundPresets.find((background) => background.id === selectedBackgroundId) ?? backgroundPresets[0];
  const selectedOutput = outputPresets.find((output) => output.id === selectedOutputId) ?? outputPresets[0];
  const selectedTemplate = studioTemplates.find((template) => template.id === selectedTemplateId) ?? { id: 'manual-pro', name: 'Ajuste manual profissional', description: 'Fluxo limpo pelo inspector profissional.', badge: 'Manual', backgroundId: selectedBackgroundId, outputPresetId: selectedOutputId, overlay: selectedOverlay, controls: {} };
  const activeOfficialAssets = useMemo(() => {
    const location = currentLocationName.trim().toLowerCase();
    return chromaAssets
      .filter((asset) => asset.type === 'SCENARIO' && asset.isActive !== false && asset.imageUrl)
      .filter((asset) => !asset.locationName || asset.locationName.trim().toLowerCase() === location)
      .sort((a, b) => Number(b.isDefault || false) - Number(a.isDefault || false) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [chromaAssets, currentLocationName]);
  const activeOfficialOverlays = useMemo(() => {
    const location = currentLocationName.trim().toLowerCase();
    return chromaAssets
      .filter((asset) => (asset.type === 'OVERLAY' || asset.type === 'TEMPLATE') && asset.isActive !== false && asset.imageUrl)
      .filter((asset) => !asset.locationName || asset.locationName.trim().toLowerCase() === location)
      .sort((a, b) => Number(b.isDefault || false) - Number(a.isDefault || false) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [chromaAssets, currentLocationName]);
  const selectedOfficialAsset = activeOfficialAssets.find((asset) => asset.id === selectedOfficialAssetId) || null;
  const selectedOfficialOverlay = activeOfficialOverlays.find((asset) => asset.id === selectedOfficialOverlayId) || null;
  const usingOfficialAsset = selectedBackgroundId === 'official' && Boolean(selectedOfficialAsset && officialAssetImage);
  const usingCustomBackground = selectedBackgroundId === 'custom' && customBackgroundImage;

  useEffect(() => {
    if (!selectedPhoto && selectedPhotoId) {
      setSelectedPhotoId('');
      return;
    }

    if (selectedPhoto && selectedPhoto.id !== selectedPhotoId) {
      setSelectedPhotoId(selectedPhoto.id);
    }
  }, [selectedPhoto, selectedPhotoId]);

  useEffect(() => {
    let canceled = false;
    sourceImageRef.current = null;
    setAiCutoutImage(null);

    async function loadSourceImage() {
      if (!selectedPhoto) {
        setStudioMessage('Importe ou capture uma foto antes de usar o Chroma Studio.');
        return;
      }

      try {
        setStudioMessage(`Carregando ${selectedPhoto.code}...`);
        const dataUrl = window.pictourDesktop?.readPhotoDataUrl
          ? (await window.pictourDesktop.readPhotoDataUrl(selectedPhoto.id)).dataUrl
          : selectedPhoto.previewUrl;

        if (!dataUrl || canceled) return;

        const image = await loadImage(dataUrl);
        if (canceled) return;
        sourceImageRef.current = image;
        setStudioMessage('Foto carregada. Escolha um template, aplique IA ou refine o chroma e renderize.');
        setRenderTick((current) => current + 1);
      } catch (error) {
        console.error(error);
        if (!canceled) setStudioMessage('Erro ao ler o arquivo local da foto.');
      }
    }

    loadSourceImage();
    return () => {
      canceled = true;
    };
  }, [selectedPhoto?.id, selectedPhoto?.previewUrl]);

  useEffect(() => {
    let canceled = false;

    async function loadOfficialAsset() {
      if (!selectedOfficialAsset) {
        setOfficialAssetImage(null);
        return;
      }

      try {
        const image = await loadImage(selectedOfficialAsset.imageUrl);
        if (canceled) return;
        setOfficialAssetImage(image);
        setSelectedBackgroundId('official');
        setCustomBackgroundName('');
        setStudioMessage(`Cenário oficial aplicado: ${selectedOfficialAsset.name}. Operação padronizada, operador feliz.`);
        setRenderTick((current) => current + 1);
      } catch (error) {
        console.error(error);
        if (!canceled) setStudioMessage('Não consegui carregar o cenário oficial. Verifique se a imagem ainda está disponível.');
      }
    }

    loadOfficialAsset();
    return () => {
      canceled = true;
    };
  }, [selectedOfficialAsset?.id, selectedOfficialAsset?.imageUrl]);

  useEffect(() => {
    let canceled = false;

    async function loadOfficialOverlay() {
      if (!selectedOfficialOverlay) {
        setOfficialOverlayImage(null);
        return;
      }

      try {
        const image = await loadImage(selectedOfficialOverlay.imageUrl);
        if (canceled) return;
        setOfficialOverlayImage(image);
        setStudioMessage(`Overlay oficial aplicado: ${selectedOfficialOverlay.name}. Ajuste X/Y, escala, rotação e opacidade no inspector.`);
        setRenderTick((current) => current + 1);
      } catch (error) {
        console.error(error);
        if (!canceled) setStudioMessage('Não consegui carregar o overlay/template oficial. Verifique se a imagem ainda está disponível.');
      }
    }

    loadOfficialOverlay();
    return () => {
      canceled = true;
    };
  }, [selectedOfficialOverlay?.id, selectedOfficialOverlay?.imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = sourceImageRef.current;
    if (!canvas || !image) return;

    const frame = window.requestAnimationFrame(() => {
      renderComposition(canvas, image, selectedBackground, controls, segmentationMode, aiCutoutImage, {
        output: selectedOutput,
        overlay: selectedOverlay,
        companyName,
        customBackgroundImage: usingOfficialAsset ? officialAssetImage : (usingCustomBackground ? customBackgroundImage : null),
        customOverlayImage: officialOverlayImage,
        compareOriginal
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [controls, selectedBackground, selectedOutput, selectedOverlay, renderTick, segmentationMode, aiCutoutImage, customBackgroundImage, compareOriginal, usingCustomBackground, usingOfficialAsset, officialAssetImage, officialOverlayImage]);

  function updateControl(key: keyof ChromaControls, value: number) {
    setControls((current) => ({ ...current, [key]: value }));
  }

  function applyTemplate(template: StudioTemplate) {
    const background = backgroundPresets.find((item) => item.id === template.backgroundId);
    setSelectedTemplateId(template.id);
    setSelectedOfficialAssetId('');
    setOfficialAssetImage(null);
    setSelectedBackgroundId(template.backgroundId);
    setSelectedOutputId(template.outputPresetId);
    setSelectedOverlay(template.overlay);
    setControls((current) => ({ ...defaultControls, ...current, ...template.controls }));
    setStudioMessage(`Template "${template.name}" aplicado${background ? ` com cenário ${background.name}` : ''}. Ajuste fino e renderize.`);
    setRenderTick((current) => current + 1);
  }

  async function handleApplyAiCutout(mode: 'standard' | 'professional' = 'standard') {
    if (!allowAiBackgroundRemoval) {
      setStudioMessage('Recorte IA disponível apenas no plano Enterprise. Use chroma verde ou atualize a licença.');
      return;
    }
    const selected = selectedPhoto;
    if (!selected) return;
    setAiProcessing(true);
    setStudioMessage(mode === 'professional'
      ? 'Rodando recorte IA profissional: segmentação + polimento de bordas. Na primeira vez pode demorar...'
      : 'Rodando recorte por IA local. Na primeira vez pode demorar um pouco...');
    try {
      const dataUrl = window.pictourDesktop?.readPhotoDataUrl
        ? (await window.pictourDesktop.readPhotoDataUrl(selected.id)).dataUrl
        : selected.previewUrl;
      if (!dataUrl) throw new Error('Não encontrei a imagem de origem para recorte IA.');
      const cutoutDataUrl = await removeBackgroundWithAi(dataUrl);
      const finalDataUrl = mode === 'professional' ? await polishAiCutoutDataUrl(cutoutDataUrl, controls) : cutoutDataUrl;
      const image = await loadImage(finalDataUrl);
      setAiCutoutImage(image);
      setSegmentationMode('AI_PERSON');
      setStudioMessage(mode === 'professional'
        ? 'Recorte IA profissional aplicado. Use os controles de borda/cor para finalizar cabelo, sombra e cenário.'
        : 'Recorte IA aplicado. Ajuste pessoa/cenário e renderize o final.');
      setRenderTick((current) => current + 1);
    } catch (error) {
      console.error(error);
      setSegmentationMode('CHROMA_COLOR');
      setStudioMessage(error instanceof Error ? error.message : 'Recorte IA indisponível. Continue com o chroma verde.');
    } finally {
      setAiProcessing(false);
    }
  }

  async function handlePolishCurrentCutout() {
    if (!aiCutoutImage) {
      setStudioMessage('Aplique o recorte IA antes de polir bordas.');
      return;
    }
    setAiProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = aiCutoutImage.naturalWidth || aiCutoutImage.width;
      canvas.height = aiCutoutImage.naturalHeight || aiCutoutImage.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível para polimento.');
      ctx.drawImage(aiCutoutImage, 0, 0, canvas.width, canvas.height);
      refineAlphaCanvas(canvas, controls);
      const polished = await canvasToImage(canvas);
      setAiCutoutImage(polished);
      setStudioMessage('Bordas do recorte IA polidas com os ajustes atuais.');
      setRenderTick((current) => current + 1);
    } catch (error) {
      console.error(error);
      setStudioMessage('Não consegui polir o recorte atual.');
    } finally {
      setAiProcessing(false);
    }
  }

  async function handleCustomBackgroundUpload(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const image = await loadImage(dataUrl);
        setCustomBackgroundImage(image);
        setCustomBackgroundName(file.name);
        setSelectedOfficialAssetId('');
        setOfficialAssetImage(null);
        setSelectedBackgroundId('custom');
        setStudioMessage(`Cenário personalizado carregado: ${file.name}. Use zoom/posição do fundo para enquadrar.`);
        setRenderTick((current) => current + 1);
      } catch (error) {
        console.error(error);
        setStudioMessage('Não consegui carregar este cenário personalizado. Use JPG, PNG ou WebP.');
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveRender() {
    const canvas = canvasRef.current;
    const image = sourceImageRef.current;
    if (!selectedPhoto || !canvas || !image) {
      alert('Selecione uma foto antes de renderizar.');
      return;
    }

    setIsSaving(true);
    try {
      renderComposition(canvas, image, selectedBackground, controls, segmentationMode, aiCutoutImage, {
        output: selectedOutput,
        overlay: selectedOverlay,
        companyName,
        customBackgroundImage: usingOfficialAsset ? officialAssetImage : (usingCustomBackground ? customBackgroundImage : null),
        customOverlayImage: officialOverlayImage,
        compareOriginal: false
      });
      const composition: ChromaComposition = {
        mode: 'CHROMA',
        segmentationMode,
        sourcePhotoId: selectedPhoto.id,
        backgroundId: usingOfficialAsset && selectedOfficialAsset ? selectedOfficialAsset.id : (usingCustomBackground ? 'custom' : selectedBackground.id),
        backgroundName: usingOfficialAsset && selectedOfficialAsset ? selectedOfficialAsset.name : (usingCustomBackground ? (customBackgroundName || 'Cenário personalizado') : selectedBackground.name),
        templateId: selectedTemplateId,
        templateName: selectedTemplate.name,
        outputPresetId: selectedOutput.id,
        outputWidth: selectedOutput.width,
        outputHeight: selectedOutput.height,
        overlayStyle: selectedOverlay,
        customBackgroundName: usingCustomBackground ? customBackgroundName : undefined,
        chromaAssetId: usingOfficialAsset && selectedOfficialAsset ? selectedOfficialAsset.id : undefined,
        chromaAssetName: usingOfficialAsset && selectedOfficialAsset ? selectedOfficialAsset.name : undefined,
        chromaAssetType: usingOfficialAsset && selectedOfficialAsset ? selectedOfficialAsset.type : undefined,
        overlayAssetId: selectedOfficialOverlay ? selectedOfficialOverlay.id : undefined,
        overlayAssetName: selectedOfficialOverlay ? selectedOfficialOverlay.name : undefined,
        overlayAssetType: selectedOfficialOverlay ? selectedOfficialOverlay.type : undefined,
        ...controls
      };

      await onSaveChromaRender({
        sessionCode: selectedSessionCode,
        sourcePhotoId: selectedPhoto.id,
        dataUrl: canvas.toDataURL('image/png'),
        backgroundName: composition.backgroundName,
        composition
      });
      setStudioMessage(`Composição profissional renderizada a partir da foto ${selectedPhoto.code}.`);
    } catch (error) {
      console.error(error);
      alert('Não consegui salvar o render do chroma. Veja o console para detalhes.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!editablePhotos.length) {
    return (
      <div className="panel">
        <p className="eyebrow">Chroma Studio</p>
        <h2>Sem fotos para editar</h2>
        <p className="mutedParagraph spacingTop">Crie uma sessão aberta e capture/importe uma foto primeiro. Depois o Chroma Studio consegue remover fundo, aplicar template e gerar uma nova foto vendável.</p>
      </div>
    );
  }

  return (
    <div className="chromaLayout chromaStudioV3">
      <section className="panel studioCanvasPanel">
        <div className="panelHeader inline">
          <div>
            <p className="eyebrow">Chroma Studio Pro • v{APP_VERSION}</p>
            <h2>Recorte IA e inspector profissional</h2>
          </div>
          <div className="actionRow noMargin wrapActions">
            <button className="ghostButton" type="button" onClick={() => setCompareOriginal((current) => !current)}>{compareOriginal ? 'Ocultar antes/depois' : 'Antes/depois'}</button>
            <button className="ghostButton" type="button" onClick={() => setControls(defaultControls)}>Resetar ajustes</button>
            <button className="primaryButton" type="button" onClick={handleSaveRender} disabled={isSaving || !hasOpenSessions || !selectedPhoto}>
              {isSaving ? 'Salvando...' : 'Renderizar final'}
            </button>
          </div>
        </div>

        <div className="chromaToolbar">
          <label>
            Sessão
            <select value={selectedSessionCode} onChange={(event) => onSessionChange(event.target.value)} disabled={!hasOpenSessions}>
              {!hasOpenSessions && <option value="">Nenhuma sessão aberta</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.code}>{session.code} — {session.customerName}</option>
              ))}
            </select>
          </label>
          <label>
            Foto de origem
            <select value={selectedPhoto?.id ?? ''} onChange={(event) => setSelectedPhotoId(event.target.value)}>
              {editablePhotos.map((photo) => (
                <option key={photo.id} value={photo.id}>{photo.code} — {photo.label}</option>
              ))}
            </select>
          </label>
          <label>
            Formato final
            <select value={selectedOutputId} onChange={(event) => setSelectedOutputId(event.target.value)}>
              {outputPresets.map((output) => (
                <option key={output.id} value={output.id}>{output.name} — {output.width}x{output.height}</option>
              ))}
            </select>
          </label>
        </div>

        {!hasOpenSessions && (
          <div className="infoBox warnBox">Nenhuma sessão aberta disponível. Vá em Sessões e crie ou reabra uma sessão para usar o Chroma Studio.</div>
        )}

        <div className="chromaStageShell proStageShell">
          <canvas ref={canvasRef} className="chromaCanvas" />
          <div className="chromaStageFooter">
            <strong>{selectedPhoto?.code} • {selectedOutput.name}</strong>
            <span>{studioMessage}</span>
          </div>
        </div>

        <div className="chromaSourceStrip proSourceStrip">
          <div>
            <p className="eyebrow">Pipeline</p>
            <strong>{segmentationMode === 'AI_PERSON' ? 'IA de pessoa + refinamento' : 'Chroma verde + borda polida'}</strong>
            <span>{usingOfficialAsset && selectedOfficialAsset ? selectedOfficialAsset.name : (usingCustomBackground ? customBackgroundName : selectedBackground.name)}{selectedOfficialOverlay ? ` • Overlay: ${selectedOfficialOverlay.name}` : ''}</span>
          </div>
          <ProtectedPreview photo={selectedPhoto} watermarkText={`${selectedSessionCode} • ${selectedPhoto?.code ?? 'F01'} • ORIGEM`} />
        </div>
      </section>

      <aside className="panel inspectorPanel chromaInspector proInspector">
        <p className="eyebrow">Inspector profissional</p>
        <h2>IA, cenário e acabamento</h2>

        <label>Modo de recorte</label>
        <div className="segmentationModeList">
          {backgroundRemovalModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={segmentationMode === mode.id ? 'active' : ''}
              disabled={!mode.available}
              onClick={() => setSegmentationMode(mode.id)}
            >
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
              {!mode.available && <em>Próxima etapa</em>}
            </button>
          ))}
        </div>

        <div className="aiActionGrid">
          <button className="ghostButton fullWidth" type="button" onClick={() => handleApplyAiCutout('standard')} disabled={aiProcessing || !allowAiBackgroundRemoval}>
            {aiProcessing ? 'Processando...' : allowAiBackgroundRemoval ? 'Recorte IA rápido' : 'IA bloqueada pelo plano'}
          </button>
          <button className="primaryButton fullWidth" type="button" onClick={() => handleApplyAiCutout('professional')} disabled={aiProcessing || !allowAiBackgroundRemoval}>
            {aiProcessing ? 'Polindo IA...' : 'IA profissional'}
          </button>
          <button className="ghostButton fullWidth" type="button" onClick={handlePolishCurrentCutout} disabled={aiProcessing || !aiCutoutImage}>
            Polir bordas atuais
          </button>
        </div>

        <div className="infoBox compactInfo">
          {allowAiBackgroundRemoval
            ? 'A IA profissional usa segmentação local, polimento de alpha, redução de vazamento verde e ajustes de cabelo/borda. Se a dependência não carregar, o chroma verde continua funcionando.'
            : 'Recorte IA faz parte do plano Enterprise. Starter/Pro continuam com chroma verde, templates e edição manual.'}
        </div>

        <label>Biblioteca oficial do parque</label>
        <div className="officialAssetList">
          {activeOfficialAssets.length ? activeOfficialAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={asset.id === selectedOfficialAssetId ? 'active' : ''}
              onClick={() => setSelectedOfficialAssetId(asset.id)}
            >
              <span className="officialAssetThumb" style={{ backgroundImage: `url(${asset.thumbnailUrl || asset.imageUrl})` }} />
              <span>
                <strong>{asset.name}</strong>
                <em>{asset.locationName || 'Todos os locais'}{asset.isDefault ? ' • Padrão' : ''}</em>
              </span>
            </button>
          )) : (
            <div className="infoBox compactInfo">Nenhum cenário oficial ativo para este local. O gestor pode cadastrar em Configurações → Biblioteca Chroma.</div>
          )}
        </div>

        <label>Cenário</label>
        <div className="backgroundList compactBackgroundList proBackgroundList">
          {backgroundPresets.map((background) => (
            <button
              key={background.id}
              type="button"
              className={background.id === selectedBackground.id && !usingCustomBackground ? 'active' : ''}
              onClick={() => { setSelectedOfficialAssetId(''); setOfficialAssetImage(null); setSelectedBackgroundId(background.id); }}
            >
              <span className="backgroundThumb" style={{ background: background.accent }} />
              <span>
                <strong>{background.name}</strong>
                <em>{background.description}</em>
              </span>
            </button>
          ))}
        </div>

        <label className="customBackgroundUploader">
          Importar cenário personalizado
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleCustomBackgroundUpload(event.target.files?.[0])} />
          <span>{customBackgroundName || 'JPG, PNG ou WebP. O render final já incorpora o cenário.'}</span>
        </label>

        <label>Overlay/template visual estático</label>
        <select value={selectedOverlay} onChange={(event) => setSelectedOverlay(event.target.value as TemplateOverlay)}>
          <option value="none">Sem overlay</option>
          <option value="classic-postcard">Postal clássico</option>
          <option value="premium-poster">Pôster premium</option>
          <option value="adventure-frame">Moldura aventura</option>
          <option value="luxury-cover">Capa luxury</option>
        </select>

        <label>Overlays/templates oficiais</label>
        <div className="officialAssetList">
          <button
            type="button"
            className={!selectedOfficialOverlayId ? 'active' : ''}
            onClick={() => { setSelectedOfficialOverlayId(''); setOfficialOverlayImage(null); setRenderTick((current) => current + 1); }}
          >
            <span className="officialAssetThumb emptyOfficialThumb" />
            <span>
              <strong>Sem overlay oficial</strong>
              <em>Usar apenas o acabamento estático acima</em>
            </span>
          </button>
          {activeOfficialOverlays.length ? activeOfficialOverlays.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={asset.id === selectedOfficialOverlayId ? 'active' : ''}
              onClick={() => setSelectedOfficialOverlayId(asset.id)}
            >
              <span className="officialAssetThumb" style={{ backgroundImage: `url(${asset.thumbnailUrl || asset.imageUrl})` }} />
              <span>
                <strong>{asset.name}</strong>
                <em>{asset.type} • {asset.locationName || 'Todos os locais'}{asset.isDefault ? ' • Padrão' : ''}</em>
              </span>
            </button>
          )) : (
            <div className="infoBox compactInfo">Nenhum overlay/template oficial ativo para este local. Cadastre em Configurações → Biblioteca Chroma usando tipo Overlay ou Template.</div>
          )}
        </div>

        <div className="controlGroupTitle">Pessoa</div>
        <RangeControl label="Pessoa X" min={-620} max={620} value={controls.subjectX} onChange={(value) => updateControl('subjectX', value)} suffix="px" />
        <RangeControl label="Pessoa Y" min={-520} max={720} value={controls.subjectY} onChange={(value) => updateControl('subjectY', value)} suffix="px" />
        <RangeControl label="Escala pessoa" min={25} max={220} value={controls.subjectScale} onChange={(value) => updateControl('subjectScale', value)} suffix="%" />
        <RangeControl label="Rotação pessoa" min={-18} max={18} value={controls.subjectRotation} onChange={(value) => updateControl('subjectRotation', value)} suffix="°" />

        <div className="controlGroupTitle">Fundo</div>
        <RangeControl label="Fundo X" min={-520} max={520} value={controls.backgroundX} onChange={(value) => updateControl('backgroundX', value)} suffix="px" />
        <RangeControl label="Fundo Y" min={-420} max={420} value={controls.backgroundY} onChange={(value) => updateControl('backgroundY', value)} suffix="px" />
        <RangeControl label="Zoom fundo" min={70} max={190} value={controls.backgroundScale} onChange={(value) => updateControl('backgroundScale', value)} suffix="%" />
        <RangeControl label="Desfoque fundo" min={0} max={16} value={controls.backgroundBlur} onChange={(value) => updateControl('backgroundBlur', value)} suffix="px" />

        <div className="controlGroupTitle">Chroma/IA bordas</div>
        <RangeControl label="Força chroma" min={5} max={90} value={controls.keyThreshold} onChange={(value) => updateControl('keyThreshold', value)} suffix="%" />
        <RangeControl label="Suavização chroma" min={0} max={100} value={controls.keySoftness} onChange={(value) => updateControl('keySoftness', value)} suffix="%" />
        <RangeControl label="Reduzir verde" min={0} max={100} value={controls.spillReduction} onChange={(value) => updateControl('spillReduction', value)} suffix="%" />
        <RangeControl label="Limpeza de borda" min={0} max={100} value={controls.edgeCleanup} onChange={(value) => updateControl('edgeCleanup', value)} suffix="%" />
        <RangeControl label="Feather/cabelo" min={0} max={100} value={controls.edgeFeather} onChange={(value) => updateControl('edgeFeather', value)} suffix="%" />

        <div className="controlGroupTitle">Finalização</div>
        <RangeControl label="Brilho" min={70} max={140} value={controls.brightness} onChange={(value) => updateControl('brightness', value)} suffix="%" />
        <RangeControl label="Contraste" min={70} max={150} value={controls.contrast} onChange={(value) => updateControl('contrast', value)} suffix="%" />
        <RangeControl label="Saturação" min={40} max={170} value={controls.saturation} onChange={(value) => updateControl('saturation', value)} suffix="%" />
        <RangeControl label="Temperatura" min={-50} max={50} value={controls.temperature} onChange={(value) => updateControl('temperature', value)} />
        <RangeControl label="Sombra" min={0} max={100} value={controls.shadow} onChange={(value) => updateControl('shadow', value)} suffix="%" />
        <RangeControl label="Overlay" min={0} max={100} value={controls.overlayIntensity} onChange={(value) => updateControl('overlayIntensity', value)} suffix="%" />

        <div className="controlGroupTitle">Transformação do overlay</div>
        <RangeControl label="Overlay X" min={-900} max={900} value={controls.overlayX} onChange={(value) => updateControl('overlayX', value)} suffix="px" />
        <RangeControl label="Overlay Y" min={-900} max={900} value={controls.overlayY} onChange={(value) => updateControl('overlayY', value)} suffix="px" />
        <RangeControl label="Escala overlay" min={10} max={250} value={controls.overlayScale} onChange={(value) => updateControl('overlayScale', value)} suffix="%" />
        <RangeControl label="Rotação overlay" min={-180} max={180} value={controls.overlayRotation} onChange={(value) => updateControl('overlayRotation', value)} suffix="°" />

        <div className="infoBox">
          Render final em {selectedOutput.width}x{selectedOutput.height}. Templates aplicam enquadramento, overlay e grade de cor, mas você ainda pode mexer em tudo antes de salvar.
        </div>
      </aside>
    </div>
  );
}

type RangeControlProps = {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
};

function RangeControl({ label, min, max, value, suffix = '', onChange }: RangeControlProps) {
  return (
    <div className="rangeControl compactRange">
      <span>
        {label}
        <strong>{value}{suffix}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
