module.exports = TracerController;
const puppeteer = require('puppeteer');
const proxyChain = require('proxy-chain');

function TracerController($config, $event, $logger) {
    this.redirection = function (io) {
        var result = [];
        var url = decodeURIComponent(io.inputs["url"]);
        (async () => {
            const proxy = await proxyChain.anonymizeProxy(getProxy());
            const browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--proxy-server=' + proxy
                ],
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
                    if (status == 404 || (status == 200 && contentType != null && contentType.indexOf('text/html') >= 0)) {
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
    function getProxy() {
        var username = 'lum-customer-hl_8bc69a16-zone-static';
        var password = 'ljhv5rpi3kg6';
        var port = 22225;
        var session_id = (1000000 * Math.random()) | 0;
        return 'http://' + username + '-country-us-session-' + session_id + ':' + password + '@zproxy.lum-superproxy.io:' + port;
    }
}