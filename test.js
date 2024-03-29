const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Africa/Abidjan' });
const lastStoredDateTime = new Date(currentDate);
const year = lastStoredDateTime.getFullYear();
const month = String(lastStoredDateTime.getMonth() + 1).padStart(2, '0');
const day = String(lastStoredDateTime.getDate()).padStart(2, '0');
const hours = String(lastStoredDateTime.getHours()).padStart(2, '0');
const minutes = String(lastStoredDateTime.getMinutes()).padStart(2, '0');
const seconds = String(lastStoredDateTime.getSeconds()).padStart(2, '0');
const formattedLastDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
const values = [[formattedLastDate]];

console.log("changed last date");
console.log(formattedLastDate)
