# Use Node.js 20 LTS with Alpine Linux
FROM node:20-alpine

# Install system dependencies (aria2 removed - banned on Railway)
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    bash \
    curl \
    git

# Install yt-dlp (standalone binary)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

# Install Python tools (gallery-dl, spotdl)
RUN pip3 install --no-cache-dir --break-system-packages \
    gallery-dl \
    spotdl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create downloads directory
RUN mkdir -p downloads data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the application
CMD ["node", "server.js"]
