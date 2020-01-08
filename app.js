global.__dir = __dirname;
require(__dir + "/core/app/start").start();
process.on('unhandledRejection', error => {
    // Do not log error when suddenly close browser!
});
