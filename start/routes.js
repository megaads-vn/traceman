module.exports = function ($route, $logger) {
    /** Register HTTP requests **/
    $route.get("/", "HomeController@welcome");
    $route.post("/tracer/redirection", "TracerController@redirection");
    /** Register socket.io requests **/
    /** Register filters **/
};