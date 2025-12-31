console.log('🟢 APP.JS LOADED - Version 25 (Enhanced)');
// ===== Video Downloader ULTRA - JavaScript =====
// ===== Video Downloader ULTRA - JavaScript =====

// ===== Supabase Configuration =====
const SUPABASE_URL = 'https://vyiqmihfbhsmaokpqgcv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2_Up4_GSTc5irBQHSFJY7Q_4W0bp5DS';

// Safe Supabase initialization - don't break the app if Supabase fails
let supabaseClient = null;
try {
    if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase initialized');
    } else {
        console.warn('⚠️ Supabase CDN not loaded - auth features disabled');
    }
} catch (e) {
    console.error('❌ Supabase init error:', e);
}

// ===== State Management =====
const state = {
    currentVideo: null,
    currentDownloadId: null,
    progressInterval: null,
    queue: [],
    isQueueRunning: false,
    scheduled: [],
    history: [],
    extractedData: null,
    user: null, // Supabase user
    isLoginMode: true, // true = login, false = register
    settings: {
        defaultPath: '',
        defaultQuality: 'best',
        defaultVideoFormat: 'mp4',
        defaultAudioFormat: 'mp3',
        theme: 'dark',
        language: 'ar',
        notifyOnComplete: true,
        soundOnComplete: true,
        autoPaste: false,
        useProxy: false,
        proxyUrl: '',
        maxConcurrent: 3,
        autoDownloadSubs: false,
        autoEmbedMetadata: true
    },
    stats: {
        totalDownloads: 0,
        totalSize: 0,
        todayDownloads: 0,
        weekDownloads: 0,
        sites: {},
        weekData: [0, 0, 0, 0, 0, 0, 0]
    }
};

const API_BASE = '/api';

// ===== Theme Management =====
function initTheme() {
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedColor = localStorage.getItem('colorTheme') || 'blue';

    document.documentElement.setAttribute('data-theme', savedTheme);
    if (savedColor !== 'blue') {
        document.documentElement.setAttribute('data-color', savedColor);
    }
    state.settings.theme = savedTheme;
    state.settings.colorTheme = savedColor;
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    state.settings.theme = newTheme;

    // Update theme button icon
    const themeBtn = $('themeToggle');
    if (themeBtn) {
        themeBtn.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
    }
}

function setColorTheme(color) {
    if (color === 'blue') {
        document.documentElement.removeAttribute('data-color');
    } else {
        document.documentElement.setAttribute('data-color', color);
    }
    localStorage.setItem('colorTheme', color);
    state.settings.colorTheme = color;
}

// ===== PUSH NOTIFICATIONS =====
let notificationPermission = 'default';

async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('⚠️ Notifications not supported');
        return false;
    }

    if (Notification.permission === 'granted') {
        notificationPermission = 'granted';
        console.log('✅ Notifications already enabled');
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationPermission = permission;
        console.log('📢 Notification permission:', permission);
        return permission === 'granted';
    }

    return false;
}

function sendPushNotification(title, message, options = {}) {
    if (notificationPermission !== 'granted') {
        console.log('Notifications not enabled');
        return;
    }

    try {
        const notification = new Notification(title, {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: options.tag || 'default',
            requireInteraction: options.persistent || false,
            ...options
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            if (options.onClick) options.onClick();
        };

        // Auto-close after 5 seconds
        if (!options.persistent) {
            setTimeout(() => notification.close(), 5000);
        }

        return notification;
    } catch (e) {
        console.error('Notification error:', e);
    }
}

// Notify on download complete
function notifyDownloadComplete(title, filePath) {
    sendPushNotification('✅ اكتمل التحميل!', title, {
        tag: 'download-complete',
        onClick: () => {
            // Could open downloads folder
        }
    });
}

// Notify on schedule start
function notifyScheduleStart(title) {
    sendPushNotification('⏰ بدأ التحميل المجدول', title, {
        tag: 'schedule-start'
    });
}

// Request permission on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(requestNotificationPermission, 2000);
});

console.log('✅ Push Notifications system loaded');

// ===== PWA SERVICE WORKER & INSTALL =====
let deferredInstallPrompt = null;

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registered:', registration.scope);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        showNotification('info', 'تحديث متاح', 'حدّث الصفحة للحصول على النسخة الجديدة');
                    }
                });
            });
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    });
}

// Handle install prompt
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📲 Install prompt available');
    e.preventDefault();
    deferredInstallPrompt = e;

    // Show install button
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

// Install app function
async function installPwa() {
    if (!deferredInstallPrompt) {
        showNotification('info', 'معلومة', 'التطبيق مثبت بالفعل أو غير متاح للتثبيت');
        return;
    }

    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;

    if (outcome === 'accepted') {
        console.log('✅ App installed');
        showNotification('success', 'تم التثبيت!', 'يمكنك الآن استخدام التطبيق من الشاشة الرئيسية');
    }

    deferredInstallPrompt = null;

    // Hide install button
    const installBtn = document.getElementById('installPwaBtn');
    if (installBtn) {
        installBtn.classList.add('hidden');
    }
}

// Check if app is installed
window.addEventListener('appinstalled', () => {
    console.log('📲 App was installed');
    deferredInstallPrompt = null;
});

// Make install function available globally
window.installPwa = installPwa;

console.log('✅ PWA system loaded');

// Initialize theme on load
initTheme();

// ===== DOM Elements Cache =====
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// ===== Modal Helpers =====
function openModal(id) {
    const modal = $(id);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = $(id);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Helper functions
function show(id) {
    const el = $(id);
    if (el) el.classList.remove('hidden');
}

function hide(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
}

// ===== Utility Functions =====
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ar-SA');
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    console.log('🚀 Initializing app...');

    try {
        loadSettings();
        console.log('✅ Settings loaded');

        loadHistory();
        console.log('✅ History loaded');

        loadStats();
        console.log('✅ Stats loaded');

        loadScheduled();
        console.log('✅ Scheduled loaded');

        setupEventListeners();
        console.log('✅ Event listeners set up');

        setupKeyboardShortcuts();
        console.log('✅ Keyboard shortcuts set up');

        setupDragAndDrop();
        console.log('✅ Drag and drop set up');

        applyTheme();
        console.log('✅ Theme applied');

        checkYtdlp();
        startScheduleChecker();
        createParticles();
        requestDesktopNotificationPermission();

        if (state.settings.autoPaste) {
            $('videoUrl')?.addEventListener('focus', autoPasteFromClipboard);
        }

        updateFooterStats();

        // Welcome notification
        setTimeout(() => {
            showNotification('success', 'مرحباً! 🎉', 'محمّل الفيديوهات جاهز');
        }, 1000);

        console.log('✅ App initialized successfully!');
    } catch (error) {
        console.error('❌ Error initializing app:', error);
    }
}

// ===== Desktop Notifications =====
function requestDesktopNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showDesktopNotification(title, message, icon = '🎬') {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'download-complete',
            requireInteraction: false
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        // Auto close after 5 seconds
        setTimeout(() => notification.close(), 5000);
    }
}

// ===== Particles Animation =====
function createParticles() {
    const container = $('particles');
    if (!container) return;

    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.cssText = `
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            width: ${Math.random() * 8 + 4}px;
            height: ${Math.random() * 8 + 4}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            animation-delay: ${Math.random() * 20}s;
            animation-duration: ${Math.random() * 20 + 15}s;
        `;
        container.appendChild(particle);
    }
}

// ===== Confetti Effect =====
function triggerConfetti() {
    const container = $('confettiContainer');
    if (!container) return;

    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];
    const shapes = ['square', 'circle'];

    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        confetti.style.cssText = `
            left: ${Math.random() * 100}%;
            top: -20px;
            width: ${Math.random() * 12 + 6}px;
            height: ${Math.random() * 12 + 6}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            border-radius: ${shape === 'circle' ? '50%' : '2px'};
            animation-delay: ${Math.random() * 2}s;
        `;
        container.appendChild(confetti);

        // Remove after animation
        setTimeout(() => confetti.remove(), 5000);
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    console.log('📎 Setting up event listeners...');

    // Tab Navigation
    const tabBtns = $$('.tab-btn');
    console.log('  Found', tabBtns.length, 'tab buttons');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('Tab clicked:', btn.dataset.tab);
            switchTab(btn.dataset.tab);
        });
    });

    // URL Actions
    const fetchBtn = $('fetchBtn');
    const videoUrl = $('videoUrl');
    console.log('  fetchBtn found:', !!fetchBtn);
    console.log('  videoUrl found:', !!videoUrl);

    fetchBtn?.addEventListener('click', () => {
        console.log('Fetch button clicked!');
        fetchVideoInfo();
    });

    $('pasteBtn')?.addEventListener('click', pasteFromClipboard);
    $('clearBtn')?.addEventListener('click', () => { $('videoUrl').value = ''; $('videoUrl').focus(); });
    $('addToQueueBtn')?.addEventListener('click', addToQueue);
    $('scheduleBtn')?.addEventListener('click', () => switchTab('schedule'));
    videoUrl?.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchVideoInfo(); });

    // Download
    const downloadBtn = $('downloadBtn');
    console.log('  downloadBtn found:', !!downloadBtn);
    downloadBtn?.addEventListener('click', () => {
        console.log('Download button clicked!');
        startDownload();
    });

    $('cancelDownload')?.addEventListener('click', cancelDownload);
    $('pauseDownload')?.addEventListener('click', pauseDownload);
    $('resumeDownload')?.addEventListener('click', resumeDownload);
    $('newDownloadBtn')?.addEventListener('click', resetUI);
    $('openFolderBtn')?.addEventListener('click', () => showNotification('info', 'المجلد', 'افتح مجلد downloads'));

    // Options Tabs
    $$('.option-tab').forEach(tab => {
        tab.addEventListener('click', () => switchOptionTab(tab.dataset.option));
    });

    // Speed Control
    $('videoSpeed')?.addEventListener('input', (e) => {
        $('speedValue').textContent = e.target.value + 'x';
    });

    // Speed Limit Toggle
    $('limitSpeed')?.addEventListener('change', (e) => {
        $('speedLimitControl').classList.toggle('hidden', !e.target.checked);
    });

    // Theme Toggle
    $('themeToggle')?.addEventListener('click', toggleTheme);

    // Modals
    $('settingsBtn')?.addEventListener('click', () => openModal('settingsModal'));
    $('statsBtn')?.addEventListener('click', () => { updateStatsDisplay(); openModal('statsModal'); });
    $('keyboardBtn')?.addEventListener('click', () => openModal('keyboardModal'));
    $('langToggle')?.addEventListener('click', toggleLanguage);

    // Settings
    $('saveSettingsBtn')?.addEventListener('click', saveSettings);
    $$('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => switchSettingsTab(tab.dataset.settings));
    });
    $('useProxy')?.addEventListener('change', (e) => {
        $('proxySettings').classList.toggle('hidden', !e.target.checked);
    });

    // Search
    $('searchBtn')?.addEventListener('click', searchYouTube);
    $('searchQuery')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchYouTube(); });

    // Playlist
    $('fetchPlaylistBtn')?.addEventListener('click', fetchPlaylist);
    $('selectAll')?.addEventListener('change', toggleSelectAll);
    $('downloadPlaylistBtn')?.addEventListener('click', downloadPlaylist);
    $('addPlaylistToQueue')?.addEventListener('click', addPlaylistToQueue);

    // Queue
    $('startQueueBtn')?.addEventListener('click', startQueue);
    $('pauseQueueBtn')?.addEventListener('click', pauseQueue);
    $('clearQueueBtn')?.addEventListener('click', clearQueue);
    $('batchDownloadAllBtn')?.addEventListener('click', batchDownloadAll);
    $('downloadAsZipBtn')?.addEventListener('click', () => downloadAsZip());

    // Schedule
    $('addScheduleBtn')?.addEventListener('click', addScheduledDownload);

    // History
    $('clearHistoryBtn')?.addEventListener('click', clearHistory);
    $('exportHistoryBtn')?.addEventListener('click', exportHistory);
    $('importHistoryBtn')?.addEventListener('click', importHistory);
    $('historySearch')?.addEventListener('input', filterHistory);
    $('historyFilter')?.addEventListener('change', filterHistory);

    // Extract
    $('analyzeBtn')?.addEventListener('click', analyzeVideo);

    // Preview
    $('previewBtn')?.addEventListener('click', previewVideo);
    $('downloadThumbBtn')?.addEventListener('click', downloadThumbnail);
    $('makeGifBtn')?.addEventListener('click', () => { switchTab('convert'); showConvertOption('toGif'); });
}

// ===== Keyboard Shortcuts =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl shortcuts
        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 'v':
                    if (document.activeElement.tagName !== 'INPUT') {
                        pasteFromClipboard();
                    }
                    break;
                case 'enter':
                    e.preventDefault();
                    startDownload();
                    break;
                case 'd':
                    e.preventDefault();
                    fetchVideoInfo();
                    break;
                case 'q':
                    e.preventDefault();
                    addToQueue();
                    break;
                case 's':
                    e.preventDefault();
                    openModal('settingsModal');
                    break;
                case 'h':
                    e.preventDefault();
                    switchTab('history');
                    break;
                case '1': case '2': case '3': case '4':
                case '5': case '6': case '7': case '8':
                    e.preventDefault();
                    const tabs = ['download', 'search', 'playlist', 'convert', 'extract', 'queue', 'schedule', 'history'];
                    switchTab(tabs[parseInt(e.key) - 1]);
                    break;
            }
        }

        // Escape to close modals
        if (e.key === 'Escape') {
            $$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
        }
    });
}

// ===== Drag and Drop =====
function setupDragAndDrop() {
    const dropZone = $('dropZone');

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropZone.classList.remove('hidden');
    });

    dropZone.addEventListener('dragleave', (e) => {
        if (e.target === dropZone) dropZone.classList.add('hidden');
    });

    dropZone.addEventListener('dragover', (e) => e.preventDefault());

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.add('hidden');
        const text = e.dataTransfer.getData('text');
        if (text && text.includes('http')) {
            $('videoUrl').value = text;
            fetchVideoInfo();
        }
    });
}

// ===== Fetch Video Info =====
async function fetchVideoInfo() {
    const url = $('videoUrl').value.trim();
    if (!url) {
        showNotification('error', 'خطأ', 'الرجاء إدخال رابط الفيديو');
        return;
    }

    setFetchLoading(true);
    hideAll(['videoInfo', 'downloadOptions', 'successSection', 'errorMessage']);

    try {
        let data;

        // اكتشاف تلقائي لروابط TikTok
        if (url.includes('tiktok.com') || url.includes('vm.tiktok.com')) {
            // استخدام Cobalt API لـ TikTok
            const response = await fetch(`${API_BASE}/tiktok/info?url=${encodeURIComponent(url)}`);
            const tiktokData = await response.json();

            if (!response.ok || !tiktokData.success) {
                throw new Error(tiktokData.error || 'فشل في جلب فيديو TikTok');
            }

            // تحويل البيانات للتنسيق الموحد
            data = {
                title: 'TikTok Video 🎵',
                thumbnail: tiktokData.thumbnail || 'https://via.placeholder.com/480x270?text=TikTok',
                duration: 0,
                duration_string: '--:--',
                channel: 'TikTok Creator',
                view_count: 0,
                like_count: 0,
                upload_date: '',
                description: '',
                qualities: [
                    { id: 'best', label: 'أفضل جودة (بدون علامة مائية)' },
                    { id: 'bestaudio', label: '🎵 صوت فقط (MP3)' }
                ],
                is_live: false,
                extractor: 'tiktok',
                is_tiktok: true,
                direct_url: tiktokData.download_url,
                audio_url: tiktokData.audio_url
            };

            showNotification('success', 'TikTok! 🎵', 'تم جلب الفيديو بنجاح');
        } else {
            // الروابط العادية (YouTube, Instagram, etc.)
            const response = await fetch(`${API_BASE}/info?url=${encodeURIComponent(url)}`);
            data = await response.json();

            if (!response.ok) throw new Error(data.error || 'خطأ في جلب المعلومات');
            showNotification('success', 'تم', data.title.substring(0, 40) + '...');
        }

        state.currentVideo = { ...data, url };
        displayVideoInfo(data);
    } catch (error) {
        showError(error.message);
        showNotification('error', 'خطأ', error.message);
    } finally {
        setFetchLoading(false);
    }
}

// 4. Dynamic Ambient Mode
async function enableAmbientMode(imgUrl) {
    if (!state.settings.enableAmbient) return; // Feature toggle

    try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imgUrl;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1;
            canvas.height = 1;
            ctx.drawImage(img, 0, 0, 1, 1);

            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            const rgb = `${r},${g},${b}`;

            // Set dynamic variables
            document.documentElement.style.setProperty('--primary', `rgb(${rgb})`);
            document.documentElement.style.setProperty('--primary-glow', `rgba(${rgb}, 0.5)`);
            document.documentElement.style.setProperty('--bg-gradient', `linear-gradient(135deg, rgba(${rgb}, 0.1) 0%, var(--bg-main) 100%)`);

            // Subtle transition
            document.body.style.transition = 'background 1s ease';
            document.body.style.backgroundImage = `radial-gradient(circle at top right, rgba(${rgb}, 0.15), transparent 70%)`;
        };
    } catch (e) {
        // Fallback or ignore
    }
}

function displayVideoInfo(data) {
    $('thumbnail').src = data.thumbnail;
    $('videoTitle').textContent = data.title;
    $('channelName').textContent = `📺 ${data.channel || 'غير معروف'}`;
    $('viewCount').textContent = `👁️ ${formatNumber(data.view_count)} مشاهدة`;
    $('uploadDate').textContent = `📅 ${formatDate(data.upload_date)}`;
    $('likeCount').textContent = `👍 ${formatNumber(data.like_count)}`;
    $('duration').textContent = data.duration_string || formatDuration(data.duration);

    // Call Ambient Mode
    // Default to true for now, can be added to settings later
    state.settings.enableAmbient = true;
    enableAmbientMode(data.thumbnail);

    // Quality Options
    const qualitySelect = $('quality');
    qualitySelect.innerHTML = data.qualities.map(q =>
        `<option value="${q.id}">${q.label}</option>`
    ).join('');

    // Badges - Find highest quality
    const getMaxQuality = (qualities) => {
        if (!qualities || qualities.length === 0) return 'HD';

        // Priority order for quality labels
        const qualityOrder = ['4320p', '2160p', '4K', '1440p', '2K', '1080p', '720p', '480p', '360p', '240p', '144p'];

        for (const q of qualityOrder) {
            const found = qualities.find(qual => qual.label && qual.label.includes(q));
            if (found) {
                // Convert to user-friendly format
                if (q === '2160p' || q === '4320p') return '4K';
                if (q === '1440p') return '2K';
                return q;
            }
        }

        // Fallback: check for numeric height
        const maxHeight = Math.max(...qualities.map(q => parseInt(q.label) || 0));
        if (maxHeight >= 2160) return '4K';
        if (maxHeight >= 1440) return '2K';
        if (maxHeight >= 1080) return '1080p';
        if (maxHeight >= 720) return '720p';

        return qualities[0]?.label || 'HD';
    };

    $('videoQualityBadge').textContent = `🎬 ${getMaxQuality(data.qualities)}`;
    $('estimatedSize').textContent = `💾 ${estimateSize(data.duration, data.qualities[0]?.id)}`;

    if (data.subtitles) {
        $('hasSubsBadge').classList.remove('hidden');
    }
    if (data.is_live) {
        $('isLiveBadge').classList.remove('hidden');
    }

    show('videoInfo');

    // Check if we need to reset the UI for a new download
    $('downloadBtn').disabled = false; // Fix: Re-enable button for new video
    hide('successSection'); // Hide success if visible
    hide('progressSection'); // Hide progress if visible

    setTimeout(() => show('downloadOptions'), 100);
}


