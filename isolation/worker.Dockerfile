FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
RUN npm install --no-audit --no-fund --no-save playwright@1.64.0
USER pwuser
EXPOSE 3000
CMD ["./node_modules/.bin/playwright","run-server","--host","0.0.0.0","--port","3000"]
