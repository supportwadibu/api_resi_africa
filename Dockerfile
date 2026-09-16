# Image de production de l'API RESI.
#
# Le passage à Docker est imposé par la génération de rapports PDF : Puppeteer
# télécharge son Chromium dans `~/.cache/puppeteer`, **hors du projet**. Sur un
# service Node natif, ce cache appartient au conteneur de build et n'existe plus
# à l'exécution — `puppeteer.launch()` échoue alors sur chaque rapport.
#
# Ici, Chromium vient du gestionnaire de paquets, à un chemin stable et présent
# dans l'image finale.

FROM node:24-slim AS base

# Chromium et ses dépendances de rendu.
#
# Les polices ne sont pas facultatives : sans elles, Chromium rend le texte en
# blocs vides et le PDF part chez le propriétaire illisible, sans qu'aucune
# erreur ne soit levée. `fonts-liberation` couvre les familles déclarées par le
# gabarit (Helvetica, Arial) et `fonts-dejavu-core` sert de repli large.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Puppeteer ne télécharge plus son propre Chromium : celui d'apt est déjà là, et
# en embarquer un second doublerait le poids de l'image pour rien.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ── Dépendances (couche mise en cache tant que les manifestes ne bougent pas)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── Build
FROM deps AS build
COPY . .
RUN node ace build

# ── Image finale
FROM base AS production

ENV NODE_ENV=production

# `npm ci --omit=dev` dans le dossier produit par `node ace build` : celui-ci
# porte son propre package.json, réduit aux dépendances d'exécution.
COPY --from=build /app/build ./
RUN npm ci --omit=dev

# Chromium refuse de démarrer en root sans namespaces ; le service tourne donc
# sous l'utilisateur non privilégié fourni par l'image Node.
RUN chown -R node:node /app
USER node

EXPOSE 3333

CMD ["node", "bin/server.js"]
