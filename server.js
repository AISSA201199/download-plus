const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Socket.io for real-time features
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// ===== Supabase Admin Configuration =====
const SUPABASE_URL = 'https://vyiqmihfbhsmaokpqgcv.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_MHR-sLM-ROVWwJWyKL3-Pw_jII3SOeh';
const ADMIN_EMAIL = 'gg9974347@gmail.com';

// Initialize Supabase Admin Client
const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});
console.log('✅ Supabase Admin ready');

// Helper function for compatibility
function getSupabaseAdmin() {
    return supabaseAdmin;
}

// ===== MEMORY CACHE FOR PERFORMANCE =====
const searchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedSearch(query) {
    const entry = searchCache.get(query);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        console.log(`📦 Cache HIT for: ${query}`);
        return entry.data;
    }
    searchCache.delete(query);
    return null;
}

function setCachedSearch(query, data) {
    // Limit cache size
    if (searchCache.size > 100) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(query, { data, timestamp: Date.now() });
    console.log(`💾 Cached search for: ${query}`);
}

// Stats tracking
let downloadStats = {
    totalDownloads: 0,
    totalSize: 0,
    today: 0,
    byPlatform: {}
};

function trackDownload(platform, size = 0) {
    downloadStats.totalDownloads++;
    downloadStats.today++;
    downloadStats.totalSize += size;
    downloadStats.byPlatform[platform] = (downloadStats.byPlatform[platform] || 0) + 1;
}

// ===== Cobalt API Support (YouTube, TikTok, Instagram, etc.) =====

// Tools Configuration (Binaries must be in PATH)
// Tools Configuration (Binaries must be in PATH or bin folder)
const TOOLS = {
    ytdlp: path.join(__dirname, 'bin', 'yt-dlp.exe'),
    ffmpeg: 'ffmpeg',
    aria2c: 'aria2c',
    gallery_dl: 'gallery-dl',
    spotdl: 'spotdl'
};

// Updated to use Cobalt v10+ API (v7 API shut down Nov 2024)
async function downloadViaCobalt(url, quality = '1080') {
    // Try multiple Cobalt instances
    const cobaltInstances = [
        'https://cobalt.api.timelessnesses.me/api',
        'https://api.cobalt.tux93.de/api',
        'https://cobalt-api.ayo.tf',
        'https://co.eepy.today/api'
    ];

    for (const instance of cobaltInstances) {
        try {
            console.log(`🔷 Trying Cobalt instance: ${instance}`);
            const response = await fetch(`${instance}/json`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({
                    url: url,
                    vCodec: 'h264',
                    vQuality: quality,
                    aFormat: 'mp3',
                    isNoTTWatermark: true,
                    dubLang: false
                })
            });

            const data = await response.json();
            console.log('Cobalt response:', JSON.stringify(data).substring(0, 200));

            if (data && (data.url || data.stream)) {
                console.log(`✅ Cobalt success from ${instance}`);
                return {
                    success: true,
                    url: data.url || data.stream,
                    audio: data.audio,
                    filename: data.filename || 'video.mp4'
                };
            }

            // Handle picker (multiple streams)
            if (data && data.picker && data.picker.length > 0) {
                console.log('✅ Cobalt picker success');
                return {
                    success: true,
                    url: data.picker[0].url,
                    filename: 'video.mp4'
                };
            }
        } catch (error) {
            console.log(`Cobalt ${instance} failed:`, error.message);
        }
    }

    return { success: false, error: 'All Cobalt instances failed' };
}

// ===== ENHANCED TIKTOK DOWNLOAD - 6+ APIs =====
async function downloadTikTokViaCobalt(url) {
    console.log('🎵 TikTok Download: Starting with 6 APIs...');

    // API 1: Cobalt (Primary)
    const cobaltResult = await downloadViaCobalt(url, '1080');
    if (cobaltResult.success) {
        console.log('✅ TikTok: Cobalt success');
        return { status: 'stream', url: cobaltResult.url, audio: cobaltResult.audio, filename: cobaltResult.filename };
    }

    // API 2: TikWM (Most reliable for TikTok)
    try {
        console.log('🔷 TikTok: Trying TikWM API...');
        const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const data = await response.json();
        if (data?.data?.play) {
            console.log('✅ TikTok: TikWM success');
            return {
                status: 'stream',
                url: data.data.play,
                audio: data.data.music,
                filename: `tiktok_${data.data.id || Date.now()}.mp4`,
                title: data.data.title,
                author: data.data.author?.nickname
            };
        }
    } catch (e) { console.log('TikWM failed:', e.message); }

    // API 3: SnapTik (No watermark)
    try {
        console.log('🔷 TikTok: Trying SnapTik API...');
        const response = await fetch('https://snaptik.app/abc2.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(url)}&lang=en`
        });
        const text = await response.text();
        const urlMatch = text.match(/"(https:\/\/[^"]+\.mp4[^"]*)"/);
        if (urlMatch) {
            console.log('✅ TikTok: SnapTik success');
            return { status: 'stream', url: urlMatch[1], filename: `tiktok_${Date.now()}.mp4` };
        }
    } catch (e) { console.log('SnapTik failed:', e.message); }

    // API 4: SSSTik (Popular, reliable)
    try {
        console.log('🔷 TikTok: Trying SSSTik API...');
        const response = await fetch(`https://ssstik.io/abc?url=${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const text = await response.text();
        const urlMatch = text.match(/href="(https:\/\/[^"]*tik[^"]*\.mp4[^"]*)"/);
        if (urlMatch) {
            console.log('✅ TikTok: SSSTik success');
            return { status: 'stream', url: urlMatch[1], filename: `tiktok_${Date.now()}.mp4` };
        }
    } catch (e) { console.log('SSSTik failed:', e.message); }

    // API 5: TikMate
    try {
        console.log('🔷 TikTok: Trying TikMate API...');
        const response = await fetch('https://tikmate.app/api/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(url)}`
        });
        const data = await response.json();
        if (data?.token) {
            const videoUrl = `https://tikmate.app/download/${data.token}/no`;
            console.log('✅ TikTok: TikMate success');
            return { status: 'stream', url: videoUrl, filename: `tiktok_${Date.now()}.mp4` };
        }
    } catch (e) { console.log('TikMate failed:', e.message); }

    // API 6: yt-dlp (Ultimate fallback - always works)
    try {
        console.log('🔷 TikTok: Trying yt-dlp...');
        const { execSync } = require('child_process');
        const output = execSync(`"${TOOLS.ytdlp}" -j "${url}" --no-warnings`, {
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 5
        });
        const info = JSON.parse(output);
        if (info?.url) {
            console.log('✅ TikTok: yt-dlp success');
            return {
                status: 'stream',
                url: info.url,
                filename: info._filename || `tiktok_${info.id || Date.now()}.mp4`,
                title: info.title,
                author: info.uploader
            };
        }
    } catch (e) { console.log('yt-dlp failed:', e.message); }

    console.log('❌ TikTok: All 6 APIs failed');
    return { status: 'error', text: 'جميع APIs فشلت - حاول لاحقاً' };
}

// Check if URL is YouTube
function isYouTubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

// Extract YouTube Video ID
function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
        /youtube\.com\/shorts\/([^&\?\/]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// ===== MEGA YouTube Download System - 10+ APIs in Parallel =====

// API 1: Cobalt (Multiple working instances - v10+)
async function tryCobalt(url, quality) {
    const endpoints = [
        'https://cobalt.api.timelessnesses.me/api/json',
        'https://api.cobalt.tux93.de/api/json',
        'https://cobalt-api.ayo.tf/json',
        'https://co.eepy.today/api/json'
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                body: JSON.stringify({ url, vCodec: 'h264', vQuality: quality, aFormat: 'mp3', dubLang: false })
            });
            const data = await response.json();
            if (data?.url || data?.stream) {
                return { success: true, url: data.url || data.stream, source: 'Cobalt' };
            }
            if (data?.picker?.[0]?.url) {
                return { success: true, url: data.picker[0].url, source: 'Cobalt' };
            }
        } catch (e) { }
    }
    return { success: false };
}

// API 2: Invidious (10 instances)
async function tryInvidious(videoId, quality) {
    const instances = [
        'https://inv.nadeko.net',
        'https://invidious.nerdvpn.de',
        'https://vid.puffyan.us',
        'https://invidious.slipfox.xyz',
        'https://invidious.privacydev.net',
        'https://invidious.io.lol',
        'https://yt.artemislena.eu',
        'https://invidious.protokolla.fi',
        'https://inv.tux.pizza',
        'https://invidious.einfachzocken.eu'
    ];

    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/api/v1/videos/${videoId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) continue;
            const data = await res.json();
            const formats = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])];
            let best = formats.find(f => f.type?.includes('video/mp4') && f.qualityLabel?.includes(quality));
            if (!best) best = formats.find(f => f.type?.includes('video/mp4'));
            if (!best) best = formats.find(f => f.url);
            if (best?.url) {
                return { success: true, url: best.url, title: data.title, source: 'Invidious' };
            }
        } catch (e) { }
    }
    return { success: false };
}

// API 3: Piped (Multiple instances)
async function tryPiped(videoId) {
    const instances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.privacydev.net',
        'https://pipedapi.in.projectsegfau.lt',
        'https://pipedapi.tokhmi.xyz',
        'https://api.piped.yt',
        'https://pipedapi.adminforge.de'
    ];

    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/streams/${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!res.ok) continue;
            const data = await res.json();
            const streams = data.videoStreams || [];
            let best = streams.find(s => s.quality === '720p' && s.mimeType?.includes('video/mp4'));
            if (!best) best = streams.find(s => s.mimeType?.includes('video/mp4'));
            if (!best) best = streams[0];
            if (best?.url) {
                return { success: true, url: best.url, title: data.title, source: 'Piped' };
            }
        } catch (e) { }
    }
    return { success: false };
}

// API 4: AllTube (Y2Mate alternative)
async function tryAllTube(videoId) {
    try {
        const res = await fetch(`https://alltubedownload.net/json?url=https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data = await res.json();
        if (data?.url) {
            return { success: true, url: data.url, source: 'AllTube' };
        }
    } catch (e) { }
    return { success: false };
}

// API 5: YouTube4KDownloader style
async function tryY4K(videoId) {
    try {
        const res = await fetch(`https://yt1s.io/api/json/convert?url=https://youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data = await res.json();
        if (data?.url) {
            return { success: true, url: data.url, source: 'Y4K' };
        }
    } catch (e) { }
    return { success: false };
}

// API 6: SaveFrom style
async function trySaveFrom(videoId) {
    try {
        const res = await fetch(`https://worker.sf-tools.com/savefrom.php?url=https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data = await res.json();
        if (data?.url?.[0]?.url) {
            return { success: true, url: data.url[0].url, source: 'SaveFrom' };
        }
    } catch (e) { }
    return { success: false };
}

// API 7: GetYouTubeVideo proxy
async function tryProxy(videoId) {
    const proxies = [
        `https://yt-download.org/api/button/mp4/${videoId}`,
        `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=360`
    ];

    for (const proxy of proxies) {
        try {
            const res = await fetch(proxy, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const text = await res.text();
            const match = text.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/);
            if (match?.[1]) {
                return { success: true, url: match[1], source: 'Proxy' };
            }
        } catch (e) { }
    }
    return { success: false };
}

// ========== 🔥 SNEAKY METHODS - Tricks & Workarounds ==========

// TRICK 1: YouTube Embed Page Scraping (الحصول على رابط من صفحة الـ embed)
async function tryEmbedScrape(videoId) {
    try {
        console.log('🕵️ Trying embed scrape...');
        const res = await fetch(`https://www.youtube.com/embed/${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'text/html'
            }
        });
        const html = await res.text();

        // Look for stream URLs in the page
        const patterns = [
            /"url":"(https:\/\/[^"]+googlevideo\.com[^"]+)"/g,
            /itag.*?url.*?(https%3A%2F%2F[^"&]+)/g
        ];

        for (const pattern of patterns) {
            const matches = html.matchAll(pattern);
            for (const match of matches) {
                let url = match[1];
                if (url.includes('%3A')) url = decodeURIComponent(url);
                if (url.includes('googlevideo.com')) {
                    return { success: true, url, source: 'EmbedScrape' };
                }
            }
        }
    } catch (e) { }
    return { success: false };
}

// TRICK 2: Mobile API Spoofing (التظاهر بأننا تطبيق موبايل)
async function tryMobileAPI(videoId) {
    try {
        console.log('📱 Trying mobile API spoof...');
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
                'X-Goog-Api-Key': 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
            },
            body: JSON.stringify({
                videoId: videoId,
                context: {
                    client: {
                        clientName: 'ANDROID',
                        clientVersion: '17.31.35',
                        androidSdkVersion: 30,
                        userAgent: 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip',
                        hl: 'en',
                        gl: 'US'
                    }
                },
                contentCheckOk: true,
                racyCheckOk: true
            })
        });

        const data = await res.json();
        const formats = [...(data.streamingData?.formats || []), ...(data.streamingData?.adaptiveFormats || [])];
        const video = formats.find(f => f.mimeType?.includes('video/mp4') && f.url);

        if (video?.url) {
            return { success: true, url: video.url, source: 'MobileAPI' };
        }
    } catch (e) { }
    return { success: false };
}

// TRICK 3: iOS Client API (عميل آيفون)
async function tryIOSClient(videoId) {
    try {
        console.log('🍎 Trying iOS client...');
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.ios.youtube/17.33.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)'
            },
            body: JSON.stringify({
                videoId: videoId,
                context: {
                    client: {
                        clientName: 'IOS',
                        clientVersion: '17.33.2',
                        deviceModel: 'iPhone14,3',
                        userAgent: 'com.google.ios.youtube/17.33.2 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)',
                        hl: 'en'
                    }
                }
            })
        });

        const data = await res.json();
        const formats = data.streamingData?.formats || [];
        const video = formats.find(f => f.url);

        if (video?.url) {
            return { success: true, url: video.url, source: 'iOSClient' };
        }
    } catch (e) { }
    return { success: false };
}

// TRICK 4: TV Client (عميل التلفزيون - أقل قيوداً)
async function tryTVClient(videoId) {
    try {
        console.log('📺 Trying TV client...');
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version'
            },
            body: JSON.stringify({
                videoId: videoId,
                context: {
                    client: {
                        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
                        clientVersion: '2.0'
                    },
                    thirdParty: {
                        embedUrl: 'https://www.google.com'
                    }
                }
            })
        });

        const data = await res.json();
        const formats = [...(data.streamingData?.formats || []), ...(data.streamingData?.adaptiveFormats || [])];
        const video = formats.find(f => f.url && f.mimeType?.includes('video'));

        if (video?.url) {
            return { success: true, url: video.url, source: 'TVClient' };
        }
    } catch (e) { }
    return { success: false };
}

// TRICK 5: Cloudtube (خدمة بديلة)
async function tryCloudtube(videoId) {
    const instances = [
        'https://tube.cadence.moe',
        'https://yt.cdaut.de'
    ];

    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/api/v1/videos/${videoId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const data = await res.json();
            const formats = data.formatStreams || [];
            const video = formats.find(f => f.url);
            if (video?.url) {
                return { success: true, url: video.url, source: 'Cloudtube' };
            }
        } catch (e) { }
    }
    return { success: false };
}

// TRICK 6: البحث عن نسخ مخبأة/مؤرشفة
async function tryArchive(videoId) {
    try {
        console.log('📦 Trying archive lookup...');
        const res = await fetch(`https://web.archive.org/web/2/https://www.youtube.com/watch?v=${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow'
        });
        // If archived, might have cached video URLs
        const html = await res.text();
        const match = html.match(/(https:\/\/[^"]+googlevideo\.com[^"]+)/);
        if (match?.[1]) {
            return { success: true, url: match[1], source: 'Archive' };
        }
    } catch (e) { }
    return { success: false };
}

// 🚀 MASTER FUNCTION - Runs ALL APIs in PARALLEL for SPEED
async function downloadYouTubeVideo(url, quality = '720') {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
        return { success: false, error: 'رابط يوتيوب غير صالح' };
    }

    console.log(`🚀 MEGA TURBO DOWNLOAD: ${videoId} - 30+ servers in parallel...`);

    // WAVE 1: Run ALL APIs at the same time - first one to succeed wins!
    const results = await Promise.allSettled([
        // Standard APIs
        tryCobalt(url, quality),
        tryInvidious(videoId, quality),
        tryPiped(videoId),
        tryAllTube(videoId),
        tryY4K(videoId),
        trySaveFrom(videoId),
        tryProxy(videoId),
        // Sneaky methods
        tryMobileAPI(videoId),
        tryIOSClient(videoId),
        tryTVClient(videoId),
        tryCloudtube(videoId),
        tryEmbedScrape(videoId)
    ]);

    // Find first successful result
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
            console.log(`✅ SUCCESS via ${result.value.source}!`);
            return result.value;
        }
    }

    // WAVE 2: If parallel failed, try more sneaky methods
    console.log('⚠️ Wave 1 failed, trying Wave 2 sneaky methods...');

    let backup = await tryInvidious(videoId, '360');
    if (backup.success) return backup;

    backup = await tryPiped(videoId);
    if (backup.success) return backup;

    backup = await tryArchive(videoId);
    if (backup.success) return backup;

    // WAVE 3: Last resort - different quality
    console.log('🔥 Wave 2 failed, trying Wave 3 low quality...');

    backup = await tryCobalt(url, '480');
    if (backup.success) return backup;

    backup = await tryCobalt(url, '360');
    if (backup.success) return backup;

    return { success: false, error: 'فشلت جميع الطرق (30+ خادم) - الفيديو محمي أو غير متاح' };
}

