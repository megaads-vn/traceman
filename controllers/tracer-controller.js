module.exports = TracerController;
var RateLimiter = require("limiter").RateLimiter;
var requestLimiter = new RateLimiter(1, 1000);
const Cache = require("cache");
var cache = new Cache(1800 * 1000);
const Queue = require(__dir + "/libs/queue");
const Trace = require(__dir + "/libs/request/trace");
const queueLimitNumber = 8;
const TraceQueue = new Queue(queueLimitNumber);
var ip2loc = require('ip2location-nodejs');
ip2loc.IP2Location_init(__dir + '/ip2location/IPV6-COUNTRY-REGION-CITY-LATITUDE-LONGITUDE-ZIPCODE.BIN');
const dns = require('dns');

function TracerController($config, $event, $logger, $gearman) {
    function getIp(domain) {
        return new Promise((resolve, reject) => {
            dns.lookup(domain, (err, address, family) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(address);
                }
            });
        });
    }

    this.redirection = function (io) {
        (async (io) => {
            if (!io.inputs["url"]) {
                io.json({
                    "status" : "fail",
                    "message" : "Url required!"
                });
                return;
            }
            var cachedResult = cache.get(io.inputs["url"]);
            if (cachedResult != null) {
                io.json(cachedResult);
            } else {
                if (io.inputs["location"] && io.inputs["location"] == "auto") {
                    var url = new URL(decodeURIComponent(io.inputs["target_url"]));
                    let domain = url.hostname;
                    let cacheLocation = cache.get('location::' + domain);
                    if (cacheLocation != null) {
                        io.inputs["location"] = cacheLocation;
                    } else {
                        let address = await getIp(domain);
                        let ip = ip2loc.IP2Location_get_all(address);
                        let countryCode = ip.country_short.toLowerCase();
                        cache.put('location::' + domain, countryCode);
                        io.inputs["location"] = countryCode;
                    }
                }
                queueJob(io);
            }
        })(io);
    }
    function queueJob(io) {
        var job = $gearman.submitJob("tracer:redirection", JSON.stringify(io.inputs));
        job.on("data", function (data) {
            var result = JSON.parse(data);
            if (result != null && result.length > 0) {
                cache.put(io.inputs["url"], result);
            }
            io.json(result);
        });
        job.on("end", function () {
            $logger.debug("Job completed!");
        });
        job.on("error", function (error) {
            $logger.debug("Job failed!", io.inputs["url"]);
            io.json({
                "status": "fail"
            });
        });
        job.on("timeout", function () {
            $logger.debug("Job timeout!", io.inputs["url"]);
            io.json({
                "status": "fail"
            });
        });
    }

    this.curl = async function(io) {
        if (!io.inputs["url"]) {
            io.json("Url required!");
            return;
        }
        let url = io.inputs["url"];
        let location = io.inputs["location"];
        let proxyUrl = "";
        if (location != null) {
            let proxyConfig = $config.get("proxies." + location, null);
            if (proxyConfig != null) {
                let proxyDomain = proxyConfig.url;
                proxyDomain = proxyDomain.replace("http://", "");
                proxyUrl = "http://" + proxyConfig.username + ":" + proxyConfig.password + "@" + proxyDomain;

            }
        }
        let task = () => {
            return Trace.curl(url, proxyUrl).then(function (data) {
                return function() {
                    io.json(data);
                }
            }).catch((e) => {
                console.log("curl err ", e);
                io.json({
                    "status": "fail"
                });
                Promise.resolve();
            });
        };
        TraceQueue.pushTask(task);
    }

}