// ===== Download =====
async function startDownload() {
    const activePanel = document.querySelector('.option-panel.active')?.id;
    let downloadType = 'video';

    if (activePanel === 'audioOptions') downloadType = 'audio';
    else if (activePanel === 'gifOptions') downloadType = 'gif';
    else if (activePanel === 'framesOptions') downloadType = 'frames';

    const url = $('videoUrl').value.trim();
    if (!url) {
        showNotification('error', 'خطأ', 'لا يوجد رابط');
        return;
    }

    $('downloadBtn').disabled = true;
    hide('downloadOptions');
    show('progressSection');
    updateProgress(0, 'جاري البدء...', '', '', '');

    try {
        let response, data;
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const isTikTok = url.includes('tiktok.com') || url.includes('vm.tiktok.com');
        // Skip Cobalt for localhost AND ngrok (ngrok tunnels to local machine where yt-dlp works)
        const isLocalOrNgrok = window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1'
            || window.location.hostname.includes('ngrok');

        // Try Cobalt API first for YouTube and TikTok ONLY on cloud (not localhost/ngrok)
        // On localhost/ngrok, yt-dlp works fine so skip Cobalt
        if ((isYouTube || isTikTok) && !isLocalOrNgrok) {
            updateProgress(30, 'جاري التحميل السريع...', '⚡ Cobalt', '', '');

            try {
                response = await fetch(`${API_BASE}/download/cobalt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url,
                        quality: $('quality')?.value || 'best',
                        audioOnly: downloadType === 'audio'
                    })
                });

                data = await response.json();

                if (response.ok && data.success && data.downloadUrl) {
                    console.log('✅ Cobalt download success');
                    updateProgress(100, 'اكتمل!', '', '', '');
                    downloadCompleted(data.downloadUrl);
                    return;
                }

                console.warn('Cobalt failed, trying fallback...', data.error);
            } catch (cobaltErr) {
                console.warn('Cobalt request failed:', cobaltErr.message);
            }

            // Show fallback message
            updateProgress(40, 'جاري المحاولة بطريقة بديلة...', '', '', '');
        }

        // Fallback: التحميل العادي عبر yt-dlp
        const options = buildDownloadOptions(downloadType);
        response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        data = await response.json();
        if (!response.ok) throw new Error(data.error || 'فشل التحميل');

        // If a direct download URL is provided, complete immediately
        if (data.downloadUrl) {
            updateProgress(100, 'اكتمل!', '', '', '');
            downloadCompleted(data.downloadUrl);
            return;
        }

        state.currentDownloadId = data.downloadId;
        startProgressPolling();
    } catch (error) {
        showError(error.message);
        hide('progressSection');
        show('downloadOptions');
        $('downloadBtn').disabled = false;
    }
}

function buildDownloadOptions(type) {
    const base = {
        url: $('videoUrl').value.trim(),
        outputPath: $('outputPath').value || state.settings.defaultPath,
        filename: $('filename').value || null,
        embedMetadata: $('embedMetadata')?.checked,
        autoUpload: $('autoUpload')?.checked || state.settings.autoUpload || false,
        deleteAfterUpload: $('deleteAfterUpload')?.checked || state.settings.deleteAfterUpload || false
    };

    if (type === 'video') {
        return {
            ...base,
            quality: $('quality').value,
            format: $('formatSelect').value,
            startTime: $('startTime').value || null,
            endTime: $('endTime').value || null,
            speed: $('videoSpeed')?.value || 1,
            compression: $('compression')?.value || 'none',
            downloadSubtitles: $('downloadSubs')?.checked,
            subsLang: $('subsLang')?.value || 'ar',
            embedSubs: $('embedSubs')?.checked,
            embedThumb: $('embedThumb')?.checked,
            reverse: $('reverseVideo')?.checked,
            speedLimit: $('limitSpeed')?.checked ? $('speedLimit').value + $('speedUnit').value : null
        };
    } else if (type === 'audio') {
        return {
            ...base,
            quality: 'bestaudio',
            format: $('audioFormat').value,
            audioOnly: true,
            audioBitrate: $('audioBitrate')?.value || '320'
        };
    } else if (type === 'gif') {
        return {
            ...base,
            type: 'gif',
            gifStart: $('gifStart')?.value || 0,
            gifDuration: $('gifDuration')?.value || 5,
            gifWidth: $('gifWidth')?.value || 480,
            gifFps: $('gifFps')?.value || 15
        };
    } else if (type === 'frames') {
        return {
            ...base,
            type: 'frames',
            framesType: $('framesType')?.value || 'interval',
            framesValue: $('framesValue')?.value || 5,
            framesFormat: $('framesFormat')?.value || 'jpg'
        };
    }

    return base;
}

function startProgressPolling() {
    state.progressInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/progress/${state.currentDownloadId}`);
            const data = await res.json();

            if (data.status === 'downloading') {
                updateProgress(
                    data.progress,
                    'جاري التحميل...',
                    data.speed ? `⚡ ${data.speed}` : '',
                    data.eta ? `⏱️ ${data.eta}` : '',
                    data.size ? `📦 ${data.size}` : ''
                );
            } else if (data.status === 'completed') {
                stopProgressPolling();
                downloadCompleted(data.downloadUrl);
            } else if (data.status === 'error') {
                stopProgressPolling();
                showError(`فشل التحميل: ${data.error || 'خطأ غير معروف'}`);
                hide('progressSection');
                show('downloadOptions');
                $('downloadBtn').disabled = false;
            }
        } catch (e) {
            console.error('Progress error:', e);
        }
    }, 500);
}

function stopProgressPolling() {
    if (state.progressInterval) {
        clearInterval(state.progressInterval);
        state.progressInterval = null;
    }
}

function downloadCompleted(downloadUrl) {
    if (downloadUrl) {
        // Method 1: Anchor Click (Standard)
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Method 2: Force Window Location (Mobile Fallback)
        // If the file is not a fast download, this ensures it saves
        setTimeout(() => {
            if (!document.hidden) {
                window.location.href = downloadUrl;
            }
        }, 1000);
    }
    updateProgress(100, 'اكتمل!', '', '', '');
    addToHistory(state.currentVideo);
    updateStats();

    setTimeout(() => {
        hide('progressSection');
        show('successSection');
        triggerConfetti(); // 🎉 Confetti effect!

        if (state.settings.notifyOnComplete) {
            showNotification('success', 'تم التحميل! 🎉', state.currentVideo.title);
            showDesktopNotification('تم التحميل! 🎉', state.currentVideo.title);
            if (state.settings.soundOnComplete) playSound();
        }
    }, 500);
}

function updateProgress(percent, status, speed, eta, size) {
    $('progressFill').style.width = `${percent}%`;
    $('progressPercent').textContent = `${Math.round(percent)}%`;
    $('progressStatus').textContent = status;
    $('progressSpeed').textContent = speed;
    $('progressEta').textContent = eta;
    if ($('progressSize')) $('progressSize').textContent = size;
}

// Make functions global for HTML onclick
window.pauseDownload = async function () {
    console.log('⏯️ Pause clicked. Current ID:', state.currentDownloadId);

    if (!state.currentDownloadId) {
        showNotification('warning', 'تنبيه', 'لا يوجد تحميل نشط حالياً للإيقاف');
        console.warn('No active download ID to pause');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.currentDownloadId })
        });
        const data = await res.json();

        if (data.success) {
            showNotification('info', 'إيقاف', 'تم إيقاف التحميل مؤقتاً');
            $('pauseDownload').classList.add('hidden');
            $('resumeDownload').classList.remove('hidden');
            // Update status text separately to be immediate
            $('progressStatus').textContent = 'متوقف مؤقتاً ⏸';
        } else {
            showNotification('error', 'خطأ', data.error || 'فشل الإيقاف');
        }
    } catch (e) {
        console.error('Pause failed:', e);
        showNotification('error', 'خطأ', 'فشل الاتصال بالسيرفر');
    }
};

window.resumeDownload = async function () {
    console.log('▶️ Resume clicked. Current ID:', state.currentDownloadId);

    if (!state.currentDownloadId) {
        showNotification('error', 'خطأ', 'لا يمكن الاستئناف: مفقود معرف التحميل');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/resume/${state.currentDownloadId}`, {
            method: 'POST'
        });
        const data = await res.json();

        if (data.success) {
            showNotification('info', 'استئناف', 'جاري استكمال التحميل...');
            $('resumeDownload').classList.add('hidden');
            $('pauseDownload').classList.remove('hidden');
            // Ensure polling is active
            if (!state.progressInterval) startProgressPolling();
        } else {
            showNotification('error', 'خطأ', data.error || 'فشل الاستئناف');
        }
    } catch (e) {
        console.error('Resume failed:', e);
        showNotification('error', 'خطأ', 'فشل الاتصال بالسيرفر');
    }
};

function cancelDownload() {
    stopProgressPolling();
    hide('progressSection');
    show('downloadOptions');
    $('downloadBtn').disabled = false;
    showNotification('info', 'إلغاء', 'تم إلغاء التحميل');
}

// ===== Queue =====
function addToQueue() {
    if (!state.currentVideo) {
        showNotification('error', 'خطأ', 'جلب معلومات الفيديو أولاً');
        return;
    }

    // Get current user preferences from the UI
    const activePanel = document.querySelector('.option-panel.active')?.id;
    const isAudio = activePanel === 'audioOptions';

    state.queue.push({
        id: Date.now(),
        url: state.currentVideo.url,
        title: state.currentVideo.title,
        thumbnail: state.currentVideo.thumbnail,
        quality: $('quality')?.value || 'best',
        format: isAudio ? ($('audioFormat')?.value || 'mp3') : ($('formatSelect')?.value || 'mp4'),
        audioOnly: isAudio,
        turbo: true, // Default turbo enabled
        status: 'pending',
        progress: 0
    });

    updateQueueDisplay();
    showNotification('success', 'الطابور', 'تم إضافة الفيديو');
}

function updateQueueDisplay() {
    // Update counts
    const countEls = document.querySelectorAll('#queueCount, #batchCount');
    countEls.forEach(el => el.textContent = state.queue.length);

    // Target both the widget (Home) and the full page (Queue Tab)
    const containers = ['queueList', 'queueListMain'];

    containers.forEach(id => {
        const container = $(id);
        if (!container) return;

        if (state.queue.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>قائمة الانتظار فارغة</p>
                    <small>أضف روابط للبدء</small>
                </div>
            `;
            return;
        }

        container.innerHTML = state.queue.map(item => `
            <div class="clean-queue-item" data-id="${item.id}">
                <button class="btn-close-item" onclick="removeFromQueue(${item.id})">✕</button>
                <div class="queue-thumb">
                    ${item.status === 'downloading' ? '<span class="status-icon">⬇️</span>' : '<span class="pause-icon">⏸</span>'}
                </div>
                <div class="queue-details">
                    <h4>${item.title.substring(0, 50)}...</h4>
                    <div class="queue-progress-row">
                        <div class="progress-bar-line">
                            <div class="progress-fill-blue" style="width: ${item.progress}%"></div>
                        </div>
                        <span class="queue-meta">${Math.round(item.progress)}% - ${getQueueStatusText(item)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    });
}

// Helper function for queue status text
function getQueueStatusText(item) {
    if (item.status === 'completed') return '✅ اكتمل';
    if (item.status === 'error') return '❌ فشل';
    if (item.status === 'downloading') return `⏳ ${item.progress}%`;
    return '⏸️ في الانتظار';
}

window.removeFromQueue = function (id) {
    state.queue = state.queue.filter(i => i.id !== id);
    updateQueueDisplay();
};

async function startQueue() {
    if (state.queue.length === 0) {
        showNotification('info', 'الطابور', 'الطابور فارغ');
        return;
    }

    state.isQueueRunning = true;
    showNotification('success', 'الطابور', 'بدء تحميل الطابور...');
    $('queueProgress').classList.remove('hidden');

    let completed = 0;
    const total = state.queue.length;

    for (const item of state.queue) {
        if (!state.isQueueRunning) break;
        if (item.status === 'completed') { completed++; continue; } // Skip completed

        item.status = 'downloading';
        updateQueueDisplay();

        try {
            // Check Turbo Setting
            const isTurbo = item.turbo !== false; // Default true
            const endpoint = isTurbo ? '/download/fast' : '/download';

            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: item.url,
                    quality: item.quality || 'best',
                    format: item.format || 'mp4', // Fix: Default to mp4
                    outputPath: ''
                })
            });

            const data = await response.json();

            // انتظار اكتمال التحميل
            const result = await waitForDownload(data.downloadId, (progress) => {
                item.progress = progress;
                updateQueueDisplay();
            });

            if (result.url) {
                triggerBrowserDownload(result.url, result.filename);
            }

            item.status = 'completed';
            completed++;
        } catch (e) {
            item.status = 'error';
            console.error(e);
        }

        $('queueProgressText').textContent = `${completed}/${total}`;
        $('queueProgressFill').style.width = `${(completed / total) * 100}%`;
        updateQueueDisplay();
    }

    state.isQueueRunning = false;
    showNotification('success', 'الطابور', `تم تحميل ${completed} فيديو!`);
}

// Helper to trigger browser download
function triggerBrowserDownload(url, filename) {
    if (!url) return;
    console.log('⬇️ Triggering browser download:', url);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || url.split('/').pop();
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function waitForDownload(downloadId, onProgress) {
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/progress/${downloadId}`);
                const data = await res.json();

                if (data.progress) onProgress(data.progress);

                if (data.status === 'completed' || data.status === 'error') {
                    clearInterval(interval);
                    // Return full data object to access URL
                    resolve(data);
                }
            } catch (e) {
                clearInterval(interval);
                resolve({ status: 'error' });
            }
        }, 1000);
    });
}

function pauseQueue() {
    state.isQueueRunning = false;
    showNotification('info', 'الطابور', 'تم إيقاف الطابور');
}

// Update Queue Item Settings
window.updateQueueItem = function (id, field, value) {
    const item = state.queue.find(i => i.id === id);
    if (item) {
        item[field] = value;

        // Auto-update related fields
        if (field === 'audioOnly' && value === true) {
            item.format = 'mp3';
        }

        console.log(`Updated queue item ${id}: ${field} = ${value}`);
    }
};

// BATCH DOWNLOAD ALL - Parallel Downloads with Turbo Speed!
async function batchDownloadAll() {
    if (state.queue.length === 0) {
        showNotification('info', 'الطابور', 'الطابور فارغ');
        return;
    }

    state.isQueueRunning = true;
    $('queueProgress').classList.remove('hidden');

    showNotification('success', '⚡ تحميل سريع', `بدء تحميل ${state.queue.length} فيديو!`);

    const total = state.queue.length;
    let completed = 0;
    let failed = 0;

    // Process downloads - higher concurrency for all videos
    const maxConcurrent = state.settings.maxConcurrent || 10;
    const pending = [...state.queue.filter(item => item.status !== 'completed')];

    // Helper function to download a single item
    async function downloadItem(item) {
        item.status = 'downloading';
        updateQueueDisplay();

        try {
            const isTurbo = item.turbo !== false;
            const endpoint = isTurbo ? '/download/fast' : '/download';

            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: item.url,
                    quality: item.quality || 'best',
                    format: item.audioOnly ? 'audio' : (item.format || 'mp4'),
                    outputPath: ''
                })
            });

            const data = await response.json();

            if (!response.ok || !data.downloadId) {
                throw new Error(data.error || 'فشل بدء التحميل');
            }

            // Wait for download to complete
            const result = await waitForDownload(data.downloadId, (progress) => {
                item.progress = progress;
                updateQueueDisplay();
            });

            if (result.url) {
                triggerBrowserDownload(result.url, result.filename);
            }

            item.status = 'completed';
            item.progress = 100;
            completed++;
        } catch (e) {
            console.error('Download error for:', item.url, e);
            item.status = 'error';
            failed++;
        }

        // Update overall progress
        $('queueProgressText').textContent = `${completed}/${total}`;
        $('queueProgressFill').style.width = `${((completed + failed) / total) * 100}%`;
        updateQueueDisplay();
    }

    // Process in batches with concurrency limit
    const batchProcessing = async () => {
        const running = [];

        for (const item of pending) {
            if (!state.isQueueRunning) break;

            const promise = downloadItem(item).finally(() => {
                const idx = running.indexOf(promise);
                if (idx > -1) running.splice(idx, 1);
            });

            running.push(promise);

            // If we've hit the concurrency limit, wait for one to finish
            if (running.length >= maxConcurrent) {
                await Promise.race(running);
            }
        }

        // Wait for all remaining downloads
        await Promise.all(running);
    };

    try {
        await batchProcessing();
    } catch (error) {
        console.error('Batch processing error:', error);
    }

    state.isQueueRunning = false;

    if (completed > 0) {
        showNotification('success', '🎉 اكتمل!', `تم تحميل ${completed} من ${total} فيديو`);
        showDesktopNotification('🎉 اكتمل الطابور!', `تم تحميل ${completed} من ${total} فيديو`);
        triggerConfetti();
    } else {
        showNotification('error', 'خطأ', 'فشل تحميل جميع الفيديوهات');
    }
}

// Track Batch Progress
let batchProgressInterval = null;
let currentBatchId = null;

function trackBatchProgress(batchId) {
    currentBatchId = batchId;

    batchProgressInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/progress/batch/${batchId}`);
            const data = await res.json();

            // Update overall progress
            $('queueProgressText').textContent = `${data.completed}/${data.total}`;
            $('queueProgressFill').style.width = `${data.progress}%`;

            // Update individual videos
            data.videos.forEach((video, index) => {
                if (state.queue[index]) {
                    state.queue[index].status = video.status;
                    state.queue[index].progress = video.progress;
                }
            });

            updateQueueDisplay();

            // Check if complete
            if (data.isComplete) {
                clearInterval(batchProgressInterval);
                state.isQueueRunning = false;

                showNotification(
                    'success',
                    '🎉 اكتمل!',
                    `تم تحميل ${data.completed} من ${data.total} فيديو`
                );

                // Show ZIP download option
                if (data.completed > 0) {
                    setTimeout(() => {
                        if (confirm(`✅ اكتمل التحميل!\n\nهل تريد تحميل جميع الملفات كملف ZIP واحد؟`)) {
                            downloadAsZip(batchId);
                        }
                    }, 1000);
                }
            }

        } catch (error) {
            console.error('Error tracking batch:', error);
        }
    }, 1000); // Update every 1 second
}

// Download as ZIP
async function downloadAsZip(batchId) {
    showNotification('info', 'ZIP', 'جاري إنشاء ملف ZIP...');

    try {
        const response = await fetch(`${API_BASE}/download/create-zip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId: batchId || currentBatchId })
        });

        if (response.ok) {
            // Trigger file download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `downloads_${batchId || currentBatchId}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            showNotification('success', 'ZIP', 'تم تحميل ملف ZIP بنجاح!');
        } else {
            throw new Error('فشل إنشاء ZIP');
        }
    } catch (error) {
        console.error('ZIP download error:', error);
        showNotification('error', 'خطأ', 'فشل إنشاء ملف ZIP');
    }
}


function clearQueue() {
    state.queue = [];
    state.isQueueRunning = false;
    $('queueProgress').classList.add('hidden');
    updateQueueDisplay();
    showNotification('info', 'الطابور', 'تم مسح الطابور');
}

// ===== Scheduled Downloads =====
function addScheduledDownload() {
    const url = $('scheduleUrl').value.trim();
    const date = $('scheduleDate').value;
    const time = $('scheduleTime').value;

    if (!url || !date || !time) {
        showNotification('error', 'خطأ', 'أكمل جميع الحقول');
        return;
    }

    state.scheduled.push({
        id: Date.now(),
        url,
        date,
        time,
        quality: $('scheduleQuality').value,
        status: 'scheduled'
    });

    saveScheduled();
    updateScheduledDisplay();
    showNotification('success', 'الجدولة', 'تمت إضافة التحميل المجدول');

    $('scheduleUrl').value = '';
}