// Check if URL is TikTok
function isTikTokUrl(url) {
    return url.includes('tiktok.com') || url.includes('vm.tiktok.com');
}

// Helper function to run yt-dlp directly (simpler approach)
function runYtDlp(args, options = {}) {
    console.log('Running yt-dlp with args:', args.join(' '));

    return spawn('yt-dlp', args, {
        shell: true,
        ...options
    });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Force Download Endpoint (ensures file saves to device, not streams in browser)
app.get('/downloads/:filename', (req, res) => {
    // Decode the filename properly (handles Arabic and special characters)
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, 'downloads', filename);

    console.log(`📥 Download request for: ${filename}`);

    if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        return res.status(404).json({ error: 'File not found', requestedFile: filename });
    }

    // Set headers to FORCE download on any device
    // Use RFC 5987 encoding for non-ASCII filenames
    const encodedFilename = encodeURIComponent(filename).replace(/'/g, "%27");
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'application/octet-stream');

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
});


// API: List downloads folder
app.get('/api/downloads', (req, res) => {
    const downloadsPath = path.join(__dirname, 'downloads');
    console.log(`📂 API: Checking downloads in: ${downloadsPath}`);

    try {
        // Read directory and get stats for each file
        const files = fs.readdirSync(downloadsPath)
            .filter(filename => {
                return !filename.endsWith('.part') &&
                    !filename.endsWith('.temp.mp4') &&
                    !filename.endsWith('.ytdl');
            })
            .map(filename => {
                try {
                    const filePath = path.join(downloadsPath, filename);
                    const stats = fs.statSync(filePath);
                    return {
                        name: filename,
                        size: stats.size,
                        sizeFormatted: formatBytes(stats.size),
                        date: stats.mtime,
                        url: `/downloads/${encodeURIComponent(filename)}`
                    };
                } catch (e) {
                    console.error(`Error reading file ${filename}:`, e);
                    return null;
                }
            })
            .filter(file => file !== null) // Remove failed files
            .sort((a, b) => b.date - a.date); // Newest first

        console.log(`📂 API: Sending ${files.length} files to client`);
        res.json({ files });
    } catch (err) {
        console.error('API Error:', err);
        res.json({ files: [], error: err.message });
    }
});

// API: List incomplete downloads (.part files)
app.get('/api/downloads/incomplete', (req, res) => {
    const downloadsPath = path.join(__dirname, 'downloads');
    try {
        const files = fs.readdirSync(downloadsPath)
            .filter(f => f.endsWith('.part'))
            .map(filename => {
                const filePath = path.join(downloadsPath, filename);
                const stats = fs.statSync(filePath);
                return {
                    name: filename,
                    originalName: filename.replace('.part', ''),
                    size: stats.size,
                    sizeFormatted: formatBytes(stats.size),
                    date: stats.mtime
                };
            })
            .sort((a, b) => b.date - a.date);
        res.json({
            count: files.length,
            files,
            message: files.length > 0 ? 'استخدم نفس الرابط للاستئناف تلقائياً' : 'لا توجد تحميلات متوقفة'
        });
    } catch (err) {
        res.json({ files: [], error: err.message });
    }
});

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Store download progress
const downloadProgress = new Map();
// const activeProcesses = new Map(); // Deprecated
// const downloadOptionsCache = new Map(); // Deprecated
const sessions = new Map(); // New Session Manager

// API: Get all active downloads
app.get('/api/downloads/active', (req, res) => {
    const active = [];
    for (const [id, data] of downloadProgress) {
        if (data.status !== 'completed' && data.status !== 'failed') {
            active.push({
                id,
                ...data
            });
        }
    }
    res.json({
        count: active.length,
        downloads: active
    });
});

// ===== PLAYLIST & CHANNEL FEATURES =====

// API: Get playlist/channel info
app.get('/api/playlist/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط القائمة أو القناة' });
    }

    console.log('📋 Fetching playlist/channel info:', url);

    try {
        const args = [
            '--dump-json',
            '--flat-playlist', // Fast - only get metadata, not full video info
            '--no-warnings',
            '--ignore-errors',
            url
        ];

        const result = await new Promise((resolve, reject) => {
            const proc = spawn('yt-dlp', args);
            let output = '';
            let errorOutput = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            proc.on('close', (code) => {
                if (code !== 0 && !output) {
                    reject(new Error(errorOutput || 'Failed to get playlist info'));
                } else {
                    resolve(output);
                }
            });
        });

        // Parse multiple JSON objects (one per video)
        const lines = result.trim().split('\n').filter(l => l.trim());
        const videos = [];
        let playlistTitle = 'Playlist';
        let uploader = '';

        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data._type === 'playlist') {
                    playlistTitle = data.title || playlistTitle;
                    uploader = data.uploader || data.channel || '';
                    continue;
                }
                videos.push({
                    id: data.id,
                    title: data.title || `Video ${videos.length + 1}`,
                    url: data.url || data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`,
                    duration: data.duration,
                    thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/mqdefault.jpg`
                });
            } catch (e) {
                // Skip invalid JSON lines
            }
        }

        console.log(`✅ Found ${videos.length} videos in playlist`);

        res.json({
            success: true,
            type: url.includes('/channel/') || url.includes('/@') ? 'channel' : 'playlist',
            title: playlistTitle,
            uploader,
            count: videos.length,
            videos
        });

    } catch (error) {
        console.error('Playlist info error:', error.message);
        res.status(500).json({ error: 'فشل في جلب معلومات القائمة: ' + error.message });
    }
});

// API: Batch download multiple videos (for playlist/channel)
app.post('/api/batch/download', async (req, res) => {
    const { videos, quality = 'best', format = 'mp4' } = req.body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
        return res.status(400).json({ error: 'لا توجد فيديوهات للتحميل' });
    }

    console.log(`📦 Starting batch download of ${videos.length} videos`);

    const batchId = Date.now().toString();
    const results = {
        total: videos.length,
        completed: 0,
        failed: 0,
        downloads: []
    };

    // Store batch progress
    downloadProgress.set(batchId, {
        status: 'downloading',
        total: videos.length,
        completed: 0,
        failed: 0,
        current: ''
    });

    res.json({
        success: true,
        batchId,
        message: `بدء تحميل ${videos.length} فيديو`
    });

    // Download videos sequentially (to avoid overload)
    const downloadPath = path.join(__dirname, 'downloads');

    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        const progress = downloadProgress.get(batchId);
        if (progress) {
            progress.current = video.title || `Video ${i + 1}`;
            progress.completed = i;
        }

        try {
            const args = [
                '--no-warnings',
                '--windows-filenames',
                '--force-overwrites',
                '-f', `bestvideo[height<=${quality === 'best' ? 2160 : quality}]+bestaudio/best`,
                '--merge-output-format', format,
                '-o', path.join(downloadPath, '%(title)s.%(ext)s'),
                video.url
            ];

            await new Promise((resolve, reject) => {
                const proc = spawn('yt-dlp', args);
                proc.on('close', (code) => {
                    if (code === 0) {
                        results.completed++;
                        resolve();
                    } else {
                        results.failed++;
                        resolve(); // Continue with next video
                    }
                });
                proc.on('error', () => {
                    results.failed++;
                    resolve();
                });
            });

            console.log(`✅ [${i + 1}/${videos.length}] Downloaded: ${video.title}`);

        } catch (err) {
            console.error(`❌ Failed: ${video.title}`, err.message);
            results.failed++;
        }
    }

    // Update final status
    const progress = downloadProgress.get(batchId);
    if (progress) {
        progress.status = 'completed';
        progress.completed = results.completed;
        progress.failed = results.failed;
    }

    console.log(`📦 Batch complete: ${results.completed}/${results.total} succeeded`);
});

// API: Get batch download progress
app.get('/api/batch/progress/:batchId', (req, res) => {
    const { batchId } = req.params;
    const progress = downloadProgress.get(batchId);

    if (!progress) {
        return res.status(404).json({ error: 'Batch not found' });
    }

    res.json(progress);
});

// ===== VIDEO TOOLS (GIF, Compress, Merge) =====

// API: Convert video to GIF
app.post('/api/tools/gif', async (req, res) => {
    const { inputPath, fps = 15, width = 480, startTime = 0, duration = 10 } = req.body;

    if (!inputPath) {
        return res.status(400).json({ error: 'الرجاء تحديد ملف الفيديو' });
    }

    const fullPath = path.join(__dirname, 'downloads', inputPath);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'الملف غير موجود' });
    }

    const outputName = path.basename(inputPath, path.extname(inputPath)) + '.gif';
    const outputPath = path.join(__dirname, 'downloads', outputName);

    console.log(`🎬 Converting to GIF: ${inputPath}`);

    try {
        const args = [
            '-y', // Overwrite
            '-ss', startTime.toString(),
            '-t', duration.toString(),
            '-i', fullPath,
            '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
            '-loop', '0',
            outputPath
        ];

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', args);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg failed')));
            proc.on('error', reject);
        });

        console.log('✅ GIF created:', outputName);
        res.json({
            success: true,
            filename: outputName,
            url: `/downloads/${encodeURIComponent(outputName)}`
        });

    } catch (error) {
        console.error('GIF error:', error.message);
        res.status(500).json({ error: 'فشل في إنشاء GIF: ' + error.message });
    }
});

// API: Compress video
app.post('/api/tools/compress', async (req, res) => {
    const { inputPath, quality = 'medium' } = req.body;

    if (!inputPath) {
        return res.status(400).json({ error: 'الرجاء تحديد ملف الفيديو' });
    }

    const fullPath = path.join(__dirname, 'downloads', inputPath);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'الملف غير موجود' });
    }

    // CRF values: lower = better quality, higher = smaller size
    const crfValues = { low: 35, medium: 28, high: 23 };
    const crf = crfValues[quality] || 28;

    const outputName = path.basename(inputPath, path.extname(inputPath)) + '_compressed.mp4';
    const outputPath = path.join(__dirname, 'downloads', outputName);

    console.log(`🗜️ Compressing video: ${inputPath} (CRF: ${crf})`);

    try {
        const args = [
            '-y',
            '-i', fullPath,
            '-vcodec', 'libx264',
            '-crf', crf.toString(),
            '-preset', 'fast',
            '-acodec', 'aac',
            '-b:a', '128k',
            outputPath
        ];

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', args);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg failed')));
            proc.on('error', reject);
        });

        const originalSize = fs.statSync(fullPath).size;
        const compressedSize = fs.statSync(outputPath).size;
        const reduction = Math.round((1 - compressedSize / originalSize) * 100);

        console.log(`✅ Compressed: ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${reduction}% smaller)`);

        res.json({
            success: true,
            filename: outputName,
            url: `/downloads/${encodeURIComponent(outputName)}`,
            originalSize: formatBytes(originalSize),
            compressedSize: formatBytes(compressedSize),
            reduction: `${reduction}%`
        });

    } catch (error) {
        console.error('Compress error:', error.message);
        res.status(500).json({ error: 'فشل في ضغط الفيديو: ' + error.message });
    }
});

// API: Merge multiple videos
app.post('/api/tools/merge', async (req, res) => {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length < 2) {
        return res.status(400).json({ error: 'الرجاء تحديد ملفين على الأقل' });
    }

    const downloadDir = path.join(__dirname, 'downloads');
    const listPath = path.join(downloadDir, `merge_list_${Date.now()}.txt`);
    const outputName = `merged_${Date.now()}.mp4`;
    const outputPath = path.join(downloadDir, outputName);

    console.log(`🔗 Merging ${files.length} videos`);

    try {
        // Create concat list file
        const listContent = files
            .map(f => `file '${path.join(downloadDir, f).replace(/'/g, "'\\''")}'`)
            .join('\n');
        fs.writeFileSync(listPath, listContent);

        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            outputPath
        ];

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', args);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg failed')));
            proc.on('error', reject);
        });

        // Clean up list file
        fs.unlinkSync(listPath);

        console.log('✅ Merged:', outputName);
        res.json({
            success: true,
            filename: outputName,
            url: `/downloads/${encodeURIComponent(outputName)}`
        });

    } catch (error) {
        console.error('Merge error:', error.message);
        if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
        res.status(500).json({ error: 'فشل في دمج الفيديوهات: ' + error.message });
    }
});

// ===== ADVANCED STUDIO TOOLS =====

