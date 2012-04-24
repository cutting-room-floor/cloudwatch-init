var fs = require('fs');
var exec = require('child_process').exec;
var _ = require('underscore');
var argv = require('optimist').argv;
var aws = require("aws-lib");
var async = require("async");

if (!argv.config) {
    console.log("Must provide --config argument which points to json settings file, such as --config settings.json");
    process.exit(1);
}

var options = {};
// Setup configuration options
if (argv.config) {
    try {
        var config = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
    } catch(e) {
        console.warn('Invalid JSON config file: ' + argv.config);
       throw e;
    }
}

_.each(config, function(v, k) {
    options[k] = v;
});
// Allow options command-line overrides
_.each(argv, function(v, k) {
    options[k] = argv[k] || options[k];
});

if (!options.awskey ||
    !options.awssecret ||
    !options.alarms ||
    !options.op ) {
    console.log("Must provide all of awskey, awssecret, and alarms as --config parameters")
    process.exit(1);
}

if (!options.op.match(/^(add|remove)$/)) {
    console.log('Provided bad operation: %s. Must be one of add/remove', options.op);
    process.exit(1);
}

if (argv.alarms) {
    try {
        var alarms = JSON.parse(fs.readFileSync(argv.alarms, 'utf8'));
    } catch(e) {
        console.warn('Invalid JSON alarm file: ' + argv.alarms);
       throw e;
    }
}

ec2 = aws.createEC2Client(options.awskey, options.awssecret, {version: '2012-04-01'});
cw = aws.createCWClient(options.awskey, options.awssecret);

async.waterfall([
    // Get instanceid of this machine
    function(cb) {
        exec('wget -q -O - http://169.254.169.254/latest/meta-data/instance-id',
          function (err, stdout, stderr) {
              cb(null, stdout.replace('\n', ''));
          }
    )},
    // Get name of this instance
    function(instanceid, cb) {
        var tagParams = {
          'Filter.1.Name': 'resource-id',
          'Filter.1.Value': instanceid,
          'Filter.2.Name': 'key',
          'Filter.2.Value': 'Name'
        };
        ec2.call("DescribeTags", tagParams, function(err, res) {
            var name = res.tagSet.item.value;
            cb(null, instanceid, name)
        });
    },
    // Format and put alarms.
    // See http://docs.amazonwebservices.com/AmazonCloudWatch/latest/APIReference/API_PutMetricAlarm.html
    function(instanceid, name, cb) {
        if (options.op == 'add') {
            _.each(alarms, function(alarm) {
                _.each(alarm.AlarmActions, function(v, i) {
                    alarm['AlarmActions.member.' + (i + 1)] = v;
                });
                _.each(alarm.InsufficientDataActions, function(v, i) {
                    alarm['InsufficientDataActions.member.' + (i + 1)] = v;
                });
                alarm.AlarmName = alarm.AlarmName + ' ' + name;
                alarm['Dimensions.member.1.Name'] = 'InstanceId';
                alarm['Dimensions.member.1.Value'] = instanceid;
                delete alarm.AlarmActions;
                delete alarm.InsufficientDataActions;
                cw.call('PutMetricAlarm', alarm, function(err, res) {
                    //
                });
            });
        } else if (options.op == 'remove') {
            var payload = {};
            _.each(alarms, function(alarm, i) {
                payload['AlarmNames.member.' + (i + 1)] = alarm.AlarmName + ' ' + name;
            });
            cw.call('DeleteAlarms', payload, function(err, res) {
                //
            });
        }
    }
]);
