// Load environment variables from .env file
if (process.env.NODE_ENV !== "production")
    loadEnvironmentVariables();
function loadEnvironmentVariables() {
    let dotenv = require('dotenv');
    dotenv.load();
}
const token = process.env.MESSENGER_VALIDATION_TOKEN;

module.exports = [
    {
        time: new Date("2017-07-14T16:27"),
        json: {
            "token": token,
            "recipients":[],
            "messages": [
                {
                    "payload": {
                        "facebook": {
                            "attachment": {
                                "type": "template",
                                "payload": {
                                    "template_type": "generic",
                                    "image_aspect_ratio": "square",
                                    "elements": [
                                        {
                                            "title": "Profile Preview",
                                            "subtitle": "Test it, do it now!",
                                            "item_url": "",
                                            "image_url": "",
                                            "buttons": [
                                                {
                                                    "type": "web_url",
                                                    "title": "Profile",
                                                    "url": "https://push2aim.github.io/profile/",
                                                    "webview_height_ratio": "compact",
                                                    "messenger_extensions": true
                                                }
                                            ]
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    "type": 4
                }
            ]
        }
    },
];