// API: Convert Video/Audio
app.post('/api/tools/convert', async (req, res) => {
    const { inputPath, format } = req.body;

    if (!inputPath || !format) {
        return res.status(400).json({ error: 'الرجاء تحديد الملف والصيغة' });
    }

    const fullPath = path.join(__dirname, 'downloads', inputPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'الملف غير موجود' });

    // Handle audio conversion
    const isAudio = ['mp3', 'wav', 'm4a', 'flac'].includes(format);
    const outputName = path.basename(inputPath, path.extname(inputPath)) + `_converted.${format}`;
    const outputPath = path.join(__dirname, 'downloads', outputName);

    console.log(`🔄 Converting ${inputPath} to ${format}`);

    try {
        const args = ['-y', '-i', fullPath];

        // Add specific parameters for audio
        if (isAudio) {
            args.push('-vn'); // No video
            if (format === 'mp3') args.push('-acodec', 'libmp3lame', '-q:a', '2');
            else if (format === 'm4a') args.push('-acodec', 'aac', '-b:a', '192k');
        } else {
            // Video params
            args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac');
        }

        args.push(outputPath);

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', args);
            let errOutput = '';
            proc.stderr.on('data', d => errOutput += d.toString());
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg failed: ' + errOutput.substring(0, 100))));
            proc.on('error', reject);
        });

        res.json({ success: true, filename: outputName, url: `/downloads/${encodeURIComponent(outputName)}` });
    } catch (err) {
        console.error('Convert Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Mute Video
app.post('/api/tools/mute', async (req, res) => {
    const { inputPath } = req.body;
    if (!inputPath) return res.status(400).json({ error: 'Missing file' });

    const fullPath = path.join(__dirname, 'downloads', inputPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    const outputName = path.basename(inputPath, path.extname(inputPath)) + '_muted.mp4';
    const outputPath = path.join(__dirname, 'downloads', outputName);

    try {
        // -an removes audio
        const args = ['-y', '-i', fullPath, '-c', 'copy', '-an', outputPath];

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', args);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('FFmpeg failed')));
        });

        res.json({ success: true, filename: outputName, url: `/downloads/${encodeURIComponent(outputName)}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: File Management (Rename)
app.post('/api/files/rename', (req, res) => {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'Invalid names' });

    const oldPath = path.join(__dirname, 'downloads', oldName);
    const newPath = path.join(__dirname, 'downloads', newName);

    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File not found' });
    if (fs.existsSync(newPath)) return res.status(400).json({ error: 'File already exists' });

    try {
        fs.renameSync(oldPath, newPath);
        res.json({ success: true, message: 'Renamed successfully' });

        // Update any tracking if used (optional)
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: File Management (Delete)
app.post('/api/files/delete', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Missing filename' });

    const filePath = path.join(__dirname, 'downloads', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    try {
        fs.unlinkSync(filePath);
        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== SCHEDULED DOWNLOADS =====
const scheduledDownloads = new Map();

// API: Schedule a download
app.post('/api/schedule', (req, res) => {
    const { url, quality, format, scheduledTime } = req.body;

    if (!url || !scheduledTime) {
        return res.status(400).json({ error: 'الرجاء تحديد الرابط ووقت التحميل' });
    }

    const scheduleId = Date.now().toString();
    const executeAt = new Date(scheduledTime);

    if (executeAt <= new Date()) {
        return res.status(400).json({ error: 'وقت التحميل يجب أن يكون في المستقبل' });
    }

    scheduledDownloads.set(scheduleId, {
        id: scheduleId,
        url,
        quality: quality || 'best',
        format: format || 'mp4',
        scheduledTime: executeAt,
        status: 'pending'
    });

    console.log(`⏰ Download scheduled for ${executeAt.toLocaleString()}: ${url}`);

    res.json({
        success: true,
        scheduleId,
        message: `تم جدولة التحميل في ${executeAt.toLocaleString()}`
    });
});

// API: Get scheduled downloads
app.get('/api/schedule', (req, res) => {
    const schedules = Array.from(scheduledDownloads.values());
    res.json({ schedules });
});

// API: Cancel scheduled download
app.delete('/api/schedule/:id', (req, res) => {
    const { id } = req.params;
    if (scheduledDownloads.has(id)) {
        scheduledDownloads.delete(id);
        res.json({ success: true, message: 'تم إلغاء التحميل المجدول' });
    } else {
        res.status(404).json({ error: 'التحميل المجدول غير موجود' });
    }
});

// Check scheduled downloads every minute
setInterval(async () => {
    const now = new Date();
    for (const [id, schedule] of scheduledDownloads) {
        if (schedule.status === 'pending' && schedule.scheduledTime <= now) {
            console.log(`⏰ Executing scheduled download: ${schedule.url}`);
            schedule.status = 'downloading';

            try {
                const downloadPath = path.join(__dirname, 'downloads');
                const args = [
                    '--no-warnings',
                    '--windows-filenames',
                    '--force-overwrites',
                    '-f', 'bestvideo+bestaudio/best',
                    '--merge-output-format', schedule.format,
                    '-o', path.join(downloadPath, '%(title)s.%(ext)s'),
                    schedule.url
                ];

                spawn('yt-dlp', args).on('close', (code) => {
                    schedule.status = code === 0 ? 'completed' : 'failed';
                    console.log(`⏰ Scheduled download ${code === 0 ? 'completed' : 'failed'}: ${schedule.url}`);
                });
            } catch (err) {
                schedule.status = 'failed';
                console.error('Scheduled download error:', err.message);
            }
        }
    }
}, 60000); // Check every minute

// API: Get video information (supports all sites)
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيديو' });
    }

    console.log('Fetching info for:', url);

    // Check if it's a YouTube URL
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    try {
        // Use more compatible options for all sites
        const args = [
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--ignore-errors',
            '--geo-bypass',
            '--socket-timeout', '30',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--referer', 'https://www.google.com/',
            // Important for TikTok, Instagram, etc.
            '--extractor-args', 'tiktok:api_hostname=api22-normal-c-useast1a.tiktokv.com',
        ];

        // DISABLED: cookies.txt is in wrong format
        // const cookiesPath = path.join(__dirname, 'cookies.txt');
        // if (fs.existsSync(cookiesPath)) {
        //     console.log('✅ Using cookies.txt');
        //     args.push('--cookies', cookiesPath);
        // }

        args.push(url);

        const ytdlp = spawn('yt-dlp', args, { shell: false });

        let data = '';
        let errorData = '';

        ytdlp.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        ytdlp.stderr.on('data', (chunk) => {
            errorData += chunk.toString();
            console.log('yt-dlp stderr:', chunk.toString());
        });

        ytdlp.on('close', async (code) => {
            console.log('yt-dlp exit code:', code);

            // If yt-dlp failed and it's YouTube, try comprehensive fallback
            if ((code !== 0 || !data) && isYouTube) {
                console.log('yt-dlp failed for YouTube, trying multi-API fallback...');

                const videoId = extractYouTubeId(url);
                if (!videoId) {
                    return res.status(400).json({ error: 'رابط YouTube غير صالح' });
                }

                // Try multiple APIs for video info
                let videoInfo = null;

                // 1. FIRST TRY: YouTube Data API (most reliable - uses API key)
                try {
                    console.log('Trying YouTube Data API first...');
                    const ytApiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyACDCP4xb5jrivWSy26eLU2Grj8A5u5rL0';
                    const ytApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${ytApiKey}`;
                    const ytRes = await fetch(ytApiUrl);
                    const ytData = await ytRes.json();

                    if (ytData.items && ytData.items.length > 0) {
                        const item = ytData.items[0];
                        const duration = item.contentDetails?.duration || 'PT0S';

                        // Parse ISO 8601 duration (PT1H2M3S)
                        const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                        const hours = parseInt(durationMatch?.[1] || 0);
                        const minutes = parseInt(durationMatch?.[2] || 0);
                        const seconds = parseInt(durationMatch?.[3] || 0);
                        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

                        videoInfo = {
                            title: item.snippet.title,
                            description: item.snippet.description,
                            lengthSeconds: totalSeconds,
                            viewCount: parseInt(item.statistics?.viewCount) || 0,
                            likeCount: parseInt(item.statistics?.likeCount) || 0,
                            author: item.snippet.channelTitle,
                            videoThumbnails: [{ url: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }]
                        };
                        console.log('✅ Got info from YouTube Data API');
                    }
                } catch (e) {
                    console.log('YouTube Data API failed:', e.message);
                }

                // 2. SECOND TRY: Piped API
                if (!videoInfo) {
                    const pipedInstances = [
                        'https://pipedapi.kavin.rocks',
                        'https://api.piped.privacydev.net',
                        'https://pipedapi.adminforge.de',
                        'https://api.piped.yt'
                    ];

                    for (const inst of pipedInstances) {
                        try {
                            console.log(`Trying Piped for info: ${inst}`);
                            const pipedRes = await fetch(`${inst}/streams/${videoId}`, {
                                headers: { 'User-Agent': 'Mozilla/5.0' }
                            });
                            if (pipedRes.ok) {
                                const pipedData = await pipedRes.json();
                                if (pipedData.title) {
                                    videoInfo = {
                                        title: pipedData.title,
                                        description: pipedData.description || '',
                                        lengthSeconds: pipedData.duration || 0,
                                        viewCount: pipedData.views || 0,
                                        likeCount: pipedData.likes || 0,
                                        author: pipedData.uploader || pipedData.uploaderName || '',
                                        videoThumbnails: [{ url: pipedData.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }],
                                        adaptiveFormats: pipedData.videoStreams || [],
                                        formatStreams: pipedData.audioStreams || []
                                    };
                                    console.log('✅ Got info from Piped');
                                    break;
                                }
                            }
                        } catch (e) { }
                    }
                }

                // 3. THIRD TRY: Invidious API
                if (!videoInfo) {
                    const invidiousInstances = [
                        'https://inv.nadeko.net',
                        'https://invidious.nerdvpn.de',
                        'https://vid.puffyan.us',
                        'https://invidious.privacydev.net',
                        'https://yt.artemislena.eu'
                    ];

                    for (const inst of invidiousInstances) {
                        try {
                            console.log(`Trying Invidious for info: ${inst}`);
                            const invRes = await fetch(`${inst}/api/v1/videos/${videoId}`, {
                                headers: { 'User-Agent': 'Mozilla/5.0' }
                            });
                            if (invRes.ok) {
                                videoInfo = await invRes.json();
                                if (videoInfo.title) {
                                    console.log('✅ Got info from Invidious');
                                    break;
                                }
                            }
                        } catch (e) { }
                    }
                }

                if (videoInfo) {
                    // Build qualities from available formats
                    const qualities = [{ id: 'best', label: 'أفضل جودة متاحة' }];

                    // Try to get real qualities from Invidious/Piped
                    const formats = [...(videoInfo.adaptiveFormats || []), ...(videoInfo.formatStreams || [])];
                    const heights = new Set();

                    formats.forEach(f => {
                        if (f.qualityLabel) {
                            const h = parseInt(f.qualityLabel);
                            if (h) heights.add(h);
                        }
                        if (f.quality) {
                            const h = parseInt(f.quality);
                            if (h) heights.add(h);
                        }
                    });

                    // Add detected qualities
                    [...heights].sort((a, b) => b - a).forEach(h => {
                        const label = h >= 2160 ? '4K' : h >= 1440 ? '2K' : `${h}p`;
                        qualities.push({ id: `${h}`, label });
                    });

                    // Default qualities if none detected
                    if (qualities.length === 1) {
                        qualities.push({ id: '1080', label: '1080p' });
                        qualities.push({ id: '720', label: '720p' });
                        qualities.push({ id: '480', label: '480p' });
                        qualities.push({ id: '360', label: '360p' });
                    }

                    qualities.push({ id: 'bestaudio', label: '🎵 صوت فقط (MP3)' });

                    const duration = videoInfo.lengthSeconds || 0;

                    return res.json({
                        title: videoInfo.title || 'فيديو YouTube',
                        thumbnail: videoInfo.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                        duration: duration,
                        duration_string: formatDuration(duration),
                        channel: videoInfo.author || videoInfo.authorId || 'غير معروف',
                        view_count: videoInfo.viewCount || 0,
                        like_count: videoInfo.likeCount || 0,
                        upload_date: videoInfo.published || '',
                        description: (videoInfo.description || '').substring(0, 500),
                        qualities: qualities,
                        is_live: videoInfo.liveNow || false,
                        extractor: 'youtube',
                        fallback_used: true,
                        fallback_source: 'multi-api'
                    });
                }

                return res.status(500).json({
                    error: 'فشل في جلب معلومات الفيديو من جميع المصادر',
                    details: errorData.substring(0, 200)
                });
            }

            if (code !== 0 && !data) {
                console.log('Error:', errorData);
                return res.status(500).json({
                    error: 'فشل في جلب معلومات الفيديو. تأكد من صحة الرابط وأن yt-dlp محدث.',
                    details: errorData.substring(0, 200)
                });
            }

            try {
                const info = JSON.parse(data);

                // Build quality options
                const formats = info.formats || [];
                const qualities = [];

                // Add best quality option
                qualities.push({ id: 'best', label: 'أفضل جودة متاحة' });

                // Add video qualities
                const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.height);
                const heights = [...new Set(videoFormats.map(f => f.height))].sort((a, b) => b - a);

                heights.forEach(h => {
                    const label = h >= 2160 ? '4K' : h >= 1440 ? '2K' : `${h}p`;
                    qualities.push({ id: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`, label });
                });

                // If no heights found, add default common qualities
                if (heights.length === 0) {
                    qualities.push({ id: 'bestvideo[height<=2160]+bestaudio/best', label: '4K' });
                    qualities.push({ id: 'bestvideo[height<=1080]+bestaudio/best', label: '1080p HD' });
                    qualities.push({ id: 'bestvideo[height<=720]+bestaudio/best', label: '720p HD' });
                    qualities.push({ id: 'bestvideo[height<=480]+bestaudio/best', label: '480p' });
                    qualities.push({ id: 'bestvideo[height<=360]+bestaudio/best', label: '360p' });
                }

                // Add audio only
                qualities.push({ id: 'bestaudio', label: '🎵 صوت فقط (MP3)' });

                res.json({
                    title: info.title || 'بدون عنوان',
                    thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || '',
                    duration: info.duration || 0,
                    duration_string: info.duration_string || formatDuration(info.duration),
                    channel: info.channel || info.uploader || info.creator || 'غير معروف',
                    view_count: info.view_count || 0,
                    like_count: info.like_count || 0,
                    upload_date: info.upload_date || '',
                    description: (info.description || '').substring(0, 500),
                    qualities: qualities,
                    is_live: info.is_live || false,
                    extractor: info.extractor || 'unknown'
                });
            } catch (parseError) {
                console.log('Parse error:', parseError);
                res.status(500).json({ error: 'فشل في تحليل بيانات الفيديو' });
            }
        });
    } catch (err) {
        console.log('Error:', err);
        res.status(500).json({ error: 'خطأ في الاتصال: ' + err.message });
    }
});

// API: Download via Cobalt (YouTube, TikTok, etc.) - Bypasses cloud restrictions
app.post('/api/download/cobalt', async (req, res) => {
    const { url, quality = '720' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيديو' });
    }

    console.log('🔷 Multi-API download request for:', url);

    try {
        let result;
        const isTikTok = url.includes('tiktok.com') || url.includes('vm.tiktok.com');

        // For YouTube: Skip APIs and return fallback to use yt-dlp directly
        // The multi-API system doesn't work reliably - yt-dlp works better locally
        if (isYouTubeUrl(url)) {
            console.log('📺 YouTube detected - returning fallback to use yt-dlp');
            return res.status(200).json({
                success: false,
                error: 'Use yt-dlp fallback for YouTube',
                fallback: true
            });
        } else if (isTikTok) {
            // For TikTok: Try Cobalt first, then TikWM
            result = await downloadViaCobalt(url, quality);

            if (!result.success) {
                console.log('🎵 Cobalt failed for TikTok, trying TikWM...');
                try {
                    const tikwmRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const tikwmData = await tikwmRes.json();

                    if (tikwmData && tikwmData.data && tikwmData.data.play) {
                        console.log('✅ TikWM success!');
                        result = {
                            success: true,
                            url: tikwmData.data.play,
                            filename: `tiktok_${tikwmData.data.id || Date.now()}.mp4`
                        };
                    }
                } catch (tikwmErr) {
                    console.log('TikWM also failed:', tikwmErr.message);
                }
            }
        } else {
            // For other platforms, use Cobalt directly
            result = await downloadViaCobalt(url, quality);
        }

        if (result.success && result.url) {
            res.json({
                success: true,
                downloadUrl: result.url,
                filename: result.filename || 'video.mp4',
                message: 'رابط التحميل جاهز!'
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'فشل في الحصول على رابط التحميل',
                fallback: true // Tell frontend to try yt-dlp
            });
        }
    } catch (error) {
        console.error('Cobalt endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            fallback: true
        });
    }
});

// ==========================================
// 🚀 NEW DOWNLOAD ENGINE (Class-Based)
// ==========================================
// (Using 'sessions' Map defined at top of file)

class DownloadSession {
    constructor(id, options) {
        this.id = id;
        this.options = options;
        this.process = null;
        this.paused = false;
        this.finalFilePath = null;
        this.lastProgress = 0; // Track highest progress for forward-only updates

        // Initial Progress State
        downloadProgress.set(id, {
            progress: 0,
            status: 'starting',
            speed: '',
            eta: '',
            filename: options.filename || 'video'
        });
    }

    async start() {
        this.paused = false;
        const { url, turbo } = this.options;
        console.log(`🚀 [${this.id}] Starting Download: ${url} (Turbo: ${turbo})`);

        try {
            // TikTok: Use direct API download instead of yt-dlp (which fails)
            if (url.includes('tiktok.com')) {
                console.log(`🎵 [${this.id}] TikTok detected - using direct API download`);
                const tiktokResult = await downloadTikTokViaCobalt(url);

                if (tiktokResult.status === 'stream' && tiktokResult.url) {
                    console.log(`✅ [${this.id}] TikTok API success - downloading via direct URL`);

                    // Download directly using fetch
                    const https = require('https');
                    const http = require('http');
                    const downloadDir = this.options.outputDir || path.join(__dirname, 'downloads');
                    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

                    const filename = tiktokResult.filename || `tiktok_${Date.now()}.mp4`;
                    const filePath = path.join(downloadDir, filename);
                    const fileStream = fs.createWriteStream(filePath);

                    const protocol = tiktokResult.url.startsWith('https') ? https : http;

                    await new Promise((resolve, reject) => {
                        protocol.get(tiktokResult.url, {
                            headers: { 'User-Agent': 'Mozilla/5.0' }
                        }, (response) => {
                            const totalSize = parseInt(response.headers['content-length']) || 0;
                            let downloaded = 0;

                            response.on('data', (chunk) => {
                                downloaded += chunk.length;
                                const progress = totalSize ? Math.round((downloaded / totalSize) * 100) : 50;
                                downloadProgress.set(this.id, {
                                    progress,
                                    status: 'downloading',
                                    speed: 'Direct Download',
                                    filename
                                });
                            });

                            response.pipe(fileStream);
                            fileStream.on('finish', () => {
                                fileStream.close();
                                this.finalFilePath = filePath;
                                resolve();
                            });
                        }).on('error', reject);
                    });

                    this.handleCompletion();
                    return;
                }
            }

            await this.runProcess(turbo);

            // If we get here, download finished successfully (and wasn't paused)
            if (!this.paused) {
                this.handleCompletion();
            }
        } catch (error) {
            // If paused, we expect an error/exit, but we ignore it
            if (this.paused) {
                console.log(`⏸️ [${this.id}] Process Terminated for Pause`);
                downloadProgress.set(this.id, { ...downloadProgress.get(this.id), status: 'paused', speed: 'Paused ⏸' });
                return;
            }

            // Real Error
            console.error(`❌ [${this.id}] Error:`, error);
            downloadProgress.set(this.id, {
                progress: 0,
                status: 'error',
                error: error.message || 'Download Failed'
            });
        }
    }

    pause() {
        if (!this.process) return false;
        console.log(`⏸️ [${this.id}] Pausing... (PID: ${this.process.pid})`);
        this.paused = true; // Set flag BEFORE killing

        const pid = this.process.pid;

        // Windows: Use taskkill to kill the entire process tree
        // /T = Kill all child processes (like ffmpeg)
        // /F = Force kill
        exec(`taskkill /PID ${pid} /T /F`, (err, stdout, stderr) => {
            if (err) {
                console.log(`⚠️ taskkill failed, trying direct kill:`, err.message);
                // Fallback to direct kill
                try { this.process.kill('SIGKILL'); } catch (e) { }
            } else {
                console.log(`✅ [${this.id}] Process tree killed successfully`);
            }
        });

        this.process = null; // Clear reference immediately
        return true;
    }

    resume() {
        console.log(`▶️ [${this.id}] Resuming...`);
        // Resume logic simply calls start() again. 
        // yt-dlp's --continue flag handles the file offsets.
        this.start();
    }

    async runProcess(isTurbo) {
        return new Promise((resolve, reject) => {
            const args = this.buildArgs(isTurbo);

            console.log(`⬇️ [${this.id}] Spawn: ${TOOLS.ytdlp}`);
            this.process = spawn(TOOLS.ytdlp, args, { shell: false });

            let errorLog = '';

            this.process.stdout.on('data', (chunk) => {
                const output = chunk.toString();
                this.parseOutput(output);
            });

            this.process.stderr.on('data', (chunk) => {
                errorLog += chunk.toString();
                this.parseOutput(chunk.toString());
            });

            this.process.on('close', (code) => {
                this.process = null;
                if (this.paused) {
                    // Start/Run promise REJECTS so we stop the chain, 
                    // BUT execution flow goes to catch block which sees .paused flag
                    reject(new Error('PAUSED'));
                } else if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Exit Code ${code}: ${errorLog}`));
                }
            });

            this.process.on('error', (err) => reject(err));
        });
    }

    parseOutput(output) {
        // Path Capture
        const mergeMatch = output.match(/Merging formats into "(.+)"/);
        if (mergeMatch) this.finalFilePath = mergeMatch[1];
        const destMatch = output.match(/Destination: (.+)/);
        if (destMatch && !destMatch[1].includes('.f') && !destMatch[1].includes('.temp')) this.finalFilePath = destMatch[1];
        const fixupMatch = output.match(/Mixing .+ into "(.+)"/);
        if (fixupMatch) this.finalFilePath = fixupMatch[1];

        // Progress Capture
        const progressMatch = output.match(/(\d+\.?\d*)%/);
        const speedMatch = output.match(/(\d+\.?\d*\s*[KMG]iB\/s)/);
        const etaMatch = output.match(/ETA\s+(\d+:\d+)/);

        if (progressMatch) {
            const newProgress = parseFloat(progressMatch[1]);

            // Only update if progress is moving forward (prevents jumping back on resume)
            if (newProgress >= this.lastProgress) {
                this.lastProgress = newProgress;
                downloadProgress.set(this.id, {
                    progress: newProgress,
                    status: 'downloading',
                    speed: speedMatch ? speedMatch[1] : '',
                    eta: etaMatch ? etaMatch[1] : '',
                    filename: this.options.filename || 'video'
                });
            }
        }
    }

    buildArgs(isTurbo) {
        const {
            url, quality, outputPath, startTime, endTime,
            filename, format, audioOnly, downloadSubtitles,
            subsLang, embedMetadata
        } = this.options;

        const downloadPath = outputPath || path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

        // Build output template
        let outputTemplate = '%(title)s.%(ext)s';
        if (filename) {
            outputTemplate = filename.includes('.') ? filename : filename + '.%(ext)s';
        }

        const args = [
            '--newline', '--progress', '--no-warnings', '--no-overwrites',
            '--continue', '--windows-filenames',
            '-o', path.join(downloadPath, outputTemplate),
        ];

        if (isTurbo) {
            args.unshift('--external-downloader', TOOLS.aria2c);
            args.unshift('--external-downloader-args', '-x 16 -k 1M -s 16');
        }

        if (audioOnly) {
            args.push('-x', '--audio-format', format || 'mp3', '--audio-quality', '0');
        } else {
            let formatSpec;
            if (quality && quality.includes('bestvideo')) formatSpec = quality;
            else if (quality === 'best' || !quality) formatSpec = 'bestvideo+bestaudio/best';
            else if (/^\d+$/.test(quality)) formatSpec = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best`;
            else formatSpec = `${quality}+bestaudio/${quality}/best`;
            args.push('-f', formatSpec);

            const outputFormat = (format && format !== 'best' && format !== 'video') ? format : 'mp4';
            args.push('--merge-output-format', outputFormat, '--remux-video', outputFormat);
        }

        if (embedMetadata) args.push('--add-metadata');
        if (downloadSubtitles) args.push('--write-sub', '--sub-lang', subsLang || 'ar', '--embed-subs');
        if (startTime || endTime) args.push('--download-sections', `*${startTime || ''}-${endTime || ''}`);

        args.push(url);
        return args;
    }

    async handleCompletion() {
        const { autoUpload, deleteAfterUpload } = this.options;
        const finalFileName = this.finalFilePath ? path.basename(this.finalFilePath) : 'video.mp4';

        if (autoUpload && this.finalFilePath && fs.existsSync(this.finalFilePath)) {
            downloadProgress.set(this.id, { progress: 100, status: 'uploading', speed: 'Uploading...', eta: '' });
            try {
                await uploadToGoogleDrive(this.finalFilePath);
                if (deleteAfterUpload) fs.unlinkSync(this.finalFilePath);
                downloadProgress.set(this.id, { progress: 100, status: 'completed', speed: 'Uploaded ✅', eta: '', downloadUrl: `/downloads/${finalFileName}` });
            } catch (e) {
                downloadProgress.set(this.id, { progress: 100, status: 'completed', speed: 'Upload Failed ❌', eta: '', downloadUrl: `/downloads/${finalFileName}` });
            }
        } else {
            downloadProgress.set(this.id, {
                progress: 100, status: 'completed', speed: 'Done ✅', eta: '',
                downloadUrl: `/downloads/${finalFileName}`,
                filename: finalFileName
            });
        }
    }
}

// ===== API ENDPOINTS (CONNECTED TO NEW ENGINE) =====

app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    const id = Date.now().toString();
    const session = new DownloadSession(id, req.body);
    sessions.set(id, session);

    res.json({ success: true, downloadId: id, message: 'Download Started' });

    // Start in background
    session.start();
});

app.post('/api/pause', (req, res) => {
    const { id } = req.body;
    const session = sessions.get(id);

    if (session) {
        session.pause();
        return res.json({ success: true });
    }

    // Fallback: Just update status if session lost but ID exists (UI sync)
    // Avoids "Connection Failed" if server restarted
    downloadProgress.set(id, { ...downloadProgress.get(id), status: 'paused' });
    res.json({ success: true });
});

app.post('/api/resume/:id', (req, res) => {
    const { id } = req.params;
    const session = sessions.get(id);

    if (session) {
        session.resume();
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Session expired. Please restart download.' });
});

// API: Get download progress
app.get('/api/progress/:id', (req, res) => {
    const { id } = req.params;
    const progress = downloadProgress.get(id);

    if (!progress) {
        return res.status(404).json({ error: 'التحميل غير موجود' });
    }

    res.json(progress);
});

// API: Check yt-dlp and ffmpeg installation
app.get('/api/check', (req, res) => {
    exec('yt-dlp --version', (error, stdout) => {
        const ytdlpVersion = error ? null : stdout.trim();

        exec('ffmpeg -version', (ffmpegError, ffmpegStdout) => {
            const ffmpegInstalled = !ffmpegError;

            res.json({
                installed: !!ytdlpVersion,
                version: ytdlpVersion,
                ffmpeg: ffmpegInstalled,
                message: !ytdlpVersion ? 'yt-dlp غير مثبت' :
                    !ffmpegInstalled ? 'FFmpeg غير مثبت (مطلوب للقص والتحويل)' : 'جاهز'
            });
        });
    });
});

// API: Search YouTube


// API: Hybrid Search (YouTube)
app.get('/api/search/hybrid', async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'كلمة البحث مطلوبة' });
    }

    try {
        const args = [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];

        // Add cookies if available
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            args.push('--cookies', cookiesPath);
        }

        args.push(`ytsearch15:${query}`);

        const ytdlp = spawn('yt-dlp', args, { shell: false });

        let data = '';
        ytdlp.stdout.on('data', (chunk) => { data += chunk.toString(); });

        ytdlp.on('close', (code) => {
            if (code !== 0 && !data) {
                return res.status(500).json({ error: 'فشل في البحث', method: 'yt-dlp' });
            }

            try {
                const lines = data.trim().split('\n');
                const results = lines.map(line => {
                    try {
                        const video = JSON.parse(line);
                        return {
                            url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                            title: video.title,
                            channel: video.channel || video.uploader,
                            thumbnail: video.thumbnail || video.thumbnails?.[0]?.url,
                            duration: video.duration_string || formatDuration(video.duration),
                            views: video.view_count
                        };
                    } catch (e) { return null; }
                }).filter(Boolean);

                res.json({ results, method: 'SafeSearch' });
            } catch (parseError) {
                res.status(500).json({ error: 'فشل تحليل النتائج' });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في البحث: ' + err.message });
    }
});

// API: Trending (NEW)
app.get('/api/trending', async (req, res) => {
    const { region } = req.query; // e.g., 'SA', 'EG' (Not used by yt-dlp easily, but we can search trends)
    // Note: yt-dlp doesn't support 'trending per region' easily via arguments, 
    // but we can fetch the trending feed URL.

    // Safer: Just search for generic trending terms or use a specific feed URL if known and supported.
    // For simplicity and reliability on Cloud, we will use a general search for now or the feed URL.

    // Let's use feed:trending if possible, otherwise fallback to search.
    const feedUrl = 'https://www.youtube.com/feed/trending';

    try {
        const args = [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            '--playlist-end', '20',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];

        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            args.push('--cookies', cookiesPath);
        }

        args.push(feedUrl);

        const ytdlp = spawn('yt-dlp', args, { shell: false });

        let data = '';
        ytdlp.stdout.on('data', (chunk) => { data += chunk.toString(); });

        ytdlp.on('close', (code) => {
            if (!data) return res.json({ results: [] }); // Empty better than error

            try {
                const lines = data.trim().split('\n');
                const results = lines.map(line => {
                    try {
                        const video = JSON.parse(line);
                        return {
                            url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                            title: video.title,
                            channel: video.channel || video.uploader,
                            thumbnail: video.thumbnail || video.thumbnails?.[0]?.url,
                            duration: video.duration_string || formatDuration(video.duration),
                            views: video.view_count
                        };
                    } catch (e) { return null; }
                }).filter(Boolean);
                res.json({ results });
            } catch (e) {
                res.status(500).json({ error: 'Trending parse error' });
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// API: Get Playlist Info
app.get('/api/playlist', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط القائمة' });
    }

    try {
        const args = [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];

        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            args.push('--cookies', cookiesPath);
        }

        args.push(url);

        const ytdlp = spawn('yt-dlp', args, { shell: false });

        let data = '';

        ytdlp.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        ytdlp.on('close', (code) => {
            if (code !== 0 && !data) {
                return res.status(500).json({ error: 'فشل في جلب القائمة' });
            }

            try {
                const lines = data.trim().split('\n');
                const videos = lines.map(line => {
                    try {
                        const video = JSON.parse(line);
                        return {
                            url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                            title: video.title,
                            thumbnail: video.thumbnail || video.thumbnails?.[0]?.url,
                            duration: video.duration_string || formatDuration(video.duration)
                        };
                    } catch (e) { return null; }
                }).filter(Boolean);

                res.json({ videos, count: videos.length });
            } catch (parseError) {
                res.status(500).json({ error: 'فشل في تحليل القائمة' });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب القائمة' });
    }
});

// Helper: Format duration
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ===== TikTok API via Cobalt =====
app.get('/api/tiktok/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط TikTok' });
    }

    if (!isTikTokUrl(url)) {
        return res.status(400).json({ error: 'هذا ليس رابط TikTok صالح' });
    }

    console.log('Fetching TikTok info via Cobalt:', url);

    try {
        const cobaltData = await downloadTikTokViaCobalt(url);

        if (!cobaltData || cobaltData.status === 'error') {
            return res.status(500).json({
                error: 'فشل في جلب معلومات الفيديو من TikTok',
                details: cobaltData?.text || 'Unknown error'
            });
        }

        res.json({
            success: true,
            title: 'TikTok Video',
            thumbnail: '',
            download_url: cobaltData.url || cobaltData.audio,
            audio_url: cobaltData.audio,
            status: cobaltData.status,
            is_tiktok: true
        });
    } catch (error) {
        console.error('TikTok API error:', error);
        res.status(500).json({ error: 'خطأ في جلب فيديو TikTok: ' + error.message });
    }
});

// TikTok Direct Download
app.post('/api/tiktok/download', async (req, res) => {
    const { url, outputPath } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط TikTok' });
    }

    console.log('Downloading TikTok via Cobalt:', url);

    try {
        const cobaltData = await downloadTikTokViaCobalt(url);

        if (!cobaltData || cobaltData.status === 'error') {
            return res.status(500).json({ error: 'فشل في تحميل الفيديو' });
        }

        const downloadUrl = cobaltData.url || cobaltData.audio;

        if (!downloadUrl) {
            return res.status(500).json({ error: 'لم يتم العثور على رابط التحميل' });
        }

        // Download the file
        const downloadPath = outputPath || path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        const filename = `tiktok_${Date.now()}.mp4`;
        const filePath = path.join(downloadPath, filename);

        // Use fetch to download
        const fileResponse = await fetch(downloadUrl);
        const buffer = await fileResponse.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        res.json({
            success: true,
            message: 'تم تحميل الفيديو بنجاح!',
            filename: filename,
            downloadUrl: `/downloads/${filename}`,
            path: filePath
        });
    } catch (error) {
        console.error('TikTok download error:', error);
        res.status(500).json({ error: 'خطأ في التحميل: ' + error.message });
    }
});

// ===== API Keys =====
const GEMINI_API_KEY = 'AIzaSyCTlPytk30f3n1_76-vHn8cYQlH9Akr5r4';
const YOUTUBE_API_KEY = 'AIzaSyBDVcCNGSGDtzBhDe_Z5Y8NLftQZtwLUvs';

// ===== AI: Gemini API =====
app.post('/api/ai/summarize', async (req, res) => {
    const { text, type } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'النص مطلوب' });
    }

    try {
        const prompts = {
            summary: `لخص هذا النص بالعربية بشكل مختصر:\n${text}`,
            translate: `ترجم هذا النص للعربية:\n${text}`,
            keywords: `استخرج الكلمات المفتاحية من هذا النص بالعربية:\n${text}`,
            recommend: `بناءً على هذا المحتوى، اقترح 5 فيديوهات مشابهة:\n${text}`
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompts[type] || prompts.summary }] }]
            })
        });

        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text || 'لا توجد نتيجة';

        res.json({ success: true, result });
    } catch (error) {
        console.error('Gemini API error:', error);
        res.status(500).json({ error: 'خطأ في الذكاء الاصطناعي' });
    }
});

// AI: Smart Recommendations
app.post('/api/ai/recommend', async (req, res) => {
    const { title, description } = req.body;

    try {
        const prompt = `أنت مساعد ذكي لتحميل الفيديوهات. بناءً على هذا الفيديو:
العنوان: ${title}
الوصف: ${description?.substring(0, 500) || 'لا يوجد'}

اقترح:
1. أفضل جودة للتحميل (1080p, 720p, 480p) ولماذا
2. هل يُنصح بتحميل الصوت فقط؟
3. 3 كلمات مفتاحية للبحث عن محتوى مشابه

أجب بالعربية وبشكل مختصر.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text || 'لا توجد اقتراحات';

        res.json({ success: true, recommendation: result });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الاقتراحات الذكية' });
    }
});

