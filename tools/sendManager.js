const request = require('request');
// Load environment variables from .env file
if (process.env.NODE_ENV !== "production")
    loadEnvironmentVariables();
function loadEnvironmentVariables() {
    let dotenv = require('dotenv');
    dotenv.load();
}

function send(json) {
    console.log("send:", json);
    let requestData = {
        uri: process.env.SERVER_URL + "/send",
        method: 'POST',
        json: json
    };
    request(requestData, (error, response, body) => {
        if (error)
            console.error(error);
        else console.log(response.body)
    });
}

function loop(messages) {
    if (messages.length <= 0) return;
    let now = new Date();
    console.log(now, messages);

    messages.filter((m) => m.time <= now).map(m => send(m.json));

    setTimeout(() => {
        loop(messages.filter((m) => m.time > now))
    }, 60000);
}

loop(require("./messages"));