function updateScheduledDisplay() {
    const scheduledList = $('scheduledList');
    if (!scheduledList) return;

    if (state.scheduled.length === 0) {
        scheduledList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📅</span>
                <p>لا توجد تحميلات مجدولة</p>
            </div>
        `;
        return;
    }

    scheduledList.innerHTML = state.scheduled.map(item => `
        <div class="scheduled-item queue-item">
            <div class="queue-item-info">
                <h5>${item.url.substring(0, 50)}...</h5>
                <p>📅 ${item.date} ⏰ ${item.time}</p>
            </div>
            <button onclick="removeScheduled(${item.id})" class="btn btn-sm btn-danger">🗑️</button>
        </div>
    `).join('');
}

window.removeScheduled = function (id) {
    state.scheduled = state.scheduled.filter(i => i.id !== id);
    saveScheduled();
    updateScheduledDisplay();
};

function startScheduleChecker() {
    setInterval(async () => {
        const now = new Date();
        for (const item of state.scheduled) {
            const scheduledTime = new Date(`${item.date}T${item.time}`);
            if (now >= scheduledTime && item.status === 'scheduled') {
                item.status = 'downloading';
                showNotification('info', 'الجدولة', 'بدء تحميل مجدول: ' + item.url.substring(0, 30) + '...');
                saveScheduled();
                updateScheduledDisplay();

                try {
                    const response = await fetch(`${API_BASE}/download`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            url: item.url,
                            quality: item.quality || 'best'
                        })
                    });

                    if (response.ok) {
                        item.status = 'completed';
                        showNotification('success', 'الجدولة', 'تم تحميل الفيديو المجدول!');
                    } else {
                        item.status = 'error';
                    }
                } catch (e) {
                    item.status = 'error';
                    showNotification('error', 'الجدولة', 'فشل التحميل المجدول');
                }

                saveScheduled();
                updateScheduledDisplay();
            }
        }
    }, 30000); // Check every 30 seconds
}

// ===== History =====
function addToHistory(video) {
    state.history.unshift({
        id: Date.now(),
        url: video.url,
        title: video.title,
        thumbnail: video.thumbnail,
        channel: video.channel,
        downloadDate: new Date().toISOString()
    });

    if (state.history.length > 200) state.history.pop();
    saveHistory();
    updateHistoryDisplay();
}

function updateHistoryDisplay(filter = '', dateFilter = 'all') {
    let items = state.history;

    if (filter) {
        items = items.filter(i => i.title.toLowerCase().includes(filter.toLowerCase()));
    }

    if (dateFilter !== 'all') {
        const now = new Date();
        items = items.filter(i => {
            const d = new Date(i.downloadDate);
            if (dateFilter === 'today') return d.toDateString() === now.toDateString();
            if (dateFilter === 'week') return (now - d) < 7 * 24 * 60 * 60 * 1000;
            if (dateFilter === 'month') return (now - d) < 30 * 24 * 60 * 60 * 1000;
            return true;
        });
    }

    const historyTotal = $('historyTotal');
    if (historyTotal) historyTotal.textContent = items.length;

    const container = $('historyTableBody');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding: 20px;">
                    <p>لا يوجد سجل</p>
                </td>
            </tr>
        `;
        return;
    }

    container.innerHTML = items.slice(0, 50).map(item => `
        <tr>
            <td>
                <div class="file-cell">
                    <span class="file-icon">🎥</span>
                    <span>${item.title.substring(0, 40) + '...'}</span>
                </div>
            </td>
            <td>${formatDate(item.downloadDate)}</td>
            <td>${item.size || '--'}</td>
            <td><span class="status-badge complete">✅ مكتمل</span></td>
            <td>
                <div class="actions-cell">
                    <button onclick="redownload('${item.url}')" class="action-link" style="border:none;background:none;cursor:pointer;">📂 تنزيل</button>
                    <button onclick="copyToClipboard('${item.url}')" class="action-link" style="border:none;background:none;cursor:pointer;">🔗 مشاركة</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function filterHistory() {
    updateHistoryDisplay($('historySearch').value, $('historyFilter').value);
}

function clearHistory() {
    if (confirm('مسح كل السجل؟')) {
        state.history = [];
        saveHistory();
        updateHistoryDisplay();
    }
}

function exportHistory() {
    downloadJSON(state.history, 'history.json');
    showNotification('success', 'تصدير', 'تم تصدير السجل');
}

function importHistory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    state.history = [...data, ...state.history];
                    saveHistory();
                    updateHistoryDisplay();
                    showNotification('success', 'استيراد', 'تم استيراد السجل');
                } catch (e) {
                    showNotification('error', 'خطأ', 'ملف غير صالح');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

window.redownload = function (url) {
    $('videoUrl').value = url;
    switchTab('download');
    fetchVideoInfo();
};

// ===== Search =====
async function searchYouTube() {
    const query = $('searchQuery').value.trim();
    if (!query) return;

    $('searchResults').innerHTML = '<div class="loader"></div>';

    try {
        // Use the new Hybrid Search API
        const response = await fetch(`${API_BASE}/search/hybrid?query=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            displaySearchResults(data.results, data.method);
        } else {
            $('searchResults').innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">🔍</span>
                    <p>لا توجد نتائج</p>
                </div>
            `;
        }
    } catch (error) {
        $('searchResults').innerHTML = `<div class="error-message">فشل البحث: ${error.message}</div>`;
    }
}

function displaySearchResults(results, method = 'API') {
    const container = $('searchResults');

    // Add method badge
    let html = `<div class="search-method-badge">⚡ Using: ${method}</div>`;

    html += '<div class="search-grid">';

    html += results.map(item => `
        <div class="search-card">
            <div class="search-thumb-wrapper">
                <img src="${item.thumbnail}" alt="${item.title}" onclick="selectVideo('https://www.youtube.com/watch?v=${item.id}')">
                <span class="duration-badge">${item.duration ? formatDuration(item.duration) : ''}</span>
            </div>
            <div class="search-info">
                <h4 onclick="selectVideo('https://www.youtube.com/watch?v=${item.id}')">${item.title}</h4>
                <div class="channel-name">${item.channel}</div>
                <div class="search-meta">
                    ${item.publishedAt ? `<span>📅 ${formatDate(item.publishedAt)}</span>` : ''}
                </div>
                
                <div class="search-actions">
                    <button class="btn btn-sm btn-success" onclick="previewVideo('${item.id}')">
                        ▶️ معاينة
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="quickDownload('${item.id}', '${item.title.replace(/'/g, "")}')">
                        ⬇️ تحميل
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="quickQueue('${item.id}', '${item.title.replace(/'/g, "")}', '${item.thumbnail}')">
                        ➕ للطابور
                    </button>
                    <button class="btn btn-sm" style="background: #9c27b0; color: white;" onclick="showPlaylistSelector('https://www.youtube.com/watch?v=${item.id}', '${item.title.replace(/'/g, "")}', '${item.thumbnail}')">
                        📂 للقائمة
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    html += '</div>';
    container.innerHTML = html;
}

// Quick Actions
window.quickDownload = function (id, title) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    $('videoUrl').value = url;
    switchTab('download');
    fetchVideoInfo(); // Auto fetch
    showNotification('success', 'تم الاختيار', `تم اختيار: ${title}`);
};

window.quickQueue = function (id, title, thumbnail) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    state.queue.push({
        id: Date.now(),
        url,
        title,
        thumbnail,
        quality: 'best',
        format: 'mp4',       // Added: default format
        audioOnly: false,    // Added: default not audio only
        turbo: true,         // Added: default turbo enabled
        status: 'pending',
        progress: 0
    });
    updateQueueDisplay();
    showNotification('success', 'تمت الإضافة للطابور', title);

    // Add nice animation effect
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✅ تم';
    setTimeout(() => btn.innerHTML = originalText, 1000);
};

window.selectVideo = function (url) {
    $('videoUrl').value = url;
    switchTab('download');
    fetchVideoInfo();
};

// Preview video in modal
// Preview video in modal (Consolidated & Fixed)
window.previewVideo = function (videoId) {
    let embedId = videoId;

    // If no ID passed, try to get from current state
    if (!embedId && state.currentVideo) {
        const url = state.currentVideo.url;
        embedId = url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1];
    }

    if (embedId) {
        const iframe = $('previewFrame');
        if (iframe) {
            iframe.src = `https://www.youtube.com/embed/${embedId}?autoplay=1`;

            // Add fallback link helper if not exists
            const modalBody = iframe.parentElement;
            let fallbackHelper = document.getElementById('previewFallback');
            if (!fallbackHelper) {
                fallbackHelper = document.createElement('div');
                fallbackHelper.id = 'previewFallback';
                fallbackHelper.style.textAlign = 'center';
                fallbackHelper.style.marginTop = '10px';
                modalBody.appendChild(fallbackHelper);
            }
            fallbackHelper.innerHTML = `<a href="https://www.youtube.com/watch?v=${embedId}" target="_blank" style="color:var(--primary); text-decoration:none;">🔗 فتح في يوتيوب (إذا لم يعمل المشغل)</a>`;

            openModal('previewModal');
        }
    } else {
        showNotification('error', 'خطأ', 'لا يمكن معاينة هذا الفيديو');
    }
};

window.closePreviewModal = function () {
    const iframe = $('previewFrame');
    if (iframe) iframe.src = '';
    closeModal('previewModal');
};

// ===== Playlist =====
async function fetchPlaylist() {
    const url = $('playlistUrl').value.trim();
    if (!url) return;

    $('playlistVideos').innerHTML = '<div class="empty-state"><p>جاري الجلب...</p></div>';

    try {
        const res = await fetch(`${API_BASE}/playlist?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (data.videos?.length > 0) {
            $('playlistInfo').classList.remove('hidden');
            $('playlistCount').textContent = `${data.count} فيديو`;

            $('playlistVideos').innerHTML = data.videos.map((v, i) => `
                <div class="playlist-video-item">
                    <input type="checkbox" checked data-url="${v.url}">
                    <img src="${v.thumbnail}" alt="">
                    <div>
                        <h5>${i + 1}. ${v.title}</h5>
                        <span>${v.duration}</span>
                    </div>
                </div>
            `).join('');

            $('playlistActions').classList.remove('hidden');
        }
    } catch (e) {
        $('playlistVideos').innerHTML = '<div class="empty-state"><p>خطأ</p></div>';
    }
}

function toggleSelectAll() {
    $$('#playlistVideos input[type="checkbox"]').forEach(cb =>
        cb.checked = $('selectAll').checked
    );
}

async function downloadPlaylist() {
    const checkboxes = Array.from($$('#playlistVideos input[type="checkbox"]:checked'));
    if (checkboxes.length === 0) {
        showNotification('error', 'خطأ', 'اختر فيديو واحد على الأقل');
        return;
    }

    const urls = checkboxes.map(cb => cb.dataset.url);
    const quality = $('playlistQuality').value;

    showNotification('info', 'القائمة', `بدء تحميل ${urls.length} فيديو...`);

    let completed = 0;
    for (const url of urls) {
        try {
            await fetch(`${API_BASE}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, quality })
            });
            completed++;
        } catch (e) {
            console.error('Playlist download error:', e);
        }
    }

    showNotification('success', 'القائمة', `تم بدء تحميل ${completed} فيديو!`);
}

function addPlaylistToQueue() {
    const urls = Array.from($$('#playlistVideos input[type="checkbox"]:checked'))
        .map(cb => cb.dataset.url);

    urls.forEach(url => {
        state.queue.push({
            id: Date.now() + Math.random(),
            url,
            title: 'فيديو من القائمة',
            thumbnail: '',
            status: 'pending',
            progress: 0
        });
    });

    updateQueueDisplay();
    showNotification('success', 'الطابور', `تم إضافة ${urls.length} فيديو`);
}

// ===== Extract Features =====
async function analyzeVideo() {
    const url = $('extractUrl').value.trim();
    if (!url) return;

    showNotification('info', 'تحليل', 'جاري تحليل الفيديو...');
}

window.trimVideo = function () {
    if (!state.currentVideo) {
        showNotification('error', 'خطأ', 'الرجاء جلب فيديو أولاً');
        return;
    }

    const start = $('trimStart').value;
    const end = $('trimEnd').value;

    if ((!start || start === '00:00') && !end) {
        showNotification('error', 'خطأ', 'حدد وقت البداية أو النهاية');
        return;
    }

    // Set values in download tab logic
    $('startTime').value = start;
    $('endTime').value = end;

    // Switch to Download logic
    switchTab('download');
    // Open video options to ensure values are read from the correct inputs if needed
    // Assuming startDownload reads from #startTime and #endTime directly as per line 589

    startDownload();
    showNotification('info', 'قص', 'جاري إعداد القص...');
};

window.extractComments = async function () {
    showExtractResults('التعليقات', 'جاري جلب التعليقات...');
    // Would call API
};

window.extractChapters = async function () {
    if (state.currentVideo?.chapters) {
        const chapters = state.currentVideo.chapters.map(c =>
            `${formatDuration(c.start_time)} - ${c.title}`
        ).join('\n');
        showExtractResults('الفصول', chapters);
    } else {
        showExtractResults('الفصول', 'لا توجد فصول في هذا الفيديو');
    }
};

window.extractDescription = async function () {
    if (state.currentVideo?.description) {
        showExtractResults('الوصف', state.currentVideo.description);
    } else {
        showExtractResults('الوصف', 'لا يوجد وصف');
    }
};

window.extractLinks = async function () {
    const desc = state.currentVideo?.description || '';
    const urls = desc.match(/https?:\/\/[^\s]+/g) || [];
    showExtractResults('الروابط', urls.length > 0 ? urls.join('\n') : 'لا توجد روابط');
};

window.extractSubtitles = async function () {
    showNotification('info', 'الترجمات', 'جاري جلب الترجمات المتاحة...');
};

window.extractMetadata = async function () {
    if (state.currentVideo) {
        const meta = JSON.stringify(state.currentVideo, null, 2);
        showExtractResults('البيانات الوصفية', meta);
    }
};

function showExtractResults(title, content) {
    $('extractResults').classList.remove('hidden');
    $('extractTitle').textContent = title;
    $('extractContent').textContent = content;
    state.extractedData = content;
}

window.copyResults = function () {
    if (state.extractedData) {
        navigator.clipboard.writeText(state.extractedData);
        showNotification('success', 'نسخ', 'تم النسخ');
    }
};

window.downloadResults = function () {
    if (state.extractedData) {
        downloadText(state.extractedData, 'extract.txt');
    }
};

window.closeResults = function () {
    $('extractResults').classList.add('hidden');
};

// ===== Convert Features =====
window.showConvertOption = function (option) {
    showNotification('info', 'تحويل', `تم اختيار: ${option}`);

    if (option === 'toGif') {
        switchTab('download');
        switchOptionTab('gif');
    } else if (option === 'extractFrames') {
        switchTab('download');
        switchOptionTab('frames');
    }
};

// ===== Share =====
window.shareVideo = function () {
    if (state.currentVideo?.url) {
        if (navigator.share) {
            navigator.share({
                title: state.currentVideo.title,
                url: state.currentVideo.url
            });
        } else {
            copyToClipboard(state.currentVideo.url);
        }
    }
};

// ===== Preview =====
// Preview function moved/consolidated above

// ===== Theme & Language =====
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    state.settings.theme = next;
    $('themeToggle').querySelector('.theme-icon').textContent = next === 'dark' ? '🌙' : '☀️';
    saveSettings();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    const icon = $('themeToggle')?.querySelector('.theme-icon');
    if (icon) icon.textContent = state.settings.theme === 'dark' ? '🌙' : '☀️';
}

function toggleLanguage() {
    showNotification('info', 'اللغة', 'ميزة قادمة قريباً');
}

// ===== Settings =====
function loadSettings() {
    const saved = localStorage.getItem('ultraSettings');
    if (saved) state.settings = { ...state.settings, ...JSON.parse(saved) };
}

function saveSettings() {
    state.settings = {
        ...state.settings,
        defaultPath: $('defaultPath')?.value || '',
        defaultQuality: $('defaultQuality')?.value || 'best',
        theme: state.settings.theme,
        notifyOnComplete: $('notifyOnComplete')?.checked ?? true,
        soundOnComplete: $('soundOnComplete')?.checked ?? true,
        autoPaste: $('autoPaste')?.checked ?? false
    };

    localStorage.setItem('ultraSettings', JSON.stringify(state.settings));
    closeModal('settingsModal');
    showNotification('success', 'حفظ', 'تم حفظ الإعدادات');
}

window.exportSettings = function () {
    downloadJSON(state.settings, 'settings.json');
};

window.importSettings = function () {
    showNotification('info', 'استيراد', 'ميزة قادمة');
};

window.resetSettings = function () {
    if (confirm('إعادة ضبط الإعدادات؟')) {
        localStorage.removeItem('ultraSettings');
        location.reload();
    }
};

// ===== Stats =====
function loadStats() {
    const saved = localStorage.getItem('ultraStats');
    if (saved) state.stats = { ...state.stats, ...JSON.parse(saved) };
}

function updateStats() {
    state.stats.totalDownloads++;
    state.stats.todayDownloads++;
    state.stats.weekDownloads++;

    const url = state.currentVideo?.url || '';
    let site = 'Other';
    if (url.includes('youtube')) site = 'YouTube';
    else if (url.includes('tiktok')) site = 'TikTok';
    else if (url.includes('facebook')) site = 'Facebook';
    else if (url.includes('twitter') || url.includes('x.com')) site = 'Twitter';
    else if (url.includes('instagram')) site = 'Instagram';

    state.stats.sites[site] = (state.stats.sites[site] || 0) + 1;

    // Week chart
    const day = new Date().getDay();
    state.stats.weekData[day]++;

    localStorage.setItem('ultraStats', JSON.stringify(state.stats));
    updateFooterStats();
}

function updateStatsDisplay() {
    const totalDownloads = $('totalDownloads');
    const totalSize = $('totalSize');
    const todayDownloads = $('todayDownloads');
    const weekDownloads = $('weekDownloads');
    const sitesChart = $('sitesChart');

    if (totalDownloads) totalDownloads.textContent = state.stats.totalDownloads;
    if (totalSize) totalSize.textContent = formatBytes(state.stats.totalSize);
    if (todayDownloads) todayDownloads.textContent = state.stats.todayDownloads;
    if (weekDownloads) weekDownloads.textContent = state.stats.weekDownloads;

    // Sites chart
    if (sitesChart) {
        const sites = Object.entries(state.stats.sites).sort((a, b) => b[1] - a[1]);
        sitesChart.innerHTML = sites.slice(0, 5).map(([site, count]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color)">
                <span>${site}</span>
                <strong>${count}</strong>
            </div>
        `).join('') || '<p style="text-align:center;color:var(--text-muted)">لا توجد بيانات</p>';
    }
}

function updateFooterStats() {
    const el = $('footerStats');
    if (el) {
        el.textContent = `${state.stats.totalDownloads} تحميل | ${formatBytes(state.stats.totalSize)}`;
    }
}

// ===== Storage =====
function loadHistory() {
    const saved = localStorage.getItem('ultraHistory');
    if (saved) state.history = JSON.parse(saved);
    updateHistoryDisplay();
}

function saveHistory() {
    localStorage.setItem('ultraHistory', JSON.stringify(state.history));
}

function loadScheduled() {
    const saved = localStorage.getItem('ultraScheduled');
    if (saved) state.scheduled = JSON.parse(saved);
    updateScheduledDisplay();
}

function saveScheduled() {
    localStorage.setItem('ultraScheduled', JSON.stringify(state.scheduled));
}

// ===== Modals =====
function openModal(id) { $(id)?.classList.remove('hidden'); }
window.closeModal = function (id) { $(id)?.classList.add('hidden'); };

// ===== Tab Switching =====
function switchTab(tabId) {
    // Update tab buttons
    $$('.tab-btn').forEach(b => {
        if (b.dataset.tab === tabId) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // Show/hide tab content
    $$('.tab-content').forEach(c => {
        if (c.id === tabId + 'Tab') {
            c.classList.remove('hidden');
            c.classList.add('active');
        } else {
            c.classList.add('hidden');
            c.classList.remove('active');
        }
    });
}

function switchOptionTab(option) {
    $$('.option-tab').forEach(t => t.classList.toggle('active', t.dataset.option === option));
    $$('.option-panel').forEach(p => {
        if (p.id === option + 'Options') {
            p.classList.add('active');
            p.classList.remove('hidden');
        } else {
            p.classList.remove('active');
            p.classList.add('hidden');
        }
    });

    const btnText = { video: 'تحميل الفيديو', audio: 'تحميل الصوت', gif: 'إنشاء GIF', frames: 'استخراج الصور' };
    const downloadBtn = $('downloadBtn');
    if (downloadBtn) {
        const btnTextEl = downloadBtn.querySelector('.btn-text');
        if (btnTextEl) {
            btnTextEl.textContent = btnText[option] || 'تحميل';
        }
    }
}

function switchSettingsTab(tab) {
    $$('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.settings === tab));
    $$('.settings-panel').forEach(p => p.classList.toggle('active', p.id === tab + 'Settings'));
}

window.toggleAdvanced = function (type) {
    const el = $('advanced' + type.charAt(0).toUpperCase() + type.slice(1));
    el?.classList.toggle('hidden');
};

// ===== Utilities =====
function show(id) { $(id)?.classList.remove('hidden'); }
function hide(id) { $(id)?.classList.add('hidden'); }
function hideAll(ids) { ids.forEach(id => hide(id)); }

function setFetchLoading(loading) {
    const btn = $('fetchBtn');
    if (!btn) return;

    // Handle both old structure (with .btn-text) and new structure (direct text)
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');

    if (btnText) {
        btnText.textContent = loading ? 'جاري الجلب...' : 'جلب المعلومات';
    } else {
        btn.textContent = loading ? 'جاري...' : 'تنزيل';
    }

    if (btnLoader) {
        btnLoader.classList.toggle('hidden', !loading);
    }

    btn.disabled = loading;
}

function showError(msg) {
    const el = $('errorMessage');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function showNotification(type, title, message) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `
        <span class="notification-icon">${icons[type]}</span>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;
    $('notifications').appendChild(n);
    setTimeout(() => { n.style.animation = 'slideIn 0.3s ease reverse'; setTimeout(() => n.remove(), 300); }, 3000);
}

function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

function formatDuration(s) {
    if (!s) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatDate(d) {
    if (!d) return '';
    if (typeof d === 'string' && d.length === 8) {
        return `${d.slice(6)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
    }
    return new Date(d).toLocaleDateString('ar-EG');
}

function formatBytes(b) {
    if (!b) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function estimateSize(duration, quality) {
    if (!duration) return '--';
    const mins = duration / 60;
    let rate = 10;
    if (quality?.includes('2160') || quality === 'best') rate = 50;
    else if (quality?.includes('1080')) rate = 15;
    else if (quality?.includes('720')) rate = 8;
    return formatBytes(mins * rate * 1024 * 1024);
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) {
            $('videoUrl').value = text;
            showNotification('success', 'لصق', 'تم لصق الرابط');
        }
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل الوصول للحافظة');
    }
}

async function autoPasteFromClipboard() {
    if (!state.settings.autoPaste) return;
    try {
        const text = await navigator.clipboard.readText();
        if (text?.includes('http') && !$('videoUrl').value) {
            $('videoUrl').value = text;
        }
    } catch (e) { }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    showNotification('success', 'نسخ', 'تم النسخ');
}

window.copyToClipboard = copyToClipboard;

function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function downloadThumbnail() {
    if (state.currentVideo?.thumbnail) {
        window.open(state.currentVideo.thumbnail, '_blank');
        showNotification('success', 'الصورة', 'جاري فتح الصورة');
    }
}

function resetUI() {
    $('videoUrl').value = '';
    $('filename').value = '';
    $('startTime').value = '';
    $('endTime').value = '';
    hideAll(['videoInfo', 'downloadOptions', 'progressSection', 'successSection', 'errorMessage']);
    $('downloadBtn').disabled = false;
    $('progressFill').style.width = '0%';
    state.currentVideo = null;
    $('videoUrl').focus();
}

function playSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YU');
    audio.volume = 0.3;
    audio.play().catch(() => { });
}

async function checkYtdlp() {
    try {
        const res = await fetch(`${API_BASE}/check`);
        const data = await res.json();
        if (!data.installed) {
            showNotification('warning', 'تحذير', 'yt-dlp غير مثبت');
        }
    } catch (e) { }
}

// ===== AI Chat Functions =====
async function sendAiMessage() {
    const input = $('aiInput');
    const message = input.value.trim();
    if (!message) return;

    // Add user message
    addAiMessage(message, 'user');
    input.value = '';

    // Show typing indicator
    const typingId = showAiTyping();

    try {
        const context = state.currentVideo ? `الفيديو الحالي: ${state.currentVideo.title}` : '';

        const response = await fetch(`${API_BASE}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, context })
        });

        const data = await response.json();
        removeAiTyping(typingId);

        if (data.success) {
            addAiMessage(data.reply, 'bot');
        } else {
            addAiMessage('عذراً، حدث خطأ. حاول مرة أخرى.', 'bot');
        }
    } catch (e) {
        removeAiTyping(typingId);
        addAiMessage('عذراً، لم أتمكن من الاتصال بالذكاء الاصطناعي.', 'bot');
    }
}

