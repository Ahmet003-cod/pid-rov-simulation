const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('style.css', 'utf8');
const js = fs.readFileSync('script.js', 'utf8');

html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>');
html = html.replace('<script src="script.js"></script>', '<script>\n' + js + '\n</script>');

fs.writeFileSync('index.html', html);
console.log('Successfully combined HTML, CSS, and JS into index.html');
