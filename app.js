global.__dir = __dirname;
const totalCPUs = require('os').cpus().length;
const cluster = require('cluster');
if (cluster.isMaster) {
    masterProcess();
} else {
    childProcess();
}
function masterProcess() {
    console.log(`Master ${process.pid} is running`);
    for (let i = 0; i < totalCPUs; i++) {
        console.log(`Forking process number ${i}...`);
        const worker = cluster.fork();
        worker.send({
            task: 'boot',
            data: {}
        });
    }
    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
        console.log("Let's fork another worker!");
        cluster.fork();
    });
}
function childProcess() {
    process.on('message', function (msg) {
        if (msg.task === 'boot') {
            require(__dir + "/core/app/start").start();
        }
    });
    process.on('unhandledRejection', error => {
        // Do not log error when suddenly close browser!
    });
}
