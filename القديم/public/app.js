// ===== Video Downloader ULTRA - JavaScript =====

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

const API_BASE = 'http://localhost:3000/api';

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

function displayVideoInfo(data) {
    $('thumbnail').src = data.thumbnail;
    $('videoTitle').textContent = data.title;
    $('channelName').textContent = `📺 ${data.channel || 'غير معروف'}`;
    $('viewCount').textContent = `👁️ ${formatNumber(data.view_count)} مشاهدة`;
    $('uploadDate').textContent = `📅 ${formatDate(data.upload_date)}`;
    $('likeCount').textContent = `👍 ${formatNumber(data.like_count)}`;
    $('duration').textContent = data.duration_string || formatDuration(data.duration);

    // Quality Options
    const qualitySelect = $('quality');
    qualitySelect.innerHTML = data.qualities.map(q =>
        `<option value="${q.id}">${q.label}</option>`
    ).join('');

    // Badges
    $('videoQualityBadge').textContent = `🎬 ${data.qualities[0]?.label || 'HD'}`;
    $('estimatedSize').textContent = `💾 ${estimateSize(data.duration, data.qualities[0]?.id)}`;

    if (data.subtitles) {
        $('hasSubsBadge').classList.remove('hidden');
    }
    if (data.is_live) {
        $('isLiveBadge').classList.remove('hidden');
    }

    show('videoInfo');
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

        // تحميل خاص لـ TikTok
        if (url.includes('tiktok.com') || url.includes('vm.tiktok.com')) {
            updateProgress(50, 'جاري تحميل من TikTok...', '⚡ Cobalt', '', '');

            response = await fetch(`${API_BASE}/tiktok/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'فشل تحميل TikTok');
            }

            // TikTok download is usually instant
            updateProgress(100, 'اكتمل!', '', '', '');
            downloadCompleted();
            return;
        }

        // التحميل العادي
        const options = buildDownloadOptions(downloadType);
        response = await fetch(`${API_BASE}/download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        data = await response.json();
        if (!response.ok) throw new Error(data.error || 'فشل التحميل');

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
                downloadCompleted();
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

function downloadCompleted() {
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

function pauseDownload() {
    showNotification('info', 'إيقاف', 'تم إيقاف التحميل');
    $('pauseDownload').classList.add('hidden');
    $('resumeDownload').classList.remove('hidden');
}

function resumeDownload() {
    showNotification('info', 'استئناف', 'تم استئناف التحميل');
    $('resumeDownload').classList.add('hidden');
    $('pauseDownload').classList.remove('hidden');
}

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
            await waitForDownload(data.downloadId, (progress) => {
                item.progress = progress;
                updateQueueDisplay();
            });

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

async function waitForDownload(downloadId, onProgress) {
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/progress/${downloadId}`);
                const data = await res.json();

                if (data.progress) onProgress(data.progress);

                if (data.status === 'completed' || data.status === 'error') {
                    clearInterval(interval);
                    resolve(data.status);
                }
            } catch (e) {
                clearInterval(interval);
                resolve('error');
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
            await waitForDownload(data.downloadId, (progress) => {
                item.progress = progress;
                updateQueueDisplay();
            });

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
window.previewVideo = function (videoId) {
    const iframe = $('previewFrame');
    if (iframe) {
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        openModal('previewModal');
    }
};

// Close modal and stop video
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
function previewVideo() {
    if (state.currentVideo) {
        let embedUrl = '';
        const url = state.currentVideo.url;

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const id = url.match(/(?:v=|youtu\.be\/)([^&]+)/)?.[1];
            if (id) embedUrl = `https://www.youtube.com/embed/${id}`;
        }

        if (embedUrl) {
            $('previewFrame').src = embedUrl;
            openModal('previewModal');
        } else {
            window.open(url, '_blank');
        }
    }
}

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
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">❌</span><p>لم يتم العثور على فيديوهات</p></div>';
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
window.switchQueueView = function (view) {
    const buttons = document.querySelectorAll('.section-header-row .btn');
    buttons.forEach(btn => {
        if (btn.textContent.includes('النشطة') && view === 'active') {
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
        } else if (btn.textContent.includes('مكتملة') && view === 'completed') {
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
        } else {
            btn.style.background = '';
            btn.style.color = '';
        }
    });

    // Filter queue display
    const container = $('queueListMain');
    if (!container) return;

    const items = view === 'completed'
        ? state.queue.filter(i => i.status === 'completed')
        : state.queue.filter(i => i.status !== 'completed');

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>${view === 'completed' ? 'لا توجد تحميلات مكتملة' : 'قائمة الانتظار فارغة'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="clean-queue-item" data-id="${item.id}">
            <button class="btn-close-item" onclick="removeFromQueue(${item.id})">✕</button>
            <div class="queue-thumb">
                ${item.thumbnail ? `<img src="${item.thumbnail}" alt="">` : ''}
                ${item.status === 'downloading' ? '<span class="status-icon">⬇️</span>' :
            item.status === 'completed' ? '<span class="status-icon">✅</span>' :
                '<span class="pause-icon">⏸</span>'}
            </div>
            <div class="queue-details">
                <h4>${item.title?.substring(0, 50) || 'فيديو'}...</h4>
                <div class="queue-progress-row">
                    <div class="progress-bar-line">
                        <div class="progress-fill-blue" style="width: ${item.progress}%"></div>
                    </div>
                    <span class="queue-meta">${Math.round(item.progress)}% - ${getQueueStatusText(item)}</span>
                </div>
            </div>
        </div>
    `).join('');
};

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
});
