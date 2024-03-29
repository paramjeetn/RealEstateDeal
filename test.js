app.get('/get-gmail-data', async (req, res) => {

    try {
      const gmail = google.gmail({ version: 'v1', auth: await oauth2Client });
      let startDateInSeconds= await getDate();

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
          res.json(filteredEmails);
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
          res.send("No Real estate mails received!");
        }
  
  
        // console.log(filteredEmails);
        // res.json(filteredEmails);
      }
    } catch (error) {
      console.error('Error fetching Gmail data:', error.message);
      res.status(500).send(`Error fetching Gmail data: ${error.message}`);
    }
  });
  





























