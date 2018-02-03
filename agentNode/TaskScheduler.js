"use strict";
const moment = require("moment");
class Task {
    constructor(description, rate, work) {
        this.description = description;
        this.taskrate = rate;
        this.work = work;
        this.nextRun = this.getNextRun(rate);
        this.running = false;
    }
    run() {
        var self = this;
        self.running = true;
        //console.log("Running task: " + self.description);
        self.work(function () {
            self.nextRun = self.getNextRun(self.taskrate);
            //console.log(self.description + " will run again at: " + self.nextRun.toISOString());
            self.running = false;
        });
    }
    rate(seconds) {
        if (seconds) {
            this.taskrate = seconds;
            this.nextRun = this.getNextRun(this.taskrate);
        }
        return this.taskrate;
    }
    getNextRun(rate) {
        var temp = rate * TaskScheduler.jitter;
        var jitteredValue = rate + (temp - (Math.random() * temp * 2));
        return moment(new Date()).add(jitteredValue, 'second');
    }
}
class TaskScheduler {
    constructor(options) {
        this.tickRate = 1100; // Every 1.1 seconds ... keep out of sync with player
        this.tasks = [];
        if (options) {
            for (var option in options) {
                switch (option) {
                    case 'jitter':
                        TaskScheduler.jitter = options[option];
                        break;
                    case 'tickRate':
                        this.tickRate = options[option];
                        break;
                    default:
                        console.log("Unknown argument to TaskScheduler: " + option);
                        break;
                }
            }
        }
        this.start();
    }
    start() {
        var self = this;
        this.timer = setInterval(function () { self.tick(self); }, this.tickRate);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    tick(self) {
        var now = moment(new Date());
        for (var task of self.tasks) {
            if ((!task.running) && now.isSameOrAfter(task.nextRun)) {
                try {
                    task.run();
                }
                catch (error) {
                    console.log("Error thrown in task: " + task.description + " - " + error);
                }
            }
        }
    }
    add(description, rate, work) {
        var task = new Task(description, rate, work);
        this.tasks.push(task);
        return task;
    }
}
TaskScheduler.jitter = .10;
exports.TaskScheduler = TaskScheduler;
