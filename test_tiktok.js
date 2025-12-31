// Test TikTok Download

async function testTikTok() {
    const url = 'https://www.tiktok.com/@khaby.lame/video/7030390434171899142';

    console.log('Testing TikTok download...');
    console.log('URL:', url);

    try {
        const response = await fetch('http://localhost:3000/api/tiktok/info?url=' + encodeURIComponent(url));
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

testTikTok();
