import express from 'express';
import { Canvas, loadImage, registerFont } from 'skia-canvas';
import https from 'https';
import http from 'http';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// REGISTER FONT (Montserrat ExtraBold)
registerFont('./assets/fonts/Montserrat-ExtraBold.ttf', { family: 'MontserratBold' });

// DOWNLOAD IMAGE HELPER
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// TEXT WRAP HELPER
function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  return lines;
}

// MAIN ENDPOINT
app.post('/render-slide', async (req, res) => {
  try {
    const { backgroundUrl, title, text } = req.body;

    if (!title || !text) {
      return res.status(400).json({ error: 'Missing title or text' });
    }

    const WIDTH = 1080;
    const HEIGHT = 1350;
    const canvas = new Canvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // ===== BACKGROUND =====
    try {
      const buffer = await downloadImage(backgroundUrl);
      const img = await loadImage(buffer);

      const scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (WIDTH - w) / 2;
      const y = (HEIGHT - h) / 2;

      ctx.drawImage(img, x, y, w, h);
    } catch (err) {
      console.error('Background load failed:', err.message);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // ===== DARKEN OVERLAY =====
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // ===== TITLE TEXT =====
    const padding = 64;
    const maxWidth = WIDTH - padding * 2;

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 14;

    ctx.font = '60px MontserratBold';
    const titleLines = wrapLines(ctx, title, maxWidth);

    let y = 80;
    const titleLineHeight = 75;

    for (const line of titleLines) {
      ctx.fillText(line, padding, y);
      y += titleLineHeight;
    }

    y += 40;

    // ===== BODY TEXT =====
    ctx.font = '40px MontserratBold';
    ctx.fillStyle = '#e5e7eb';
    ctx.shadowBlur = 10;

    const textLines = wrapLines(ctx, text, maxWidth);
    const bodyLineHeight = 55;

    for (const line of textLines) {
      if (y + bodyLineHeight > HEIGHT - 100) break;
      ctx.fillText(line, padding, y);
      y += bodyLineHeight;
    }

    // ===== RETURN PNG =====
    const png = await canvas.toBuffer('png');

    res.json({
      imageBase64: `data:image/png;base64,${png.toString('base64')}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Render error' });
  }
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port', PORT);
});

