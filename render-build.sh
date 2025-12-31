#!/usr/bin/env bash
# Render.com Build Script - Install Required Tools

set -e

echo "🔧 Installing system dependencies..."

# Install yt-dlp (standalone binary - most reliable method)
echo "📥 Installing yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

# Install ffmpeg (should be pre-installed on Render, but just in case)
echo "📥 Checking ffmpeg..."
which ffmpeg || echo "⚠️ ffmpeg not found, some features may not work"

# Install aria2 (for turbo downloads)
echo "📥 Installing aria2..."
apt-get update && apt-get install -y aria2 || true

# Verify installations
echo ""
echo "✅ Verifying installations..."
which yt-dlp && yt-dlp --version || echo "❌ yt-dlp failed"
which ffmpeg && ffmpeg -version 2>&1 | head -1 || echo "❌ ffmpeg not found"
which aria2c && aria2c --version | head -1 || echo "⚠️ aria2c not available"

# Install Node.js dependencies
echo ""
echo "📦 Installing npm packages..."
npm install

echo ""
echo "🎉 Build complete!"