function addAiMessage(text, type) {
    const container = $('aiChatArea');
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    div.innerHTML = `
        <span class="ai-avatar">${type === 'bot' ? '🤖' : '👤'}</span>
        <div class="ai-bubble">${text.replace(/\n/g, '<br>')}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function showAiTyping() {
    const container = $('aiChatArea');
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'ai-message bot';
    div.id = id;
    div.innerHTML = `
        <span class="ai-avatar">🤖</span>
        <div class="ai-typing">
            <span></span><span></span><span></span>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeAiTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

window.aiQuickAction = async function (action) {
    if (!state.currentVideo) {
        showNotification('error', 'خطأ', 'جلب معلومات الفيديو أولاً');
        return;
    }

    const typingId = showAiTyping();

    try {
        let endpoint = '/ai/summarize';
        let body = { text: state.currentVideo.description || state.currentVideo.title, type: action };

        if (action === 'recommend') {
            endpoint = '/ai/recommend';
            body = { title: state.currentVideo.title, description: state.currentVideo.description };
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        removeAiTyping(typingId);

        const result = data.result || data.recommendation || data.translation || 'لا توجد نتيجة';
        addAiMessage(result, 'bot');
    } catch (e) {
        removeAiTyping(typingId);
        addAiMessage('حدث خطأ في معالجة الطلب.', 'bot');
    }
};

// ===== Trending Functions =====
async function loadTrending() {
    const region = $('trendingRegion').value;
    const container = $('trendingResults');

    container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>جاري التحميل...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/youtube/trending?regionCode=${region}`);
        const data = await response.json();

        if (data.success && data.videos.length > 0) {
            container.innerHTML = data.videos.map((video, index) => `
                <div class="trending-card" onclick="loadTrendingVideo('${video.url}')">
                    <div style="position: relative;">
                        <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                        <span class="trending-rank">${index + 1}</span>
                    </div>
                    <div class="trending-card-info">
                        <h4>${video.title}</h4>
                        <p>📺 ${video.channel} • 👁️ ${formatNumber(video.views)}</p>
                    </div>
                </div>
            `).join('');
        } else {
            const errorMsg = data.error || 'لم يتم العثور على فيديوهات';
            const details = data.details || '';
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">❌</span><p>${errorMsg}</p><small style="color:#666; display:block; margin-top:5px;">${details}</small></div>`;
        }
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>خطأ في الاتصال</p></div>';
    }
}

window.loadTrendingVideo = function (url) {
    $('videoUrl').value = url;
    switchTab('download');
    fetchVideoInfo();
};

// ===== Setup Additional Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    // AI Chat
    $('aiSendBtn')?.addEventListener('click', sendAiMessage);
    $('aiInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAiMessage();
    });

    // Trending
    $('loadTrendingBtn')?.addEventListener('click', loadTrending);

    // Stats Button
    $('statsBtn')?.addEventListener('click', openStatsModal);
});

// ===== Advanced Statistics =====
let weeklyChart = null;
let contentTypeChart = null;

function openStatsModal() {
    openModal('statsModal');
    updateStatsDisplay();
    renderCharts();
}

function getDownloadStats() {
    const stats = JSON.parse(localStorage.getItem('downloadStats') || '{}');
    return {
        totalDownloads: stats.totalDownloads || 0,
        totalSize: stats.totalSize || 0,
        weeklyData: stats.weeklyData || [0, 0, 0, 0, 0, 0, 0],
        contentTypes: stats.contentTypes || { video: 0, audio: 0 }
    };
}

function saveDownloadStats(stats) {
    localStorage.setItem('downloadStats', JSON.stringify(stats));
}

function trackDownload(isAudio = false, sizeMB = 0) {
    const stats = getDownloadStats();
    stats.totalDownloads++;
    stats.totalSize += sizeMB;

    // Track weekly (today is index 6)
    stats.weeklyData[6]++;

    // Track content type
    if (isAudio) {
        stats.contentTypes.audio++;
    } else {
        stats.contentTypes.video++;
    }

    saveDownloadStats(stats);
}

function updateStatsDisplay() {
    const stats = getDownloadStats();
    const today = new Date().toDateString();

    const totalDownloadsCount = $('totalDownloadsCount');
    const totalSizeCount = $('totalSizeCount');
    const todayDownloadsCount = $('todayDownloadsCount');
    const avgSpeedCount = $('avgSpeedCount');

    if (totalDownloadsCount) totalDownloadsCount.textContent = stats.totalDownloads;
    if (totalSizeCount) totalSizeCount.textContent = formatSize(stats.totalSize * 1024 * 1024);
    if (todayDownloadsCount) todayDownloadsCount.textContent = stats.weeklyData[6] || 0;
    if (avgSpeedCount) avgSpeedCount.textContent = '5.2 MB/s';
}

function renderCharts() {
    const stats = getDownloadStats();
    const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

    // Weekly Chart
    const weeklyCtx = document.getElementById('weeklyChart');
    if (weeklyCtx) {
        if (weeklyChart) weeklyChart.destroy();
        weeklyChart = new Chart(weeklyCtx, {
            type: 'bar',
            data: {
                labels: days,
                datasets: [{
                    label: 'التحميلات',
                    data: stats.weeklyData,
                    backgroundColor: 'rgba(99, 102, 241, 0.7)',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Content Type Chart
    const contentCtx = document.getElementById('contentTypeChart');
    if (contentCtx) {
        if (contentTypeChart) contentTypeChart.destroy();
        contentTypeChart = new Chart(contentCtx, {
            type: 'doughnut',
            data: {
                labels: ['فيديو 🎬', 'صوت 🎵'],
                datasets: [{
                    data: [stats.contentTypes.video || 1, stats.contentTypes.audio || 0],
                    backgroundColor: ['#6366f1', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

// ===== User Authentication System =====
const AUTH_KEY = 'videoDownloader_user';

function getUser() {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
}

function setUser(user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

function isLoggedIn() {
    return getUser() !== null;
}

function isGuest() {
    const user = getUser();
    return user && user.isGuest;
}

window.switchAuthTab = function (tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');

    if (tab === 'login') {
        $('loginForm').classList.remove('hidden');
        $('registerForm').classList.add('hidden');
    } else {
        $('loginForm').classList.add('hidden');
        $('registerForm').classList.remove('hidden');
    }
};

window.handleLogin = function (e) {
    e.preventDefault();
    const email = $('loginEmail').value;
    const password = $('loginPassword').value;

    // Simple localStorage auth (no backend for local app)
    const users = JSON.parse(localStorage.getItem('videoDownloader_users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
        setUser({ ...user, isGuest: false });
        showNotification('success', 'مرحباً!', `أهلاً بك ${user.name}`);
        updateAuthUI();
        closeModal('authModal');
    } else {
        showNotification('error', 'خطأ', 'البريد أو كلمة المرور غير صحيحة');
    }
};

window.handleRegister = function (e) {
    e.preventDefault();
    const name = $('registerName').value;
    const email = $('registerEmail').value;
    const password = $('registerPassword').value;

    const users = JSON.parse(localStorage.getItem('videoDownloader_users') || '[]');

    if (users.find(u => u.email === email)) {
        showNotification('error', 'خطأ', 'البريد مستخدم بالفعل');
        return;
    }

    const newUser = { name, email, password, downloads: 0, createdAt: new Date().toISOString() };
    users.push(newUser);
    localStorage.setItem('videoDownloader_users', JSON.stringify(users));

    setUser({ ...newUser, isGuest: false });
    showNotification('success', 'تم التسجيل!', 'مرحباً بك');
    updateAuthUI();
    closeModal('authModal');
};

window.continueAsGuest = function () {
    setUser({ name: 'ضيف', email: '', isGuest: true, downloads: 0 });
    showNotification('info', 'وضع الضيف', 'يمكنك التحميل بدون حفظ السجل');
    closeModal('authModal');
    updateAuthUI();
};

window.handleLogout = function () {
    localStorage.removeItem(AUTH_KEY);
    showNotification('info', 'تسجيل الخروج', 'تم تسجيل الخروج بنجاح');
    updateAuthUI();
    closeModal('authModal');
};

function updateAuthUI() {
    const user = getUser();
    const authForms = $('authForms');
    const userProfile = $('userProfile');

    if (user && !user.isGuest) {
        authForms?.classList.add('hidden');
        userProfile?.classList.remove('hidden');
        $('userName').textContent = user.name;
        $('userEmail').textContent = user.email;
        $('userDownloads').textContent = getDownloadStats().totalDownloads;
    } else {
        authForms?.classList.remove('hidden');
        userProfile?.classList.add('hidden');
    }
}

// Open auth modal when clicking settings
$('settingsBtn')?.addEventListener('click', () => openModal('authModal'));

// ===== Cloud Upload Functions =====
window.connectGoogleDrive = function () {
    showNotification('info', 'Google Drive', 'يتطلب إعداد API Key من Google Cloud Console');
    // Future: Implement OAuth2 flow for Google Drive
};

window.connectDropbox = function () {
    showNotification('info', 'Dropbox', 'يتطلب إعداد API Key من Dropbox Developer Portal');
    // Future: Implement OAuth2 flow for Dropbox
};

function getCloudSettings() {
    return {
        autoUpload: $('autoUpload')?.checked || false,
        deleteAfterUpload: $('deleteAfterUpload')?.checked || false,
        cloudFolder: $('cloudFolder')?.value || '/VideoDownloads'
    };
}

// ===== Extract Tab Functions =====
let extractVideoData = null;
let extractProgressInterval = null;

// Show extraction progress
function showExtractProgress(message) {
    const progressContainer = $('extractProgress');
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        const statusEl = progressContainer.querySelector('.progress-status') || progressContainer;
        if (statusEl) statusEl.textContent = message;
    }
    showNotification('info', 'استخراج', message);
}

// Hide extraction progress
function hideExtractProgress() {
    const progressContainer = $('extractProgress');
    if (progressContainer) {
        progressContainer.classList.add('hidden');
    }
    if (extractProgressInterval) {
        clearInterval(extractProgressInterval);
        extractProgressInterval = null;
    }
}

// Track extraction progress
async function trackExtractProgress(downloadId, itemName) {
    extractProgressInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/progress/${downloadId}`);
            const data = await res.json();

            if (data.status === 'downloading') {
                showExtractProgress(`جاري تحميل ${itemName}... ${Math.round(data.progress || 0)}%`);
            } else if (data.status === 'completed') {
                hideExtractProgress();
                showNotification('success', 'تم!', `تم استخراج ${itemName} بنجاح`);

                // Trigger download
                if (data.downloadUrl) {
                    const a = document.createElement('a');
                    a.href = data.downloadUrl;
                    a.download = '';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            } else if (data.status === 'error') {
                hideExtractProgress();
                showNotification('error', 'خطأ', data.error || 'فشل الاستخراج');
            }
        } catch (e) {
            console.error('Track progress error:', e);
        }
    }, 1000);
}


// Analyze video for extraction
window.analyzeForExtract = async function () {
    const url = $('extractUrl')?.value?.trim();
    if (!url) {
        showNotification('error', 'خطأ', 'الرجاء إدخال رابط الفيديو');
        return;
    }

    showNotification('info', 'تحليل', 'جاري تحليل الفيديو...');

    try {
        const response = await fetch(`${API_BASE}/info?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'فشل جلب المعلومات');
        }

        extractVideoData = { ...data, url };

        // Show preview
        $('extractThumb').src = data.thumbnail;
        $('extractTitle').textContent = data.title;
        $('extractChannel').textContent = `📺 ${data.channel || 'غير معروف'}`;
        $('extractDuration').textContent = `⏱️ ${data.duration_string || formatDuration(data.duration)}`;

        // Update thumbnail preview
        const thumbPreview = $('thumbnailPreview');
        if (thumbPreview) {
            thumbPreview.innerHTML = `<img src="${data.thumbnail}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }

        $('extractPreview')?.classList.remove('hidden');
        showNotification('success', 'تم', 'تم تحليل الفيديو بنجاح');

    } catch (error) {
        showNotification('error', 'خطأ', error.message);
    }
};

// Extract Audio from video
window.extractAudio = async function () {
    const url = $('extractUrl')?.value?.trim() || extractVideoData?.url;
    if (!url) {
        showNotification('error', 'خطأ', 'حدد الفيديو أولاً');
        return;
    }

    const format = $('extractAudioFormat')?.value || 'mp3';
    showExtractProgress('جاري استخراج الصوت...');

    try {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                quality: 'bestaudio',
                format: format,
                audioOnly: true
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'فشل في استخراج الصوت');

        // Track progress
        trackExtractProgress(data.downloadId, 'الصوت');

    } catch (error) {
        hideExtractProgress();
        showNotification('error', 'خطأ', error.message);
    }
};

// Trim Video
window.trimVideo = async function () {
    const url = $('extractUrl')?.value?.trim() || extractVideoData?.url;
    if (!url) {
        showNotification('error', 'خطأ', 'حدد الفيديو أولاً');
        return;
    }

    const startTime = $('trimStart')?.value || '00:00';
    const endTime = $('trimEnd')?.value || '';

    if (!endTime) {
        showNotification('error', 'خطأ', 'حدد وقت النهاية');
        return;
    }

    showExtractProgress('جاري قص الفيديو...');

    try {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                quality: 'best',
                format: 'mp4',
                startTime,
                endTime
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'فشل في قص الفيديو');

        trackExtractProgress(data.downloadId, 'الفيديو المقصوص');

    } catch (error) {
        hideExtractProgress();
        showNotification('error', 'خطأ', error.message);
    }
};

// Download High Quality Thumbnail
window.downloadThumbnailHQ = function () {
    const thumbnail = extractVideoData?.thumbnail || $('extractThumb')?.src;
    if (!thumbnail) {
        showNotification('error', 'خطأ', 'ليس هناك صورة للتحميل');
        return;
    }

    // Open maximum resolution thumbnail
    let hqThumb = thumbnail;
    if (thumbnail.includes('youtube') || thumbnail.includes('ytimg')) {
        // Try to get max resolution
        const videoId = thumbnail.match(/vi[\/]([^\/]+)/)?.[1] || extractVideoData?.url?.match(/(?:v=|youtu\.be\/)([^&]+)/)?.[1];
        if (videoId) {
            hqThumb = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
    }

    window.open(hqThumb, '_blank');
    showNotification('success', 'الصورة', 'جاري فتح الصورة بأعلى جودة');
};

// Extract Subtitles
window.extractSubtitles = async function () {
    const url = $('extractUrl')?.value?.trim() || extractVideoData?.url;
    if (!url) {
        showNotification('error', 'خطأ', 'حدد الفيديو أولاً');
        return;
    }

    const lang = $('subtitleLang')?.value || 'ar';
    showExtractProgress('جاري جلب الترجمات...');

    try {
        const response = await fetch(`${API_BASE}/extract/subtitles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, lang })
        });

        const data = await response.json();
        hideExtractProgress();

        if (data.success && data.subtitles) {
            showExtractResults('الترجمات', data.subtitles);
        } else if (data.error) {
            showNotification('warning', 'تنبيه', data.error || 'لا توجد ترجمات متاحة');
        }

    } catch (error) {
        hideExtractProgress();
        // Fallback - show notification that subtitles may not be available
        showNotification('info', 'الترجمات', 'سيتم تحميل الترجمات مع الفيديو إن وجدت');

        // Try downloading with subtitles
        try {
            const response = await fetch(`${API_BASE}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    quality: 'best',
                    downloadSubtitles: true,
                    subsLang: lang
                })
            });
            const data = await response.json();
            if (response.ok) {
                trackExtractProgress(data.downloadId, 'الفيديو مع الترجمات');
            }
        } catch (e) {
            showNotification('error', 'خطأ', 'فشل في جلب الترجمات');
        }
    }
};

// Extract Comments using YouTube API
window.extractComments = async function () {
    const url = $('extractUrl')?.value?.trim() || extractVideoData?.url;
    if (!url) {
        showNotification('error', 'خطأ', 'حدد الفيديو أولاً');
        return;
    }

    // Extract video ID
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\?]+)/)?.[1];
    if (!videoId) {
        showNotification('error', 'خطأ', 'رابط يوتيوب غير صالح');
        return;
    }

    const maxResults = $('commentsCount')?.value || 50;
    showExtractProgress('جاري جلب التعليقات...');

    try {
        const response = await fetch(`${API_BASE}/youtube/comments?videoId=${videoId}&maxResults=${maxResults}`);
        const data = await response.json();
        hideExtractProgress();

        if (data.success && data.comments?.length > 0) {
            const formatted = data.comments.map((c, i) =>
                `${i + 1}. ${c.author}\n   👍 ${c.likes} إعجاب\n   ${c.text}\n`
            ).join('\n');

            showExtractResults(`التعليقات (${data.comments.length})`, formatted);
            showNotification('success', 'التعليقات', `تم جلب ${data.comments.length} تعليق`);
        } else {
            showNotification('warning', 'تنبيه', 'لا توجد تعليقات أو التعليقات معطلة');
        }

    } catch (error) {
        hideExtractProgress();
        showNotification('error', 'خطأ', 'فشل في جلب التعليقات');
    }
};

// Show Metadata
window.showMetadata = function () {
    if (!extractVideoData) {
        showNotification('error', 'خطأ', 'حلل الفيديو أولاً');
        return;
    }

    const metadata = {
        title: extractVideoData.title,
        channel: extractVideoData.channel,
        duration: extractVideoData.duration_string || formatDuration(extractVideoData.duration),
        views: formatNumber(extractVideoData.view_count),
        likes: formatNumber(extractVideoData.like_count),
        uploadDate: extractVideoData.upload_date,
        description: extractVideoData.description?.substring(0, 500) + '...',
        url: extractVideoData.url
    };

    showExtractResults('البيانات الوصفية', JSON.stringify(metadata, null, 2));
};

// Download Metadata as JSON
window.downloadMetadata = function () {
    if (!extractVideoData) {
        showNotification('error', 'خطأ', 'حلل الفيديو أولاً');
        return;
    }

    const filename = `${extractVideoData.title?.substring(0, 30) || 'metadata'}.json`;
    downloadJSON(extractVideoData, filename);
    showNotification('success', 'تصدير', 'تم تصدير البيانات');
};

// Extract results display helpers
function showExtractResults(title, content) {
    $('extractResultTitle').textContent = title;
    $('extractResultContent').textContent = content;
    $('extractResults').classList.remove('hidden');
    state.extractedData = content;
}

window.copyExtractResults = function () {
    if (state.extractedData) {
        navigator.clipboard.writeText(state.extractedData);
        showNotification('success', 'نسخ', 'تم نسخ المحتوى');
    }
};

window.downloadExtractResults = function () {
    if (state.extractedData) {
        downloadText(state.extractedData, 'extract_results.txt');
    }
};

window.closeExtractResults = function () {
    $('extractResults').classList.add('hidden');
};

// Progress helpers
function showExtractProgress(text) {
    $('extractProgressText').textContent = text;
    $('extractProgressPercent').textContent = '0%';
    $('extractProgressBar').style.width = '0%';
    $('extractProgress').classList.remove('hidden');
}

function hideExtractProgress() {
    $('extractProgress').classList.add('hidden');
}

function trackExtractProgress(downloadId, type) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/progress/${downloadId}`);
            const data = await res.json();

            const percent = Math.round(data.progress || 0);
            $('extractProgressPercent').textContent = `${percent}%`;
            $('extractProgressBar').style.width = `${percent}%`;

            if (data.status === 'completed') {
                clearInterval(interval);
                hideExtractProgress();
                showNotification('success', 'اكتمل', `تم استخراج ${type} بنجاح!`);
                triggerConfetti();
            } else if (data.status === 'error') {
                clearInterval(interval);
                hideExtractProgress();
                showNotification('error', 'خطأ', data.error || 'فشل الاستخراج');
            }
        } catch (e) {
            clearInterval(interval);
            hideExtractProgress();
        }
    }, 1000);
}

// ===== Enhanced Trending Functions =====
window.loadTrending = async function () {
    const region = $('trendingRegion')?.value || 'SA';
    const container = $('trendingResults');

    container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <span style="font-size: 2rem;">⏳</span>
            <p>جاري تحميل الفيديوهات الرائجة...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/youtube/trending?regionCode=${region}&maxResults=20`);
        const data = await response.json();

        if (data.success && data.videos?.length > 0) {
            container.innerHTML = data.videos.map((video, index) => `
                <div class="trending-card cloud-card" style="cursor: pointer;" onclick="selectTrendingVideo('${video.url}')">
                    <div style="position: relative; margin: -24px -24px 16px; overflow: hidden; border-radius: 16px 16px 0 0;">
                        <img src="${video.thumbnail}" alt="${video.title}" style="width: 100%; height: 140px; object-fit: cover;">
                        <span style="position: absolute; top: 10px; right: 10px; background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600;">
                            #${index + 1}
                        </span>
                    </div>
                    <h4 style="font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${video.title}
                    </h4>
                    <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: 0.85rem;">
                        <span>📺 ${video.channel}</span>
                        <span>👁️ ${formatNumber(video.views)}</span>
                    </div>
                    <div style="margin-top: 12px; display: flex; gap: 8px;">
                        <button class="btn btn-primary" style="flex: 1; padding: 8px;" onclick="event.stopPropagation(); quickDownloadTrending('${video.url}')">
                            ⬇️ تحميل
                        </button>
                        <button class="btn btn-secondary" style="padding: 8px 12px;" onclick="event.stopPropagation(); addTrendingToQueue('${video.url}', '${video.title.replace(/'/g, "")}', '${video.thumbnail}')">
                            ➕
                        </button>
                    </div>
                </div>
            `).join('');

            showNotification('success', 'الرائج', `تم تحميل ${data.videos.length} فيديو رائج`);
        } else {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <span style="font-size: 2rem;">😕</span>
                    <p>لم يتم العثور على فيديوهات رائجة</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Trending error:', error);
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <span style="font-size: 2rem;">❌</span>
                <p>خطأ في جلب الفيديوهات</p>
                <small style="color: var(--text-muted);">${error.message}</small>
            </div>
        `;
    }
};

window.selectTrendingVideo = function (url) {
    $('videoUrl').value = url;
    switchTab('download');
    fetchVideoInfo();
};

window.quickDownloadTrending = function (url) {
    $('videoUrl').value = url;
    switchTab('download');
    fetchVideoInfo();
    showNotification('info', 'تحميل', 'جاري جلب معلومات الفيديو...');
};

window.addTrendingToQueue = function (url, title, thumbnail) {
    state.queue.push({
        id: Date.now(),
        url,
        title: title || 'فيديو رائج',
        thumbnail,
        quality: 'best',
        format: 'mp4',
        audioOnly: false,
        turbo: true,
        status: 'pending',
        progress: 0
    });
    updateQueueDisplay();
    showNotification('success', 'الطابور', 'تمت إضافة الفيديو للطابور');
};

// ===== Queue View Toggle =====
// [Legacy switchQueueView removed - using new DownloadsManager implementation]

// ===== Additional Event Listeners for New Features =====
document.addEventListener('DOMContentLoaded', () => {
    // Extract Tab - Analyze button
    $('analyzeVideoBtn')?.addEventListener('click', analyzeForExtract);
    $('extractUrl')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') analyzeForExtract();
    });

    // Search Tab
    $('searchBtn')?.addEventListener('click', searchYouTube);
    $('searchQuery')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchYouTube();
    });

    // Trending Tab - Auto load on tab switch (optional)
    // Uncomment below to auto-load trending when tab is opened
    // document.querySelector('[data-tab="trending"]')?.addEventListener('click', loadTrending);
});

// ===== Notifications Container Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    // Ensure notifications container exists
    if (!$('notifications')) {
        const container = document.createElement('div');
        container.id = 'notifications';
        container.style.cssText = 'position: fixed; top: 20px; left: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }
});

// ===== YOUTUBE SEARCH =====
async function searchYouTube() {
    const query = $('searchQuery')?.value?.trim();
    if (!query) {
        showNotification('warning', 'تنبيه', 'الرجاء إدخال كلمة البحث');
        return;
    }

    const container = $('searchResults');
    if (!container) return;

    // Show loading
    container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="loading-spinner" style="margin: 0 auto 16px;"></div>
            <p>جاري البحث عن "${query}"...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/youtube/search?q=${encodeURIComponent(query)}&maxResults=20`);
        const data = await response.json();

        // Handle error response from server
        if (!data.success) {
            console.error('Server returned error:', data.error);
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <span style="font-size: 3rem;">⚠️</span>
                    <p>${data.error || 'حدث خطأ في الخادم'}</p>
                    <small style="color:red; direction:ltr; display:block; margin-top:5px;">${data.details || ''}</small>
                </div>
            `;
            return;
        }

        if (!data.videos?.length) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <span style="font-size: 3rem;">😕</span>
                    <p>لم يتم العثور على نتائج</p>
                    <small>جرب كلمات بحث مختلفة</small>
                    <small style="color:#666; font-size:0.8rem; margin-top:5px;">المصدر: ${data.source}</small>
                </div>
            `;
            return;
        }

        container.innerHTML = data.videos.map(video => `
            <div class="search-result-card">
                <img src="${video.thumbnail}" alt="" class="search-result-thumb">
                <div class="search-result-info">
                    <div class="search-result-title">${video.title}</div>
                    <div class="search-result-channel">${video.channel}</div>
                    <div class="search-result-meta">
                        <span>👁️ ${formatViewCount(video.views)}</span>
                        <span>📅 ${video.publishedAt ? new Date(video.publishedAt).toLocaleDateString('ar-SA') : ''}</span>
                    </div>
                    <div class="search-result-actions">
                        <button class="btn btn-primary" onclick="quickDownloadSearch('${video.url}')">
                            ⬇️ تحميل
                        </button>
                        <button class="btn btn-secondary" onclick="addSearchToQueue('${video.url}', '${video.title.replace(/'/g, "")}', '${video.thumbnail}')">
                            ➕ طابور
                        </button>
                        <button class="btn" style="background: #9c27b0; color: white;" onclick="showPlaylistSelector('${video.url}', '${video.title.replace(/'/g, "")}', '${video.thumbnail}')">
                            📂 قائمة
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        showNotification('success', 'البحث', `تم العثور على ${data.videos.length} فيديو`);

    } catch (error) {
        console.error('Search error:', error);
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <span style="font-size: 3rem;">❌</span>
                <p>حدث خطأ في البحث</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

// Quick download from search
window.quickDownloadSearch = async function (url) {
    showNotification('info', 'جاري البدء', 'بدء تحميل الفيديو...');

    try {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                quality: 'best',
                format: 'mp4',
                turboMode: true
            })
        });

        const data = await response.json();
        if (data.success || data.downloadId) {
            showNotification('success', 'تم البدء', 'جاري تحميل الفيديو');
            // Monitor progress
            monitorDownload(data.downloadId);
        } else {
            showNotification('error', 'خطأ', data.error || 'فشل بدء التحميل');
        }
    } catch (error) {
        showNotification('error', 'خطأ', error.message);
    }
};

