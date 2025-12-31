// Service Worker for تحميل بلس PWA
const CACHE_NAME = 'tahmil-plus-v1';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline use
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Caching essential files');
                return cache.addAll(PRECACHE_ASSETS.filter(url => !url.includes('icon')));
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('🚀 Service Worker activating...');

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('🗑️ Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip API requests (always fetch fresh)
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone the response for caching
                const responseClone = response.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });

                return response;
            })
            .catch(() => {
                // Fallback to cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // If HTML request, show offline page
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match(OFFLINE_URL);
                    }
                });
            })
    );
});

// Push notification event
self.addEventListener('push', (event) => {
    console.log('📢 Push received');

    const data = event.data?.json() || {
        title: 'تحميل بلس',
        body: 'لديك إشعار جديد',
        icon: '/icons/icon-192x192.png'
    };

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon || '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            vibrate: [100, 50, 100],
            data: data.data || {}
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});

console.log('✅ Service Worker loaded');
