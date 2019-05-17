module.exports = TracerController;
var RateLimiter = require('limiter').RateLimiter;
var requestLimiter = new RateLimiter(1, 1000);
const Cache = require("cache");
var cache = new Cache(1800 * 1000);
var exec = require('child_process').exec;
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
                    var url = decodeURIComponent(decodeURIComponent(io.inputs["url"]));
                    $logger.debug("url", url);
                    $logger.debug("Request using CURL ...");
                    var result = await requestUsingCurl(url);
                    if (result == null || result.length == 0) {
                        $logger.debug("Request using Browser ...");
                        result = await requestUsingBrowser(url);
                    }
                    if (result != null && result.length > 0) {
                        cache.put(io.inputs["url"], result);
                    }
                    io.json(result);
                });
            }
        })(io);
    }
    async function requestUsingBrowser(url) {
        var result = [];
        var isResponded = false;
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
        return new Promise(async (resolve, reject) => {
            try {
                await page.on('response', response => {
                    const url = response.url();
                    const status = response.status();
                    const contentType = response.headers()['content-type'];
                    if (!isResponded) {
                        result.push({
                            "url": url,
                            "status": status,
                            "contentType": contentType,
                        });
                        if (status == 404 || status == 403
                            || (status == 200 && contentType != null && contentType.indexOf('text/html') >= 0)) {
                            isResponded = true;
                            resolve(result);
                        }
                    }
                });
                await page.goto(url, { waitUntil: 'networkidle0' });
                await page.close();
                await browser.close();
            } catch (error) {
                await page.close();
                await browser.close();
                reject(error);
            }
            if (!isResponded) {
                resolve(result);
            }
        });
    }
    async function requestUsingCurl(url) {
        var retval = [];
        return new Promise((resolve, reject) => {
            exec("curl --head -s -L -D - '" + url + "' -o /dev/null -w '%{url_effective}' | egrep 'Location|HTTP/'", function (err, stdout, stderr) {
                if (err) {
                    console.log("requestUsingCurl err", err);
                    reject(err);
                }
                var result = stdout.split("\n");
                if (result.length == 2) {
                    if (parseStatusCode(result[0]) >= 400) {
                        resolve(retval);
                    } else {
                        retval.push({
                            "status": parseStatusCode(result[0]),
                            "url": url
                        });
                    }
                } else if (result.length > 2) {
                    retval.push({
                        "status": parseStatusCode(result[0]),
                        "url": url
                    });
                    for (let index = 1; index < result.length - 1; index = index + 2) {
                        var statusCode = parseStatusCode(result[index + 1]);
                        if (statusCode == null) {
                            break;
                        }
                        retval.push({
                            "url": result[index].replace("Location: ", "").replace("\r", ""),
                            "status": statusCode
                        });
                    }
                }
                resolve(retval);
            });
        });
    }
    function parseStatusCode(header) {
        var retval = null;
        var matches = header.match(/(.{1,}) ([0-9]{3})/);
        if (matches != null && matches.length == 3) {
            retval = matches[2];
        }
        return retval;
    }
}