// Add to queue from search
window.addSearchToQueue = function (url, title, thumbnail) {
    const item = {
        id: Date.now(),
        url,
        title: title || 'فيديو',
        thumbnail: thumbnail || '',
        status: 'pending',
        progress: 0,
        quality: 'best',
        format: 'mp4',
        turboMode: true
    };

    state.queue.push(item);
    updateQueueDisplay();
    showNotification('success', 'تمت الإضافة', 'تمت إضافة الفيديو للطابور');
};

// Format view count
function formatViewCount(views) {
    if (!views) return '0';
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

// ===== QUEUE MANAGEMENT =====

// Add to queue from main page
function addToQueue() {
    if (!state.currentVideo) {
        showNotification('warning', 'تنبيه', 'الرجاء جلب معلومات الفيديو أولاً');
        return;
    }

    const quality = $('videoQuality')?.value || 'best';
    const format = $('videoFormat')?.value || 'mp4';

    const item = {
        id: Date.now(),
        url: state.currentVideo.url,
        title: state.currentVideo.title,
        thumbnail: state.currentVideo.thumbnail,
        status: 'pending',
        progress: 0,
        quality,
        format,
        turboMode: document.querySelector('input[name="downloadMode"]:checked')?.value === 'turbo'
    };

    state.queue.push(item);
    updateQueueDisplay();
    showNotification('success', 'تمت الإضافة', 'تمت إضافة الفيديو لقائمة الانتظار');
}

// Update queue display with per-video settings
function updateQueueDisplay() {
    const container = $('queueListMain');
    if (!container) return;

    if (state.queue.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span style="font-size: 3rem;">📭</span>
                <p>الطابور فارغ حالياً</p>
                <small>أضف فيديوهات من البحث أو الصفحة الرئيسية</small>
            </div>
        `;
        return;
    }

    container.innerHTML = state.queue.map(item => `
        <div class="queue-item-card" data-id="${item.id}">
            <div class="queue-item-header">
                <img src="${item.thumbnail || '/placeholder.jpg'}" alt="" class="queue-item-thumb">
                <div class="queue-item-info">
                    <div class="queue-item-title">${item.title || 'فيديو'}</div>
                    <div class="queue-item-channel">${getQueueStatusText(item)}</div>
                </div>
            </div>
            
            <div class="queue-item-settings">
                <div class="queue-item-setting">
                    <label>الجودة:</label>
                    <select onchange="updateQueueItemSetting(${item.id}, 'quality', this.value)" ${item.status !== 'pending' ? 'disabled' : ''}>
                        <option value="best" ${item.quality === 'best' ? 'selected' : ''}>أفضل جودة</option>
                        <option value="1080" ${item.quality === '1080' ? 'selected' : ''}>1080p</option>
                        <option value="720" ${item.quality === '720' ? 'selected' : ''}>720p</option>
                        <option value="480" ${item.quality === '480' ? 'selected' : ''}>480p</option>
                        <option value="360" ${item.quality === '360' ? 'selected' : ''}>360p</option>
                    </select>
                </div>
                <div class="queue-item-setting">
                    <label>الصيغة:</label>
                    <select onchange="updateQueueItemSetting(${item.id}, 'format', this.value)" ${item.status !== 'pending' ? 'disabled' : ''}>
                        <option value="mp4" ${item.format === 'mp4' ? 'selected' : ''}>MP4</option>
                        <option value="webm" ${item.format === 'webm' ? 'selected' : ''}>WEBM</option>
                        <option value="mkv" ${item.format === 'mkv' ? 'selected' : ''}>MKV</option>
                        <option value="mp3" ${item.format === 'mp3' ? 'selected' : ''}>MP3 (صوت)</option>
                    </select>
                </div>
            </div>

            ${item.status === 'downloading' ? `
                <div class="queue-item-progress">
                    <div class="queue-item-status">
                        <span class="status-text">⬇️ جاري التحميل</span>
                        <span class="status-percent">${Math.round(item.progress)}%</span>
                    </div>
                    <div class="progress-bar-line">
                        <div class="progress-fill-blue" style="width: ${item.progress}%"></div>
                    </div>
                </div>
            ` : ''}

            <div class="queue-item-actions">
                ${item.status === 'pending' ? `
                    <button class="btn btn-primary" onclick="startSingleDownload(${item.id})">▶️ بدء التحميل</button>
                ` : ''}
                ${item.status === 'completed' ? `
                    <button class="btn btn-secondary" onclick="openDownloadedFile(${item.id})">📂 فتح الملف</button>
                ` : ''}
                <button class="btn btn-outline danger" onclick="removeFromQueue(${item.id})">🗑️ حذف</button>
            </div>
        </div>
    `).join('');
}

// Update queue item setting
window.updateQueueItemSetting = function (id, setting, value) {
    const item = state.queue.find(i => i.id === id);
    if (item) {
        item[setting] = value;
    }
};

// Start single download
window.startSingleDownload = async function (id) {
    const item = state.queue.find(i => i.id === id);
    if (!item) return;

    item.status = 'downloading';
    updateQueueDisplay();

    try {
        const response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: item.url,
                quality: item.quality,
                format: item.format,
                turboMode: item.turboMode
            })
        });

        const data = await response.json();
        if (data.downloadId) {
            item.downloadId = data.downloadId;
            monitorQueueItem(item);
        } else {
            item.status = 'error';
            updateQueueDisplay();
            showNotification('error', 'خطأ', data.error || 'فشل بدء التحميل');
        }
    } catch (error) {
        item.status = 'error';
        updateQueueDisplay();
        showNotification('error', 'خطأ', error.message);
    }
};

// Monitor queue item progress
function monitorQueueItem(item) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/progress/${item.downloadId}`);
            const data = await response.json();

            item.progress = data.progress || 0;

            if (data.status === 'complete' || data.progress >= 100) {
                item.status = 'completed';
                item.progress = 100;
                clearInterval(interval);
                updateQueueDisplay();
                showNotification('success', 'اكتمل التحميل', item.title);
                triggerConfetti();
            } else if (data.status === 'error') {
                item.status = 'error';
                clearInterval(interval);
                updateQueueDisplay();
            } else {
                updateQueueDisplay();
            }
        } catch (error) {
            // Silent error
        }
    }, 1000);
}

// ===== BULK URL FUNCTIONS =====

// Parse URLs from textarea
function parseBulkUrls() {
    const input = $('bulkUrlsInput')?.value || '';
    const urls = input.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && (line.includes('http://') || line.includes('https://')));
    return urls;
}

// Add multiple URLs to queue
window.addBulkUrls = async function () {
    const urls = parseBulkUrls();

    if (urls.length === 0) {
        showNotification('warning', 'تنبيه', 'لا توجد روابط صالحة');
        return;
    }

    $('bulkStatus').textContent = `جاري تحليل ${urls.length} رابط...`;

    let added = 0;
    for (const url of urls) {
        try {
            // Fetch video info
            const response = await fetch(`${API_BASE}/info?url=${encodeURIComponent(url)}`);
            const data = await response.json();

            if (data.title) {
                // Add to queue
                state.queue.push({
                    id: Date.now() + Math.random(),
                    url: url,
                    title: data.title || 'فيديو ' + (added + 1),
                    thumbnail: data.thumbnail || '',
                    channel: data.channel || '',
                    duration: data.duration_string || '',
                    quality: 'best',
                    format: 'mp4',
                    status: 'pending',
                    progress: 0
                });
                added++;
            }
        } catch (e) {
            console.error('Failed to add URL:', url, e);
        }
    }

    saveQueue();
    updateQueueDisplay();
    $('bulkStatus').textContent = `✅ تمت إضافة ${added} من ${urls.length} فيديو للطابور`;
    showNotification('success', 'تمت الإضافة', `${added} فيديو في الطابور`);
};

// Download all URLs directly (without adding to queue)
window.downloadAllBulk = async function () {
    const urls = parseBulkUrls();

    if (urls.length === 0) {
        showNotification('warning', 'تنبيه', 'لا توجد روابط صالحة');
        return;
    }

    const mode = document.querySelector('input[name="downloadMode"]:checked')?.value || 'turbo';
    $('bulkStatus').textContent = `🚀 بدء تحميل ${urls.length} فيديو...`;

    show('queueProgress');
    let completed = 0;
    const total = urls.length;

    if (mode === 'turbo') {
        // Download all at once
        const promises = urls.map(async (url) => {
            try {
                const response = await fetch(`${API_BASE}/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, quality: 'best', turboMode: true })
                });
                const data = await response.json();
                if (data.success || data.downloadId) {
                    completed++;
                    updateQueueProgress(completed, total);
                }
                return data;
            } catch (e) {
                console.error('Download failed:', url);
                return null;
            }
        });

        await Promise.all(promises);
    } else {
        // Sequential download
        for (const url of urls) {
            $('queueProgressText').textContent = `جاري تحميل ${completed + 1} من ${total}...`;

            try {
                const response = await fetch(`${API_BASE}/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, quality: 'best' })
                });
                const data = await response.json();

                if (data.downloadId) {
                    // Wait for this download to complete
                    await waitForBulkDownload(data.downloadId);
                    completed++;
                    updateQueueProgress(completed, total);
                }
            } catch (e) {
                console.error('Download failed:', url);
            }
        }
    }

    hide('queueProgress');
    $('bulkStatus').textContent = `✅ اكتمل تحميل ${completed} من ${total} فيديو`;
    triggerConfetti();
    showNotification('success', 'اكتمل!', `تم تحميل ${completed} فيديو`);
};

// Wait for a single bulk download
function waitForBulkDownload(downloadId) {
    return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/progress/${downloadId}`);
                const data = await res.json();

                if (data.status === 'completed' || data.progress >= 100) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (data.status === 'error') {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (e) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, 300000);
    });
}

// Clear bulk input
window.clearBulkInput = function () {
    $('bulkUrlsInput').value = '';
    $('bulkStatus').textContent = '';
};

// Update queue progress bar
function updateQueueProgress(current, total) {
    const percent = Math.round((current / total) * 100);
    $('queueProgressFill').style.width = `${percent}%`;
    $('queueProgressPercent').textContent = `${current}/${total}`;
}

// Start queue (batch download)
function startQueue() {
    const pendingItems = state.queue.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) {
        showNotification('warning', 'تنبيه', 'لا توجد فيديوهات في الانتظار');
        return;
    }

    const mode = document.querySelector('input[name="downloadMode"]:checked')?.value || 'turbo';

    show('queueProgress');
    state.isQueueRunning = true;

    if (mode === 'turbo') {
        // Turbo mode: download all at once
        turboDownloadQueue(pendingItems);
    } else {
        // Sequential mode: one by one
        sequentialDownloadQueue(pendingItems);
    }
}

// Turbo download (all at once)
async function turboDownloadQueue(items) {
    showNotification('info', 'وضع التحميل السريع', `بدء تحميل ${items.length} فيديو معاً`);

    let completed = 0;
    const total = items.length;

    const promises = items.map(async (item) => {
        item.status = 'downloading';
        updateQueueDisplay();

        try {
            const response = await fetch(`${API_BASE}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: item.url,
                    quality: item.quality,
                    format: item.format,
                    turboMode: true
                })
            });

            const data = await response.json();
            if (data.downloadId) {
                item.downloadId = data.downloadId;
                await waitForDownload(item);
                completed++;
                updateQueueProgress(completed, total);
            }
        } catch (error) {
            item.status = 'error';
        }
    });

    await Promise.all(promises);

    state.isQueueRunning = false;
    hide('queueProgress');
    triggerConfetti();
    showNotification('success', 'اكتمل', `تم تحميل ${completed} من ${total} فيديو`);
}

// Wait for single download to complete
function waitForDownload(item) {
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE}/progress/${item.downloadId}`);
                const data = await response.json();

                item.progress = data.progress || 0;
                updateQueueDisplay();

                if (data.status === 'complete' || data.progress >= 100) {
                    item.status = 'completed';
                    item.progress = 100;
                    clearInterval(interval);
                    resolve();
                } else if (data.status === 'error') {
                    item.status = 'error';
                    clearInterval(interval);
                    resolve();
                }
            } catch (error) {
                clearInterval(interval);
                resolve();
            }
        }, 1000);
    });
}

// Sequential download (one by one)
async function sequentialDownloadQueue(items) {
    showNotification('info', 'وضع التحميل المتتابع', `بدء تحميل ${items.length} فيديو بالترتيب`);

    let completed = 0;
    const total = items.length;

    for (const item of items) {
        if (!state.isQueueRunning) break;

        item.status = 'downloading';
        updateQueueDisplay();
        updateQueueProgress(completed, total);

        try {
            const response = await fetch(`${API_BASE}/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: item.url,
                    quality: item.quality,
                    format: item.format,
                    turboMode: false
                })
            });

            const data = await response.json();
            if (data.downloadId) {
                item.downloadId = data.downloadId;
                await waitForDownload(item);
                completed++;
            } else {
                item.status = 'error';
            }
        } catch (error) {
            item.status = 'error';
        }
    }

    state.isQueueRunning = false;
    hide('queueProgress');
    triggerConfetti();
    showNotification('success', 'اكتمل', `تم تحميل ${completed} من ${total} فيديو`);
}

// Update queue progress bar
function updateQueueProgress(completed, total) {
    const percent = total > 0 ? (completed / total * 100) : 0;
    const progressFill = $('queueProgressFill');
    const progressText = $('queueProgressText');
    const progressPercent = $('queueProgressPercent');

    if (progressFill) progressFill.style.width = percent + '%';
    if (progressText) progressText.textContent = 'جاري التحميل...';
    if (progressPercent) progressPercent.textContent = `${completed}/${total}`;
}

// Pause queue
function pauseQueue() {
    state.isQueueRunning = false;
    showNotification('info', 'إيقاف مؤقت', 'تم إيقاف الطابور مؤقتاً');
}

// Clear queue
function clearQueue() {
    if (state.queue.length === 0) return;

    if (confirm('هل تريد حذف كل العناصر من الطابور؟')) {
        state.queue = [];
        updateQueueDisplay();
        hide('queueProgress');
        showNotification('success', 'تم المسح', 'تم مسح قائمة الانتظار');
    }
}

// Remove single item from queue
window.removeFromQueue = function (id) {
    state.queue = state.queue.filter(i => i.id !== id);
    updateQueueDisplay();
};

// Get queue status text
function getQueueStatusText(item) {
    switch (item.status) {
        case 'pending': return '⏳ في الانتظار';
        case 'downloading': return `⬇️ جاري التحميل ${Math.round(item.progress)}%`;
        case 'completed': return '✅ مكتمل';
        case 'error': return '❌ خطأ';
        default: return '';
    }
}

