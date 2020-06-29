module.exports = TracerController;
var RateLimiter = require("limiter").RateLimiter;
var requestLimiter = new RateLimiter(1, 1000);
const Cache = require("cache");
var cache = new Cache(1800 * 1000);
const Queue = require(__dir + "/libs/queue");
const Trace = require(__dir + "/libs/request/trace");
const queueLimitNumber = 8;
const TraceQueue = new Queue(queueLimitNumber);
const RedirectionQueue = new Queue(3);
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

    this.redirection = async function (io) {
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
    }

    function queueJob(io) {
        let priority = io.inputs["priority"] ? 1 : 0;
        let task = () => {
            return hybridRequest(io.inputs).then(function (data) {
                if (data != null && data.length > 0) {
                    cache.put(io.inputs["url"], data);
                }
                io.json(data);
            }).catch((e) => {
                console.log("curl err ", e);
                io.json({
                    "status": "fail",
                    "msg": e
                });
                Promise.resolve();
            });
        };
        RedirectionQueue.pushTask(task, priority);
    }

    async function hybridRequest(inputs) {
        let url = decodeURIComponent(decodeURIComponent(decodeURIComponent(decodeURIComponent(inputs["url"]))));
        let result = null;
        let proxyConfig = null;
        let location = inputs["location"];
        let onlyCurl = inputs["onlyCurl"] ? 1 : 0;
        if (location) {
            proxyConfig = $config.get("proxies." + inputs["location"], null);
            if (proxyConfig == null) {
                proxyConfig = $config.get("proxies.default");
            }
            $logger.debug("Request using via proxy ...", proxyConfig);
        }
        $logger.debug(`Inputs ... `, inputs);
        $logger.debug(`Requesting using CURL ... ${url}`);
        result = await Trace.curl(url, proxyConfig);
        $logger.debug(`Request using CURL done ... ${url}`);
        if ((result == null || result.length <= 2) && !onlyCurl) {
            $logger.debug(`Requesting using browser  ... ${url}`);
            result = await Trace.browser(url, proxyConfig);
            $logger.debug(`Request using browser done ... ${url}`);
        }
        return result;
    }

    this.curl = async function(io) {
        if (!io.inputs["url"]) {
            io.json("Url required!");
            return;
        }
        let url = io.inputs["url"];
        let location = io.inputs["location"];
        let proxyConfig = "";
        if (location != null) {
            proxyConfig = $config.get("proxies." + location, null);
        }
        let task = () => {
            return Trace.curl(url, proxyConfig).then(function (data) {
                return function() {
                    io.json(data);
                }
            }).catch((e) => {
                console.log("curl err ", e);
                io.json({
                    "status": "fail",
                    "msg": e
                });
                Promise.resolve();
            });
        };
        TraceQueue.pushTask(task);
    }


}
