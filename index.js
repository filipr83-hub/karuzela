const express = require('express');
const path = require('path');
const { Canvas, Image, FontLibrary } = require('skia-canvas');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());

// Railway przydziela port dynamicznie w zmiennej PORT
const PORT = process.env.PORT || 3000;

// === KONFIGURACJA CZCIONEK ===
const fontsDir = path.join(__dirname, 'assets', 'fonts');

// Funkcja rejestrująca fonty z obsługą błędów
function registerFonts() {
    // 1. Rejestracja GRUBEJ czcionki (u Ciebie ExtraBold)
    // UWAGA: Musisz mieć plik: assets/fonts/Montserrat-ExtraBold.ttf
    if (fs.existsSync(path.join(fontsDir, 'Montserrat-ExtraBold.ttf'))) {
        FontLibrary.use("Montserrat-Bold", path.join(fontsDir, 'Montserrat-ExtraBold.ttf'));
        console.log("Załadowano: Montserrat-ExtraBold");
    } else {
        console.error("❌ BŁĄD KRYTYCZNY: Brak pliku Montserrat-ExtraBold.ttf w assets/fonts/");
    }

    // 2. Rejestracja ZWYKŁEJ czcionki
    // UWAGA: Musisz dograć plik: assets/fonts/Montserrat-Regular.ttf
    if (fs.existsSync(path.join(fontsDir, 'Montserrat-Regular.ttf'))) {
        FontLibrary.use("Montserrat-Regular", path.join(fontsDir, 'Montserrat-Regular.ttf'));
        console.log("Załadowano: Montserrat-Regular");
    } else {
        console.error("❌ BŁĄD KRYTYCZNY: Brak pliku Montserrat-Regular.ttf w assets/fonts/");
    }
}

// Uruchomienie rejestracji przy starcie
registerFonts();

// === FUNKCJE POMOCNICZE ===

// Pobieranie obrazka z URL
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Błąd pobierania obrazu. Status: ${res.statusCode}`));
                return;
            }
            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
        }).on('error', (err) => reject(err));
    });
}

// Zawijanie tekstu (Word Wrap)
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

// Skalowanie obrazu (object-fit: cover)
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
        console.log("Otrzymano request:", req.body); // Logowanie dla debugowania

        const { backgroundUrl, title, text } = req.body;

        if (!title || !text) {
            return res.status(400).json({ error: "Brak pola title lub text" });
        }

        // 1. Tworzenie Canvas
        const canvas = new Canvas(1080, 1350);
        const ctx = canvas.getContext("2d");

        // 2. Tło
        try {
            if (backgroundUrl) {
                const imgBuffer = await downloadImage(backgroundUrl);
                const img = new Image(imgBuffer);
                drawImageProp(ctx, img, 0, 0, 1080, 1350);
            } else {
                // Fallback jeśli brak URL
                ctx.fillStyle = "#111111";
                ctx.fillRect(0, 0, 1080, 1350);
            }
        } catch (err) {
            console.error("Błąd tła:", err.message);
            ctx.fillStyle = "#111111";
            ctx.fillRect(0, 0, 1080, 1350);
        }

        // 3. Overlay (Ciemna warstwa)
        ctx.fillStyle = "rgba(0,0,0,0.45)"; // Zwiększyłem lekko przyciemnienie dla lepszej czytelności
        ctx.fillRect(0, 0, 1080, 1350);

        // 4. Rysowanie Tytułu
        ctx.font = '60px "Montserrat-Bold"'; // Używamy zarejestrowanej nazwy
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 15;
        ctx.textBaseline = "top";

        const titleX = 64;
        const titleY = 100;
        const maxTextWidth = 1080 - (64 * 2); // 952px
        const titleLineHeight = 75;

        const titleLines = wrapText(ctx, title, maxTextWidth);
        titleLines.forEach((line, index) => {
            ctx.fillText(line, titleX, titleY + (index * titleLineHeight));
        });

        // 5. Rysowanie Tekstu
        const descriptionStartY = titleY + (titleLines.length * titleLineHeight) + 50;
        
        ctx.font = '40px "Montserrat-Regular"'; // Używamy zarejestrowanej nazwy
        ctx.fillStyle = "#e5e7eb"; 
        ctx.shadowBlur = 10;

        const descLineHeight = 55;
        const descLines = wrapText(ctx, text, maxTextWidth);
        descLines.forEach((line, index) => {
            ctx.fillText(line, titleX, descriptionStartY + (index * descLineHeight));
        });

        // 6. Generowanie Base64
        const pngBuffer = await canvas.toBuffer('png');
        const base64String = `data:image/png;base64,${pngBuffer.toString('base64')}`;

        res.json({ imageBase64: base64String });

    } catch (error) {
        console.error("Błąd renderowania:", error);
        res.status(500).json({ error: "Render error: " + error.message });
    }
});

// Start serwera
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