// Monitor download from search
function monitorDownload(downloadId) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/progress/${downloadId}`);
            const data = await response.json();

            if (data.status === 'complete' || data.progress >= 100) {
                clearInterval(interval);
                showNotification('success', 'تم التحميل', 'اكتمل تحميل الفيديو بنجاح');
                triggerConfetti();
            } else if (data.status === 'error') {
                clearInterval(interval);
                showNotification('error', 'خطأ', 'فشل تحميل الفيديو');
            }
        } catch (error) {
            // Silent
        }
    }, 2000);
}

// ===== AI & Cloud Assistant Logic NEW =====

// --- AI Key Management ---
function checkAiKey() {
    const key = localStorage.getItem('gemini_api_key');
    if (key) {
        hide('aiSetupScreen');
        show('aiChatInterface');
        return true;
    } else {
        show('aiSetupScreen');
        hide('aiChatInterface');
        return false;
    }
}

function saveAiKey() {
    const key = $('geminiApiKeyInput').value.trim();
    if (!key) {
        showNotification('error', 'خطأ', 'الرجاء إدخال مفتاح API');
        return;
    }
    // Simple validation (starts with AI)
    if (!key.startsWith('AI')) {
        showNotification('warning', 'تنبيه', 'قد يكون المفتاح غير صحيح، تأكد منه');
    }

    localStorage.setItem('gemini_api_key', key);
    showNotification('success', 'تم الحفظ', 'تم تفعيل مساعد الذكاء الاصطناعي');
    checkAiKey();
}

function logoutAi() {
    if (confirm('هل أنت متأكد من حذف مفتاح API؟')) {
        localStorage.removeItem('gemini_api_key');
        checkAiKey();
    }
}

// --- Google Drive Logic ---
let driveState = {
    clientId: localStorage.getItem('gdrive_client_id') || '',
    connected: localStorage.getItem('gdrive_connected') === 'true'
};

function checkDriveStatus() {
    if (driveState.connected) {
        hide('driveSetupScreen');
        show('driveConnectedScreen');
    } else {
        show('driveSetupScreen');
        hide('driveConnectedScreen');
        if (driveState.clientId) {
            $('gDriveClientId').value = driveState.clientId;
        }
    }
}

function generateDriveAuthLink() {
    const clientId = $('gDriveClientId').value.trim();
    const clientSecret = $('gDriveClientSecret').value.trim();

    if (!clientId || !clientSecret) {
        showNotification('error', 'نقص بيانات', 'يرجى إدخال Client ID و Secret');
        return;
    }

    localStorage.setItem('gdrive_client_id', clientId);
    localStorage.setItem('gdrive_client_secret', clientSecret);

    const scope = 'https://www.googleapis.com/auth/drive.file';
    const redirectUri = 'urn:ietf:wg:oauth:2.0:oob'; // Use manual copy paste flow

    // Construct Auth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

    window.open(authUrl, '_blank');

    show('driveAuthCodeSection');
    showNotification('info', 'الخطوة التالية', 'وافق على الصلاحيات وانسخ الكود');
}

async function completeDriveSetup() {
    const code = $('gDriveAuthCode').value.trim();
    if (!code) {
        showNotification('error', 'خطأ', 'أدخل رمز المصادقة');
        return;
    }

    setFetchLoading(true);
    showNotification('info', 'جاري الربط...', 'يرجى الانتظار');

    try {
        const response = await fetch(`${API_BASE}/cloud/google/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                clientId: localStorage.getItem('gdrive_client_id'),
                clientSecret: localStorage.getItem('gdrive_client_secret')
            })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('gdrive_connected', 'true');
            driveState.connected = true;
            checkDriveStatus();
            showNotification('success', 'نجاح', 'تم ربط Google Drive بنجاح!');
        } else {
            throw new Error(data.error || 'فشل الربط');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        setFetchLoading(false);
    }
}

function disconnectDrive() {
    if (confirm('فصل حساب Google Drive؟')) {
        localStorage.removeItem('gdrive_connected');
        driveState.connected = false;
        checkDriveStatus();
    }
}

// Init AI and Cloud on load
document.addEventListener('DOMContentLoaded', () => {
    // Other init functions are called in initApp, add these there or call simply here
    // But since this is appended, this listener will run
    checkAiKey();
    checkDriveStatus();

    // Playlist button
    const fetchPlaylistBtn = $('fetchPlaylistBtn');
    if (fetchPlaylistBtn) {
        fetchPlaylistBtn.addEventListener('click', fetchPlaylist);
    }

    // Theme toggle button
    const themeToggle = $('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
});

// ===== PLAYLIST FUNCTIONS =====
let playlistData = null;

async function fetchPlaylist() {
    const url = $('playlistUrl')?.value?.trim();
    if (!url) {
        showNotification('error', 'خطأ', 'الرجاء إدخال رابط القائمة');
        return;
    }

    const btn = $('fetchPlaylistBtn');
    btn.disabled = true;
    btn.textContent = 'جاري الجلب...';

    try {
        const response = await fetch(`${API_BASE}/playlist/info?url=${encodeURIComponent(url)}`);
        const data = await response.json();

        if (data.success) {
            playlistData = data;
            renderPlaylistVideos(data);
            showNotification('success', 'نجاح', `تم العثور على ${data.count} فيديو`);
        } else {
            showNotification('error', 'خطأ', data.error || 'فشل في جلب القائمة');
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في الاتصال بالخادم');
    } finally {
        btn.disabled = false;
        btn.textContent = 'جلب';
    }
}

function renderPlaylistVideos(data) {
    const container = $('playlistVideos');
    const infoSection = $('playlistInfo');
    const actionsSection = $('playlistActions');

    // Show info header
    $('playlistTitle').textContent = `📂 ${data.title}`;
    $('playlistStats').textContent = `${data.count} فيديو • ${data.type === 'channel' ? 'قناة' : 'قائمة تشغيل'}`;
    infoSection.classList.remove('hidden');
    actionsSection.classList.remove('hidden');

    // Render videos
    container.innerHTML = data.videos.map((video, index) => `
        <div class="clean-queue-item">
            <input type="checkbox" class="playlist-video-check" data-index="${index}" checked 
                   style="width: 20px; height: 20px; cursor: pointer;">
            <div class="queue-thumb">
                <img src="${video.thumbnail || ''}" alt="" onerror="this.style.display='none'">
            </div>
            <div class="queue-details">
                <h4>${video.title || 'فيديو ' + (index + 1)}</h4>
                <small style="color: var(--text-muted);">${video.duration ? formatDuration(video.duration) : ''}</small>
            </div>
        </div>
    `).join('');

    // Add download button listener
    const downloadBtn = $('downloadPlaylistBtn');
    if (downloadBtn) {
        downloadBtn.onclick = downloadPlaylist;
    }
}

async function downloadPlaylist() {
    if (!playlistData) return;

    const checkboxes = document.querySelectorAll('.playlist-video-check:checked');
    const selectedVideos = Array.from(checkboxes).map(cb => {
        const index = parseInt(cb.dataset.index);
        return playlistData.videos[index];
    });

    if (selectedVideos.length === 0) {
        showNotification('error', 'خطأ', 'الرجاء تحديد فيديو واحد على الأقل');
        return;
    }

    const quality = $('playlistQuality')?.value || 'best';
    const btn = $('downloadPlaylistBtn');
    btn.disabled = true;
    btn.textContent = 'جاري البدء...';

    try {
        const response = await fetch(`${API_BASE}/batch/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videos: selectedVideos,
                quality,
                format: 'mp4'
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '🚀 بدأ التحميل', `جاري تحميل ${selectedVideos.length} فيديو`);
            // Could add progress polling here
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في بدء التحميل');
    } finally {
        btn.disabled = false;
        btn.textContent = '⬇️ تحميل المحدد';
    }
}

// ===== VIDEO TOOLS FUNCTIONS =====
async function compressVideo(filename) {
    const quality = prompt('جودة الضغط (low/medium/high):', 'medium');
    if (!quality) return;

    showNotification('info', '🗜️ جاري الضغط', 'قد يستغرق بعض الوقت...');

    try {
        const response = await fetch(`${API_BASE}/tools/compress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputPath: filename, quality })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '✅ تم الضغط', `${data.originalSize} → ${data.compressedSize} (${data.reduction})`);
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في ضغط الفيديو');
    }
}

async function convertToGif(filename) {
    const duration = prompt('مدة GIF (بالثانية):', '5');
    if (!duration) return;

    showNotification('info', '🎬 جاري التحويل', 'قد يستغرق بعض الوقت...');

    try {
        const response = await fetch(`${API_BASE}/tools/gif`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inputPath: filename,
                duration: parseInt(duration),
                fps: 15,
                width: 480
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '✅ تم إنشاء GIF', data.filename);
            window.open(data.url, '_blank');
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في إنشاء GIF');
    }
}

async function mergeVideos() {
    const filesInput = prompt('أسماء الملفات (مفصولة بفاصلة):', 'video1.mp4, video2.mp4');
    if (!filesInput) return;

    const files = filesInput.split(',').map(f => f.trim());
    if (files.length < 2) {
        showNotification('error', 'خطأ', 'يجب تحديد ملفين على الأقل');
        return;
    }

    showNotification('info', '🔗 جاري الدمج', 'قد يستغرق بعض الوقت...');

    try {
        const response = await fetch(`${API_BASE}/tools/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '✅ تم الدمج', data.filename);
            window.open(data.url, '_blank');
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في دمج الفيديوهات');
    }
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ===== UI WRAPPER FUNCTIONS FOR TOOLS =====
async function compressVideoUI() {
    const filename = $('compressFilename')?.value?.trim();
    const quality = $('compressQuality')?.value || 'medium';

    if (!filename) {
        showNotification('error', 'خطأ', 'الرجاء إدخال اسم الملف');
        return;
    }

    showNotification('info', '🗜️ جاري الضغط', 'قد يستغرق بعض الوقت...');

    try {
        const response = await fetch(`${API_BASE}/tools/compress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputPath: filename, quality })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '✅ تم الضغط', `${data.originalSize} → ${data.compressedSize} (${data.reduction})`);
            // Open download link
            window.open(data.url, '_blank');
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في ضغط الفيديو');
    }
}

async function mergeVideosUI() {
    const filesText = $('mergeFiles')?.value?.trim();

    if (!filesText) {
        showNotification('error', 'خطأ', 'الرجاء إدخال أسماء الملفات');
        return;
    }

    const files = filesText.split('\n').map(f => f.trim()).filter(f => f);
    if (files.length < 2) {
        showNotification('error', 'خطأ', 'يجب إدخال ملفين على الأقل');
        return;
    }

    showNotification('info', '🔗 جاري الدمج', 'قد يستغرق بعض الوقت...');

    try {
        const response = await fetch(`${API_BASE}/tools/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '✅ تم الدمج', data.filename);
            window.open(data.url, '_blank');
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في دمج الفيديوهات');
    }
}

async function convertToGifUI() {
    const filename = $('gifFilename')?.value?.trim();
    const startTime = parseInt($('gifStartSec')?.value) || 0;
    const duration = parseInt($('gifDurationSec')?.value) || 5;

    if (!filename) {
        showNotification('error', 'خطأ', 'الرجاء إدخال اسم الملف');
        return;
    }

    showNotification('info', '🎬 جاري التحويل', 'قد يستغرق بعض الوقت...');

    try {
        const response = await fetch(`${API_BASE}/tools/gif`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inputPath: filename,
                startTime,
                duration,
                fps: 15,
                width: 480
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', '✅ تم إنشاء GIF', data.filename);
            window.open(data.url, '_blank');
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (error) {
        showNotification('error', 'خطأ', 'فشل في إنشاء GIF');
    }
}

// ===== DOWNLOADS MANAGER (REBUILT v2.0) =====
// Handles both Active Queue and Completed Library

let activeDownloadsInterval = null;

// 1. Switch View Logic
function switchQueueView(view) {
    console.log('🔄 Swapping View to:', view);

    // Buttons
    const btnActive = document.getElementById('btnActiveQueue');
    const btnCompleted = document.getElementById('btnCompletedQueue');

    // Containers
    const containerActive = document.getElementById('queueListMain');
    const containerLibrary = document.getElementById('libraryContainer');

    // Reset Interval
    if (activeDownloadsInterval) {
        clearInterval(activeDownloadsInterval);
        activeDownloadsInterval = null;
    }

    if (view === 'active') {
        // UI Updates
        if (btnActive) btnActive.className = 'btn btn-primary';
        if (btnCompleted) btnCompleted.className = 'btn btn-secondary';

        if (containerActive) containerActive.style.display = 'block';
        if (containerLibrary) containerLibrary.style.display = 'none';

        // Start Logic
        loadActiveDownloads();
        activeDownloadsInterval = setInterval(loadActiveDownloads, 2000);

    } else {
        // UI Updates
        if (btnActive) btnActive.className = 'btn btn-secondary';
        if (btnCompleted) btnCompleted.className = 'btn btn-primary';

        if (containerActive) containerActive.style.display = 'none';
        if (containerLibrary) containerLibrary.style.display = 'block';

        // Start Logic
        loadLibraryContent();
    }
}

// 2. Active Downloads Logic
async function loadActiveDownloads() {
    const container = document.getElementById('queueListMain');
    if (!container) return;

    try {
        const response = await fetch(`${API_BASE}/downloads/active?t=${Date.now()}`);
        const data = await response.json();

        if (!data.downloads || data.downloads.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span style="font-size: 3rem;">⏳</span>
                    <p>لا توجد تحميلات نشطة</p>
                </div>`;
            return;
        }

        container.innerHTML = data.downloads.map(dl => `
            <div class="clean-queue-item">
                <div class="queue-details" style="flex:1;">
                    <div style="display:flex; justify-content:space-between;">
                        <h4>${dl.title || 'جاري التحميل...'}</h4>
                        <span>${dl.progress}%</span>
                    </div>
                    <div class="progress-bar-line">
                        <div class="progress-fill-blue" style="width: ${dl.progress}%"></div>
                    </div>
                    <small>${dl.status} • ${dl.speed || ''} • ${dl.eta || ''}</small>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Active Queue Error:', e);
    }
}

// 3. Library Logic (Restored Grid Shape)
async function loadLibraryContent() {
    const container = document.getElementById('libraryContent');
    const badge = document.getElementById('libCountBadge');

    if (!container) return;

    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px;">جاري تحميل المكتبة...</div>';

    try {
        const response = await fetch(`${API_BASE}/downloads?t=${Date.now()}`);
        const data = await response.json();
        const files = data.files || [];

        if (badge) badge.textContent = files.length;

        if (files.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:40px;">
                    <span style="font-size:4rem;">📂</span>
                    <h3>المكتبة فارغة</h3>
                </div>`;
            return;
        }

        // Render as Grid Cards (User Preferred Shape)
        container.innerHTML = files.map(file => {
            const safeName = encodeURIComponent(file.name);
            const isAudio = file.name.match(/\.(mp3|m4a|wav)$/i);
            const icon = isAudio ? '🎵' : '🎬';

            return `
            <div class="file-card" style="animation: fadeIn 0.3s ease;">
                <div class="file-preview-area">
                    <span class="file-icon-large">${icon}</span>
                    <button onclick="openLibraryPlayer('${file.url}', decodeURIComponent('${safeName}'))" class="play-overlay-btn">▶️</button>
                </div>
                <div class="file-info-area">
                    <div class="file-name-title" title="${file.name}">${file.name}</div>
                    <div class="file-meta-row">
                        <span>${file.sizeFormatted}</span>
                        <span>${new Date(file.date).toLocaleDateString('ar')}</span>
                    </div>
                    <div class="file-actions-row">
                        <button onclick="renameFileUI(decodeURIComponent('${safeName}'))" class="action-btn-mini" title="تسمية">✏️</button>
                        <button onclick="uploadToCloudUI(decodeURIComponent('${safeName}'))" class="action-btn-mini" title="سحابة">☁️</button>
                        <button onclick="deleteFileUI(decodeURIComponent('${safeName}'))" class="action-btn-mini danger" title="حذف">🗑️</button>
                    </div>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        container.innerHTML = `<div style="color:red; text-align:center;">خطأ: ${e.message}</div>`;
    }
}

// 4. File Actions UI (Simplified)
async function renameFileUI(oldName) {
    const newName = prompt('اسم الملف الجديد:', oldName);
    if (newName && newName !== oldName) {
        await apiCall('/files/rename', { oldName, newName });
        loadLibraryContent();
    }
}

async function deleteFileUI(filename) {
    if (confirm('حذف الملف نهائياً؟')) {
        await apiCall('/files/delete', { filename });
        loadLibraryContent();
    }
}

async function uploadToCloudUI(filename) {
    const choice = prompt('اختر السحابة:\n1. Google Drive\n2. Dropbox\n3. OneDrive');
    if (choice === '1') window.open('https://drive.google.com/', '_blank');
    if (choice === '2') window.open('https://dropbox.com/', '_blank');
    if (choice === '3') window.open('https://onedrive.live.com/', '_blank');
}

// 5. Video Tools
async function convertMediaUI() {
    const filename = $('convertFilename')?.value;
    const format = $('convertFormat')?.value;
    if (filename && format) {
        showNotification('info', 'جاري التحويل', 'انتظر قليلاً...');
        await apiCall('/tools/convert', { inputPath: filename, format });
    }
}

async function muteVideoUI() {
    const filename = $('muteFilename')?.value;
    if (filename) {
        showNotification('info', 'جاري كتم الصوت', 'انتظر قليلاً...');
        await apiCall('/tools/mute', { inputPath: filename });
    }
}

// Helper for Tools
async function apiCall(endpoint, body) {
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            showNotification('success', 'نجاح', data.filename || 'تمت العملية');
            if (data.url) window.open(data.url, '_blank');
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (e) {
        showNotification('error', 'فشل الاتصال', e.message);
    }
}

function openFolderUI() {
    alert('الملفات محفوظة في مجلد downloads على السيرفر');
}

// ===== LIBRARY PLAYER FUNCTIONS (ISOLATED) =====
function openLibraryPlayer(url, title) {
    const modal = document.getElementById('libraryPlayerModal');
    const video = document.getElementById('libVideoPlayer');
    const titleEl = document.getElementById('libPlayerTitleText');

    if (modal && video) {
        console.log('Opening Library Player:', url);
        video.src = url;
        video.load(); // Force reload source
        if (titleEl) titleEl.textContent = title;
        modal.classList.remove('hidden');

        video.play().catch(e => {
            console.error('Autoplay failed:', e);
        });
    } else {
        console.error('Library player elements not found!');
    }
}

function closeLibraryPlayer() {
    const modal = document.getElementById('libraryPlayerModal');
    const video = document.getElementById('libVideoPlayer');

    if (modal) modal.classList.add('hidden');
    if (video) {
        video.pause();
        video.src = ""; // Clear src to stop buffering
    }
}

// ===== OVERRIDE LEGACY PLAYER =====
// Force all legacy calls to use the new isolated player
window.openVideoPlayer = function (url, title) {
    console.log('Legacy player call redirected to Library Player');
    openLibraryPlayer(url, title);
};

// ===== PHASE 1 FEATURES: PiP, Cinema, Smart Clip =====

// 1. Picture-in-Picture
async function togglePiP() {
    console.log('🖼️ Toggling PiP...');
    const video = document.getElementById('libVideoPlayer');

    if (!video) {
        console.error('❌ PiP Error: Video element not found!');
        return;
    }

    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
            await video.requestPictureInPicture();
        } else {
            showNotification('error', 'خطأ', 'المتصفح لا يدعم PiP');
        }
    } catch (err) {
        console.error('❌ PiP Failed:', err);
    }
}

// 2. Cinema Mode
function toggleCinemaMode() {
    console.log('🌗 Toggling Cinema Mode...');
    const modal = document.querySelector('#libraryPlayerModal .modal-content');

    if (modal) {
        modal.classList.toggle('cinema-mode');

        // Inject dynamic style if not exists
        if (!document.getElementById('cinemaStyle')) {
            const style = document.createElement('style');
            style.id = 'cinemaStyle';
            style.innerHTML = `
                .cinema-mode {
                    box-shadow: 0 0 0 200vw rgba(0,0,0,0.95) !important;
                    border: 1px solid #444 !important;
                    transform: scale(1.02);
                    transition: all 0.5s ease;
                    z-index: 9999;
                }
            `;
            document.head.appendChild(style);
        }
    } else {
        console.error('❌ Cinema Mode Error: Modal content not found');
    }
}

// 3. Smart Clipboard (Auto-detect YouTube links on focus)
async function initSmartClipboard() {
    // Only init once
    if (window.smartClipInitialized) return;
    window.smartClipInitialized = true;

    window.addEventListener('focus', async () => {
        try {
            // Check if feature enabled (can be setting later)
            // Note: Reading clipboard requires user gesture or permission usually
            // However, 'readText' often works if document is focused

            const text = await navigator.clipboard.readText();
            if (text && (text.includes('youtube.com/') || text.includes('youtu.be/'))) {

                // Don't annoy if already processing this URL
                if ($('videoUrl').value === text) return;

                // Show subtle toast
                const toast = document.createElement('div');
                toast.className = 'clipboard-toast';
                toast.innerHTML = `
                    <div style="background:var(--bg-card); border:1px solid var(--primary); padding:15px; border-radius:12px; position:fixed; bottom:20px; right:20px; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.5); display:flex; gap:15px; align-items:center; animation: slideInRight 0.3s ease;">
                        <span style="font-size:2rem;">🔗</span>
                        <div>
                            <h4 style="margin:0; color:var(--text-primary);">رابط يوتيوب مكتشف!</h4>
                            <small style="color:var(--text-secondary); max-width:200px; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${text}</small>
                        </div>
                        <button id="clipActionBtn" style="background:var(--primary); color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;">تحليل</button>
                        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">✕</button>
                    </div>
                `;

                // Remove existing toast if any
                const existing = document.querySelector('.clipboard-toast');
                if (existing) existing.remove();

                document.body.appendChild(toast);

                // Auto-remove after 8s
                setTimeout(() => { if (toast.parentElement) toast.remove(); }, 8000);

                document.getElementById('clipActionBtn').onclick = () => {
                    $('videoUrl').value = text;
                    switchTab('download');
                    fetchVideoInfo(); // Auto fetch
                    toast.remove();
                };
            }
        } catch (e) {
            // Clipboard access denied or empty - ignore silently
        }
    });
}

// Initialize Smart Clipboard
document.addEventListener('DOMContentLoaded', initSmartClipboard);

// ===== SUPABASE AUTHENTICATION MODULE =====

// Check if user is logged in
async function checkSession() {
    if ((!supabaseClient)) {
        console.warn('Supabase not initialized');
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            state.user = session.user;
            updateAuthUI(true);
        } else {
            state.user = null;
            updateAuthUI(false);
        }
    } catch (e) {
        console.error('Session check failed:', e);
    }
}

// Update UI based on auth state
function updateAuthUI(isLoggedIn) {
    const authBtn = document.getElementById('authBtn');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');

    if (isLoggedIn && state.user) {
        authBtn.textContent = '✅';
        authBtn.title = state.user.email;
        userName.textContent = state.user.email.split('@')[0];

        // Toggle menu on click
        authBtn.onclick = () => userMenu.classList.toggle('hidden');
    } else {
        authBtn.textContent = '👤';
        authBtn.title = 'تسجيل الدخول';
        authBtn.onclick = openAuthModal;
        userMenu.classList.add('hidden');
    }
}

// Open auth modal
function openAuthModal() {
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('authEmail').focus();
}
window.openAuthModal = openAuthModal;

// Close auth modal
function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('authForm').reset();
    document.getElementById('authError').classList.add('hidden');
}
window.closeAuthModal = closeAuthModal;

// Toggle between login and register mode
function toggleAuthMode() {
    state.isLoginMode = !state.isLoginMode;
    const title = document.getElementById('authTitle');
    const submitBtn = document.getElementById('authSubmit');
    const switchText = document.getElementById('authSwitchText');
    const switchBtn = document.getElementById('authSwitchBtn');

    if (state.isLoginMode) {
        title.textContent = 'تسجيل الدخول';
        submitBtn.textContent = 'دخول';
        switchText.textContent = 'ليس لديك حساب؟';
        switchBtn.textContent = 'إنشاء حساب';
    } else {
        title.textContent = 'إنشاء حساب جديد';
        submitBtn.textContent = 'تسجيل';
        switchText.textContent = 'لديك حساب بالفعل؟';
        switchBtn.textContent = 'تسجيل الدخول';
    }

    document.getElementById('authError').classList.add('hidden');
}
window.toggleAuthMode = toggleAuthMode;

// ===== GOOGLE SIGN IN =====
window.signInWithGoogle = async function () {
    try {
        if (!supabaseClient) {
            showNotification('error', 'خطأ', 'Supabase غير متصل');
            return;
        }

        showNotification('info', 'تسجيل الدخول', 'جاري فتح نافذة Google...');

        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) throw error;

    } catch (e) {
        console.error('Google sign in error:', e);
        showNotification('error', 'خطأ', 'فشل تسجيل الدخول بـ Google');
    }
};

// ===== FAVORITES FUNCTIONS =====

// Load user favorites
window.loadFavorites = async function () {
    if (!state.currentUser) {
        showNotification('warning', 'تنبيه', 'يجب تسجيل الدخول أولاً');
        return;
    }

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${API_BASE}/favorites`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success && data.favorites) {
            renderFavorites(data.favorites);
            $('favoritesCount').textContent = `${data.favorites.length} فيديو`;
        }
    } catch (e) {
        console.error('Load favorites error:', e);
        showNotification('error', 'خطأ', 'فشل تحميل المفضلة');
    }
};

// Render favorites grid
function renderFavorites(favorites) {
    const container = $('favoritesList');
    if (!container) return;

    if (favorites.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <span style="font-size: 3rem;">💫</span>
                <p style="margin-top: 15px; color: var(--text-secondary);">لا توجد مفضلات بعد</p>
                <small>أضف فيديوهات من نتائج البحث أو الرئيسية</small>
            </div>
        `;
        return;
    }

    container.innerHTML = favorites.map(fav => `
        <div class="card" style="padding: 0; overflow: hidden;">
            <img src="${fav.thumbnail}" style="width: 100%; height: 150px; object-fit: cover;">
            <div style="padding: 15px;">
                <h4 style="font-size: 0.95rem; margin-bottom: 8px; line-height: 1.4;">${fav.video_title?.substring(0, 60) || 'بدون عنوان'}...</h4>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">${fav.channel || ''}</p>
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button onclick="downloadFromFavorite('${fav.video_url}')" class="btn btn-primary" style="flex: 1; padding: 8px;">⬇️ تحميل</button>
                    <button onclick="removeFromFavorites('${fav.id}')" class="btn btn-secondary" style="padding: 8px;">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Add video to favorites
window.addToFavorites = async function (videoUrl, title, thumbnail, channel) {
    if (!state.currentUser) {
        showNotification('warning', 'تنبيه', 'سجل الدخول لإضافة للمفضلة');
        openAuthModal();
        return;
    }

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${API_BASE}/favorites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ video_url: videoUrl, video_title: title, thumbnail, channel })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', 'تمت الإضافة', 'أُضيف للمفضلة ⭐');
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل إضافة للمفضلة');
    }
};

