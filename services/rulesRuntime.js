function _number(val) {

    var wrapper = {};

    wrapper.is = function (arg) {
        if (val)
            return val == arg;
        else
            return false;
    }
    wrapper.isNot = function (arg) {
        if (val)
            return val != arg;
        else
            return false;
    }
    wrapper.isGreaterThan = function (arg) {
        if (val)
            return val > arg;
        else
            return false;
    }
    wrapper.isLessThan = function (arg) {
        if (val)
            return val < arg;
        else
            return false;
    }
    wrapper.isGreaterThanOrEqualTo = function (arg) {
        if (val)
            return val >= arg;
        else
            return false;
    }
    wrapper.isLessThanOrEqualTo = function (arg) {
        if (val)
            return val <= arg;
        else
            return false;
    }

    return wrapper;
}

function _string(val) {

    var wrapper = {};

    wrapper.is = function (arg) {
        if (val)
            return val == arg;
        else
            return false;
    }
    wrapper.isNot = function (arg) {
        if (val)
            return val != arg;
        else
            return false;
    }
    wrapper.contains = function (arg) {
        if (val)
            return val.toLowerCase().indexOf(arg.toLowerCase()) >= 0;
        else
            return false;

    }
    wrapper.doesNotContain = function (arg) {
        if (val)
            return val.toLowerCase().indexOf(arg.toLowerCase()) == -1;
        else
            return false;
    }
    wrapper.startsWith = function (arg) {
        if (val)
            return val.toLowerCase().startsWith(arg.toLowerCase());
        else
            return false;
    }
    wrapper.endsWith = function (arg) {
        if (val)
            return val.toLowerCase().endsWith(arg.toLowerCase());
        else
            return false;
    }

    return wrapper;
}

function _dateTime(val) {
    var parseTime = function (arg) {
        var parts = arg.split(' ');
        var val = parseInt(parts[0]);
        switch (parts[1]) {
            case 'Seconds':
                return val * 1;
            case 'Minutes':
                return val * 60;
            case 'Hours':
                return val * 60 * 60;
            case 'Days':
                return val * 24 * 60 * 60;
            case 'Weeks':
                return val * 7 * 24 * 60 * 60;
            default:
                return val;
        }
    }
    var wrapper = {};

    wrapper.is = function (arg) {
        return val.getTime() == Date.parse(arg).getTime();
    }
    wrapper.isNot = function (arg) {
        return val.getTime() != Date.parse(arg).getTime();
    }
    wrapper.isAfter = function (arg) {
        return val.getTime() > Date.parse(arg).getTime();
    }
    wrapper.isBefore = function (arg) {
        return val.getTime() < Date.parse(arg).getTime();
    }
    wrapper.isInTheLast = function (arg) {
        console.log(val);
        console.log(val.toString());
        // get elapsed time in seconds
        var elapsed = ((new Date()).getTime() - val.getTime()) / 1000;
        console.log("elapsed: " + elapsed);
        return elapsed <= parseTime(arg);
    }
    wrapper.isNotInTheLast = function (arg) {
        // get elapsed time in seconds
        var elapsed = ((new Date()).getTime() - val.getTime()) / 1000;
        return elapsed > parseTime(arg);
    }
    return wrapper;
}


function _time(val) {

    var parseTime = function (arg) {
        var parts = arg.split(':');
        var val = (+parts[0]) * 60 * 60 + (+parts[1]) * 60 + (+parts[2]);
    }

    wrapper.is = function (arg) {
        return val.getTime() == arg.getTime();
    }
    wrapper.isNot = function (arg) {
        return val.getTime() != arg.getTime();
    }
    wrapper.isAfter = function (arg) {
        return val.getTime() > arg.getTime();
    }
    wrapper.isBefore = function (arg) {
        return val.getTime() < arg.getTime();
    }
    wrapper.isInTheLast = function (arg) {
        var d = new Date();
        var elapsed = ((d.getTime()).getTime() - val.getTime()) / 1000;
        console.log("elapsed: " + elapsed);
        return elapsed <= parseTime(arg);
    }
    wrapper.isNotInTheLast = function (arg) {
        var d = new Date();
        var elapsed = ((d.getTime()).getTime() - val.getTime()) / 1000;
        return elapsed > parseTime(arg);
    }

    return wrapper;
}