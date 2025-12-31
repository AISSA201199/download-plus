const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ===== TikTok Support via Cobalt API & TikWM =====
async function downloadTikTokViaCobalt(url) {
    // 1. Try Cobalt API
    try {
        console.log('Attempting Cobalt API...');
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                vCodec: 'h264',
                vQuality: '1080',
                isNoTTWatermark: true
            })
        });

        const data = await response.json();
        if (data && (data.url || data.stream)) {
            console.log('Cobalt success');
            return { ...data, url: data.url || data.stream };
        }
    } catch (error) {
        console.error('Cobalt API error:', error.message);
    }

    // 2. Fallback: TikWM API
    try {
        console.log('Attempting TikWM API...');
        const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data && data.data) {
            console.log('TikWM success');
            return {
                status: 'stream',
                url: data.data.play, // No watermark URL
                audio: data.data.music,
                filename: `tiktok_${data.data.id}.mp4`
            };
        }
    } catch (error) {
        console.error('TikWM API error:', error.message);
    }

    return { status: 'error', text: 'All TikTok APIs failed' };
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

// Store download progress
const downloadProgress = new Map();

// API: Get video information (supports all sites)
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيديو' });
    }

    console.log('Fetching info for:', url);

    try {
        // Use more compatible options for all sites
        const args = [
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--ignore-errors',
            // Important for TikTok, Instagram, etc.
            '--extractor-args', 'tiktok:api_hostname=api22-normal-c-useast1a.tiktokv.com',
            url
        ];

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

        ytdlp.on('close', (code) => {
            console.log('yt-dlp exit code:', code);

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

// API: Start download
app.post('/api/download', async (req, res) => {
    const {
        url,
        quality,
        outputPath,
        startTime,
        endTime,
        filename,
        format,
        audioOnly,
        downloadSubtitles,
        subsLang,
        embedMetadata
    } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط الفيديو' });
    }

    console.log('Starting download:', url);
    console.log('Options:', { quality, startTime, endTime, format, audioOnly });

    // Use default download path if not specified
    const downloadPath = outputPath || path.join(__dirname, 'downloads');

    // Create download directory if it doesn't exist
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
    }

    const downloadId = Date.now().toString();
    downloadProgress.set(downloadId, { progress: 0, status: 'starting', speed: '', eta: '' });

    // Build output template - Use video title
    let outputTemplate = '%(title)s.%(ext)s';
    if (filename) {
        if (filename.includes('.')) {
            outputTemplate = filename;
        } else {
            outputTemplate = filename + '.%(ext)s';
        }
    }

    // Build command arguments
    const args = [
        '--newline',
        '--progress',
        '--no-warnings',
        '--windows-filenames', // Safe filenames for Windows (better than restrict-filenames)
        '-o', path.join(downloadPath, outputTemplate),
    ];

    // Quality/Format
    if (audioOnly) {
        args.push('-x');  // Extract audio
        args.push('--audio-format', format || 'mp3');
        args.push('--audio-quality', '0');  // Best quality
    } else {
        // FIXED: Use format that ensures video+audio are merged
        if (quality && quality.includes('bestvideo')) {
            // Quality contains explicit video+audio selection
            args.push('-f', quality);
        } else if (quality === 'best' || !quality) {
            // Best quality with merged output
            args.push('-f', 'bestvideo+bestaudio/best');
        } else {
            args.push('-f', quality);
        }

        // IMPORTANT: Always merge to MP4 to ensure video+audio are combined
        const outputFormat = (format && format !== 'best' && format !== 'video') ? format : 'mp4';
        args.push('--merge-output-format', outputFormat);

        // Ensure remuxing if needed
        args.push('--remux-video', outputFormat);
    }

    // Time range (trimming)
    const hasStart = startTime && startTime.trim() !== '' && startTime !== '00:00' && startTime !== '0:00';
    const hasEnd = endTime && endTime.trim() !== '' && endTime !== '00:00' && endTime !== '0:00';

    if (hasStart || hasEnd) {
        console.log('Trimming enabled:', { startTime, endTime });

        let sectionArg = '*';
        let suffix = '_cut'; // Basic suffix

        if (hasStart && hasEnd) {
            sectionArg = `*${startTime}-${endTime}`;
            suffix = `_cut_${startTime.replace(/:/g, '-')}_to_${endTime.replace(/:/g, '-')}`;
        } else if (hasStart) {
            sectionArg = `*${startTime}-inf`;
            suffix = `_cut_from_${startTime.replace(/:/g, '-')}`;
        } else if (hasEnd) {
            sectionArg = `*0:00-${endTime}`;
            suffix = `_cut_until_${endTime.replace(/:/g, '-')}`;
        }

        // Update output template to include the trim suffix
        // We inject it before the extension
        if (outputTemplate.includes('%(ext)s')) {
            outputTemplate = outputTemplate.replace('.%(ext)s', `${suffix}.%(ext)s`);
        } else {
            outputTemplate += suffix;
        }

        // Re-update args with new output path
        const outputIndex = args.indexOf('-o');
        if (outputIndex !== -1) {
            args[outputIndex + 1] = path.join(downloadPath, outputTemplate);
        }

        args.push('--download-sections', sectionArg);
        args.push('--force-keyframes-at-cuts');
    }

    // Subtitles
    if (downloadSubtitles) {
        args.push('--write-subs');
        args.push('--sub-lang', subsLang || 'ar,en');
    }

    // Metadata
    if (embedMetadata) {
        args.push('--embed-metadata');
    }

    // Turbo Mode Option
    const useTurbo = req.body.turbo && TOOLS.aria2c && fs.existsSync(TOOLS.aria2c);

    // Add URL (Moved to end of args later)
    // args.push(url); // Don't push yet

    console.log('Final command setup. Turbo:', useTurbo);

    // Track final path
    let finalFilePath = null;

    // Helper function to execute download
    const runDownload = async (isTurbo) => {
        const cmdArgs = [...args]; // Clone basic args

        // Add Turbo args if enabled
        if (isTurbo) {
            cmdArgs.unshift('--external-downloader-args', '-x 16 -k 1M -s 16');
            cmdArgs.unshift('--external-downloader', TOOLS.aria2c);
        }

        cmdArgs.push(url); // Add URL last

        // Log the full command for debugging
        console.log('⬇️ Executing Command:', TOOLS.ytdlp, cmdArgs.join(' '));

        const ytdlp = spawn(TOOLS.ytdlp, cmdArgs, { shell: false });

        let errorLog = '';
        ytdlp.stderr.on('data', (chunk) => {
            const msg = chunk.toString();
            errorLog += msg;

            // Check for progress in stderr too
            const progressMatch = msg.match(/(\d+\.?\d*)%/);
            if (progressMatch) {
                downloadProgress.set(downloadId, {
                    progress: parseFloat(progressMatch[1]),
                    status: 'downloading',
                    speed: '',
                    eta: ''
                });
            }
        });

        ytdlp.stdout.on('data', (chunk) => {
            const output = chunk.toString();

            // Capture Filename
            // [Merger] Merging formats into "C:\...\Downloads\Title.mp4"
            const mergeMatch = output.match(/Merging formats into "(.+)"/);
            if (mergeMatch) finalFilePath = mergeMatch[1];

            // [download] Destination: C:\...\Downloads\Title.mp4
            const destMatch = output.match(/Destination: (.+)/);
            if (destMatch) {
                // Only if not part of a partial download (like .f137.mp4)
                if (!destMatch[1].includes('.f') && !destMatch[1].includes('.temp')) {
                    finalFilePath = destMatch[1];
                }
            }

            // [FixupM3u8] Mixing ... into "..."
            const fixupMatch = output.match(/Mixing .+ into "(.+)"/);
            if (fixupMatch) finalFilePath = fixupMatch[1];


            // Parse progress
            const progressMatch = output.match(/(\d+\.?\d*)%/);
            const speedMatch = output.match(/(\d+\.?\d*\s*[KMG]iB\/s)/);
            const etaMatch = output.match(/ETA\s+(\d+:\d+)/);

            if (progressMatch) {
                downloadProgress.set(downloadId, {
                    progress: parseFloat(progressMatch[1]),
                    status: 'downloading',
                    speed: speedMatch ? speedMatch[1] : '',
                    eta: etaMatch ? etaMatch[1] : ''
                });
            }
        });

        return new Promise((resolve, reject) => {
            ytdlp.on('close', (code) => {
                if (code === 0) {
                    // Check if file exists, if not, try to find the newest file
                    if (!finalFilePath || !fs.existsSync(finalFilePath)) {
                        try {
                            const files = fs.readdirSync(downloadPath)
                                .map(f => ({ name: f, time: fs.statSync(path.join(downloadPath, f)).mtime.getTime() }))
                                .sort((a, b) => b.time - a.time);

                            if (files.length > 0) {
                                // Assume the newest file is the one we just downloaded
                                // Only pick if it was modified in the last 10 seconds
                                if (Date.now() - files[0].time < 20000) {
                                    finalFilePath = path.join(downloadPath, files[0].name);
                                    console.log('⚠️ Recovered filename from directory scan:', finalFilePath);
                                }
                            }
                        } catch (e) {
                            console.error('File scan error:', e);
                        }
                    }
                    resolve();
                }
                else reject(new Error(`Exit code ${code}. Stderr: ${errorLog}`));
            });
            ytdlp.on('error', (err) => reject(err));
        });
    };

    // send response immediately
    res.json({ downloadId, message: 'بدأ التحميل' });

    // Start background process with Fallback
    (async () => {
        try {
            // Try Turbo first if requested
            if (useTurbo) {
                try {
                    await runDownload(true);
                    // Continue to success handler
                } catch (e) {
                    console.warn('Turbo download failed, switch to normal...', e.message);
                    await runDownload(false);
                }
            } else {
                // Normal download
                await runDownload(false);
            }

            // SUCCESS HANDLER
            downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: '', eta: '' });

            // AUTO UPLOAD LOGIC
            // Check if user requested auto-upload and we captured the filepath
            console.log('🔍 Auto-Upload Check:', {
                requested: req.body.autoUpload,
                path: finalFilePath,
                exists: finalFilePath ? fs.existsSync(finalFilePath) : false
            });

            if (req.body.autoUpload && finalFilePath && fs.existsSync(finalFilePath)) {
                console.log('☁️ Auto-uploading triggered:', finalFilePath);
                downloadProgress.set(downloadId, { progress: 100, status: 'uploading', speed: 'Uploading...', eta: '' });

                try {
                    await uploadToGoogleDrive(finalFilePath);
                    downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: 'Uploaded ✅', eta: '' });

                    // DELETE AFTER UPLOAD
                    if (req.body.deleteAfterUpload) {
                        fs.unlinkSync(finalFilePath);
                        console.log('🗑️ Deleted local file after upload');
                    }

                } catch (uploadErr) {
                    console.error('Upload failed:', uploadErr);
                    // Don't fail the download status, just log it? Or show warning?
                    // We reset to completed but maybe with a note
                    downloadProgress.set(downloadId, { progress: 100, status: 'completed', speed: 'Upload Failed ❌', eta: '' });
                }
            }

        } catch (error) {
            console.error('Download failed completely:', error);
            downloadProgress.set(downloadId, {
                progress: 0,
                status: 'error',
                speed: '',
                eta: '',
                error: 'فشل التحميل: ' + error.message
            });
        }
    })();
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
app.get('/api/search', async (req, res) => {
    const { q, sort = 'relevance' } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'الرجاء إدخال كلمة البحث' });
    }

    try {
        const ytdlp = spawn('yt-dlp', [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            `ytsearch10:${q}`
        ], { shell: true });

        let data = '';

        ytdlp.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        ytdlp.on('close', (code) => {
            if (code !== 0 && !data) {
                return res.status(500).json({ error: 'فشل في البحث' });
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
                    } catch (e) {
                        return null;
                    }
                }).filter(Boolean);

                res.json({ results });
            } catch (parseError) {
                res.status(500).json({ error: 'فشل في تحليل النتائج' });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في البحث' });
    }
});

