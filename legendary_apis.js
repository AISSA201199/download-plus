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

// ===== PHASE 1: User System - Playlists API =====

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

        if (error) throw error;
        res.json({ success: true, item: data });
    } catch (e) {
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

        // Delete playlist items first
        await supabaseAdmin.from('playlist_items').delete().eq('playlist_id', req.params.id);

        // Delete playlist
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

// ===== PHASE 2: Scheduled Downloads API =====

// Get scheduled downloads
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

// Schedule a download
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

// Cancel scheduled download
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

// ===== PHASE 3: AI Features - Smart Summary =====

// Get AI video summary
app.post('/api/ai/video-summary', async (req, res) => {
    const { videoUrl, title, description } = req.body;

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
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || 'تعذر إنشاء الملخص';

        res.json({ success: true, summary });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Smart Search - Natural Language
app.post('/api/ai/smart-search', async (req, res) => {
    const { query } = req.body;

    try {
        const prompt = `المستخدم يبحث عن: "${query}"
استخرج:
1. كلمات البحث المناسبة لـ YouTube (بالإنجليزية والعربية)
2. نوع المحتوى المطلوب (موسيقى، تعليمي، ترفيهي، إلخ)
3. أي فلاتر مقترحة (قصير، طويل، HD)

أعد النتيجة كـ JSON:
{"keywords": ["..."], "type": "...", "filters": {...}}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        // Try to parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { keywords: [query] };

        res.json({ success: true, search: parsed });
    } catch (e) {
        res.status(500).json({ error: e.message, search: { keywords: [req.body.query] } });
    }
});

// ===== PHASE 4: User Profile & Stats =====

// Get user profile
app.get('/api/user/profile', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        // Get user stats
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

// Sync download history to cloud
app.post('/api/user/sync-history', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'يرجى تسجيل الدخول' });

    try {
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'جلسة غير صالحة' });

        const { history } = req.body;

        // Upsert history items
        for (const item of history) {
            await supabaseAdmin
                .from('download_history')
                .upsert({
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

// Get cloud history
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

console.log('✅ Legendary Features APIs loaded (Favorites, Playlists, Scheduled, AI, Profile)');
