module.exports = TracingWorker;
var exec = require('child_process').exec;
const puppeteer = require('puppeteer');
const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36";

function TracingWorker($config, $logger, $event, $gearman) {
    $gearman.registerWorker("tracer:redirection", async function (payload, worker) {
        var result = await trace(parsePayload(payload, worker));
        worker.end(JSON.stringify(result));
    });
    async function trace(inputs) {
        return new Promise(async function (resolve, reject) {
            var url = decodeURIComponent(decodeURIComponent(decodeURIComponent(decodeURIComponent(inputs["url"]))));
            var result = null;
            var proxyConfig = null;
            if (inputs["location"] != null) {
                proxyConfig = $config.get("proxies." + inputs["location"], null);
                if (proxyConfig == null) {
                    proxyConfig = $config.get("proxies.default");
                }
                $logger.debug("Request using via proxy ...", proxyConfig);

            }
            $logger.debug(`Requesting using CURL ... ${url}`);
            result = await requestUsingCurl(url, proxyConfig);
            $logger.debug(`Request using CURL done ... ${url}`);
            const lastStatus = result[result.length - 1].status;
            if ((result == null || result.length <= 3 || lastStatus == "405") && inputs["location"] == null) {
                $logger.debug(`Requesting using browser  ... ${url}`);
                result = await requestUsingBrowser(url, proxyConfig);
                $logger.debug(`Request using browser done ... ${url}`);
            }
            resolve(result);
        });
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
                setTimeout(function (isResponded) {
                    resolve([]);
                }, 30000);

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
                                    || body.toLowerCase().indexOf('location.replace') > -1)
                        }
                        if (!isResponded) {
                            if (page.mainFrame().url() == url || page.mainFrame().url() == 'about:blank' || status != 200) {
                                // Do not push iframe response to result
                                result.push({
                                    "url": url,
                                    "status": status,
                                    "contentType": contentType,
                                });
                            }
                            if (status == 405 || status == 403
                                || (
                                    status == 200
                                    && contentType != null
                                    && contentType.indexOf('text/html') >= 0
                                    && !isRedirect
                                )) {
                                isResponded = true;
                                resolve(result);
                                await page.close();
                                await browser.close();
                            }
                        }
                    }
                })

                await page.goto(url);
                await new Promise((res) => {
                    setTimeout(res, 30 * 1000)
                });
                await page.close();
                await browser.close();
                $logger.debug(`Request using browser timeout ${url}`);
                reject({
                    "status": 'fail',
                    "message": "Request using browser timeout, can not tracing."
                });


            } catch (e) {
                await page.close();
                await browser.close();
                reject(error);
            }

        });
    }
    async function requestUsingCurl(url, proxyConfig) {
        var retval = [];
        return new Promise((resolve, reject) => {
            let command = `curl -v -s -L -D - '${url}' -H 'Connection: keep-alive' -H 'Upgrade-Insecure-Requests: 1' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' -H 'Accept-Encoding: gzip, deflate' -H 'Accept-Language: en-US,en;q=0.9,ja;' --max-time 8 -o /dev/null -w '%{url_effective}'`;
            if (proxyConfig != null) {
                let proxyDomain = proxyConfig.url;
                proxyDomain = proxyDomain.replace("http://", "");
                let proxyUrl = "http://" + proxyConfig.username + ":" + proxyConfig.password + "@" + proxyDomain;
                command += " --proxy " + proxyUrl;

            }
            command += " | egrep 'Location|HTTP/' -i";
            exec(command, async function (err, stdout, stderr) {
                if (err) {
                    console.log("requestUsingCurl err", err);
                    resolve([]);
                    // reject(err);
                }
                var result = stdout.split("\n");
                let destinationUrl, statusCode;
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
                    let urlIndex = 0;
                    for (let index = 0; index < result.length - 1; index++) {
                        let line = result[index];
                        if (!line) {
                            continue;
                        }
                        if (line.includes('HTTP')) {
                            statusCode = parseStatusCode(line);
                            if (destinationUrl) {
                                retval[urlIndex] = {
                                    "status": statusCode,
                                    "url": destinationUrl
                                };
                            }

                        } else if (line.includes('ocation')) {
                            urlIndex++;
                            destinationUrl = line.replace("Location: ", "")
                                .replace("location: ", "")
                                .replace("\r", "");
                        }
                    }
                }
                // Check redirect if status code 200 and redirect using JS
                if (statusCode == 200) {
                    let redirectFlow = await getRedirectUrls(destinationUrl);
                    if (redirectFlow) {
                        retval.push(redirectFlow);
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
    async function getRedirectUrls(url) {
        let retval = false;
        let isResponded = false;
        return new Promise((resolve, reject) => {
            let command = `curl '${url}' -H 'Connection: keep-alive' -H 'Upgrade-Insecure-Requests: 1' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' -H 'Accept-Encoding: gzip, deflate' -H 'Accept-Language: en-US,en;q=0.9,ja;' --compressed | grep 'location.replace'`;
            exec(command, async function (err, stdout, stderr) {
                if (err || !stdout) {
                    resolve(false);
                    return;
                }
                let matches = stdout.match(/window.location.replace\(\'(.*)\'\)/);
                if (matches != null && matches.length == 2) {
                    let redirectUrl = (decodeURIComponent(matches[1]
                        .replaceAll('\b', '')
                        .replaceAll('\\', '')
                    ));
                    resolve({
                        'url': redirectUrl,
                        'status': '200'
                    });
                    return;
                } else {
                    resolve(false);
                    return;
                }
            })
        });
    }
    function parsePayload(payload, worker) {
        if (!payload) {
            worker.error();
            return null;
        }
        return JSON.parse(payload.toString("utf-8"));
    }
}
