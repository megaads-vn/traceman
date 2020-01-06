module.exports = TracerController;
var RateLimiter = require('limiter').RateLimiter;
var requestLimiter = new RateLimiter(1, 1000);
const Cache = require("cache");
var cache = new Cache(1800 * 1000);

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
        job.setTimeout(5 * 60 * 1000); // timeout in 5 minutes       
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
            $logger.debug("Job failed!");
            io.json({
                "status": "fail"
            });
        });
        job.on("timeout", function () {
            $config.debug("Job timeout!");
            io.json({
                "status": "fail"
            });
        });
    }
}
