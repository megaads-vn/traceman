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
            if (!io.inputs["url"]) {
                io.json("Url required!");
                return;
            }
            var cachedResult = cache.get(io.inputs["url"]);
            if (cachedResult != null) {
                io.json(cachedResult);
            } else {
                requestLimiter.removeTokens(1, async function () {
                    var url = decodeURIComponent(decodeURIComponent(io.inputs["url"]));
                    $logger.debug("url", url);
                    $logger.debug("Request using CURL ...");
                    var result = await requestUsingCurl(url);
                    if (result == null || result.length <= 2) {
                        $logger.debug("Request using Browser ...");
                        result = await requestUsingBrowser(url);
                    }
                    if ((result == null || result.length <= 2)
                        && io.inputs["location"] != null) {
                        var proxyConfig = $config.get("proxies." + io.inputs["location"], null);
                        if (proxyConfig == null) {
                            proxyConfig = $config.get("proxies.default");
                        }
                        $logger.debug("Request using Browser via proxy ...");
                        result = await requestUsingBrowser(url, proxyConfig);
                    }
                    if (result != null && result.length > 0) {
                        cache.put(io.inputs["url"], result);
                    }
                    io.json(result);
                });
            }
        })(io);
    }
    async function requestUsingBrowser(url, proxyConfig) {
        var result = [];
        let isNotViglink = false;
        var isResponded = false;
        var browserConfig = {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
            headless: true,
            timeout: 30000,
            ignoreHTTPSErrors: true
        };
        if (proxyConfig != null) {
            browserConfig.args.push('--proxy-server=' + proxyConfig.url);
        }
        const browser = await puppeteer.launch(browserConfig);
        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        if (proxyConfig != null) {
            await page.authenticate({
                "username": proxyConfig.username,
                "password": proxyConfig.password
            });
        }
        return new Promise(async (resolve, reject) => {
            try {
                page.on('response', async (response) => {
                    const url = response.url();
                    const status = response.status();
                    const contentType = response.headers()['content-type'];
                    if (((contentType == '' || contentType == null) && (status == 301 || status == 302))
                        || (contentType && contentType.indexOf('text/html') > -1)) {
                        let isRedirect = false;
                        if (status == 200) {
                            let body = await response.text();
                            isRedirect =
                                (body.toLowerCase().indexOf('http-equiv="refresh"') > -1
                                    || body.toLowerCase().indexOf('window.location.replace') > -1)
                        }
                        if (!isResponded) {
                            result.push({
                                "url": url,
                                "status": status,
                                "contentType": contentType,
                            });
                            if (status == 405 || status == 403
                                || (
                                    status == 200
                                    && contentType != null
                                    && contentType.indexOf('text/html') >= 0
                                    && !isRedirect
                                )) {
                                isResponded = true;
                                resolve(result);
                                page.close();
                                browser.close();
                            }
                        }
                    }
                })
                process.on('unhandledRejection', error => {
                    // Do not log error when suddenly close browser!
                });
                await page.goto(url);

            } catch (e) {
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
            let command = `curl -v -s -L -D - '${url}' -H 'Connection: keep-alive' -H 'Upgrade-Insecure-Requests: 1' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' -H 'Accept-Encoding: gzip, deflate' -H 'Accept-Language: en-US,en;q=0.9,ja;' -o /dev/null -w '%{url_effective}' | egrep 'Location|HTTP/' -i`;
            exec(command, function (err, stdout, stderr) {
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
                        let destinationUrl = result[index].toLowerCase()
                                                          .replace("location: ", "")
                                                          .replace("\r", "");
                        retval.push({
                            "url": destinationUrl,
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
