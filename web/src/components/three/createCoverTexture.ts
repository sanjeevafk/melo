import * as THREE from "three";

interface CoverOptions {
  title: string;
  author: string;
  bookId?: string | null;
}

/**
 * Creates a high-resolution, procedural hardcover book jacket texture
 * with realistic book cloth weave, foil embossed serif typography, and gold filigree.
 */
export function createCoverTexture({ title, author, bookId }: CoverOptions): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1440;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    return fallback;
  }

  // Base cloth color palette depending on book
  const isStyles = bookId?.includes("styles") || title.toLowerCase().includes("mysterious");
  const baseDark = isStyles ? "#1b1916" : "#14171a";
  const baseMid = isStyles ? "#25211c" : "#1d2328";

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 1024, 1440);
  grad.addColorStop(0, baseMid);
  grad.addColorStop(0.5, baseDark);
  grad.addColorStop(1, "#0d0e11");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1440);

  // Procedural woven bookcloth texture
  ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
  for (let y = 0; y < 1440; y += 4) {
    ctx.fillRect(0, y, 1024, 1.5);
  }
  for (let x = 0; x < 1024; x += 4) {
    ctx.fillRect(x, 0, 1.5, 1440);
  }

  // Spine hinge indentation shadow on left edge
  const hingeGrad = ctx.createLinearGradient(0, 0, 120, 0);
  hingeGrad.addColorStop(0, "rgba(0,0,0,0.85)");
  hingeGrad.addColorStop(0.5, "rgba(0,0,0,0.3)");
  hingeGrad.addColorStop(0.8, "rgba(255,255,255,0.05)");
  hingeGrad.addColorStop(1, "transparent");
  ctx.fillStyle = hingeGrad;
  ctx.fillRect(0, 0, 120, 1440);

  // Outer gold foil double frame
  ctx.strokeStyle = "rgba(203, 163, 110, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(90, 80, 844, 1280);

  ctx.strokeStyle = "rgba(203, 163, 110, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(105, 95, 814, 1250);

  // Corner filigree ornaments
  const drawCorner = (cx: number, cy: number, flipX: number, flipY: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flipX, flipY);
    ctx.strokeStyle = "rgba(203, 163, 110, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(40, 0);
    ctx.moveTo(0, 10);
    ctx.lineTo(0, 40);
    ctx.arc(20, 20, 12, Math.PI, 1.5 * Math.PI);
    ctx.stroke();
    ctx.restore();
  };

  drawCorner(105, 95, 1, 1);
  drawCorner(919, 95, -1, 1);
  drawCorner(105, 1345, 1, -1);
  drawCorner(919, 1345, -1, -1);

  // Subtle gold emblem in upper center
  ctx.fillStyle = "rgba(203, 163, 110, 0.75)";
  ctx.beginPath();
  ctx.arc(512, 380, 36, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(203, 163, 110, 0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(512, 380, 26, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(203, 163, 110, 0.35)";
  ctx.stroke();

  // Emblem center icon / star
  ctx.beginPath();
  ctx.moveTo(512, 360);
  ctx.lineTo(518, 375);
  ctx.lineTo(534, 380);
  ctx.lineTo(518, 385);
  ctx.lineTo(512, 400);
  ctx.lineTo(506, 385);
  ctx.lineTo(490, 380);
  ctx.lineTo(506, 375);
  ctx.closePath();
  ctx.fillStyle = "rgba(203, 163, 110, 0.85)";
  ctx.fill();

  // Publisher seal / Edition label
  ctx.font = "600 24px 'JetBrains Mono', monospace";
  ctx.fillStyle = "rgba(203, 163, 110, 0.65)";
  ctx.textAlign = "center";
  ctx.letterSpacing = "6px";
  ctx.fillText("MELO AUDIO EDITION", 512, 280);

  // Title typography (Editorial Serif)
  ctx.font = "italic 400 64px 'Fraunces', 'Iowan Old Style', serif";
  ctx.fillStyle = "#f5f0e6";
  ctx.letterSpacing = "1px";

  // Wrap title lines cleanly
  const words = (title || "Audiobook").split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const testLine = `${currentLine} ${words[i]}`;
    const metrics = ctx.measureText(testLine);
    if (metrics.width < 700) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  const startY = 620 - (lines.length - 1) * 40;
  lines.forEach((line, idx) => {
    // Subtle embossed drop shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    ctx.fillText(line, 512, startY + idx * 80);
  });
  ctx.shadowColor = "transparent";

  // Ornamental divider
  ctx.strokeStyle = "rgba(203, 163, 110, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(380, startY + lines.length * 80 + 20);
  ctx.lineTo(644, startY + lines.length * 80 + 20);
  ctx.stroke();

  // Diamond in divider center
  ctx.fillStyle = "rgba(203, 163, 110, 0.8)";
  ctx.beginPath();
  ctx.arc(512, startY + lines.length * 80 + 20, 4, 0, Math.PI * 2);
  ctx.fill();

  // Author typography
  ctx.font = "500 32px 'Fraunces', serif";
  ctx.fillStyle = "rgba(203, 163, 110, 0.9)";
  ctx.letterSpacing = "4px";
  ctx.fillText((author || "Literary Companion").toUpperCase(), 512, startY + lines.length * 80 + 90);

  // Bottom seal / ISBN badge
  ctx.font = "500 20px 'JetBrains Mono', monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  ctx.letterSpacing = "4px";
  ctx.fillText("TEMPORAL AUDIO HORIZON · PRIVATE INFERENCE", 512, 1260);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates page edges texture (simulating paper block with fine horizontal strata)
 */
export function createPageEdgesTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#dfd6c4";
    ctx.fillRect(0, 0, 128, 512);

    for (let y = 0; y < 512; y += 2) {
      const alpha = (Math.sin(y * 0.8) * 0.15 + 0.15).toFixed(2);
      ctx.fillStyle = `rgba(80, 65, 45, ${alpha})`;
      ctx.fillRect(0, y, 128, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  texture.needsUpdate = true;
  return texture;
}
