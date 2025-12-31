// Test multiple TikTok APIs

async function testAPIs() {
    const tiktokUrl = 'https://www.tiktok.com/@gg9974347/video/7428098927913549088';

    console.log('Testing TikTok APIs...\n');

    // API 1: TikWM
    console.log('1. Testing TikWM API...');
    try {
        const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`);
        const data = await response.json();
        if (data && data.data && data.data.play) {
            console.log('   ✅ TikWM SUCCESS!');
            console.log('   Video URL:', data.data.play.substring(0, 80) + '...');
        } else {
            console.log('   ❌ TikWM failed:', JSON.stringify(data).substring(0, 100));
        }
    } catch (e) {
        console.log('   ❌ TikWM error:', e.message);
    }

    // API 2: SSSTik clone
    console.log('\n2. Testing SnapTik API...');
    try {
        const response = await fetch('https://snaptik.app/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(tiktokUrl)}`
        });
        const text = await response.text();
        console.log('   Response:', text.substring(0, 100));
    } catch (e) {
        console.log('   ❌ SnapTik error:', e.message);
    }

    // API 3: TikHub
    console.log('\n3. Testing free TikHub...');
    try {
        const response = await fetch(`https://api.tikhub.io/api/v1/tiktok/aweme_detail?url=${encodeURIComponent(tiktokUrl)}`);
        const data = await response.json();
        console.log('   Response:', JSON.stringify(data).substring(0, 200));
    } catch (e) {
        console.log('   ❌ TikHub error:', e.message);
    }
}

testAPIs();
