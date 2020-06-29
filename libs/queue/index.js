"use strict";

module.exports = class Queue {
    constructor(concurrency = 1, name = 'default') {
        this.concurrency = concurrency;
        this.running = 0;
        this.name = name;
        this.queue = [];
    }

    pushTask(task, priority = false) {
        if (priority) {
            this.queue.unshift(task);
        } else {
            this.queue.push(task);

        }
        this.next();
    }

    size() {
        return this.queue.length;
    }

    next() {
        while (this.running < this.concurrency && this.queue.length) {
            const task = this.queue.shift();
            task().then((callback) => {
                this.running--;
                console.log(this.name, 'running: ', this.running, 'length: ', this.queue.length);
                this.next();
                if (typeof callback == 'function') {
                    callback();
                }

            }).catch(function(e) {
                this.running--;
                console.log('error', this.name);
            });
            this.running++;
        }
    }
};