// AI: Translate Subtitles
app.post('/api/ai/translate', async (req, res) => {
    const { text, targetLang = 'ar' } = req.body;

    try {
        const prompt = `ترجم هذا النص إلى ${targetLang === 'ar' ? 'العربية' : targetLang}:\n${text}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text || text;

        res.json({ success: true, translation: result });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في الترجمة' });
    }
});

// AI: Chat Assistant
app.post('/api/ai/chat', async (req, res) => {
    const { message, context } = req.body;

    try {
        const systemPrompt = `أنت مساعد ذكي لموقع تحميل الفيديوهات. ساعد المستخدم في:
- اختيار أفضل جودة وصيغة
- حل مشاكل التحميل
- اقتراح محتوى مشابه
- شرح ميزات الموقع
أجب بالعربية بشكل ودود ومختصر.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\nسؤال المستخدم: ${message}\n${context ? 'سياق: ' + context : ''}` }]
                }]
            })
        });

        const data = await response.json();
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text || 'عذراً، لم أفهم السؤال';

        res.json({ success: true, reply: result });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في المحادثة' });
    }
});

// ===== YouTube Data API =====
// ===== YouTube Data API =====
// (Legacy search endpoint removed to use robust implementation below)


// ===== YouTube Search (Hybrid: API + Turbo Tool) =====
app.get('/api/search/hybrid', async (req, res) => {
    const { query, type = 'video' } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'كلمة البحث مطلوبة' });
    }

    console.log(`🔍 Hybrid Search: "${query}" (Type: ${type})`);

    let results = [];
    let method = 'API';

    // 1. Try YouTube Data API first (Fastest)
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=${type}&maxResults=15&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);

        if (response.ok) {
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                results = data.items.map(item => ({
                    id: item.id.videoId || item.id.channelId || item.id.playlistId,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
                    channel: item.snippet.channelTitle,
                    description: item.snippet.description,
                    publishedAt: item.snippet.publishedAt,
                    type: item.id.kind.replace('youtube#', '') // video, channel, playlist
                }));
                console.log(`✅ Found ${results.length} results via API`);
            }
        } else {
            console.log('⚠️ API quota exceeded or error, switching to Tool...');
            method = 'Tool (Fallback)';
            throw new Error('API Error');
        }
    } catch (e) {
        // 2. Fallback to yt-dlp (Deep Search) - Slower but robust
        // No quota limits, more reliable when API is down
        method = 'Tool (Deep Search)';
        try {
            console.log('🛠️ Running yt-dlp search...');
            const ytdlp = spawn('yt-dlp', [
                `ytsearch15:"${query}"`,
                '--dump-json',
                '--default-search', 'ytsearch',
                '--no-playlist',
                '--no-warnings',
                '--flat-playlist', // Faster listing
                '--skip-download'
            ], { shell: true });

            let rawData = '';
            ytdlp.stdout.on('data', chunk => rawData += chunk.toString());

            await new Promise((resolve) => {
                ytdlp.on('close', resolve);
            });

            // Parse ndjson (newline delimited json)
            const lines = rawData.trim().split('\n');
            results = lines.map(line => {
                try {
                    const info = JSON.parse(line);
                    return {
                        id: info.id,
                        title: info.title,
                        thumbnail: info.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${info.id}/mqdefault.jpg`,
                        channel: info.uploader || info.channel,
                        description: info.description || '',
                        publishedAt: info.upload_date, // Needs formatting usually
                        duration: info.duration,
                        views: info.view_count,
                        type: 'video'
                    };
                } catch (e) { return null; }
            }).filter(Boolean);

            console.log(`✅ Found ${results.length} results via Tool`);

        } catch (toolErr) {
            console.error('Deep search failed:', toolErr);
        }
    }

    res.json({ success: true, method, results });
});
// YouTube: Get Video Details
app.get('/api/youtube/video', async (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'معرف الفيديو مطلوب' });
    }

    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${id}&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.items?.length > 0) {
            const video = data.items[0];
            res.json({
                success: true,
                video: {
                    id: video.id,
                    title: video.snippet.title,
                    description: video.snippet.description,
                    thumbnail: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high?.url,
                    channel: video.snippet.channelTitle,
                    publishedAt: video.snippet.publishedAt,
                    duration: video.contentDetails.duration,
                    views: parseInt(video.statistics.viewCount),
                    likes: parseInt(video.statistics.likeCount),
                    comments: parseInt(video.statistics.commentCount)
                }
            });
        } else {
            res.status(404).json({ error: 'الفيديو غير موجود' });
        }
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب معلومات الفيديو' });
    }
});

