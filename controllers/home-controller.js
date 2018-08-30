module.exports = HomeController;

function HomeController($config, $event, $logger) {
    this.welcome = function (io) {
        io.json({
            name: $config.get("package.name"),            
            version: $config.get("package.version"),
            port: $config.get("app.port"),
            debug: $config.get("app.debug"),
            log: $config.get("log.storage"),
            autoload: $config.get("app.autoload"),
        });
    }
}


// page.on('request', (data) => console.log(data));    

// await page.on('response', response => {
//     const url = response.url();
//     response.buffer()
//     .then (
//         buffer => {
//             bufferString = buffer.toString();         
//         },
//         error => {
//           console.log(error)
//         }
//     )
// })

// await page.goto('https://www.ford.com', {waitUntil: 'networkidle0'});