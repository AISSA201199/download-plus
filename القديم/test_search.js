const { spawn } = require('child_process');

const q = "خلودة";
const maxResults = 20;

console.log(`Testing search for: ${q}`);

const ytdlp = spawn('yt-dlp', [
    `ytsearch${maxResults}:${q}`,
    '--dump-single-json',
    '--flat-playlist',
    '--skip-download',
    '--no-warnings',
    '--ignore-config'
], { shell: true });

let output = '';
let errorOutput = '';

ytdlp.stdout.on('data', (chunk) => {
    console.log('Got data chunk size:', chunk.length);
    output += chunk;
});
ytdlp.stderr.on('data', (chunk) => {
    console.log('Got stderr:', chunk.toString());
    errorOutput += chunk;
});

ytdlp.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
    if (code === 0) {
        console.log('Success! Output length:', output.length);
        try {
            // Clean output logic
            const jsonStart = output.indexOf('{');
            const jsonEnd = output.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                output = output.substring(jsonStart, jsonEnd + 1);
            }
            JSON.parse(output);
            console.log('JSON parsed successfully');
        } catch (e) {
            console.error('JSON Parse Error:', e.message);
        }
    } else {
        console.error('Failed with error:', errorOutput);
    }
});
