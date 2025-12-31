-- =============================================
-- Supabase Tables for Legendary Features
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Favorites Table
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    video_title TEXT,
    thumbnail TEXT,
    channel TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own favorites
CREATE POLICY "Users can manage their favorites" ON favorites
    FOR ALL USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_favorites_user ON favorites(user_id);

-- =============================================

-- 2. Playlists Table
CREATE TABLE IF NOT EXISTS playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own, read public
CREATE POLICY "Users can manage their playlists" ON playlists
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public playlists are viewable" ON playlists
    FOR SELECT USING (is_public = true);

-- Index
CREATE INDEX idx_playlists_user ON playlists(user_id);

-- =============================================

-- 3. Playlist Items Table
CREATE TABLE IF NOT EXISTS playlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    video_title TEXT,
    thumbnail TEXT,
    position INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;

-- Policy: Same as parent playlist
CREATE POLICY "Playlist items follow playlist access" ON playlist_items
    FOR ALL USING (
        playlist_id IN (
            SELECT id FROM playlists WHERE user_id = auth.uid()
        )
    );

-- Index
CREATE INDEX idx_playlist_items_playlist ON playlist_items(playlist_id);

-- =============================================

-- 4. Scheduled Downloads Table
CREATE TABLE IF NOT EXISTS scheduled_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    video_title TEXT,
    thumbnail TEXT,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    quality TEXT DEFAULT 'best',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE scheduled_downloads ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Users can manage their scheduled downloads" ON scheduled_downloads
    FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_scheduled_user ON scheduled_downloads(user_id);
CREATE INDEX idx_scheduled_time ON scheduled_downloads(scheduled_time);

-- =============================================

-- 5. Download History Table
CREATE TABLE IF NOT EXISTS download_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    video_title TEXT,
    thumbnail TEXT,
    channel TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, video_url)
);

-- Enable RLS
ALTER TABLE download_history ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Users can manage their history" ON download_history
    FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_history_user ON download_history(user_id);

-- =============================================
-- SUCCESS! All tables created.
-- =============================================
