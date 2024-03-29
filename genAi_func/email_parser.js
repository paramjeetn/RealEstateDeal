// const fs = require('fs');
const Anthropic = require("@anthropic-ai/sdk");
// const XLSX = require('xlsx');
require('dotenv').config({ path: '../.env' });
// const {  saveToDrive }= require("../index")



async function getParsedEmail(emails) {
  console.log("inside gen ai");


  const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_KEY
  });


  async function main(email) {
    console.log("inside main");
    const jsonString = JSON.stringify(email);
    const characterCount = jsonString.length;
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: `${characterCount}`,
        messages: [
          { role: "user", content: createPrompt(email) }
        ]
      });

      console.log('this is res', response);
      return response.content[0].text;
    } catch (error) {
      console.error('Error:', error);
      return null;
    }
  }


  function createPrompt(body) {
    console.log("inside create prompt");
    const prompt = `
      ##################### Start Instructions
    
      Objective: Transform raw property data into a structured tabular format, with each attribute as a separate column in this table.
    
      Use the same instructions to parse multiple texts entered on the prompt in the same session
    
      Parsing Instructions:
    
      Extract Core Attributes: For each property, extract the following core attributes:
    
      Property Address (Include Property Address within "", example "124 main st, san jose CA, 95051")
    
      Zip Code (first 5 digits only), Zip code is typically last 5 digits of the address, example in the following address “1234 Main St, Miami FL 33024” 33024 is the zip code. Sometimes there is a “,” after “FL”
    
      "Wholesale Price (in $)" (output the number without commas)
    
      "After Repair Value - ARV (in $)" (output the number without commas)
    
      Property Type (e.g., Single Family, Duplex, Condo, Multi-Family)
    
      Bedrooms (Always an integer)
    
      Bathrooms
    
      Living Area (in sq ft) (output the number without commas)
    
      Incorporate 'Notes' Field:
    
      Include a 'Notes' column for each home address for additional information or remarks that do not fit into the standard attributes.
    
      Be sure to list exhaustive notes with as much detail as possible.
    
      Mark Unavailable Data:
    
      Indicate with "Not Found" or a similar placeholder where specific data points are unavailable or cannot be inferred from the provided information.
    
      General Guidelines:
    
      Draw a table with columns as described above separated by ","
    
      DO NOT STOP until entire text is parsed
    
      Wholesale Price is sometimes after words "Asking Price",or "Asking", or "Reduced"
    
      When encountering ambiguous data, assess context clues from the entire dataset to make the most logical inference.
    
      For unclear numerical data (e.g., "4/2 1480sf"), break it down systematically: first, interpret bedroom/bathroom count, then square footage.
    
      If property type is not mentioned, use property features (like the number of units in a duplex) to determine it.
    
      Utilize the 'Notes' field for any uncertainties or additional details that might require further clarification or are noteworthy.
    
      Extract all property-related attributes, especially infer the number of bedrooms, bathrooms, and sq ft area attributes.
    
      Any additional textual information can be captured in a "Notes" field.
    
      STOP reading when you see the next property address or some other information.
    
      For Bedrooms and Bathrooms, follow these guidelines for interpretation:
    
      "Duplex, Both Units: 1 Bed / 1 Bath" ==> 2 Bedrooms, 2 Bathrooms
    
      "Bed/Bath: 2/1" ==> 2 Bedrooms, 1 Bathroom
    
      "4/2 1480sf" ==> 4 Bedrooms, 2 Bathrooms
    
      "Condo 2/2" ==> 2 Bedrooms, 2 Bathrooms
    
      "2/1 + Efficiency" ==> 3 Bedrooms, 2 Bathrooms
    
      "2/1 + 1/1" ==> 3 Bedrooms, 2 Bathrooms
    
      "3 Bedrooms / 2 Bathrooms" ==> 3 Bedrooms, 2 Bathrooms
    
      "2 Beds / 2 Baths / Garage" ==> 2 Bedrooms, 2 Bathrooms
    
      ##################### End Instructions
    
      [data]
      ${body}
        `;
    return prompt.trim();
  }

  async function processEmails(emails) {
    try {
      const propertyData = [];

      for (const email of emails) {
        const result = await main(email);
        if (result) {
          // Process the result and add it to propertyData
          // Same processing as before...

          // Process the result
          const responseLines = result.split('\n');
          const propertyAddressIndex = responseLines.findIndex(line => line.includes("Property Address", "Zip Code", "Wholesale Price (in $)", "After Repair Value - ARV (in $)", "Property Type", "Bedrooms", "Bathrooms", "Living Area (in sq ft)", "Notes"));
          const filteredLines = responseLines.slice(propertyAddressIndex + 1);
          filteredLines.forEach(line => propertyData.push(line + '\n'));
          console.log("email being processed in for loop");
        }
      }

      console.log('Email data processed.');
      return propertyData;
    } catch (error) {
      console.error('Error processing emails:', error);
      throw error;
    }
  }

  const values = emails.map(obj => obj.body);
  // console.log(values);


  return processEmails(values);

}

module.exports = { getParsedEmail };