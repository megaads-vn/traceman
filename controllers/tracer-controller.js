module.exports = TracerController;
const puppeteer = require('puppeteer');

function TracerController($config, $event, $logger) {
    this.redirection = function (io) {
        var result = [];
        var url = decodeURIComponent(io.inputs["url"]);
        (async () => {
            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: true,
                timeout: 30000,
                ignoreHTTPSErrors: true
            });
            const page = await browser.newPage();
            try {
                await page.on('response', response => {
                    const url = response.url();
                    const status = response.status();
                    const contentType = response.headers()['content-type'];
                    result.push({
                        "url": url,
                        "status": status,
                        "contentType": contentType,
                    });
                    if (status == 404 || (status == 200 && contentType.indexOf('text/html') >= 0)) {
                        io.json(result);
                    }
                })
                await page.goto(url, { waitUntil: 'networkidle0' });
                await page.close();
                await browser.close();
            } catch (error) {
                await page.close();
                await browser.close();
            }
            io.json(result);
        })();
    }
}