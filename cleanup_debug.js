const fs = require('fs');

const files = [
    'test_trending_debug.js',
    'test_trending_debug_v2.js',
    'test_scraping_debug.js',
    'test_search_debug.js'
];

files.forEach(f => {
    if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        console.log(`Deleted ${f}`);
    }
});
