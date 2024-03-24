const fs = require('fs');
const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client, GoogleAuth } = require('google-auth-library');
const cron = require('node-cron');
const axios = require('axios');
const { readLastDate } = require("./timefunc/time.js");
const Anthropic = require("@anthropic-ai/sdk");
const { getParsedEmail } = require("./genAi_func/email_parser.js");
const credentials = require('./credentials.json');


const app = express();
const PORT = 3000;

const TOKEN_PATH = 'token.json';
const LAST_DATE_PATH = 'lastDate.json';

let oauth2Client;

// Load or create the OAuth2 client
if (fs.existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oauth2Client = new OAuth2Client(
        credentials.installed.client_id,
        credentials.installed.client_secret,
        credentials.installed.redirect_uris,
    );
    oauth2Client.setCredentials(tokens);
} else {
    console.error('OAuth2 token not found. Please authenticate using /auth endpoint.');
    process.exit(1);
}

app.get("/", (req, res) => {
    res.send("Hello, you are welcome!");
});

app.get('/auth', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/drive'
        ],
    });
    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials({ tokens });
        console.log(tokens);

        const refreshToken = tokens.refresh_token;
        if (refreshToken) {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify({ refresh_token: refreshToken }));
            res.send('Refresh token saved successfully!');
        }
        else {
            res.send('Authentication successful! You can now use the stored refresh token.');
        }

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).send(`Error decoding token: ${error.message}`);
    }
});


const endpointUrl = "http://localhost:3000/get-gmail-data";
async function fetchData() {
    try {
        const response = await axios.get(endpointUrl);
        console.log('Response from the endpoint:', response.data);
    } catch (error) {
        console.error('Error calling the endpoint:', error.message);
    }
}


let lastStoredDateTime = readLastDate();


app.get('/get-gmail-data', async (req, res) => {
    try {
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });


        let startDateInSeconds;

        if (lastStoredDateTime && lastStoredDateTime.length === 2) {
            const [datePart, timePart] = lastStoredDateTime;
            const [hours, minutes, seconds] = timePart.split(':').map(Number);

            // console.log(new Date().getTimezoneOffset() * 60000);

            const secTimeZone = (new Date().getTimezoneOffset() * 60000) / 1000;
            startDateInSeconds = Math.floor(new Date(lastStoredDateTime[0]).getTime() / 1000) + secTimeZone + (hours * 60 * 60) + (minutes * 60) + (seconds);
            // console.log(startDateInSeconds);
        } else {
            startDateInSeconds = null;
        }
        console.log(startDateInSeconds);

        let msgParam = {
            userId: 'me',

        };

        if (!startDateInSeconds) {
            msgParam.maxResults = 1;

        } else {
            msgParam.q = `after:${startDateInSeconds}`;
        }

        const messages = await gmail.users.messages.list(msgParam);
        const result = [];
        const messageList = messages.data.messages;

        if (!messageList) {

            const currentDate = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000));
            lastStoredDateTime = currentDate.toISOString();
            const formattedLastDate = lastStoredDateTime.slice(0, 19).replace('T', ' ');

            fs.writeFileSync(LAST_DATE_PATH, `"${formattedLastDate}"`);

            res.send("No new mails received!");
        } else {

            for (const message of messageList) {
                const messageDetails = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                });
                const messageBody = messageDetails.data.payload.parts && messageDetails.data.payload.parts[0].body && messageDetails.data.payload.parts[0].body.data;
                const decodedMessageBody = messageBody ?
                    Buffer.from(messageDetails.data.payload.parts[0].body.data, 'base64').toString('utf-8').replace(/[\r\n]+/g, '') : '';


                const messageSnippet = messageDetails.data.snippet;

                // Extract sender's email address
                const senderEmail = messageDetails.data.payload.headers.find(header => header.name === 'From').value;

                // Extract sender's name (if available)
                const senderNameHeader = messageDetails.data.payload.headers.find(header => header.name === 'From');
                const senderName = senderNameHeader ? senderNameHeader.value.split('<')[0].trim() : '';
                const messageInfo = {
                    messageId: message.id,
                    senderEmail: senderEmail,
                    senderName: senderName,
                    snippet: messageSnippet,
                    body: decodedMessageBody,

                };
                result.push(messageInfo);
            }

            const currentDate = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000));
            lastStoredDateTime = currentDate.toISOString();
            const formattedLastDate = lastStoredDateTime.slice(0, 19).replace('T', ' ');

            fs.writeFileSync(LAST_DATE_PATH, `"${formattedLastDate}"`);

            //console.log(result);
            const filteredEmails = filterEmailsByKeywords(result);
            console.log(filteredEmails);
            await getParsedEmail(filteredEmails)
                .then(async () => {
                    await saveToDrive();

                });
            // console.log(filteredEmails);
            res.json(filteredEmails);
        }
    } catch (error) {
        console.error('Error fetching Gmail data:', error.message);
        res.status(500).send(`Error fetching Gmail data: ${error.message}`);
    }
});
async function saveToDrive() {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    let last_date = readLastDate()
    const requestBody = {
        name: `Report_${last_date}.xlsx`,
        parents: ['1lKYJu_64v99Q49vXag9xH6ptCkVL-Y9j'],
        fields: 'id',

    };
    const media = {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: fs.createReadStream('output.xlsx')
    }
    drive.files.create({
        requestBody,
        media: media,
    }
    );


}

function filterEmailsByKeywords(emails) {
    const filteredEmails = [];
    const searchKeywords = ['Bed', 'Bath', 'family home', 'Built in', '$', 'sq. ft', 'Beds', 'Baths'];

    emails.forEach(email => {
        if (searchKeywords.some(searchKeywords => email.body.toLowerCase().includes(searchKeywords.toLowerCase()))) {
            filteredEmails.push(email);
        }
    });

    return filteredEmails;
}

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
})