// Remove from favorites
window.removeFromFavorites = async function (favoriteId) {
    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        await fetch(`${API_BASE}/favorites/${favoriteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        showNotification('success', 'تم الحذف', 'أُزيل من المفضلة');
        loadFavorites();
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل الحذف');
    }
};

// Download from favorite
window.downloadFromFavorite = function (url) {
    $('videoUrl').value = url;
    switchTab('download');
    getVideoInfo();
};

// ===== PLAYLISTS FUNCTIONS =====

// Load user playlists
window.loadMyPlaylists = async function () {
    if (!state.currentUser) {
        showNotification('warning', 'تنبيه', 'يجب تسجيل الدخول أولاً');
        return;
    }

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${API_BASE}/playlists`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success && data.playlists) {
            renderMyPlaylists(data.playlists);
            $('playlistsCount').textContent = `${data.playlists.length} قائمة`;
        }
    } catch (e) {
        console.error('Load playlists error:', e);
        showNotification('error', 'خطأ', 'فشل تحميل القوائم');
    }
};

// Render playlists
function renderMyPlaylists(playlists) {
    const container = $('myPlaylistsList');
    if (!container) return;

    if (playlists.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <span style="font-size: 3rem;">📂</span>
                <p style="margin-top: 15px; color: var(--text-secondary);">لا توجد قوائم بعد</p>
                <small>أنشئ قائمة جديدة من الأعلى</small>
            </div>
        `;
        return;
    }

    container.innerHTML = playlists.map(pl => `
        <div class="card" style="padding: 20px; cursor: pointer;" onclick="openPlaylistDetails('${pl.id}', '${pl.name}')">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h4 style="margin-bottom: 8px;">${pl.name}</h4>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${pl.playlist_items?.length || 0} فيديو • ${pl.is_public ? '🌐 عامة' : '🔒 خاصة'}
                    </p>
                </div>
                <button onclick="event.stopPropagation(); deletePlaylist('${pl.id}')" class="btn btn-secondary" style="padding: 6px 10px;">🗑️</button>
            </div>
            ${pl.is_public ? `
                <div style="margin-top: 12px; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                    <small>رابط المشاركة:</small>
                    <input type="text" value="${window.location.origin}/playlist/${pl.id}" 
                        style="width: 100%; padding: 6px; margin-top: 5px; border-radius: 4px; border: 1px solid var(--border-color);" 
                        onclick="event.stopPropagation(); this.select(); navigator.clipboard.writeText(this.value); showNotification('success', 'تم النسخ', 'الرابط في الحافظة');" readonly>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Open playlist details with videos
window.openPlaylistDetails = async function (playlistId, playlistName) {
    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${API_BASE}/playlists`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        const playlist = data.playlists?.find(p => p.id === playlistId);

        if (!playlist) {
            showNotification('error', 'خطأ', 'لم يتم العثور على القائمة');
            return;
        }

        // Create modal for playlist details
        let modal = $('playlistDetailsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'playlistDetailsModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const items = playlist.playlist_items || [];

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>📂 ${playlistName} (${items.length} فيديو)</h3>
                    <button class="modal-close" onclick="closePlaylistDetails()">✕</button>
                </div>
                <div class="modal-body">
                    ${items.length === 0 ? `
                        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                            <span style="font-size: 3rem;">📭</span>
                            <p style="margin-top: 15px;">لا توجد فيديوهات في هذه القائمة</p>
                            <small>أضف فيديوهات من صفحة البحث</small>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${items.map(item => `
                                <div style="display: flex; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; align-items: center;">
                                    <img src="${item.thumbnail || 'https://via.placeholder.com/120x68'}" 
                                        style="width: 120px; height: 68px; object-fit: cover; border-radius: 6px;" 
                                        onerror="this.src='https://via.placeholder.com/120x68?text=Video'">
                                    <div style="flex: 1; overflow: hidden;">
                                        <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            ${item.video_title || 'فيديو'}
                                        </div>
                                        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
                                            ${item.video_url ? item.video_url.substring(0, 40) + '...' : ''}
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 6px;">
                                        <button class="btn btn-primary btn-sm" onclick="playFromPlaylist('${item.video_url}')">▶️</button>
                                        <button class="btn btn-secondary btn-sm" onclick="removeFromPlaylist('${playlistId}', '${item.id}')">🗑️</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    } catch (e) {
        console.error('Open playlist error:', e);
        showNotification('error', 'خطأ', 'فشل فتح القائمة');
    }
};

// Close playlist details
window.closePlaylistDetails = function () {
    $('playlistDetailsModal')?.classList.add('hidden');
};

// Play video from playlist
window.playFromPlaylist = function (url) {
    if (url) {
        $('videoUrl').value = url;
        switchTab('download');
        fetchVideoInfo();
        closePlaylistDetails();
    }
};

// Remove item from playlist
window.removeFromPlaylist = async function (playlistId, itemId) {
    if (!confirm('هل تريد إزالة هذا الفيديو من القائمة؟')) return;

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        await fetch(`${API_BASE}/playlists/${playlistId}/items/${itemId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        showNotification('success', 'تم الحذف', 'أُزيل الفيديو من القائمة');
        loadMyPlaylists();
        closePlaylistDetails();
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل إزالة الفيديو');
    }
};

// ===== PUBLIC PLAYLISTS DISCOVERY =====

// Load and display public playlists
window.discoverPublicPlaylists = async function (searchQuery = '') {
    try {
        const url = searchQuery
            ? `${API_BASE}/playlists/discover?search=${encodeURIComponent(searchQuery)}`
            : `${API_BASE}/playlists/discover`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.success && data.playlists) {
            renderPublicPlaylists(data.playlists);
        }
    } catch (e) {
        console.error('Discover playlists error:', e);
        showNotification('error', 'خطأ', 'فشل تحميل القوائم العامة');
    }
};

// Render public playlists
function renderPublicPlaylists(playlists) {
    let container = $('publicPlaylistsList');

    // Create container if doesn't exist
    if (!container) {
        // Create a modal for public playlists
        let modal = $('publicPlaylistsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'publicPlaylistsModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px; max-height: 85vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>🌐 اكتشف قوائم عامة</h3>
                    <button class="modal-close" onclick="closePublicPlaylists()">✕</button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 20px;">
                        <input type="text" id="publicPlaylistsSearch" placeholder="🔍 ابحث عن قوائم..."
                            style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border-color);"
                            onkeyup="if(event.key==='Enter') searchPublicPlaylists()">
                        <button onclick="searchPublicPlaylists()" class="btn btn-primary" style="margin-top: 10px;">
                            🔍 بحث
                        </button>
                    </div>
                    <div id="publicPlaylistsList"></div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        container = $('publicPlaylistsList');
    }

    if (playlists.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <span style="font-size: 3rem;">📭</span>
                <p style="margin-top: 15px;">لا توجد قوائم عامة</p>
            </div>
        `;
        return;
    }

    container.innerHTML = playlists.map(pl => `
        <div style="padding: 15px; margin-bottom: 10px; background: var(--bg-secondary); border-radius: 10px; cursor: pointer;"
            onclick="viewPublicPlaylist('${pl.id}', '${pl.name}')"
            onmouseover="this.style.transform='scale(1.01)'" 
            onmouseout="this.style.transform='scale(1)'">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h4 style="margin: 0 0 5px 0;">📂 ${pl.name}</h4>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                        👤 ${pl.owner_name || 'مستخدم'} • 
                        🎬 ${pl.playlist_items?.length || 0} فيديو
                    </p>
                </div>
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); viewPublicPlaylist('${pl.id}', '${pl.name}')">
                    👁️ عرض
                </button>
            </div>
        </div>
    `).join('');
}

// Search public playlists
window.searchPublicPlaylists = function () {
    const query = $('publicPlaylistsSearch')?.value?.trim() || '';
    discoverPublicPlaylists(query);
};

// Close public playlists modal
window.closePublicPlaylists = function () {
    $('publicPlaylistsModal')?.classList.add('hidden');
};

// View a public playlist
window.viewPublicPlaylist = async function (playlistId, playlistName) {
    try {
        const response = await fetch(`${API_BASE}/playlists/public/${playlistId}`);
        const data = await response.json();

        if (!data.success || !data.playlist) {
            showNotification('error', 'خطأ', 'لم يتم العثور على القائمة');
            return;
        }

        const playlist = data.playlist;
        const items = playlist.playlist_items || [];

        // Create modal for viewing public playlist
        let modal = $('viewPublicPlaylistModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'viewPublicPlaylistModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3>🌐 ${playlistName} (${items.length} فيديو)</h3>
                    <button class="modal-close" onclick="closeViewPublicPlaylist()">✕</button>
                </div>
                <div class="modal-body">
                    ${items.length === 0 ? `
                        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                            <span style="font-size: 3rem;">📭</span>
                            <p style="margin-top: 15px;">هذه القائمة فارغة</p>
                        </div>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${items.map(item => `
                                <div style="display: flex; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; align-items: center;">
                                    <img src="${item.thumbnail || 'https://via.placeholder.com/120x68'}" 
                                        style="width: 120px; height: 68px; object-fit: cover; border-radius: 6px;">
                                    <div style="flex: 1; overflow: hidden;">
                                        <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            ${item.video_title || 'فيديو'}
                                        </div>
                                    </div>
                                    <button class="btn btn-primary btn-sm" onclick="playFromPlaylist('${item.video_url}'); closeViewPublicPlaylist();">
                                        ▶️ تحميل
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    } catch (e) {
        console.error('View public playlist error:', e);
        showNotification('error', 'خطأ', 'فشل تحميل القائمة');
    }
};

// Close view public playlist modal
window.closeViewPublicPlaylist = function () {
    $('viewPublicPlaylistModal')?.classList.add('hidden');
};

// Open discover modal
window.openDiscoverPlaylists = function () {
    discoverPublicPlaylists();
};

// Create new playlist
window.createPlaylist = async function () {
    const name = $('newPlaylistName')?.value?.trim();
    if (!name) {
        showNotification('warning', 'تنبيه', 'أدخل اسم القائمة');
        return;
    }

    if (!supabaseClient) {
        showNotification('error', 'خطأ', 'Supabase غير متصل');
        return;
    }

    const isPublic = $('newPlaylistPublic')?.checked || false;

    try {
        const sessionData = await supabaseClient.auth.getSession();
        const token = sessionData.data.session?.access_token;

        console.log('Creating playlist with token:', token ? 'EXISTS' : 'NULL');

        if (!token) {
            showNotification('error', 'خطأ', 'يرجى تسجيل الدخول أولاً');
            openAuthModal();
            return;
        }

        const response = await fetch(`${API_BASE}/playlists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, is_public: isPublic })
        });

        const data = await response.json();
        console.log('Create playlist response:', data);

        if (data.success) {
            $('newPlaylistName').value = '';
            showNotification('success', 'تم الإنشاء', `قائمة "${name}" جاهزة`);
            loadMyPlaylists();
        } else {
            throw new Error(data.error || 'خطأ غير معروف');
        }
    } catch (e) {
        console.error('Create playlist error:', e);
        showNotification('error', 'خطأ', e.message || 'فشل إنشاء القائمة');
    }
};

// Delete playlist
window.deletePlaylist = async function (playlistId) {
    if (!confirm('هل أنت متأكد من حذف هذه القائمة؟')) return;

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        await fetch(`${API_BASE}/playlists/${playlistId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        showNotification('success', 'تم الحذف', 'حُذفت القائمة');
        loadMyPlaylists();
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل الحذف');
    }
};

// Store video data temporarily for adding to playlist
let pendingVideoForPlaylist = null;

// Show playlist selection modal
window.showPlaylistSelector = async function (videoUrl, videoTitle, thumbnail) {
    if (!state.currentUser) {
        showNotification('warning', 'تنبيه', 'سجل الدخول أولاً');
        openAuthModal();
        return;
    }

    pendingVideoForPlaylist = { videoUrl, videoTitle, thumbnail };

    // Create modal if doesn't exist
    let modal = $('playlistSelectorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'playlistSelectorModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>📂 اختر قائمة</h3>
                    <button class="modal-close" onclick="closePlaylistSelector()">✕</button>
                </div>
                <div class="modal-body">
                    <div id="playlistSelectorList" style="max-height: 300px; overflow-y: auto;"></div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color);">
                        <input type="text" id="quickPlaylistName" placeholder="أو أنشئ قائمة جديدة..." 
                            style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <button onclick="quickCreateAndAdd()" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
                            ➕ إنشاء وإضافة
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Load playlists
    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${API_BASE}/playlists`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const list = $('playlistSelectorList');
        if (data.playlists && data.playlists.length > 0) {
            list.innerHTML = data.playlists.map(pl => `
                <div onclick="addVideoToPlaylist('${pl.id}')" 
                    style="padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 8px; background: var(--bg-secondary); display: flex; align-items: center; gap: 10px;"
                    onmouseover="this.style.background='var(--accent-color)'" 
                    onmouseout="this.style.background='var(--bg-secondary)'">
                    <span>📂</span>
                    <span>${pl.name}</span>
                    <span style="margin-right: auto; color: var(--text-secondary); font-size: 0.8rem;">${pl.playlist_items?.length || 0} فيديو</span>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">لا توجد قوائم - أنشئ واحدة أدناه</p>';
        }
    } catch (e) {
        console.error('Load playlists error:', e);
    }

    modal.classList.remove('hidden');
};

// Close playlist selector
window.closePlaylistSelector = function () {
    $('playlistSelectorModal')?.classList.add('hidden');
    pendingVideoForPlaylist = null;
};

// Add video to selected playlist
window.addVideoToPlaylist = async function (playlistId) {
    if (!pendingVideoForPlaylist) return;

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;
        const response = await fetch(`${API_BASE}/playlists/${playlistId}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                video_url: pendingVideoForPlaylist.videoUrl,
                video_title: pendingVideoForPlaylist.videoTitle,
                thumbnail: pendingVideoForPlaylist.thumbnail
            })
        });

        const data = await response.json();
        if (data.success) {
            showNotification('success', 'تمت الإضافة', 'أُضيف الفيديو للقائمة ✅');
            closePlaylistSelector();
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل إضافة الفيديو');
    }
};

// Quick create playlist and add video
window.quickCreateAndAdd = async function () {
    const name = $('quickPlaylistName')?.value?.trim();
    if (!name) {
        showNotification('warning', 'تنبيه', 'أدخل اسم القائمة');
        return;
    }

    try {
        const token = (await supabaseClient.auth.getSession()).data.session?.access_token;

        // Create playlist
        const createRes = await fetch(`${API_BASE}/playlists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, is_public: false })
        });

        const createData = await createRes.json();
        if (createData.success && createData.playlist) {
            // Add video to new playlist
            await addVideoToPlaylist(createData.playlist.id);
            $('quickPlaylistName').value = '';
        }
    } catch (e) {
        showNotification('error', 'خطأ', 'فشل إنشاء القائمة');
    }
};

// Update UI when user logs in/out
function updateUserUI() {
    const isLoggedIn = !!state.currentUser;

    // Show/hide login prompts
    if (isLoggedIn) {
        hide('favoritesLoginRequired');
        hide('playlistsLoginRequired');
        show('favoritesContent');
        show('playlistsContent');

        // Update header
        $('authBtn').innerHTML = `<img src="${state.currentUser.user_metadata?.avatar_url || ''}" style="width: 32px; height: 32px; border-radius: 50%;" onerror="this.textContent='👤'">`;
        $('userName').textContent = state.currentUser.user_metadata?.full_name || state.currentUser.email;

        // Load data
        loadFavorites();
        loadMyPlaylists();
    } else {
        show('favoritesLoginRequired');
        show('playlistsLoginRequired');
        hide('favoritesContent');
        hide('playlistsContent');
        $('authBtn').textContent = '👤';
    }
}

// Check auth state on load
if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        if (session?.user) {
            state.currentUser = session.user;
            closeAuthModal();
            showNotification('success', 'مرحباً!', `أهلاً ${session.user.user_metadata?.full_name || session.user.email}`);
        } else {
            state.currentUser = null;
        }
        updateUserUI();
    });

    // Also check initial session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
            console.log('Initial session found:', session.user.email);
            state.currentUser = session.user;
            updateUserUI();
        }
    });
} else {
    console.warn('Supabase not available - auth features disabled');
}