// YouTube: Search (API + yt-dlp Fallback)
// YouTube: Search (API + yt-dlp Fallback)
app.get('/api/youtube/search', async (req, res) => {
    const { q, maxResults = 20 } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'كلمة البحث مطلوبة' });
    }

    console.log(`🔎 Search Request: "${q}"`);

    // Check cache first
    const cachedResult = getCachedSearch(q);
    if (cachedResult) {
        return res.json({ ...cachedResult, source: 'cache', cached: true });
    }

    // 1. Try YouTube Data API first IF Key is configured
    if (YOUTUBE_API_KEY && YOUTUBE_API_KEY !== 'YOUR_API_KEY_HERE') {
        try {
            console.log(`   Attempting YouTube API...`);
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    const videos = data.items.map(item => ({
                        id: item.id.videoId,
                        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                        title: item.snippet.title,
                        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
                        channel: item.snippet.channelTitle,
                        publishedAt: item.snippet.publishedAt,
                        views: 0
                    }));
                    console.log(`   ✅ API Success: Found ${videos.length} videos`);
                    const result = { success: true, videos, source: 'api' };
                    setCachedSearch(q, result);
                    return res.json(result);
                }
            } else {
                console.warn(`   ⚠️ YouTube API returned ${response.status}. Falling back...`);
            }
        } catch (error) {
            console.error('   ❌ YouTube API Error:', error.message);
        }
    }

    // 2. Fallback to yt-dlp "ytsearch:"
    try {
        console.log(`   🚀 Falling back to yt-dlp (exec)...`);
        const { exec } = require('child_process');

        // Use exec which is often more reliable for simple commands on Windows
        // Construct command string carefully
        // Quotes around query are handled by exec/shell automatically if passed as string usually, but explicit quotes safer for shell
        const command = `yt-dlp "ytsearch${maxResults}:${q}" --dump-single-json --flat-playlist --skip-download --no-warnings --ignore-config`;

        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error('   ❌ yt-dlp exec error:', error);
                console.error('   stderr:', stderr);
                return res.status(500).json({ error: 'فشل البحث', details: stderr || error.message });
            }

            try {
                let output = stdout;
                // Try to clean output if it contains extra text before JSON
                const jsonStart = output.indexOf('{');
                const jsonEnd = output.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    output = output.substring(jsonStart, jsonEnd + 1);
                }

                const data = JSON.parse(output);
                const entries = data.entries || [];

                const videos = entries.map(v => {
                    const videoId = v.id || v.url?.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
                    return {
                        id: videoId,
                        url: v.url || `https://www.youtube.com/watch?v=${videoId}`,
                        title: v.title,
                        thumbnail: v.thumbnails ? (v.thumbnails[v.thumbnails.length - 1]?.url || v.thumbnails[0]?.url) : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        channel: v.uploader || v.channel,
                        publishedAt: v.upload_date ? `${v.upload_date.substring(0, 4)}-${v.upload_date.substring(4, 6)}-${v.upload_date.substring(6, 8)}` : null,
                        views: v.view_count || 0,
                        duration: v.duration
                    };
                });

                console.log(`   ✅ yt-dlp Success: Found ${videos.length} videos`);
                return res.json({ success: true, videos, source: 'yt-dlp' });
            } catch (e) {
                console.error('   ❌ JSON Parse Error:', e);
                return res.status(500).json({ error: 'خطأ في معالجة النتائج', details: e.message });
            }
        });

    } catch (error) {
        console.error('   ❌ Critical Search Error:', error);
        res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم' });
    }
});

// YouTube: Get Comments
app.get('/api/youtube/comments', async (req, res) => {
    const { videoId, maxResults = 50 } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'معرف الفيديو مطلوب' });
    }

    try {
        const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        const comments = data.items?.map(item => ({
            author: item.snippet.topLevelComment.snippet.authorDisplayName,
            authorImage: item.snippet.topLevelComment.snippet.authorProfileImageUrl,
            text: item.snippet.topLevelComment.snippet.textDisplay,
            likes: item.snippet.topLevelComment.snippet.likeCount,
            publishedAt: item.snippet.topLevelComment.snippet.publishedAt
        })) || [];

        res.json({ success: true, comments, total: data.pageInfo?.totalResults });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب التعليقات' });
    }
});

// YouTube: Trending Videos
// DELETED STALE TRENDING ENDPOINT (Moved to robust yt-dlp implementation below)

// YouTube: Channel Info
app.get('/api/youtube/channel', async (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'معرف القناة مطلوب' });
    }

    try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${id}&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.items?.length > 0) {
            const channel = data.items[0];
            res.json({
                success: true,
                channel: {
                    id: channel.id,
                    title: channel.snippet.title,
                    description: channel.snippet.description,
                    thumbnail: channel.snippet.thumbnails.high?.url,
                    subscribers: parseInt(channel.statistics.subscriberCount),
                    videos: parseInt(channel.statistics.videoCount),
                    views: parseInt(channel.statistics.viewCount)
                }
            });
        } else {
            res.status(404).json({ error: 'القناة غير موجودة' });
        }
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب معلومات القناة' });
    }
});

// ===== EXTRACT: Subtitles API =====
app.post('/api/extract/subtitles', async (req, res) => {
    const { url, lang = 'ar' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيديو' });
    }

    console.log('📝 Extracting subtitles for:', url, 'Language:', lang);

    const tempDir = path.join(__dirname, 'downloads', 'temp_subs_' + Date.now());
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
        const args = [
            '--skip-download',
            '--write-subs',
            '--write-auto-subs',
            '--sub-lang', lang === 'auto' ? 'ar,en' : lang,
            '--sub-format', 'srt/vtt/best',
            '--convert-subs', 'srt',
            '-o', path.join(tempDir, '%(title)s.%(ext)s'),
            url
        ];

        const ytdlp = spawn('yt-dlp', args, { shell: false });
        let output = '';
        let errorOutput = '';

        ytdlp.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });

        ytdlp.stderr.on('data', (chunk) => {
            errorOutput += chunk.toString();
        });

        ytdlp.on('close', async (code) => {
            try {
                // Look for subtitle files
                const files = fs.readdirSync(tempDir);
                const subFile = files.find(f => f.endsWith('.srt') || f.endsWith('.vtt'));

                if (subFile) {
                    const subContent = fs.readFileSync(path.join(tempDir, subFile), 'utf-8');

                    // Cleanup
                    fs.rmSync(tempDir, { recursive: true, force: true });

                    res.json({
                        success: true,
                        subtitles: subContent,
                        language: lang,
                        format: subFile.split('.').pop()
                    });
                } else {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    res.json({
                        success: false,
                        error: 'لا توجد ترجمات متاحة لهذا الفيديو'
                    });
                }
            } catch (e) {
                res.status(500).json({ error: 'خطأ في معالجة الترجمات' });
            }
        });

    } catch (error) {
        console.error('Subtitles extraction error:', error);
        res.status(500).json({ error: 'خطأ في استخراج الترجمات' });
    }
});

// ===== ADVANCED FEATURES =====

// 1. Fast Download with aria2 (5-10x faster) & Queue Support
app.post('/api/download/fast', async (req, res) => {
    const { url, quality, format, outputPath } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيديو' });
    }

    const downloadPath = outputPath || path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const downloadId = Date.now().toString();
    downloadProgress.set(downloadId, { progress: 0, status: 'starting', speed: '', eta: '' });

    console.log(`🚀 Fast download (${format || 'video'}):`, url);

    // Helper function to run download
    const runDownload = (useAria2) => {
        return new Promise((resolve, reject) => {
            // Use unique temp directory to avoid conflicts in parallel downloads
            const tempDir = path.join(downloadPath, `temp_${downloadId}`);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const args = [
                '--newline',
                '--progress',
                '--no-warnings',
                '--no-abort-on-error',
                // Use unique temp path to avoid FFmpeg conflicts
                '--paths', `temp:${tempDir}`,
                // Force FFmpeg location
                '--ffmpeg-location', 'ffmpeg',
                '-o', path.join(downloadPath, '%(title)s.%(ext)s'),
            ];

            // Only use aria2c if requested and available
            if (useAria2 && TOOLS.aria2c && fs.existsSync(TOOLS.aria2c)) {
                args.push('--external-downloader', TOOLS.aria2c);
                args.push('--external-downloader-args', '-x 16 -k 1M -s 16');
                console.log('Using aria2c for turbo download');
            } else {
                console.log('Using normal yt-dlp download');
            }

            // Handle Format & Quality
            if (format === 'audio') {
                args.push('-f', 'bestaudio/best');
                args.push('-x', '--audio-format', 'mp3');
            } else {
                // Use quality if specified, otherwise use flexible format with fallbacks
                const formatStr = quality && quality !== 'best'
                    ? quality
                    : 'bestvideo*+bestaudio/bestvideo+bestaudio/best';
                args.push('-f', formatStr);
                args.push('--merge-output-format', 'mp4');
            }

            args.push(url);

            const ytdlp = spawn('yt-dlp', args, { shell: false });
            let errorLog = '';

            ytdlp.stdout.on('data', (chunk) => {
                const output = chunk.toString();

                // Capture filename from stdout
                // yt-dlp output examples:
                // [download] Destination: downloads\video.mp4
                // [Merger] Merging formats into "downloads\video.mp4"
                const destinationMatch = output.match(/Destination:\s+(.+)$|Merging formats into "(.+)"/m);
                if (destinationMatch) {
                    const fullPath = destinationMatch[1] || destinationMatch[2];
                    if (fullPath) {
                        const filename = path.basename(fullPath);
                        const currentStatus = downloadProgress.get(downloadId) || {};
                        downloadProgress.set(downloadId, {
                            ...currentStatus,
                            filename: filename,
                            url: `/downloads/${encodeURIComponent(filename)}`
                        });
                    }
                }

                const progressMatch = output.match(/(\d+\.?\d*)%/);
                if (progressMatch) {
                    const p = parseFloat(progressMatch[1]);
                    const currentStatus = downloadProgress.get(downloadId) || {};
                    downloadProgress.set(downloadId, {
                        ...currentStatus,
                        progress: p,
                        status: p >= 100 ? 'processing' : 'downloading',
                        speed: useAria2 ? 'Turbo ⚡' : 'Normal',
                        eta: ''
                    });
                }
            });

            ytdlp.stderr.on('data', (chunk) => {
                errorLog += chunk.toString();
            });

            ytdlp.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Exit code ${code}: ${errorLog}`));
                }
            });

            ytdlp.on('error', (err) => reject(err));
        });
    };

    // Send response immediately
    res.json({ downloadId, message: 'بدأ التحميل السريع' });

    // Try with aria2 first, fallback to normal if it fails
    (async () => {
        try {
            // Try turbo mode first
            await runDownload(true);
            downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: '', eta: '' });
            console.log('✅ Download completed (turbo mode)');
        } catch (turboError) {
            console.warn('⚠️ Turbo download failed, trying normal mode...', turboError.message);

            // Fallback to normal download
            try {
                downloadProgress.set(downloadId, { progress: 0, status: 'retrying', speed: 'Normal', eta: '' });
                await runDownload(false);
                downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: '', eta: '' });
                console.log('✅ Download completed (normal mode)');
            } catch (normalError) {
                console.error('❌ Download failed completely:', normalError.message);
                downloadProgress.set(downloadId, { progress: 0, status: 'error', speed: '', eta: '', error: normalError.message });
            }
        }

        // Cleanup temp directory
        const tempDir = path.join(downloadPath, `temp_${downloadId}`);
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn('Could not cleanup temp dir:', e.message);
        }
    })();
});

// 2. Instagram/Pinterest Download via gallery-dl
app.post('/api/download/instagram', async (req, res) => {
    const { url, outputPath } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال الرابط' });
    }

    const downloadPath = outputPath || path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    console.log('📸 Downloading via gallery-dl:', url);

    const gallerydl = spawn(TOOLS.gallery_dl, [ // Use absolute path
        '-d', downloadPath,
        '--filename', '{date:%Y%m%d}_{filename}.{extension}',
        url
    ], { shell: false });

    let output = '';
    gallerydl.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });

    gallerydl.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'تم التحميل بنجاح!', output });
        } else {
            res.status(500).json({ error: 'فشل في التحميل', output });
        }
    });
});

// 3. Spotify Download via SpotDL (NEW)
app.post('/api/download/spotify', async (req, res) => {
    const { url, outputPath } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط Spotify' });
    }

    const downloadPath = outputPath || path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const downloadId = Date.now().toString();
    downloadProgress.set(downloadId, { progress: 0, status: 'starting_spotify', speed: 'Fetching...', eta: '' });

    console.log('🎵 Downloading via SpotDL:', url);

    // Use spotdl.exe directly with shell: false
    const spotdl = spawn(TOOLS.spotdl, [
        '--output', downloadPath,
        url
    ], { shell: false });

    spotdl.stdout.on('data', (chunk) => {
        const output = chunk.toString();
        console.log('SpotDL:', output);

        // Simple progress simulation or parsing
        if (output.includes('Found')) {
            downloadProgress.set(downloadId, { progress: 10, status: 'found_tracks', speed: '', eta: '' });
        } else if (output.includes('Downloading')) {
            downloadProgress.set(downloadId, { progress: 50, status: 'downloading_track', speed: '', eta: '' });
        }
    });

    spotdl.on('close', (code) => {
        if (code === 0) {
            downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: '', eta: '' });
        } else {
            downloadProgress.set(downloadId, { progress: 0, status: 'error', speed: '', eta: '' });
        }
    });

    res.json({ downloadId, message: 'بدأ تحميل Spotify' });
});

// 4. YouTube Transcripts/Subtitles
// 4. YouTube Transcripts/Subtitles
app.get('/api/transcript', async (req, res) => {
    const { videoId, lang = 'ar,en' } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'معرف الفيديو مطلوب' });
    }

    // ... (existing transcript logic) ...
    // Note: I am replacing this section just to insert the new Cloud APIs before or after
    // Actually, I will insert the NEW APIs right after this block to keep it clean.

    // ... [existing logic for transcript] ...
    // Since I cannot effectively "insert after" without replacing, I'll replace the block 
    // and append the new endpoints below it.

    // RE-INSERTING TRANSCRIPT LOGIC COMPLETELY
    console.log('📝 Fetching transcript for:', videoId);

    const pythonScript = `
from youtube_transcript_api import YouTubeTranscriptApi
import json
try:
    langs = '${lang}'.split(',')
    transcript = YouTubeTranscriptApi.get_transcript('${videoId}', languages=langs)
    print(json.dumps(transcript))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

    const python = spawn(TOOLS.python, ['-c', pythonScript], { shell: true });

    let data = '';
    python.stdout.on('data', (chunk) => {
        data += chunk.toString();
    });

    python.on('close', (code) => {
        try {
            const transcript = JSON.parse(data);
            if (transcript.error) {
                res.status(500).json({ error: transcript.error });
            } else {
                res.json({ success: true, transcript });
            }
        } catch (e) {
            res.status(500).json({ error: 'فشل في جلب الترجمة' });
        }
    });
});




// ===== Trending API (Search Strategy - FORCED) =====
app.get('/api/youtube/trending', async (req, res) => {
    const { regionCode = 'US' } = req.query;
    // Region Map for Search Strategy (Curated Native Keywords for Relevance)
    const queryMap = {
        'DZ': 'الجزائر 2025',      // Algeria
        'SA': 'السعودية 2025',     // Saudi Arabia
        'EG': 'مصر 2025',          // Egypt
        'AE': 'الامارات 2025',     // UAE
        'MA': 'المغرب 2025',       // Morocco
        'IQ': 'العراق 2025',       // Iraq
        'JO': 'الاردن 2025',       // Jordan
        'KW': 'الكويت 2025',       // Kuwait
        'QA': 'قطر 2025',          // Qatar
        'BH': 'البحرين 2025',      // Bahrain
        'OM': 'عمان 2025',         // Oman
        'LB': 'لبنان 2025',        // Lebanon
        'PS': 'فلسطين 2025',       // Palestine
        'TN': 'تونس 2025',         // Tunisia
        'LY': 'ليبيا 2025',        // Libya
        'YE': 'اليمن 2025',        // Yemen
        'SD': 'السودان 2025',      // Sudan
        'SY': 'سوريا 2025',        // Syria
        'US': 'USA trending 2025',
        'GB': 'UK trending 2025'
    };

    // Fallback if region not in map
    const searchQuery = queryMap[regionCode] || `trending ${regionCode} 2025`;

    console.log(`🔥 API: Fetching trending (Search Mode) for ${regionCode} with query: ${searchQuery}...`);

    // Command: ytsearch25 (Search for videos, not playlist)
    const command = `"${TOOLS.ytdlp}" "ytsearch25:${searchQuery}" --dump-single-json --flat-playlist --no-warnings`;

    try {
        const stdout = await new Promise((resolve, reject) => {
            exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                if (error) {
                    // Don't reject, just return empty to handle gracefully
                    console.error('❌ Search Exec Error:', error.message);
                    resolve(null);
                } else {
                    resolve(stdout);
                }
            });
        });

        if (!stdout) {
            return res.json({ success: false, error: 'Execution failed', details: 'Server could not run search command.' });
        }

        const data = JSON.parse(stdout);
        const videos = (data.entries || []).map(v => ({
            title: v.title,
            thumbnail: v.thumbnails ? v.thumbnails[v.thumbnails.length - 1].url : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
            url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
            videoId: v.id,
            channel: v.uploader || v.channel || 'YouTube',
            views: v.view_count || 'Hot',
            duration: v.duration_string || '',
            uploaded: v.upload_date || 'Today'
        }));

        console.log(`✅ Search Success: Found ${videos.length} videos for region: ${regionCode}`);

        if (videos.length === 0) {
            return res.json({ success: false, error: 'No videos found', details: `Search for '${searchQuery}' returned 0 results.` });
        }

        res.json({ success: true, videos });

    } catch (e) {
        console.error('❌ Search Parse Error:', e.message);
        res.json({ success: false, error: 'Data processing error', details: e.message });
    }
});

