const express = require('express');
const path = require('path');
const { Canvas, Image, FontLibrary, loadImage } = require('skia-canvas');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// === KONFIGURACJA CZCIONEK ===
const fontsDir = path.join(__dirname, 'assets', 'fonts');

function registerFonts() {
    if (fs.existsSync(path.join(fontsDir, 'Montserrat-ExtraBold.ttf'))) {
        FontLibrary.use("Montserrat-Bold", path.join(fontsDir, 'Montserrat-ExtraBold.ttf'));
        console.log("✅ Załadowano: Montserrat-ExtraBold");
    }

    if (fs.existsSync(path.join(fontsDir, 'Montserrat-Regular.ttf'))) {
        FontLibrary.use("Montserrat-Regular", path.join(fontsDir, 'Montserrat-Regular.ttf'));
        console.log("✅ Załadowano: Montserrat-Regular");
    }
}
registerFonts();

// === POBIERANIE OBRAZU ===
async function downloadImage(url) {
    console.log(`📥 Pobieranie tła z URL: ${url}`);
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    if (!response.ok) throw new Error(`Status: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

// === WORD WRAP ===
function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        let word = words[i];
        let width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// === SKALOWANIE TŁA ===
function drawImageProp(ctx, img, x, y, w, h) {
    let offsetX = 0.5, offsetY = 0.5;
    let iw = img.width, ih = img.height;
    let r = Math.min(w / iw, h / ih);
    let nw = iw * r, nh = ih * r;
    let cx, cy, cw, ch, ar = 1;

    if (nw < w) ar = w / nw;
    if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh;
    nw *= ar; nh *= ar;

    cw = iw / (nw / w);
    ch = ih / (nh / h);
    cx = (iw - cw) * offsetX;
    cy = (ih - ch) * offsetY;

    if (cx < 0) cx = 0; if (cy < 0) cy = 0;
    if (cw > iw) cw = iw; if (ch > ih) ch = ih;

    ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

// === API ===
app.post('/render-slide', async (req, res) => {
    try {
        const { backgroundUrl, title, text } = req.body;

        if (!title || !text) return res.status(400).json({ error: "Missing data" });

        const canvas = new Canvas(1080, 1350);
        const ctx = canvas.getContext("2d");

        // 1. TŁO
        try {
            if (backgroundUrl) {
                const imgBuffer = await downloadImage(backgroundUrl);
                const img = await loadImage(imgBuffer);
                drawImageProp(ctx, img, 0, 0, 1080, 1350);
            } else {
                throw new Error("No URL");
            }
        } catch (err) {
            console.error("Błąd tła:", err.message);
            ctx.fillStyle = "#111111";
            ctx.fillRect(0, 0, 1080, 1350);
        }

        // 2. OVERLAY
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, 1080, 1350);

        // 3. OBLICZENIA DO CENTROWANIA (MATEMATYKA)
        const CANVAS_HEIGHT = 1350;
        const CANVAS_WIDTH = 1080;
        const PADDING_X = 64;
        const MAX_WIDTH = CANVAS_WIDTH - (PADDING_X * 2);
        const GAP = 50; // Odstęp między tytułem a opisem

        // A. Konfiguracja fontu dla TYTUŁU
        ctx.font = '60px "Montserrat-Bold"';
        const titleLineHeight = 75;
        const titleLines = wrapText(ctx, title, MAX_WIDTH);
        const titleHeight = titleLines.length * titleLineHeight;

        // B. Konfiguracja fontu dla OPISU
        ctx.font = '40px "Montserrat-Regular"';
        const descLineHeight = 55;
        const descLines = wrapText(ctx, text, MAX_WIDTH);
        const descHeight = descLines.length * descLineHeight;

        // C. Całkowita wysokość bloku tekstu
        const totalContentHeight = titleHeight + GAP + descHeight;

        // D. Punkt startowy Y (żeby było idealnie na środku)
        let currentY = (CANVAS_HEIGHT - totalContentHeight) / 2;

        // 4. RYSOWANIE
        
        // Rysujemy Tytuł
        ctx.font = '60px "Montserrat-Bold"';
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 15;
        ctx.textBaseline = "top";
        
        titleLines.forEach((line) => {
            ctx.fillText(line, PADDING_X, currentY);
            currentY += titleLineHeight;
        });

        // Dodajemy odstęp
        currentY += GAP;

        // Rysujemy Opis
        ctx.font = '40px "Montserrat-Regular"';
        ctx.fillStyle = "#e5e7eb";
        ctx.shadowBlur = 10;

        descLines.forEach((line) => {
            ctx.fillText(line, PADDING_X, currentY);
            currentY += descLineHeight;
        });

        // 5. OUTPUT
        const pngBuffer = await canvas.toBuffer('png');
        const base64String = `data:image/png;base64,${pngBuffer.toString('base64')}`;

        res.json({ imageBase64: base64String });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer na porcie ${PORT}`);
});