// Handle auth form submission
async function handleAuth(e) {
    e.preventDefault();

    if ((!supabaseClient)) {
        showNotification('error', 'خطأ', 'Supabase غير متصل');
        return;
    }

    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errorDiv = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmit');

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري...';

    try {
        let result;

        if (state.isLoginMode) {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        } else {
            result = await supabaseClient.auth.signUp({ email, password });
        }

        if (result.error) {
            errorDiv.textContent = result.error.message;
            errorDiv.classList.remove('hidden');
        } else {
            state.user = result.data.user;
            updateAuthUI(true);
            closeAuthModal();
            showNotification('success', 'مرحباً', `تم تسجيل الدخول بنجاح 👋`);
        }
    } catch (err) {
        errorDiv.textContent = 'حدث خطأ غير متوقع';
        errorDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = state.isLoginMode ? 'دخول' : 'تسجيل';
    }
}

// Logout
async function logout() {
    if ((!supabaseClient)) return;

    await supabaseClient.auth.signOut();
    state.user = null;
    updateAuthUI(false);
    showNotification('info', 'تسجيل خروج', 'تم تسجيل الخروج بنجاح');
}
window.logout = logout;

// Save download to history (via server API)
async function saveToHistory(videoData) {
    if (!supabaseClient || !state.user) {
        console.warn('Cannot save history: user not logged in');
        return;
    }

    try {
        // Get access token
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const res = await fetch('/api/history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                url: videoData.url || '',
                title: videoData.title || 'Unknown',
                thumbnail: videoData.thumbnail || '',
                format: videoData.format || 'mp4',
                quality: videoData.quality || 'best',
                fileSize: videoData.fileSize || ''
            })
        });

        if (res.ok) {
            console.log('✅ تم حفظ السجل');
        } else {
            const data = await res.json();
            console.error('History save failed:', data.error);
        }
    } catch (e) {
        console.error('History save error:', e);
    }
}
window.saveToHistory = saveToHistory;

// Load user's download history
async function loadHistory() {
    if ((!supabaseClient) || !state.user) {
        displayHistoryEmpty('يرجى تسجيل الدخول لعرض سجل التحميلات');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('download_history')
            .select('*')
            .eq('user_id', state.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        if (data && data.length > 0) {
            displayHistory(data);
        } else {
            displayHistoryEmpty('لا توجد تحميلات سابقة');
        }
    } catch (e) {
        console.error('Load history error:', e);
        displayHistoryEmpty('خطأ في تحميل السجل');
    }
}
window.loadHistory = loadHistory;

function displayHistory(items) {
    const container = document.getElementById('historyContent');
    if (!container) return;

    container.innerHTML = items.map(item => `
        <div class="history-item">
            <img src="${item.thumbnail || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22><rect fill=%22%23333%22 width=%22100%%22 height=%22100%%22/></svg>'}" 
                 alt="${item.title}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22><rect fill=%22%23333%22 width=%22100%%22 height=%22100%%22/></svg>'">
            <div class="history-item-info">
                <div class="history-item-title">${item.title}</div>
                <div class="history-item-meta">
                    ${item.format?.toUpperCase() || 'MP4'} • ${item.quality || 'Best'} • ${new Date(item.created_at).toLocaleDateString('ar')}
                </div>
            </div>
        </div>
    `).join('');
}

function displayHistoryEmpty(message) {
    const container = document.getElementById('historyContent');
    if (!container) return;
    container.innerHTML = `<div class="history-empty"><p>📋</p><p>${message}</p></div>`;
}

// Init auth event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Check session on load
    checkSession();

    // Auth form submit
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', handleAuth);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Listen for auth state changes
    if (supabase) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) {
                state.user = session.user;
                updateAuthUI(true);
            } else {
                state.user = null;
                updateAuthUI(false);
            }
        });
    }
});

// ===== PHASE 1: UI ENHANCEMENTS =====

// ========== 1.1 KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', (e) => {
    // Ctrl+V: Auto-paste and fetch
    if (e.ctrlKey && e.key === 'v') {
        const videoUrlInput = document.getElementById('videoUrl');
        if (videoUrlInput && document.activeElement !== videoUrlInput) {
            setTimeout(async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && (text.includes('http') || text.includes('youtu') || text.includes('tiktok'))) {
                        videoUrlInput.value = text;
                        videoUrlInput.focus();
                        if (typeof fetchVideoInfo === 'function') {
                            fetchVideoInfo();
                        }
                        console.log('⌨️ Ctrl+V: Auto-pasted URL');
                    }
                } catch (err) { /* Clipboard access denied */ }
            }, 100);
        }
    }

    // Enter: Start download (if video info visible)
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
        const videoInfo = document.getElementById('videoInfo');
        const downloadBtn = document.getElementById('downloadBtnMain') || document.querySelector('.btn-primary[onclick*="download"]');
        if (videoInfo && !videoInfo.classList.contains('hidden') && downloadBtn && document.activeElement.tagName !== 'INPUT') {
            downloadBtn.click();
            console.log('⌨️ Enter: Starting download');
        }
    }

    // Escape: Close all modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
            modal.classList.add('hidden');
        });
        console.log('⌨️ Escape: Closed modals');
    }
});

// ========== 1.2 DRAG AND DROP ==========
function initDragDrop() {
    const dropZone = document.body;
    let dragCounter = 0;

    // Create drag overlay
    const overlay = document.createElement('div');
    overlay.id = 'dragOverlay';
    overlay.innerHTML = `
        <div class="drag-content">
            <span style="font-size: 4rem;">📥</span>
            <h2>أفلت الرابط هنا</h2>
            <p>قم بإفلات رابط الفيديو لبدء التحميل</p>
        </div>
    `;
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(25, 118, 210, 0.95); color: white;
        display: none; justify-content: center; align-items: center;
        z-index: 9999; flex-direction: column; text-align: center;
    `;
    document.body.appendChild(overlay);

    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.style.display = 'flex';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) overlay.style.display = 'none';
    });

    dropZone.addEventListener('dragover', (e) => e.preventDefault());

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.style.display = 'none';

        const text = e.dataTransfer.getData('text');
        if (text && text.includes('http')) {
            const videoUrlInput = document.getElementById('videoUrl');
            if (videoUrlInput) {
                videoUrlInput.value = text;
                if (typeof fetchVideoInfo === 'function') fetchVideoInfo();
                console.log('📥 Dropped URL:', text);
            }
        }
    });
}

// ========== 1.3 COLOR THEMES ==========
const colorThemes = {
    blue: { primary: '#1976d2', name: 'أزرق' },
    purple: { primary: '#7c3aed', name: 'بنفسجي' },
    green: { primary: '#059669', name: 'أخضر' },
    red: { primary: '#dc2626', name: 'أحمر' },
    orange: { primary: '#ea580c', name: 'برتقالي' }
};

function setColorTheme(themeName) {
    const theme = colorThemes[themeName];
    if (!theme) return;

    document.documentElement.style.setProperty('--primary', theme.primary);
    localStorage.setItem('colorTheme', themeName);
    console.log('🎨 Theme changed to:', themeName);
}

function initColorThemes() {
    const saved = localStorage.getItem('colorTheme');
    if (saved && colorThemes[saved]) {
        setColorTheme(saved);
    }
}
window.setColorTheme = setColorTheme;

// ========== 1.4 CINEMA MODE ==========
function openCinemaMode(videoUrl, title) {
    const existing = document.getElementById('cinemaModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'cinemaModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90vw; width: 1200px; background: #000; padding: 0;">
            <div class="modal-header" style="background: rgba(0,0,0,0.8); color: white; padding: 1rem;">
                <h3 style="color: white;">🎬 ${title || 'معاينة الفيديو'}</h3>
                <button onclick="closeCinemaMode()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">✕</button>
            </div>
            <div style="position: relative; background: #000;">
                <iframe 
                    src="${videoUrl}" 
                    style="width: 100%; height: 70vh; border: none;"
                    allowfullscreen
                ></iframe>
            </div>
            <div style="padding: 1rem; background: rgba(0,0,0,0.8); display: flex; justify-content: center; gap: 1rem;">
                <button onclick="closeCinemaMode()" class="btn-secondary">إغلاق</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeCinemaMode() {
    const modal = document.getElementById('cinemaModal');
    if (modal) modal.remove();
}
window.openCinemaMode = openCinemaMode;
window.closeCinemaMode = closeCinemaMode;

// ========== INITIALIZE PHASE 1 ==========
document.addEventListener('DOMContentLoaded', () => {
    initDragDrop();
    initColorThemes();
    console.log('✅ Phase 1 UI Enhancements loaded');
});

// ===== PHASE 2: PERFORMANCE IMPROVEMENTS =====

// ========== 2.1 SMART CACHE SYSTEM ==========
const videoCache = new Map();
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function getCachedVideo(url) {
    const cached = videoCache.get(url);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > CACHE_EXPIRY_MS) {
        videoCache.delete(url);
        return null;
    }

    console.log('📦 Cache hit for:', url);
    return cached.data;
}

function setCachedVideo(url, data) {
    videoCache.set(url, {
        data: data,
        timestamp: Date.now()
    });
    console.log('📦 Cached:', url);
}

// Clean expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [url, entry] of videoCache) {
        if (now - entry.timestamp > CACHE_EXPIRY_MS) {
            videoCache.delete(url);
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes

window.getCachedVideo = getCachedVideo;
window.setCachedVideo = setCachedVideo;

// ========== 2.2 SMART QUEUE SYSTEM ==========
const smartQueue = {
    items: [],
    isProcessing: false,
    maxConcurrent: 3,
    activeCount: 0,

    add(item, priority = 'normal') {
        const queueItem = {
            id: Date.now() + Math.random(),
            ...item,
            priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2,
            status: 'pending',
            addedAt: Date.now()
        };
        this.items.push(queueItem);
        this.sort();
        this.process();
        return queueItem.id;
    },

    sort() {
        this.items.sort((a, b) => {
            // Sort by priority first, then by time added
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.addedAt - b.addedAt;
        });
    },

    async process() {
        if (this.isProcessing || this.activeCount >= this.maxConcurrent) return;

        const pending = this.items.filter(i => i.status === 'pending');
        if (pending.length === 0) return;

        const item = pending[0];
        item.status = 'downloading';
        this.activeCount++;

        try {
            if (typeof item.downloadFn === 'function') {
                await item.downloadFn();
            }
            item.status = 'completed';
        } catch (e) {
            item.status = 'failed';
            item.error = e.message;
        }

        this.activeCount--;
        this.process(); // Process next
    },

    getStatus() {
        return {
            total: this.items.length,
            pending: this.items.filter(i => i.status === 'pending').length,
            downloading: this.items.filter(i => i.status === 'downloading').length,
            completed: this.items.filter(i => i.status === 'completed').length,
            failed: this.items.filter(i => i.status === 'failed').length
        };
    },

    clear() {
        this.items = this.items.filter(i => i.status === 'downloading');
    }
};

window.smartQueue = smartQueue;

// ========== 2.3 GIF PREVIEW (Hover Animation) ==========
function createGifPreview(videoId) {
    // YouTube video preview using storyboard
    const frames = [];
    for (let i = 1; i <= 3; i++) {
        frames.push(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
        frames.push(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`);
    }

    return {
        frames,
        currentFrame: 0,
        interval: null,

        start(imgElement) {
            this.currentFrame = 0;
            this.interval = setInterval(() => {
                imgElement.src = this.frames[this.currentFrame];
                this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            }, 500);
        },

        stop(imgElement, originalSrc) {
            if (this.interval) clearInterval(this.interval);
            imgElement.src = originalSrc;
        }
    };
}

window.createGifPreview = createGifPreview;

console.log('✅ Phase 2 Performance Improvements loaded');

// ===== UI COMPONENT HANDLERS =====

// ========== STAR RATING ==========
document.addEventListener('DOMContentLoaded', () => {
    const starRating = document.getElementById('starRating');
    if (starRating) {
        starRating.addEventListener('click', async (e) => {
            if (!e.target.classList.contains('star')) return;

            const rating = parseInt(e.target.dataset.rating);
            const stars = starRating.querySelectorAll('.star');

            // Update visual
            stars.forEach((star, index) => {
                star.textContent = index < rating ? '★' : '☆';
                star.classList.toggle('active', index < rating);
            });

            // Submit rating to API
            if (state.currentVideo?.url && supabaseClient) {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    if (session) {
                        await fetch('/api/rate', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`
                            },
                            body: JSON.stringify({
                                videoUrl: state.currentVideo.url,
                                rating: rating
                            })
                        });
                        showNotification('success', 'شكراً!', `تم تسجيل تقييمك: ${rating} نجوم`);
                    }
                } catch (e) {
                    console.error('Rating error:', e);
                }
            }
        });
    }
});

// ========== SCHEDULE MODAL ==========
function scheduleDownload() {
    if (!state.currentVideo) {
        showNotification('warning', 'تحذير', 'الرجاء اختيار فيديو أولاً');
        return;
    }

    // Set default datetime to 1 hour from now
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const dateInput = document.getElementById('scheduleDateTime');
    if (dateInput) {
        dateInput.value = now.toISOString().slice(0, 16);
    }

    document.getElementById('scheduleModal')?.classList.remove('hidden');
}

function closeScheduleModal() {
    document.getElementById('scheduleModal')?.classList.add('hidden');
}

async function confirmSchedule() {
    const dateTime = document.getElementById('scheduleDateTime')?.value;
    const quality = document.getElementById('scheduleQuality')?.value;
    const videoUrlInput = document.getElementById('videoUrl');
    const url = videoUrlInput?.value;

    if (!url) {
        showNotification('error', 'خطأ', 'الرجاء إدخال رابط الفيديو أولاً');
        return;
    }

    if (!dateTime) {
        showNotification('error', 'خطأ', 'الرجاء اختيار التاريخ والوقت');
        return;
    }

    if (!supabaseClient) {
        showNotification('error', 'خطأ', 'يجب تسجيل الدخول');
        return;
    }

    try {
        const res = await fetch('/api/schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                scheduledTime: new Date(dateTime).toISOString()
            })
        });

        const data = await res.json();
        if (data.success) {
            showNotification('success', 'تمت الجدولة!', data.message || 'سيتم التحميل في الوقت المحدد');
            closeScheduleModal();
        } else {
            showNotification('error', 'خطأ', data.error);
        }
    } catch (e) {
        showNotification('error', 'خطأ', e.message);
    }
}

window.scheduleDownload = scheduleDownload;
window.closeScheduleModal = closeScheduleModal;
window.confirmSchedule = confirmSchedule;

// ========== THEME MODAL ==========
function openThemeModal() {
    document.getElementById('themeModal')?.classList.remove('hidden');
}

function closeThemeModal() {
    document.getElementById('themeModal')?.classList.add('hidden');
}

window.openThemeModal = openThemeModal;
window.closeThemeModal = closeThemeModal;

// ========== SHARE LINK MODAL ==========
function openShareModal(url) {
    document.getElementById('shareUrlInput').value = url;
    document.getElementById('shareLinkModal')?.classList.remove('hidden');
}

function closeShareModal() {
    document.getElementById('shareLinkModal')?.classList.add('hidden');
}

async function copyShareLink() {
    const input = document.getElementById('shareUrlInput');
    if (input) {
        try {
            await navigator.clipboard.writeText(input.value);
            showNotification('success', 'تم النسخ!', 'تم نسخ الرابط');
        } catch (e) {
            input.select();
            document.execCommand('copy');
        }
    }
}

window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.copyShareLink = copyShareLink;

console.log('✅ UI Component Handlers loaded');

// ===== DYNAMIC PLAYLIST BUTTON INJECTION =====
// Automatically adds "📂 قائمة" button to all video cards
function injectPlaylistButtons() {
    // Find all action containers with download/queue buttons but no playlist button
    document.querySelectorAll('.search-result-actions, .search-actions, .video-actions, .card-actions').forEach(container => {
        // Skip if already has playlist button
        if (container.querySelector('.playlist-btn-injected')) return;

        // Find a download button to get video info
        const downloadBtn = container.querySelector('button[onclick*="Download"], button[onclick*="download"]');
        const queueBtn = container.querySelector('button[onclick*="Queue"], button[onclick*="queue"]');

        if (downloadBtn || queueBtn) {
            // Extract URL from onclick
            const onclickStr = (downloadBtn || queueBtn)?.getAttribute('onclick') || '';
            const urlMatch = onclickStr.match(/['"]([^'"]*youtube[^'"]*)['"]/);
            const titleMatch = onclickStr.match(/,\s*['"]([^'"]+)['"]/);

            if (urlMatch || onclickStr) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm playlist-btn-injected';
                btn.style.cssText = 'background: #9c27b0; color: white; margin-left: 4px;';
                btn.innerHTML = '📂 قائمة';
                btn.onclick = function () {
                    // Try to extract video info from parent card
                    const card = container.closest('.search-result, .search-card, .video-card, .card');
                    const title = card?.querySelector('h4, .title, .video-title')?.textContent || 'Video';
                    const thumb = card?.querySelector('img')?.src || '';
                    const link = card?.querySelector('a[href*="youtube"], img[onclick]');
                    let url = urlMatch?.[1] || '';

                    if (!url && link) {
                        const linkOnclick = link.getAttribute('onclick') || '';
                        const videoIdMatch = linkOnclick.match(/['"]([a-zA-Z0-9_-]{11})['"]/);
                        if (videoIdMatch) {
                            url = 'https://www.youtube.com/watch?v=' + videoIdMatch[1];
                        }
                    }

                    if (url || title) {
                        showPlaylistSelector(url, title.trim(), thumb);
                    } else {
                        showNotification('warning', 'تنبيه', 'لم يتم العثور على معلومات الفيديو');
                    }
                };
                container.appendChild(btn);
            }
        }
    });
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injectPlaylistButtons, 1000);
});

// Watch for new content
const playlistBtnObserver = new MutationObserver(() => {
    injectPlaylistButtons();
});

playlistBtnObserver.observe(document.body, {
    childList: true,
    subtree: true
});

// Also inject on interval for SPA-style navigation
setInterval(injectPlaylistButtons, 2000);

console.log('✅ Playlist button injection enabled');

// ===== STATISTICS FUNCTIONS =====

// Load and display statistics
window.loadStats = async function () {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();

        if (data.success && data.stats) {
            const stats = data.stats;

            // Update main cards
            const totalEl = document.getElementById('statTotalDownloads');
            const todayEl = document.getElementById('statTodayDownloads');
            const sizeEl = document.getElementById('statTotalSize');
            const cacheEl = document.getElementById('statCacheSize');

            if (totalEl) totalEl.textContent = stats.totalDownloads || 0;
            if (todayEl) todayEl.textContent = stats.todayDownloads || 0;
            if (sizeEl) sizeEl.textContent = formatBytes(stats.totalSize || 0);
            if (cacheEl) cacheEl.textContent = stats.cacheSize || 0;

            // Update platform stats
            const platforms = stats.byPlatform || {};
            const ytEl = document.getElementById('statYouTube');
            const ttEl = document.getElementById('statTikTok');
            const igEl = document.getElementById('statInstagram');
            const pinEl = document.getElementById('statPinterest');

            if (ytEl) ytEl.textContent = platforms.youtube || platforms.YouTube || 0;
            if (ttEl) ttEl.textContent = platforms.tiktok || platforms.TikTok || 0;
            if (igEl) igEl.textContent = platforms.instagram || platforms.Instagram || 0;
            if (pinEl) pinEl.textContent = platforms.pinterest || platforms.Pinterest || 0;

            // Update server info
            const uptimeEl = document.getElementById('statUptime');
            const memEl = document.getElementById('statMemory');

            if (uptimeEl) {
                const seconds = Math.floor(stats.uptime || 0);
                const hours = Math.floor(seconds / 3600);
                const mins = Math.floor((seconds % 3600) / 60);
                uptimeEl.textContent = `${hours} ساعة ${mins} دقيقة`;
            }

            if (memEl) {
                memEl.textContent = formatBytes(stats.memoryUsage || 0);
            }

            showNotification('success', 'تم', 'تم تحديث الإحصائيات');
        }
    } catch (e) {
        console.error('Load stats error:', e);
        showNotification('error', 'خطأ', 'فشل تحميل الإحصائيات');
    }
};

// Auto-load stats when stats tab is opened
document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tab="stats"]')) {
        setTimeout(loadStats, 100);
    }
});

console.log('✅ Statistics module loaded');

// ===== PUSH NOTIFICATIONS =====

// Request notification permission
window.requestNotificationPermission = async function () {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            showNotification('success', 'تم', 'تم تفعيل الإشعارات!');
            localStorage.setItem('notificationsEnabled', 'true');
            return true;
        } else {
            showNotification('warning', 'تنبيه', 'لم يتم السماح بالإشعارات');
            return false;
        }
    }
    return false;
};

// Send browser notification
window.sendBrowserNotification = function (title, body, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: options.tag || 'download-plus',
            ...options
        });

        notification.onclick = function () {
            window.focus();
            notification.close();
        };

        return notification;
    }
    return null;
};

// Notify when download completes
window.notifyDownloadComplete = function (title) {
    sendBrowserNotification('✅ اكتمل التحميل!', title, {
        tag: 'download-complete'
    });
};

// Notify when scheduled download starts
window.notifyScheduledStart = function (title) {
    sendBrowserNotification('⏰ بدأ التحميل المجدول', title, {
        tag: 'scheduled-start'
    });
};

// Check and request permissions on load
if (localStorage.getItem('notificationsEnabled') !== 'true') {
    // Ask user to enable notifications after 5 seconds
    setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            // User hasn't been asked yet - we'll ask when they try to schedule
        }
    }, 5000);
}

console.log('✅ Push Notifications module loaded');