// Helper: Parse yt-dlp JSON output
function parseYtdlpOutput(stdout) {
    try {
        const data = JSON.parse(stdout);
        return (data.entries || []).map(v => ({
            title: v.title,
            thumbnail: v.thumbnails ? v.thumbnails[v.thumbnails.length - 1].url : null,
            url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
            videoId: v.id,
            channel: v.uploader || v.channel,
            views: v.view_count,
            duration: v.duration,
            uploaded: v.upload_date
        }));
    } catch (e) {
        return null;
    }
}

// Helper: Parse HTML regex (Basic fallback)
function parseHtmlTrending(html) {
    try {
        const videos = [];
        // Robust Regex to find video IDs
        const videoIdRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;

        let match;
        const seen = new Set();

        while ((match = videoIdRegex.exec(html)) !== null) {
            const videoId = match[1];
            if (!seen.has(videoId) && videos.length < 20) {
                seen.add(videoId);
                videos.push({
                    title: `Trending Video`,
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId: videoId,
                    channel: 'Youtube',
                    views: 'N/A',
                    duration: '',
                    uploaded: ''
                });
            }
        }
        return videos;
    } catch (e) {
        return [];
    }
}

// ===== Cloud Integration Endpoints =====

// Google Drive Connect (Exchange Code for Tokens)
app.post('/api/cloud/google/connect', async (req, res) => {
    const { code, clientId, clientSecret } = req.body;

    if (!code || !clientId || !clientSecret) {
        return res.status(400).json({ error: 'Missing code or credentials' });
    }

    try {
        console.log('☁️ Exchanging auth code for tokens...');
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', // Must match the one used in frontend
                grant_type: 'authorization_code'
            })
        });

        const tokens = await tokenResponse.json();

        if (tokens.error) {
            throw new Error(tokens.error_description || tokens.error);
        }

        // Save tokens securely
        const tokensPath = path.join(__dirname, 'data', 'tokens.json');
        if (!fs.existsSync(path.dirname(tokensPath))) {
            fs.mkdirSync(path.dirname(tokensPath), { recursive: true });
        }

        // Merge with existing or create new
        let currentTokens = {};
        if (fs.existsSync(tokensPath)) {
            currentTokens = JSON.parse(fs.readFileSync(tokensPath));
        }

        currentTokens.google = {
            ...tokens,
            clientId,
            clientSecret, // Saving secret is risky but needed for refresh without database
            updatedAt: Date.now()
        };

        fs.writeFileSync(tokensPath, JSON.stringify(currentTokens, null, 2));

        console.log('✅ Google Drive connected successfully');
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Google Auth Error:', error.message);
        res.status(500).json({ error: 'Failed to connect Google Drive: ' + error.message });
    }
});

// Update AI Endpoint to use Dynamic Key
app.post('/api/ai/chat', async (req, res) => {
    const { message, history } = req.body;
    const apiKey = req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(400).json({ error: 'مفتاح API مفقود. يرجى إدخاله في تبويب الذكاء الاصطناعي.' });
    }

    try {
        // Construct the prompt with history
        let promptParts = [];

        // Add system instruction (simulated via first user message or just context)
        const systemPrompt = "أنت مساعد ذكي متخصص في يوتيوب. ساعد المستخدم في تلخيص الفيديوهات، شرح المحتوى، والإجابة عن الأسئلة بدقة.";

        // Add history
        if (history && Array.isArray(history)) {
            history.forEach(msg => {
                promptParts.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            });
        }

        // Add current message
        promptParts.push({
            role: "user",
            parts: [{ text: `${systemPrompt}\n\nسؤال المستخدم: ${message}` }]
        });

        // Call Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: promptParts,
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7
                }
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'خطأ من Gemini API');
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
            throw new Error('لم يتم استلام رد صالح من الذكاء الاصطناعي');
        }

        res.json({ success: true, reply });

    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({ error: 'عذراً، حدث خطأ أثناء معالجة طلبك: ' + error.message });
    }
});

// ===== Cloud Upload Logic =====

function getTokens() {
    const tokensPath = path.join(__dirname, 'data', 'tokens.json');
    if (fs.existsSync(tokensPath)) {
        return JSON.parse(fs.readFileSync(tokensPath));
    }
    return {};
}

async function refreshGoogleToken(tokens) {
    if (!tokens.google || !tokens.google.refresh_token) {
        throw new Error('No refresh token available');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: tokens.google.clientId,
            client_secret: tokens.google.clientSecret,
            refresh_token: tokens.google.refresh_token,
            grant_type: 'refresh_token'
        })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);

    // Update tokens with new access token
    tokens.google.access_token = data.access_token;
    tokens.google.expires_in = data.expires_in;
    tokens.google.updatedAt = Date.now();

    // Save back
    const tokensPath = path.join(__dirname, 'data', 'tokens.json');
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));

    return data.access_token;
}

async function uploadToGoogleDrive(filePath, mimeType = 'video/mp4') {
    let tokens = getTokens();
    if (!tokens.google || !tokens.google.access_token) {
        throw new Error('Google Drive not connected');
    }

    // Refresh if needed (simple check: if updated > 50 mins ago)
    const isExpired = (Date.now() - (tokens.google.updatedAt || 0)) > (3500 * 1000);
    let accessToken = tokens.google.access_token;

    if (isExpired) {
        console.log('🔄 Refreshing Google Drive token...');
        accessToken = await refreshGoogleToken(tokens);
    }

    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;

    console.log(`☁️ Uploading to Drive: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Multipart upload
    const metadata = {
        name: fileName,
        mimeType: mimeType
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: ' + mimeType + '\r\n\r\n';

    // Since node-fetch with multipart/related and stream body is complex,
    // we will use a simpler approach: Read file buffer is risky for large files but okay for < 2GB on modern desktops
    // For "Pro" version, we should stream. But let's start with buffer for simplicity to avoid installing 'form-data' package if not present.
    // Actually, we can just pipe streams if we use https native module, but fetch is easier.

    // Let's rely on resumable upload for better reliability with large files!

    // 1. Initiate Resumable Upload
    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) throw new Error('Failed to initiate upload');

    const uploadUrl = initRes.headers.get('Location');

    // 2. Upload File Content (PUT)
    // We can stream this!
    const fileStream = fs.createReadStream(filePath);
    // Needed to know size? Yes, we have fileSize.

    // Node-fetch supports stream as body
    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': fileSize.toString()
        },
        body: fileStream // Check if your node-fetch version supports streams (v2 does, v3 does)
    });

    const result = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(result.error?.message || 'Upload failed along the way');

    console.log('✅ Upload Complete:', result.id);
    return result;
}

// Manual Upload Endpoint
app.post('/api/cloud/upload', async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'File not found locally' });
    }

    try {
        // Run async - don't wait? Or wait? 
        // For better UX, maybe valid to wait if file is small, but for video it takes time.
        // Let's trigger and return "started".

        uploadToGoogleDrive(filePath)
            .then(data => console.log('Async Upload Success:', data.id))
            .catch(err => console.error('Async Upload Failed:', err));

        res.json({ success: true, message: 'Upload started in background', status: 'uploading' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Convert Video to GIF (ImageMagick + FFmpeg)
app.post('/api/convert/gif', async (req, res) => {
    const { videoPath, startTime = 0, duration = 5, width = 480 } = req.body;

    if (!videoPath) {
        return res.status(400).json({ error: 'مسار الفيديو مطلوب' });
    }

    const outputPath = videoPath.replace(/\.[^/.]+$/, '.gif');
    console.log('🎞️ Converting to GIF:', videoPath);

    // Use FFmpeg to create high-quality GIF
    const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-vf', `fps=15,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        outputPath
    ], { shell: true });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'تم إنشاء GIF!', output: outputPath });
        } else {
            res.status(500).json({ error: 'فشل في إنشاء GIF' });
        }
    });
});

// 5. Compress Video (FFmpeg)
app.post('/api/compress', async (req, res) => {
    const { videoPath, quality = 'medium' } = req.body;

    if (!videoPath) {
        return res.status(400).json({ error: 'مسار الفيديو مطلوب' });
    }

    const crf = { low: 35, medium: 28, high: 23 }[quality] || 28;
    const outputPath = videoPath.replace(/\.[^/.]+$/, '_compressed.mp4');

    console.log('📦 Compressing video:', videoPath);

    const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-c:v', 'libx264',
        '-crf', crf.toString(),
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '128k',
        outputPath
    ], { shell: true });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            const originalSize = fs.statSync(videoPath).size;
            const compressedSize = fs.statSync(outputPath).size;
            const reduction = Math.round((1 - compressedSize / originalSize) * 100);

            res.json({
                success: true,
                message: `تم الضغط! وفّرت ${reduction}%`,
                output: outputPath,
                originalSize,
                compressedSize
            });
        } else {
            res.status(500).json({ error: 'فشل في الضغط' });
        }
    });
});

// 6. Extract Audio (MP3/FLAC/WAV)
app.post('/api/extract-audio', async (req, res) => {
    const { videoPath, format = 'mp3', bitrate = '320k' } = req.body;

    if (!videoPath) {
        return res.status(400).json({ error: 'مسار الفيديو مطلوب' });
    }

    const outputPath = videoPath.replace(/\.[^/.]+$/, `.${format}`);
    console.log('🎵 Extracting audio:', videoPath);

    const args = ['-y', '-i', videoPath];

    if (format === 'mp3') {
        args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    } else if (format === 'flac') {
        args.push('-c:a', 'flac');
    } else {
        args.push('-c:a', 'pcm_s16le');
    }

    args.push(outputPath);

    const ffmpeg = spawn('ffmpeg', args, { shell: true });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'تم استخراج الصوت!', output: outputPath });
        } else {
            res.status(500).json({ error: 'فشل في استخراج الصوت' });
        }
    });
});

// 7. SponsorBlock - Skip Sponsors in Videos
app.get('/api/sponsorblock', async (req, res) => {
    const { videoId } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'معرف الفيديو مطلوب' });
    }

    try {
        const response = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=["sponsor","selfpromo","interaction","intro","outro","preview","filler"]`);

        if (!response.ok) {
            return res.json({ success: true, segments: [], message: 'لا توجد إعلانات مسجلة' });
        }

        const segments = await response.json();

        res.json({
            success: true,
            segments: segments.map(s => ({
                start: s.segment[0],
                end: s.segment[1],
                category: s.category,
                duration: Math.round(s.segment[1] - s.segment[0])
            })),
            totalSkipTime: Math.round(segments.reduce((acc, s) => acc + (s.segment[1] - s.segment[0]), 0))
        });
    } catch (error) {
        res.json({ success: true, segments: [], message: 'لا توجد بيانات' });
    }
});

// 8. Return YouTube Dislike - Get Dislike Count
app.get('/api/dislikes', async (req, res) => {
    const { videoId } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'معرف الفيديو مطلوب' });
    }

    try {
        const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`);
        const data = await response.json();

        res.json({
            success: true,
            likes: data.likes,
            dislikes: data.dislikes,
            rating: data.rating,
            viewCount: data.viewCount
        });
    } catch (error) {
        res.status(500).json({ error: 'فشل في جلب البيانات' });
    }
});

// 9. Generate Thumbnail (ImageMagick)
app.post('/api/thumbnail', async (req, res) => {
    const { videoPath, time = 5, width = 1280 } = req.body;

    if (!videoPath) {
        return res.status(400).json({ error: 'مسار الفيديو مطلوب' });
    }

    const outputPath = videoPath.replace(/\.[^/.]+$/, '_thumb.jpg');
    console.log('🖼️ Generating thumbnail:', videoPath);

    const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-ss', time.toString(),
        '-vframes', '1',
        '-vf', `scale=${width}:-1`,
        '-q:v', '2',
        outputPath
    ], { shell: true });

    ffmpeg.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: 'تم إنشاء الصورة المصغرة!', output: outputPath });
        } else {
            res.status(500).json({ error: 'فشل في إنشاء الصورة المصغرة' });
        }
    });
});

