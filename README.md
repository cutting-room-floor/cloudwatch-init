Node.js script which takes a json array of CloudWatch alarm definitions and creates CloudWatch alarms.

Setup: Fill out sample-alarms.json with the alarms you want to create. Replace values where your SNS ARN is required.

Usage: Assumes script is run on an EC2

`node index.js --config config-example.json --alarms sample-alarms.json`
