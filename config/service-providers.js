var config = require(__dir + "/core/app/config");
var routerLoader = require(__dir + "/core/loader/route-loader");
var event = require(__dir + "/core/app/event");
var logger = (require(__dir + "/core/log/logger-factory")).getLogger();
var Gearman = require("node-gearman");
var gearman = new Gearman(config.get("mq.host"), config.get("mq.port"));
gearman.on("connect", function () {
    logger.debug("Connected to the Gearman server!");
});
gearman.connect();
module.exports = function ($serviceContainer) {
    $serviceContainer.bind("$config", config);
    $serviceContainer.bind("$route", routerLoader);
    $serviceContainer.bind("$event", event);
    $serviceContainer.bind("$logger", logger);
    $serviceContainer.bind("$gearman", gearman);
};