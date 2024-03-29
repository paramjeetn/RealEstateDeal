const moment = require('moment-timezone');

// Get current time in PST
const pstTime = moment.tz('America/Los_Angeles');
console.log("Current time in PST:", pstTime.format());

// Convert PST time to UTC
const utcTime = pstTime.utc();
console.log("Converted to UTC:", utcTime.format());

// Convert UTC time to epoch time
const epochTime = utcTime.valueOf();
console.log("Epoch time:", epochTime);































