const http = require('http');

http.get('http://localhost:3000/api/downloads', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Response status:', res.statusCode);
        console.log('Response body:', data.substring(0, 500)); // Show start of data
        try {
            const json = JSON.parse(data);
            console.log('Files count:', json.files ? json.files.length : 'No files array');
        } catch (e) {
            console.log('Invalid JSON');
        }
    });
}).on("error", (err) => {
    console.log("Error: " + err.message);
});
