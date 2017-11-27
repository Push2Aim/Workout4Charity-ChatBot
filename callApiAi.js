var apiai = require('apiai');
var dotenv = require('dotenv');
// Load environment variables from .env file
dotenv.load();
const API_AI_ACCESS_TOKEN = process.env.API_AI_ACCESS_TOKEN;

var app = apiai(API_AI_ACCESS_TOKEN);//<your client access token>

var message = "error";
var sessionId = "0987654321";

var request = app.textRequest(message, {
    sessionId: sessionId
});

request.on('response', function (response) {
    console.log(response.result.fulfillment.messages);
});

request.on('error', function (error) {
    console.log(error);
});
request.end();

