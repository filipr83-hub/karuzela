# Używamy Node v18
FROM node:18

# 🔥 KLUCZOWE: Instalujemy biblioteki systemowe potrzebne dla skia-canvas
RUN apt-get update && apt-get install -y \
    libfontconfig1 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Ustawiamy katalog roboczy
WORKDIR /app

# Kopiujemy pliki zależności
COPY package*.json ./

# Instalujemy zależności Node.js
RUN npm install

# Kopiujemy resztę plików aplikacji (w tym folder assets/fonts!)
COPY . .

# Otwieramy port (Railway podstawi tu odpowiedni numer)
EXPOSE $PORT

# Startujemy aplikację
CMD ["npm", "start"]