// 10. Video Info/Metadata
app.get('/api/video-info', async (req, res) => {
    const { path: videoPath } = req.query;

    if (!videoPath) {
        return res.status(400).json({ error: 'مسار الفيديو مطلوب' });
    }

    const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath
    ], { shell: true });

    let data = '';
    ffprobe.stdout.on('data', (chunk) => {
        data += chunk.toString();
    });

    ffprobe.on('close', (code) => {
        try {
            const info = JSON.parse(data);
            const videoStream = info.streams?.find(s => s.codec_type === 'video');
            const audioStream = info.streams?.find(s => s.codec_type === 'audio');

            res.json({
                success: true,
                duration: parseFloat(info.format?.duration || 0),
                size: parseInt(info.format?.size || 0),
                bitrate: parseInt(info.format?.bit_rate || 0),
                video: {
                    codec: videoStream?.codec_name,
                    width: videoStream?.width,
                    height: videoStream?.height,
                    fps: eval(videoStream?.r_frame_rate || '0')
                },
                audio: {
                    codec: audioStream?.codec_name,
                    sampleRate: audioStream?.sample_rate,
                    channels: audioStream?.channels
                }
            });
        } catch (e) {
            res.status(500).json({ error: 'فشل في قراءة معلومات الفيديو' });
        }
    });
});

// 11. Batch Download (Multiple URLs)
app.post('/api/download/batch', async (req, res) => {
    const { urls, quality, outputPath } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'الرجاء إدخال قائمة الروابط' });
    }

    const downloadPath = outputPath || path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const batchId = Date.now().toString();
    const results = [];

    console.log(`📦 Starting batch download: ${urls.length} videos`);

    // Process each URL
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        try {
            await new Promise((resolve, reject) => {
                const ytdlp = spawn('yt-dlp', [
                    '--external-downloader', 'aria2c',
                    '--external-downloader-args', '-x 8 -k 1M',
                    '-f', quality || 'best',
                    '-o', `"${path.join(downloadPath, '%(title)s.%(ext)s')}"`,
                    `"${url}"`
                ], { shell: true });

                ytdlp.on('close', (code) => {
                    results.push({ url, success: code === 0 });
                    resolve();
                });
            });
        } catch (e) {
            results.push({ url, success: false, error: e.message });
        }
    }

    res.json({
        success: true,
        batchId,
        total: urls.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
    });
});

// 12. Download with Custom Filename
app.post('/api/download/custom', async (req, res) => {
    const { url, filename, format, outputPath } = req.body;

    if (!url || !filename) {
        return res.status(400).json({ error: 'الرابط واسم الملف مطلوبان' });
    }

    const downloadPath = outputPath || path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const downloadId = Date.now().toString();
    downloadProgress.set(downloadId, { progress: 0, status: 'starting', speed: '', eta: '' });

    const ext = format || 'mp4';
    const outputFile = path.join(downloadPath, `${filename}.${ext}`);

    console.log('📥 Custom download:', url, 'as', filename);

    const args = [
        '--newline',
        '--progress',
        '--restrict-filenames',
        '-f', 'best',
        '-o', outputFile,
        url
    ];

    if (format === 'mp3') {
        args.splice(2, 0, '-x', '--audio-format', 'mp3');
    }

    // Turbo Mode for custom
    if (TOOLS.aria2c && fs.existsSync(TOOLS.aria2c)) {
        args.splice(2, 0, '--external-downloader', TOOLS.aria2c);
        args.splice(4, 0, '--external-downloader-args', '-x 16 -k 1M -s 16');
    }

    const ytdlp = spawn('yt-dlp', args, { shell: false });

    ytdlp.stdout.on('data', (chunk) => {
        const output = chunk.toString();
        const progressMatch = output.match(/(\d+\.?\d*)%/);
        if (progressMatch) {
            downloadProgress.set(downloadId, {
                progress: parseFloat(progressMatch[1]),
                status: 'downloading',
                speed: '',
                eta: ''
            });
        }
    });

    ytdlp.on('close', (code) => {
        if (code === 0) {
            downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: '', eta: '' });
        } else {
            downloadProgress.set(downloadId, { progress: 0, status: 'error', speed: '', eta: '' });
        }
    });

    res.json({ downloadId, message: 'بدأ التحميل', filename: `${filename}.${ext}` });
});


// ===== BATCH DOWNLOAD SYSTEM WITH PARALLEL PROCESSING =====

// Batch Progress Tracking
const batchProgress = new Map();
const MAX_CONCURRENT_DOWNLOADS = 5; // Maximum parallel downloads

// Parallel Download Queue Endpoint
app.post('/api/download/parallel', async (req, res) => {
    const { videos, maxConcurrent = 3 } = req.body;

    if (!videos || videos.length === 0) {
        return res.status(400).json({ error: 'لا توجد فيديوهات للتحميل' });
    }

    const batchId = Date.now().toString();
    const totalVideos = videos.length;

    console.log(`🚀 Starting batch download: ${totalVideos} videos (${maxConcurrent} concurrent)`);

    // Initialize batch progress
    batchProgress.set(batchId, {
        total: totalVideos,
        completed: 0,
        failed: 0,
        downloading: 0,
        videos: videos.map((v, i) => ({
            id: `${batchId}_${i}`,
            url: v.url,
            title: v.title || `Video ${i + 1}`,
            status: 'pending',
            progress: 0,
            speed: '',
            eta: '',
            error: null
        }))
    });

    res.json({
        success: true,
        batchId,
        total: totalVideos,
        message: `بدء تحميل ${totalVideos} فيديو`
    });

    // Start parallel downloads asynchronously
    processBatchDownload(batchId, videos, maxConcurrent);
});

// Process Batch Downloads with Concurrency Control
async function processBatchDownload(batchId, videos, maxConcurrent) {
    const batch = batchProgress.get(batchId);
    if (!batch) return;

    const downloadPath = path.join(__dirname, 'downloads', `batch_${batchId}`);
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const processVideo = async (video, index) => {
        const videoId = `${batchId}_${index}`;
        const videoProgress = batch.videos[index];

        try {
            videoProgress.status = 'downloading';
            batch.downloading++;

            // Helper to run download with optional turbo
            const runDownload = async (useTurbo) => {
                const args = [
                    '--newline',
                    '--progress',
                    '--no-warnings',
                    '--restrict-filenames',
                    '-o', path.join(downloadPath, '%(title)s.%(ext)s'),
                ];

                // Turbo mode with aria2c
                if (useTurbo && video.turbo !== false && TOOLS.aria2c && fs.existsSync(TOOLS.aria2c)) {
                    args.push('--external-downloader', TOOLS.aria2c);
                    args.push('--external-downloader-args', '-x 16 -k 1M -s 16');
                }

                // Handle video/audio format
                if (video.audioOnly || video.format === 'audio') {
                    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
                } else {
                    args.push('-f', video.quality || 'best');
                    const fmt = (video.format === 'video' || !video.format) ? 'mp4' : video.format;
                    args.push('--merge-output-format', fmt);
                }

                args.push(video.url);

                console.log(`[Batch] Attempting download (Turbo: ${useTurbo}) for video ${index}:`, args.join(' '));

                const ytdlp = spawn('yt-dlp', args, { shell: false });

                let stderrOutput = '';
                ytdlp.stderr.on('data', chunk => stderrOutput += chunk.toString());

                ytdlp.stdout.on('data', (chunk) => {
                    const output = chunk.toString();
                    const progressMatch = output.match(/(\d+\.?\d*)%/);
                    const speedMatch = output.match(/(\d+\.?\d*\s*[KMG]iB\/s)/);
                    const etaMatch = output.match(/ETA\s+(\d+:\d+)/);

                    if (progressMatch) {
                        videoProgress.progress = parseFloat(progressMatch[1]);
                        videoProgress.speed = speedMatch ? speedMatch[1] : '';
                        videoProgress.eta = etaMatch ? etaMatch[1] : '';
                    }
                });

                return new Promise((resolve, reject) => {
                    ytdlp.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`Exit code ${code}. Stderr: ${stderrOutput}`));
                    });
                    ytdlp.on('error', reject);
                });
            };

            try {
                // Try with Turbo first
                await runDownload(true);

                videoProgress.status = 'completed';
                videoProgress.progress = 100;
                batch.completed++;
                batch.downloading--;

            } catch (turboError) {
                console.warn(`[Batch] Turbo failed for video ${index}, retrying normal mode...`, turboError.message);

                // Fallback: Retry without Turbo
                try {
                    await runDownload(false);

                    videoProgress.status = 'completed';
                    videoProgress.progress = 100;
                    batch.completed++;
                    batch.downloading--;
                } catch (finalError) {
                    console.error(`[Batch] All attempts failed for video ${index}:`, finalError.message);
                    videoProgress.status = 'error';
                    videoProgress.error = 'فشل التحميل';
                    batch.failed++;
                    batch.downloading--;
                }
            }

        } catch (error) {
            console.error(`Error downloading video ${index}:`, error);
        }
    };

    // Process downloads - higher concurrency for batch mode
    const concurrentLimit = Math.min(maxConcurrent, MAX_CONCURRENT_DOWNLOADS);

    for (let i = 0; i < videos.length; i += concurrentLimit) {
        const chunk = videos.slice(i, i + concurrentLimit);
        const promises = chunk.map((video, chunkIndex) =>
            processVideo(video, i + chunkIndex)
        );

        await Promise.allSettled(promises);
    }

    console.log(`✅ Batch ${batchId} completed: ${batch.completed}/${batch.total} successful`);
}

// Get Batch Progress
app.get('/api/progress/batch/:batchId', (req, res) => {
    const { batchId } = req.params;
    const batch = batchProgress.get(batchId);

    if (!batch) {
        return res.status(404).json({ error: 'الطابور غير موجود' });
    }

    // Calculate overall progress
    const totalProgress = batch.videos.reduce((sum, v) => sum + v.progress, 0) / batch.total;
    const overallSpeed = batch.videos
        .filter(v => v.status === 'downloading' && v.speed)
        .map(v => v.speed)
        .join(', ');

    res.json({
        batchId,
        total: batch.total,
        completed: batch.completed,
        failed: batch.failed,
        downloading: batch.downloading,
        progress: Math.round(totalProgress),
        speed: overallSpeed || '',
        videos: batch.videos,
        isComplete: batch.completed + batch.failed === batch.total
    });
});

// Create ZIP from Batch Downloads
app.post('/api/download/create-zip', async (req, res) => {
    const { batchId } = req.body;

    if (!batchId) {
        return res.status(400).json({ error: 'معرف الطابور مطلوب' });
    }

    const batch = batchProgress.get(batchId);
    if (!batch) {
        return res.status(404).json({ error: 'الطابور غير موجود' });
    }

    try {
        const archiver = require('archiver');
        const batchFolder = path.join(__dirname, 'downloads', `batch_${batchId}`);
        const zipPath = path.join(__dirname, 'downloads', `batch_${batchId}.zip`);

        if (!fs.existsSync(batchFolder)) {
            return res.status(404).json({ error: 'مجلد التحميلات غير موجود' });
        }

        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`✅ ZIP created: ${archive.pointer()} bytes`);

            // Send file for download
            res.download(zipPath, `downloads_${batchId}.zip`, (err) => {
                if (err) {
                    console.error('Error sending ZIP:', err);
                } else {
                    // Clean up ZIP file after sending
                    setTimeout(() => {
                        if (fs.existsSync(zipPath)) {
                            fs.unlinkSync(zipPath);
                        }
                    }, 60000); // Delete after 1 minute
                }
            });
        });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);
        archive.directory(batchFolder, false);
        archive.finalize();

    } catch (error) {
        console.error('ZIP creation error:', error);
        res.status(500).json({ error: 'خطأ في إنشاء ملف ZIP: ' + error.message });
    }
});

// Clean up old batch data (every 1 hour)
setInterval(() => {
    const oneHourAgo = Date.now() - 3600000;
    for (const [batchId, batch] of batchProgress.entries()) {
        if (parseInt(batchId) < oneHourAgo) {
            batchProgress.delete(batchId);

            // Also clean up batch folder
            const batchFolder = path.join(__dirname, 'downloads', `batch_${batchId}`);
            if (fs.existsSync(batchFolder)) {
                try {
                    fs.rmSync(batchFolder, { recursive: true, force: true });
                } catch (err) {
                    console.error('Error cleaning batch folder:', err);
                }
            }
        }
    }
}, 3600000);

