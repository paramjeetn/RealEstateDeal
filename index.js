const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client, GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const { getParsedEmail } = require("./genAi_func/email_parser.js");
require('dotenv').config();
const nodemailer = require('nodemailer');
const { format } = require('date-fns');
const exceljs = require('exceljs');
const stream = require('stream');


const app = express();
const PORT = 3000;
const TOKEN = process.env.REFRESH_TOKEN;
const spreadsheetId = '1wAWX4d6aEp1-WQW9Yy5yItpCdcjs68XtQUbjnXW6WTA';
const range = 'Sheet1!A1';

// console.log(TOKEN);

let oauth2Client;

// Load or create the OAuth2 client
if (TOKEN) {

  oauth2Client = new OAuth2Client(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URL,
  );
  oauth2Client.setCredentials({ refresh_token: TOKEN });
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
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets'
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
async function getDate() {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  lastDate = `${response.data.values[0][0]}`;
  console.log(lastDate);
  return lastDate;
}
async function writeDate(formattedLastDate) {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const values = [[formattedLastDate]];
  const response = sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    resource: { values },
  });
  console.log("changed last date");
  console.log(response)

}


app.get('/get-gmail-data', async (req, res) => {

  try {
    let lastStoredDateTime = await getDate();
    console.log(lastStoredDateTime, " ", typeof lastStoredDateTime);
    const gmail = google.gmail({ version: 'v1', auth: await oauth2Client });
    // console.log(gmail);
    let startDateInSeconds;

    if (lastStoredDateTime) {
      console.log("inside lastStoredDate")
      const [datePart, timePart] = lastStoredDateTime.split(' ');
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      // console.log(new Date().getTimezoneOffset() * 60000);
      const secTimeZone = (new Date().getTimezoneOffset() * 60000) / 1000;
      startDateInSeconds = Math.floor(new Date(lastStoredDateTime[0]).getTime() / 1000) + secTimeZone + (hours * 60 * 60) + (minutes * 60) + (seconds);
      // console.log(startDateInSeconds);
    } else {
      startDateInSeconds = null;
    }
    console.log("startdate", startDateInSeconds);

    let msgParam = {
      userId: 'me',

    };

    if (!startDateInSeconds) {
      msgParam.maxResults = 1;

    } else {
      msgParam.q = `in:all after:${startDateInSeconds}`;
    }

    const messages = await gmail.users.messages.list(msgParam);
    const result = [];
    const messageList = messages.data.messages;

    if (!messageList) {

      const currentDate = new Date(Date.now() - (new Date().getTimezoneOffset() * 60000));
      lastStoredDateTime = currentDate.toISOString();
      const formattedLastDate = lastStoredDateTime.slice(0, 19).replace('T', ' ');
      writeDate(formattedLastDate);



      res.send("No new mails received!");
    }
    else {

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
      writeDate(formattedLastDate);




      console.log("result", result);
      const filteredEmails = filterEmailsByKeywords(result);
      // console.log("filtered mails" , filteredEmails);
      if (filteredEmails.length > 0) {
        getParsedEmail(filteredEmails).then((propertyData) => {
          if (propertyData.length > 0) {
            console.log("got property data array from index.js", "\n");
            console.log("calling toxlsx");
            toxlsx(propertyData);
          }

        }).catch((error) => {
          console.error("Error fetching Gmail data:", error);
        });
      }
      else{
        res.send("No new Real Estate mails")
      }


      // console.log(filteredEmails);
      res.json(filteredEmails);
    }
  } catch (error) {
    console.error('Error fetching Gmail data:', error.message);
    res.status(500).send(`Error fetching Gmail data: ${error.message}`);
  }
});

async function toxlsx(propertyData) {
  console.log("inside to xlsx");
  const workbook = new exceljs.Workbook(); // Create a new workbook
  const worksheet = workbook.addWorksheet('Sheet1'); // Add a worksheet

  const headerRow = ['"Property Address", "Zip Code", "Wholesale Price (in $)", "After Repair Value - ARV (in $)", "Property Type", "Bedrooms", "Bathrooms", "Living Area (in sq ft)", "Notes"\n'];
  propertyData.unshift(headerRow);
  const csvLines = propertyData.join('');
  console.log('csv lines \n');

  const parsedCSV = [];
  csvLines.split('\n').forEach(line => {
    const cells = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim());

    parsedCSV.push(cells);
  });
  // console.log(parsedCSV);
  parsedCSV.forEach(row => {
    worksheet.addRow(row);
  });

  workbook.xlsx.writeBuffer().then(buffer => {
    saveToDrive(buffer);
    sendmail(buffer);
  }).catch(error => {
    console.error('Error generating XLSX buffer:', error);
  });
}

function filterEmailsByKeywords(emails) {
  const filteredEmails = [];
  const searchKeywords = ['bed', 'bath', 'family home', 'built in', 'sq.', 'ft.', 'beds', 'baths'];

  emails.forEach(email => {
    const words = email.body.toLowerCase().match(/\b\w+\b/g); // Match whole words

    // Check each word against searchKeywords
    if (words && words.some(word => searchKeywords.includes(word))) {
      filteredEmails.push(email);
    }
  });

  return filteredEmails;
}

async function saveToDrive(buffer) {
  console.log("inside save to drive email parser");
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const date_now = format(new Date(), "d MMMM yyyy h:mm a")
  const requestBody = {
    name: `Report_${date_now}.xlsx`,
    parents: ['1lKYJu_64v99Q49vXag9xH6ptCkVL-Y9j'],
    fields: 'id',

  };
  const media = {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: stream.Readable.from([buffer]),  //converts buffer to readable stream
  }
  try {
    const response = await drive.files.create({
      requestBody,
      media: media,
    });

    console.log('File created successfully:', response.data);
  } catch (error) {
    console.error('Error creating file in Google Drive:', error);
  }

}


async function sendmail(buffer) {
  console.log("inside sendmail");
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'paramjeetnpradhan@gmail.com',
      pass: `${process.env.EMAIL_PASS}`
    }
  });
  const date_now = format(new Date(), "d MMMM yyyy h:mm a")
  const mailOptions = {
    from: 'paramjeetnpradhan@gmail.com',
    to: 'realestate.yonata@gmail.com',
    subject: `Real Estate report for ${date_now} `,
    text: 'Real Estate Deal Report from YONATA',
    attachments: [
      {
        filename: `Report_${date_now}`,
        content: buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    ]
  };
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error);
      } else {
        resolve(info.response);
      }
    });
  });

}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
})