FROM mcr.microsoft.com/playwright:v1.41.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build TypeScript
RUN npm run build

# Playwright browsers já estão na imagem base (mcr.microsoft.com/playwright)
# mas garantimos que as dependências do sistema estejam lá
RUN npx playwright install-deps chromium

EXPOSE 3001

CMD ["npm", "start"]
