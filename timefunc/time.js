const fs = require("fs");
const LAST_DATE_PATH = 'lastDate.json';

const readLastDate = () => {
    if (fs.existsSync(LAST_DATE_PATH)) {
        const dateStr = JSON.parse(fs.readFileSync(LAST_DATE_PATH));
        if (!dateStr) return ['', '']; 
        
        else{
            const [datePart, timePart] = dateStr.split(' '); 
            return [datePart, timePart];
        }
        
    } else {
        console.log(`Last date file (${LAST_DATE_PATH}) not found. Using default date.`);
        return ['', '']; 
    }
    
}

module.exports = { readLastDate };
