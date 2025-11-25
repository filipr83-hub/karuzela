const express = require('express');
const path = require('path');
// 🔥 1. ZMIANA: Dodajemy loadImage do importów
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
    } else {
        console.error("❌ BŁĄD: Brak pliku Montserrat-ExtraBold.ttf");
    }

    if (fs.existsSync(path.join(fontsDir, 'Montserrat-Regular.ttf'))) {
        FontLibrary.use("Montserrat-Regular", path.join(fontsDir, 'Montserrat-Regular.ttf'));
        console.log("✅ Załadowano: Montserrat-Regular");
    } else {
        console.error("❌ BŁĄD: Brak pliku Montserrat-Regular.ttf");
    }
}
registerFonts();

// === POBIERANIE OBRAZU ===
async function downloadImage(url) {
    console.log(`📥 Pobieranie tła z URL: ${url}`);
    
    const response = await fetch(url, {
        headers: {
            // Udajemy przeglądarkę, żeby ominąć blokady
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!response.ok) {
        throw new Error(`Serwer obrazka zwrócił błąd: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`📦 Pobranao obraz. Rozmiar danych: ${buffer.length} bajtów`);
    return buffer;
}

// === FUNKCJE POMOCNICZE ===
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

    if (cx < 0) cx = 0;
    if (cy < 0) cy = 0;
    if (cw > iw) cw = iw;
    if (ch > ih) ch = ih;

    ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

// === ENDPOINT API ===
app.post('/render-slide', async (req, res) => {
    try {
        const { backgroundUrl, title, text } = req.body;

        if (!title || !text) {
            return res.status(400).json({ error: "Brak title lub text" });
        }

        const canvas = new Canvas(1080, 1350);
        const ctx = canvas.getContext("2d");

        // 1. RYSOWANIE TŁA
        try {
            if (backgroundUrl) {
                const imgBuffer = await downloadImage(backgroundUrl);
                
                // 🔥 2. ZMIANA: Używamy await loadImage() zamiast new Image()
                // To gwarantuje, że obraz jest w pełni zdekodowany przed rysowaniem
                const img = await loadImage(imgBuffer);
                
                drawImageProp(ctx, img, 0, 0, 1080, 1350);
                console.log("✅ Tło narysowane pomyślnie.");
            } else {
                throw new Error("Pusty URL tła");
            }
        } catch (err) {
            console.error("⚠️ BŁĄD RYSOWANIA TŁA:", err.message);
            // Fallback - czarne tło
            ctx.fillStyle = "#111111";
            ctx.fillRect(0, 0, 1080, 1350);
        }

        // 2. OVERLAY (Półprzezroczysta czerń)
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, 1080, 1350);

        // 3. TYTUŁ
        ctx.font = '60px "Montserrat-Bold"';
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 15;
        ctx.textBaseline = "top";

        const titleX = 64;
        const titleY = 100;
        const maxTextWidth = 1080 - 128;
        const titleLineHeight = 75;

        const titleLines = wrapText(ctx, title, maxTextWidth);
        titleLines.forEach((line, index) => {
            ctx.fillText(line, titleX, titleY + (index * titleLineHeight));
        });

        // 4. TEKST
        const descriptionStartY = titleY + (titleLines.length * titleLineHeight) + 50;
        
        ctx.font = '40px "Montserrat-Regular"';
        ctx.fillStyle = "#e5e7eb"; 
        ctx.shadowBlur = 10;

        const descLineHeight = 55;
        const descLines = wrapText(ctx, text, maxTextWidth);
        descLines.forEach((line, index) => {
            ctx.fillText(line, titleX, descriptionStartY + (index * descLineHeight));
        });

        // 5. OUTPUT
        const pngBuffer = await canvas.toBuffer('png');
        const base64String = `data:image/png;base64,${pngBuffer.toString('base64')}`;

        res.json({ imageBase64: base64String });

    } catch (error) {
        console.error("🔥 BŁĄD KRYTYCZNY:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