// API: Get Playlist Info
app.get('/api/playlist', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'الرجاء إدخال رابط القائمة' });
    }

    try {
        const ytdlp = spawn('yt-dlp', [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            url
        ], { shell: true });

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
                    } catch (e) {
                        return null;
                    }
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
                    return res.json({ success: true, videos, source: 'api' });
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
app.get('/api/youtube/trending', async (req, res) => {
    const { regionCode = 'SA', maxResults = 20 } = req.query;

    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        const videos = data.items?.map(video => ({
            id: video.id,
            title: video.snippet.title,
            thumbnail: video.snippet.thumbnails.high?.url,
            channel: video.snippet.channelTitle,
            views: parseInt(video.statistics.viewCount),
            url: `https://www.youtube.com/watch?v=${video.id}`
        })) || [];

        res.json({ success: true, videos });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الفيديوهات الرائجة' });
    }
});

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

// Tool Paths (Detected & Verified)
const TOOLS = {
    aria2c: 'C:\\ProgramData\\chocolatey\\bin\\aria2c.exe',
    gallery_dl: 'C:\\Python314\\Scripts\\gallery-dl.exe',
    spotdl: 'C:\\Users\\gg997\\AppData\\Roaming\\Python\\Python314\\Scripts\\spotdl.exe',
    python: 'C:\\Python314\\python.exe',
    ytdlp: 'C:\\Windows\\system32\\yt-dlp.exe'
};

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
                const progressMatch = output.match(/(\d+\.?\d*)%/);
                if (progressMatch) {
                    const p = parseFloat(progressMatch[1]);
                    downloadProgress.set(downloadId, {
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

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📁 Downloads folder: ${path.join(__dirname, 'downloads')}`);
    console.log(`🚀 Batch parallel downloads enabled (max ${MAX_CONCURRENT_DOWNLOADS} concurrent)`);
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