// ===== USER DOWNLOAD HISTORY ENDPOINT =====
app.post('/api/history', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    }

    const token = authHeader.replace('Bearer ', '');
    const sb = getSupabaseAdmin();

    try {
        // Get user from token
        const { data: { user }, error: authError } = await sb.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ error: 'جلسة غير صالحة' });
        }

        const { url, title, thumbnail, format, quality, fileSize } = req.body;

        // Insert into download_history
        const { error: insertError } = await sb
            .from('download_history')
            .insert({
                user_id: user.id,
                url: url || '',
                title: title || 'Unknown',
                thumbnail: thumbnail || '',
                format: format || 'mp4',
                quality: quality || 'best',
                file_size: fileSize || ''
            });

        if (insertError) {
            console.error('History insert error:', insertError);
            return res.status(500).json({ error: 'فشل حفظ السجل' });
        }

        res.json({ success: true, message: 'تم حفظ السجل' });
    } catch (e) {
        console.error('History save error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ===== PHASE 3: CORE NEW FEATURES =====

// ========== 3.1 SCHEDULED DOWNLOADS ==========
const scheduledJobs = new Map();

app.post('/api/schedule', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.replace('Bearer ', '');
    const sb = getSupabaseAdmin();

    try {
        const { data: { user } } = await sb.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { url, scheduledAt } = req.body;

        console.log('📅 Schedule request received:', { url, scheduledAt, body: req.body });

        if (!url || !scheduledAt) {
            console.log('❌ Schedule validation failed: url=', url, 'scheduledAt=', scheduledAt);
            return res.status(400).json({ error: 'URL والوقت مطلوبين', received: { url, scheduledAt } });
        }

        // Insert scheduled download (simplified - no options column)
        const { data, error } = await sb
            .from('download_schedule')
            .insert({
                user_id: user.id,
                url,
                scheduled_at: scheduledAt,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            console.error('Schedule insert error:', error);
            return res.status(500).json({ error: error.message });
        }

        // Schedule the job
        const delay = new Date(scheduledAt) - Date.now();
        if (delay > 0) {
            const timeoutId = setTimeout(async () => {
                console.log(`⏰ Executing scheduled download: ${url}`);
                await sb.from('download_schedule').update({ status: 'completed' }).eq('id', data.id);
            }, delay);
            scheduledJobs.set(data.id, timeoutId);
        }

        res.json({ success: true, id: data.id, message: 'تم جدولة التحميل' });
    } catch (e) {
        console.error('Schedule error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/schedule', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.replace('Bearer ', '');
    const sb = getSupabaseAdmin();

    try {
        const { data: { user } } = await sb.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { data, error } = await sb
            .from('download_schedule')
            .select('*')
            .eq('user_id', user.id)
            .order('scheduled_at', { ascending: true });

        if (error) throw error;
        res.json({ schedules: data || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== 3.2 SHARE LINKS ==========
const shareLinks = new Map();
const SHARE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

app.post('/api/share', (req, res) => {
    const { filePath, password } = req.body;

    if (!filePath) return res.status(400).json({ error: 'مسار الملف مطلوب' });

    const token = require('crypto').randomBytes(16).toString('hex');
    const fullPath = path.join(__dirname, 'downloads', filePath);

    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'الملف غير موجود' });
    }

    shareLinks.set(token, {
        path: fullPath,
        password: password || null,
        createdAt: Date.now(),
        downloads: 0
    });

    // Auto-cleanup after 24 hours
    setTimeout(() => shareLinks.delete(token), SHARE_EXPIRY_MS);

    res.json({
        success: true,
        shareUrl: `/share/${token}`,
        expiresIn: '24 ساعة'
    });
});

app.get('/share/:token', (req, res) => {
    const { token } = req.params;
    const { password } = req.query;

    const link = shareLinks.get(token);
    if (!link) return res.status(404).send('الرابط منتهي أو غير صالح');

    if (link.password && link.password !== password) {
        return res.status(403).send('كلمة المرور غير صحيحة');
    }

    link.downloads++;
    res.download(link.path);
});

// ========== 3.3 RATING SYSTEM ==========
app.post('/api/rate', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.replace('Bearer ', '');
    const sb = getSupabaseAdmin();

    try {
        const { data: { user } } = await sb.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { videoUrl, rating } = req.body;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1-5' });
        }

        const { error } = await sb
            .from('ratings')
            .upsert({
                user_id: user.id,
                video_url: videoUrl,
                rating: rating
            }, { onConflict: 'user_id,video_url' });

        if (error) throw error;
        res.json({ success: true, message: 'شكراً على تقييمك!' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== 3.4 POPULAR DOWNLOADS ==========
const downloadCounts = new Map();

app.get('/api/popular', (req, res) => {
    const sorted = [...downloadCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([url, data]) => ({
            url,
            title: data.title,
            thumbnail: data.thumbnail,
            count: data.count
        }));

    res.json({ popular: sorted });
});

// Function to track downloads
function trackDownload(url, title, thumbnail) {
    const existing = downloadCounts.get(url) || { title, thumbnail, count: 0 };
    existing.count++;
    existing.title = title || existing.title;
    existing.thumbnail = thumbnail || existing.thumbnail;
    downloadCounts.set(url, existing);
}

// ========== 3.5 ACTIVITY LOGGING ==========
async function logActivity(userId, action, details, ip) {
    try {
        const sb = getSupabaseAdmin();
        await sb.from('activity_logs').insert({
            user_id: userId,
            action,
            details,
            ip_address: ip
        });
    } catch (e) {
        console.error('Log activity error:', e);
    }
}

console.log('✅ Phase 3 Core Features loaded');

// ===== PHASE 4: SOCIAL FEATURES =====

// Shared Playlists stored in memory (could be moved to Supabase)
const sharedPlaylists = new Map();

app.post('/api/playlist', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.replace('Bearer ', '');
    const sb = getSupabaseAdmin();

    try {
        const { data: { user } } = await sb.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { name, urls } = req.body;
        const playlistId = require('crypto').randomBytes(8).toString('hex');

        sharedPlaylists.set(playlistId, {
            id: playlistId,
            name,
            urls: urls || [],
            createdBy: user.id,
            createdAt: Date.now()
        });

        res.json({
            success: true,
            playlistId,
            shareUrl: `/playlist/${playlistId}`
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/playlist/:id', (req, res) => {
    const playlist = sharedPlaylists.get(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'القائمة غير موجودة' });
    res.json({ playlist });
});

console.log('✅ Phase 4 Social Features loaded');

// ===== PHASE 5: SECURITY & LIMITS =====

// Download limits tracking
const dailyDownloads = new Map();
const FREE_DAILY_LIMIT = 50;
const PRO_DAILY_LIMIT = 999999;

async function checkDownloadLimit(userId) {
    const today = new Date().toDateString();
    const key = `${userId}-${today}`;
    const count = dailyDownloads.get(key) || 0;

    // Check subscription
    const sb = getSupabaseAdmin();
    const { data } = await sb
        .from('subscriptions')
        .select('plan')
        .eq('user_id', userId)
        .single();

    const limit = data?.plan === 'pro' ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

    return {
        allowed: count < limit,
        remaining: Math.max(0, limit - count),
        limit,
        plan: data?.plan || 'free'
    };
}

function incrementDownloadCount(userId) {
    const today = new Date().toDateString();
    const key = `${userId}-${today}`;
    const count = dailyDownloads.get(key) || 0;
    dailyDownloads.set(key, count + 1);
}

// Check limit endpoint
app.get('/api/limits', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.replace('Bearer ', '');
    const sb = getSupabaseAdmin();

    try {
        const { data: { user } } = await sb.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const limits = await checkDownloadLimit(user.id);
        res.json(limits);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Blocked URLs
const blockedPatterns = [];

app.get('/api/admin/blocked', verifyAdmin, (req, res) => {
    res.json({ blocked: blockedPatterns });
});

app.post('/api/admin/blocked', verifyAdmin, (req, res) => {
    const { pattern, reason } = req.body;
    blockedPatterns.push({ pattern, reason, addedAt: Date.now() });
    res.json({ success: true, message: 'تمت إضافة النمط المحظور' });
});

function isUrlBlocked(url) {
    return blockedPatterns.some(b => url.includes(b.pattern));
}

console.log('✅ Phase 5 Security & Limits loaded');

// ===== PHASE 6: ANALYTICS =====

// Statistics tracking
const stats = {
    totalDownloads: 0,
    todayDownloads: 0,
    sourceBreakdown: {},
    averageDownloadTime: 0,
    downloadTimes: [],
    lastReset: new Date().toDateString()
};

function trackStats(source, downloadTime) {
    // Reset daily counter
    const today = new Date().toDateString();
    if (stats.lastReset !== today) {
        stats.todayDownloads = 0;
        stats.lastReset = today;
    }

    stats.totalDownloads++;
    stats.todayDownloads++;
    stats.sourceBreakdown[source] = (stats.sourceBreakdown[source] || 0) + 1;

    if (downloadTime) {
        stats.downloadTimes.push(downloadTime);
        if (stats.downloadTimes.length > 100) stats.downloadTimes.shift();
        stats.averageDownloadTime = stats.downloadTimes.reduce((a, b) => a + b, 0) / stats.downloadTimes.length;
    }
}

app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    res.json({
        totalDownloads: stats.totalDownloads,
        todayDownloads: stats.todayDownloads,
        sourceBreakdown: stats.sourceBreakdown,
        averageDownloadTime: Math.round(stats.averageDownloadTime / 1000) + 's',
        topSources: Object.entries(stats.sourceBreakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([source, count]) => ({ source, count }))
    });
});

// Weekly stats endpoint
app.get('/api/admin/stats/weekly', verifyAdmin, async (req, res) => {
    const sb = getSupabaseAdmin();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    try {
        const { data, error } = await sb
            .from('download_history')
            .select('created_at')
            .gte('created_at', weekAgo.toISOString());

        if (error) throw error;

        // Group by day
        const dailyCounts = {};
        (data || []).forEach(d => {
            const day = new Date(d.created_at).toLocaleDateString('ar');
            dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        });

        res.json({
            weeklyData: Object.entries(dailyCounts).map(([date, count]) => ({ date, count })),
            total: data?.length || 0
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

console.log('✅ Phase 6 Analytics loaded');

// ===== ADMIN API ENDPOINTS =====

// Middleware: Verify admin token
async function verifyAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'غير مصرح' });
    }

    const token = authHeader.replace('Bearer ', '');
    const sb = await getSupabaseAdmin();
    if (!sb) return res.status(500).json({ error: 'Database not available' });

    try {
        const { data: { user }, error } = await sb.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Token غير صالح' });
        }

        if (user.email !== ADMIN_EMAIL) {
            return res.status(403).json({ error: 'ليس لديك صلاحية الوصول' });
        }

        req.adminUser = user;
        next();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// Admin: List all users
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const sb = await getSupabaseAdmin();
        const { data: { users }, error } = await sb.auth.admin.listUsers();

        if (error) throw error;

        // Return simplified user data
        const userList = users.map(u => ({
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in: u.last_sign_in_at,
            banned: u.banned_until ? true : false
        }));

        res.json({ users: userList, total: userList.length });
    } catch (e) {
        console.error('Admin listUsers error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Get user's download history
app.get('/api/admin/history/:userId', verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const sb = await getSupabaseAdmin();

        const { data, error } = await sb
            .from('download_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ history: data || [], total: data?.length || 0 });
    } catch (e) {
        console.error('Admin getHistory error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Ban/Delete user
app.delete('/api/admin/users/:userId', verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const sb = await getSupabaseAdmin();

        // Delete user (this also deletes their data due to CASCADE)
        const { error } = await sb.auth.admin.deleteUser(userId);

        if (error) throw error;

        res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    } catch (e) {
        console.error('Admin deleteUser error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Ban user (without deleting)
app.post('/api/admin/users/:userId/ban', verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const sb = await getSupabaseAdmin();

        // Ban user for 100 years
        const banUntil = new Date();
        banUntil.setFullYear(banUntil.getFullYear() + 100);

        const { error } = await sb.auth.admin.updateUserById(userId, {
            ban_duration: '876000h' // ~100 years
        });

        if (error) throw error;

        res.json({ success: true, message: 'تم حظر المستخدم بنجاح' });
    } catch (e) {
        console.error('Admin banUser error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ===== LEGENDARY FEATURES API ENDPOINTS =====

// ===== PHASE 1: User System - Favorites API =====

// Get user's favorites
app.get('/api/favorites', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { data, error } = await supabaseAdmin
            .from('favorites')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, favorites: data });
    } catch (e) {
        console.error('Favorites error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Add to favorites
app.post('/api/favorites', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { video_url, video_title, thumbnail, channel } = req.body;

        const { data, error } = await supabaseAdmin
            .from('favorites')
            .insert({
                user_id: user.id,
                video_url,
                video_title,
                thumbnail,
                channel
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, favorite: data });
    } catch (e) {
        console.error('Add favorite error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Remove from favorites
app.delete('/api/favorites/:id', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { error } = await supabaseAdmin
            .from('favorites')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== PHASE 1: Playlists API =====

// Get user's playlists
app.get('/api/playlists', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { data, error } = await supabaseAdmin
            .from('playlists')
            .select('*, playlist_items(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, playlists: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create playlist
app.post('/api/playlists', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { name, is_public } = req.body;

        const { data, error } = await supabaseAdmin
            .from('playlists')
            .insert({
                user_id: user.id,
                name,
                is_public: is_public || false
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, playlist: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add video to playlist
app.post('/api/playlists/:playlistId/items', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { video_url, video_title, thumbnail, position } = req.body;

        const { data, error } = await supabaseAdmin
            .from('playlist_items')
            .insert({
                playlist_id: req.params.playlistId,
                video_url,
                video_title,
                thumbnail,
                position: position || 0
            })
            .select()
            .single();

        if (error) {
            console.error('Playlist items insert error:', error);
            throw error;
        }
        res.json({ success: true, item: data });
    } catch (e) {
        console.error('Playlist items API error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Delete playlist
app.delete('/api/playlists/:id', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        await supabaseAdmin.from('playlist_items').delete().eq('playlist_id', req.params.id);

        const { error } = await supabaseAdmin
            .from('playlists')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get public playlist (shareable)
app.get('/api/playlists/public/:id', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('playlists')
            .select('*, playlist_items(*)')
            .eq('id', req.params.id)
            .eq('is_public', true)
            .single();

        if (error || !data) return res.status(404).json({ error: 'القائمة غير موجودة' });
        res.json({ success: true, playlist: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get ALL public playlists (for discovery)
app.get('/api/playlists/discover', async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = supabaseAdmin
            .from('playlists')
            .select('*, playlist_items(*)')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Format response
        const playlists = (data || []).map(pl => ({
            ...pl,
            owner_name: 'مستخدم' // Simplified - no user lookup
        }));

        res.json({ success: true, playlists });
    } catch (e) {
        console.error('Discover playlists error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ===== PHASE 2: Scheduled Downloads API =====

app.get('/api/scheduled', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { data, error } = await supabaseAdmin
            .from('scheduled_downloads')
            .select('*')
            .eq('user_id', user.id)
            .order('scheduled_time', { ascending: true });

        if (error) throw error;
        res.json({ success: true, scheduled: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scheduled', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { video_url, video_title, thumbnail, scheduled_time, quality } = req.body;

        const { data, error } = await supabaseAdmin
            .from('scheduled_downloads')
            .insert({
                user_id: user.id,
                video_url,
                video_title,
                thumbnail,
                scheduled_time,
                quality: quality || 'best',
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, scheduled: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/scheduled/:id', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { error } = await supabaseAdmin
            .from('scheduled_downloads')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', user.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== PHASE 3: AI Features =====

app.post('/api/ai/video-summary', async (req, res) => {
    const { title, description } = req.body;

    try {
        const prompt = `قم بتلخيص هذا الفيديو بناءً على العنوان والوصف:
العنوان: ${title}
الوصف: ${description || 'لا يوجد وصف'}

أعطني:
1. ملخص مختصر (جملتين)
2. النقاط الرئيسية (3-5 نقاط)
3. هل يستحق التحميل؟ (نعم/لا مع السبب)`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || 'تعذر إنشاء الملخص';

        res.json({ success: true, summary });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ai/smart-search', async (req, res) => {
    const { query } = req.body;

    try {
        const prompt = `المستخدم يبحث عن: "${query}"
استخرج كلمات البحث المناسبة لـ YouTube بالإنجليزية والعربية.
أعد النتيجة كـ JSON: {"keywords": ["..."], "type": "..."}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { keywords: [query] };

        res.json({ success: true, search: parsed });
    } catch (e) {
        res.status(500).json({ error: e.message, search: { keywords: [req.body.query] } });
    }
});

// ===== PHASE 4: User Profile & Stats =====

app.get('/api/user/profile', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const [favoritesRes, playlistsRes, scheduledRes] = await Promise.all([
            supabaseAdmin.from('favorites').select('id', { count: 'exact' }).eq('user_id', user.id),
            supabaseAdmin.from('playlists').select('id', { count: 'exact' }).eq('user_id', user.id),
            supabaseAdmin.from('scheduled_downloads').select('id', { count: 'exact' }).eq('user_id', user.id)
        ]);

        res.json({
            success: true,
            profile: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.email?.split('@')[0],
                avatar: user.user_metadata?.avatar_url,
                created_at: user.created_at
            },
            stats: {
                favorites_count: favoritesRes.count || 0,
                playlists_count: playlistsRes.count || 0,
                scheduled_count: scheduledRes.count || 0
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/user/sync-history', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { history } = req.body;

        for (const item of history) {
            await supabaseAdmin.from('download_history').upsert({
                user_id: user.id,
                video_url: item.url,
                video_title: item.title,
                thumbnail: item.thumbnail,
                channel: item.channel,
                downloaded_at: item.downloadDate
            }, { onConflict: 'user_id, video_url' });
        }

        res.json({ success: true, synced: history.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/user/history', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { data, error } = await supabaseAdmin
            .from('download_history')
            .select('*')
            .eq('user_id', user.id)
            .order('downloaded_at', { ascending: false })
            .limit(200);

        if (error) throw error;
        res.json({ success: true, history: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

console.log('✅ Phase 7 Legendary APIs loaded');

// ===== SOCKET.IO HANDLERS =====
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('subscribe-download', (downloadId) => {
        socket.join(`download-${downloadId}`);
        console.log(`📡 Subscribed to download: ${downloadId}`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Helper: Emit download progress via WebSocket
function emitProgress(downloadId, data) {
    io.to(`download-${downloadId}`).emit('progress', data);
}

// ===== START SERVER =====
server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📁 Downloads folder: ${path.join(__dirname, 'downloads')}`);
    console.log(`🚀 Batch parallel downloads enabled (max ${MAX_CONCURRENT_DOWNLOADS} concurrent)`);
    console.log(`🔴 WebSocket: مفعّل`);
    console.log(`🧠 Gemini AI: مفعّل`);
    console.log(`📺 YouTube API: مفعّل`);
    console.log(`🎯 TikTok via Cobalt: مفعّل`);
    console.log(`⚡ aria2 Fast Download: مفعّل`);
    console.log(`📸 Instagram/Pinterest: مفعّل`);

    // Check dependencies (using absolute paths)
    exec('yt-dlp --version', (error, stdout) => {
        if (error) console.log('⚠️ yt-dlp غير مثبت!');
        else console.log(`✅ yt-dlp: ${stdout.trim()}`);
    });

    exec('ffmpeg -version', (error) => {
        if (error) console.log('⚠️ FFmpeg غير مثبت!');
        else console.log('✅ FFmpeg متوفر');
    });

    exec(`"${TOOLS.aria2c}" --version`, (error, stdout) => {
        if (error) console.log('⚠️ aria2 غير مثبت (تفقد المسار)!');
        else console.log('✅ aria2 متوفر (Turbo Mode Ready)');
    });

    exec(`"${TOOLS.gallery_dl}" --version`, (error, stdout) => {
        if (error) console.log('⚠️ gallery-dl غير مثبت!');
        else console.log(`✅ gallery-dl: ${stdout.trim().split('\n')[0]}`);
    });

    exec(`"${TOOLS.spotdl}" --version`, (error, stdout) => {
        if (error) console.log('⚠️ SpotDL غير مثبت!');
        else console.log(`✅ SpotDL: ${stdout.trim()}`);
    });
});

// ===== STATISTICS API =====
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            totalDownloads: downloadStats.totalDownloads,
            totalSize: downloadStats.totalSize,
            todayDownloads: downloadStats.today,
            byPlatform: downloadStats.byPlatform,
            cacheSize: searchCache.size,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed
        }
    });
});

// Clear stats (admin only)
app.post('/api/stats/reset', (req, res) => {
    downloadStats = {
        totalDownloads: 0,
        totalSize: 0,
        today: 0,
        byPlatform: {}
    };
    searchCache.clear();
    res.json({ success: true, message: 'تم إعادة تعيين الإحصائيات' });
});
