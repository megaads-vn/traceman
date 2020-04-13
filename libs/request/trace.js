var exec = require('child_process').exec;
module.exports.curl = async function(url, proxy = '') {
    var retval = [];
    return new Promise((resolve, reject) => {
        url = decodeURIComponent(decodeURIComponent(decodeURIComponent(decodeURIComponent(url))));
        let curlCommand = "curl --head -s -L -D - '" + url + "' " +
            "-H 'Connection: keep-alive' " +
            "-H 'Upgrade-Insecure-Requests: 1' " +
            "-H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36' " +
            "-H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3' " +
            "-H 'Accept-Encoding: gzip, deflate' " +
            "-H 'Accept-Language: en-US,en;q=0.9,ja;q=0.8,vi;q=0.7' --max-time 8 -o /dev/null -w '%{url_effective}'";
        if(proxy) {
            curlCommand += " --proxy " + proxy;
        }
        curlCommand += " | egrep 'Location|HTTP/'";
        exec(curlCommand, function (err, stdout, stderr) {
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
                let urlIndex = 0;
                let destinationUrl, statusCode;
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