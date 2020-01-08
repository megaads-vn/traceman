module.exports = TracerController;
var RateLimiter = require("limiter").RateLimiter;
var requestLimiter = new RateLimiter(1, 1000);
const Cache = require("cache");
var cache = new Cache(1800 * 1000);
const Queue = require(__dir + "/libs/queue");
const Trace = require(__dir + "/libs/request/trace");
const queueLimitNumber = 8;
const TraceQueue = new Queue(queueLimitNumber);


function TracerController($config, $event, $logger, $gearman) {

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
                queueJob(io);
            }
        })(io);
    }
    function queueJob(io) {
        var job = $gearman.submitJob("tracer:redirection", JSON.stringify(io.inputs));
        job.setTimeout(1 * 60 * 1000); // timeout in 0.6 minutes       
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
