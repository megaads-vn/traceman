module.exports = TracerController;
var RateLimiter = require('limiter').RateLimiter;
var requestLimiter = new RateLimiter(1, 1000);
const Cache = require("cache");
var cache = new Cache(1800 * 1000);
const puppeteer = require('puppeteer');
const proxyChain = require('proxy-chain');
const proxyUrl = 'http://zproxy.lum-superproxy.io:22225';
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36";
const username = 'lum-customer-hl_8bc69a16-zone-static';
const password = 'ljhv5rpi3kg6';

function TracerController($config, $event, $logger) {
    this.redirection = function (io) {
        ((io) => {
            var cachedResult = cache.get(io.inputs["url"]);
            if (cachedResult != null) {
                io.json(cachedResult);
            } else {
                requestLimiter.removeTokens(1, async function () {
                    var result = [];
                    var url = decodeURIComponent(io.inputs["url"]);
                    const browser = await puppeteer.launch({
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            // '--proxy-server=' + proxyUrl
                        ],
                        headless: true,
                        timeout: 30000,
                        ignoreHTTPSErrors: true    
                    });
                    const page = await browser.newPage();
                    await page.setUserAgent(userAgent);
                    // await page.authenticate({ username, password });
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
                    cache.put(io.inputs["url"], result);
                    io.json(result);
                });
            }            
        })(io);
    }
}