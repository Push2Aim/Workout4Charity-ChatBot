/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
//'use strict';

const
    bodyParser = require('body-parser'),
    crypto = require('crypto'),
    express = require('express'),
    https = require('https'),
    request = require('request'),
    apiAI = require('apiai'),
    async = require('async');
const db = require("./server/db.js");
const profileBuilder = require("./server/profileBuilder.js");

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({verify: verifyRequestSignature}));
app.use(express.static('public'));

// Load environment variables from .env file
if (process.env.NODE_ENV !== "production")
    loadEnvironmentVariables();
function loadEnvironmentVariables() {
    let dotenv = require('dotenv');
    dotenv.load();
}

var dashbot = require('dashbot')(process.env.DASHBOT_API_KEY).facebook;

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET);

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN);

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN);

// URL where the app is running (include protocol). Used to point to scripts and 
// assets located at this address. 
const SERVER_URL = (process.env.SERVER_URL);

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
    console.error("Missing config values");
    process.exit(1);
}

wakeUp(process.env.ADDRESSES.split(","));
function wakeUp(addresses) {
    try {
        addresses.map((uri) => {
            request({
                    method: 'GET',
                    uri: uri
                },
                function (error, response) {
                    if (error) {
                        console.error('Error while userInfoRequest: ', error);
                    } else {
                        console.log(uri + ' result: ', response.body);
                    }
                });
        });
    } catch (err) {
        console.error("caught Error at wakeUp(%s):", addresses, err);
    }
}
let sendMessagesToIDs = function (ids, messages, url) {
    console.log("send Messages to IDs", ids, messages);
    return new Promise((resolve, reject) => {
        ids.forEach(senderID => {
            sendMessages(senderID, messages, null, url, (id, err) => reject(err), resolve);
        })
    })
};
let isValidatedRequest = function (req, res) {
    if (req.body.token !== VALIDATION_TOKEN) {
        res.status(400).json({error: "wrong Token"});
        console.log("wrong Token:", req.body.token);
        return false;
    }
    return true;
};
app.post('/subscription', function (req, res) {
    try {
        console.log("/subscripiton", req.body);
        if (!isValidatedRequest(req, res)) return;

        let messages = req.body.messages;
        let selectors = req.body.selectors;
        db.getAllIDs(selectors)
            .then(ids => sendMessagesToIDs(ids, messages, req.headers.host))
            .then(ids => res.json({recipients: ids, success: true}))
            .catch(err => res.status(500).json({error: err}));
    } catch (err) {
        console.error("caught Error at /subscription with req: %s; res: %s :", req.body, res, err);
    }
});

app.post('/send', function (req, res) {
    try {
        console.log("/send", req.body);
        if (!isValidatedRequest(req, res)) return;

        let messages = req.body.messages;
        let recipients = req.body.recipients;
        sendMessagesToIDs(recipients, messages, req.headers.host)
            .then(ids => res.json({recipients: ids, success: true}))
            .catch((err) => {
                console.error("Error on /send", err);
                res.status(500).json({error: err})
            });
    } catch (err) {
        console.error("caught Error at /send with req: %s; res: %s :", req.body, res, err);
    }
});

let pausedUsers = {};

function pauseUser(userId, paused) {
    pausedUsers[userId] = paused;
    console.log(userId, paused, pausedUsers);
}

app.post('/pause', function (req, res) {
    try {
        pauseUser(req.body.userId, req.body.paused);
        res.send("ok");
    } catch (err) {
        console.error("caught Error at /pause with req: %s; res: %s :", req.body, res, err);
    }
});

let xpToken = {};
app.post('/xp', function (req, res) {
    try {
        let data = xpToken[req.body.token];
        console.log("/xp", req.body.token, data);
        db.addXp(data.userId, data.context, req.body.type || "drill")
            .then(xp => res.json({success: true}))
            .catch((err) => {
                console.error("Error on /xp", err);
                res.status(500).json({error: err})
            });
        res.send("ok");
    } catch (err) {
        console.error("caught Error at /xp with req: %s; res: %s :", req.body, res, err);
    }
});

function buildToken(userId = 0, duration) {
    let token = userId + new Date();
    try {
        xpToken[token] = {
            userId: userId,
            context: {xp: duration * 10}
        };
    console.log("buildToken", token, xpToken[token]);
    } catch (err) {
        console.error("Error on buildToken", err);
    }
    return token;
}
/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */


app.get('/webhook', function (req, res) {
    try {
        if (req.query['hub.mode'] === 'subscribe' &&
            req.query['hub.verify_token'] === VALIDATION_TOKEN) {
            console.log("Validating webhook");
            res.status(200).send(req.query['hub.challenge']);
        } else {
            console.error("Failed validation. Make sure the validation tokens match.");
            res.sendStatus(403);
        }
    } catch (err) {
        console.error("caught Error at /webhook with req: %s; res: %s :", req.body, res, err);
    }
});
/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */

app.post('/webhook', function (req, res) {
    try {
        dashbot.logIncoming(req.body);

        var data = req.body;

        // Make sure this is a page subscription
        if (data.object == 'page') {
            // Iterate over each entry
            // There may be multiple if batched
            data.entry.forEach(function (pageEntry) {
                var pageID = pageEntry.id;
                var timeOfEvent = pageEntry.time;

                // Iterate over each messaging event
                pageEntry.messaging.forEach(function (messagingEvent) {
                    if (messagingEvent.optin) {
                        receivedAuthentication(messagingEvent);
                    } else if (messagingEvent.postback) {
                        receivedPostback(messagingEvent, req.headers.host);
                    } else if (messagingEvent.message) {
                        receivedMessage(messagingEvent);
                    } else if (messagingEvent.delivery) {
                        receivedDeliveryConfirmation(messagingEvent);
                    } else if (messagingEvent.read) {
                        receivedMessageRead(messagingEvent);
                    } else if (messagingEvent.account_linking) {
                        receivedAccountLink(messagingEvent);
                    } else {
                        console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                    }
                });
            });

            // Assume all went well.
            //
            // You must send back a 200, within 20 seconds, to let us know you've
            // successfully received the callback. Otherwise, the request will time out.
            res.sendStatus(200);
        }
    } catch (err) {
        console.error("caught Error at /webhook with req: %s; res: %s :", req.body, res, err);
    }
});
/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL. 
 * 
 */

app.get('/authorize', function (req, res) {
    try {
        var accountLinkingToken = req.query.account_linking_token;
        var redirectURI = req.query.redirect_uri;

        // Authorization Code should be generated per user by the developer. This will
        // be passed to the Account Linking callback.
        var authCode = "1234567890";

        // Redirect users to this URI on successful login
        var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

        res.render('authorize', {
            accountLinkingToken: accountLinkingToken,
            redirectURI: redirectURI,
            redirectURISuccess: redirectURISuccess
        });
    } catch (err) {
        console.error("caught Error at /authorize with req: %s; res: %s :", req.body, res, err);
    }
});
/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */

function verifyRequestSignature(req, res, buf) {
    var signature = req.headers["x-hub-signature"];

    if (!signature) {
        // For testing, let's log an error. In production, you should throw an
        // error.
        console.error("Couldn't validate the signature.");
        // throw new Error("Couldn't validate the signature.");
    } else {
        var elements = signature.split('=');
        var method = elements[0];
        var signatureHash = elements[1];

        var expectedHash = crypto.createHmac('sha1', APP_SECRET)
            .update(buf)
            .digest('hex');

        if (signatureHash != expectedHash) {
            // throw new Error("Couldn't validate the request signature.");
        }
    }
}
/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */

function receivedAuthentication(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfAuth = event.timestamp;

    // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
    // The developer can set this to an arbitrary value to associate the
    // authentication callback with the 'Send to Messenger' click event. This is
    // a way to do account linking when the user clicks the 'Send to Messenger'
    // plugin.
    var passThroughParam = event.optin.ref;

    console.log("Received authentication for user %d and page %d with pass " +
        "through param '%s' at %d", senderID, recipientID, passThroughParam,
        timeOfAuth);

    // When an authentication is received, we'll send a message back to the sender
    // to let them know it was successful.
    sendTextMessage(senderID, "Authentication successful");
}

function makeQuickReply(payload) {
    try {
        if (payload) {
            let actionSplit = payload.toLowerCase().split("_");
            switch (actionSplit[0]) {
                case "pause":
                    return pauseUser(actionSplit[1], true);
                case "continue":
                    return pauseUser(actionSplit[1], false);
            }
        }
    } catch (err) {
        console.error("caught Error on makeQuickReply(%s):", JSON.stringify(payload), err);
    }
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've
 * created. If we receive a message with an attachment (image, video, audio),
 * then we'll simply confirm that we've received the attachment.
 *
 */
function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    if (pausedUsers[senderID]) return console.log("paused", senderID, message);

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        // Just logging message echoes to console
        console.log("Received echo for message %s and app %d with metadata %s",
            messageId, appId, metadata);
    } else if (quickReply) {
        var quickReplyPayload = quickReply.payload;
        console.log("Quick reply for message %s with payload %s",
            messageId, quickReplyPayload);
        makeQuickReply(quickReplyPayload);
        sendTextRequest(senderID, messageText);
    }
    else if (messageText) {
        sendTextRequest(senderID, messageText);
    } else if (messageAttachments) {
        //ThumbsUpSticker: {"mid":"mid.1483466706080:70a65f8088","seq":48327,"sticker_id":369239263222822,"attachments":[{"type":"image","payload":{"url":"https://scontent.xx.fbcdn.net/t39.1997-6/851557_369239266556155_759568595_n.png?_nc_ad=z-m","sticker_id":369239263222822}}]}
        sendEventRequest(senderID, "RANDOM_STUFF");
    }
}
// exports.sendEventRequest = sendEventRequest;
function sendEventRequest(senderID, eventName, url) {
    let event = {
        name: eventName,
        data: {}
    };

    buildApiAiRequestOptions(senderID)
        .then(options => {
            var request = apiAI(process.env.API_AI_ACCESS_TOKEN)
                .eventRequest(event,options);
            sendApiAiRequest(request, senderID, url);
        }).catch(err => console.error(err));
}
// exports.sendTextRequest = sendTextRequest;
function buildApiAiRequestOptions (senderID) {
    return userInfoRequest(senderID)
        .then((userInfo) => db.getProfile(senderID)
            .then(userProfile => ({
                sessionId: senderID,
                contexts: [
                    {
                        name: "userInfo",
                        parameters: userInfo
                    },
                    {
                        name: "userProfile",
                        parameters: userProfile
                    },
                ]
            }))).catch(err => console.error(err));
}
function sendTextRequest(senderID, message, url = "") {
    buildApiAiRequestOptions(senderID)
        .then(options => {
            var request = apiAI(process.env.API_AI_ACCESS_TOKEN)
                .textRequest(message, options);
            sendApiAiRequest(request, senderID, url);
        }).catch(err => console.error(err));
}

function userInfoRequest(userId) {
    return new Promise((resolve, reject) => {
        request({
                method: 'GET',
                uri: "https://graph.facebook.com/v2.6/" + userId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + PAGE_ACCESS_TOKEN
            },
            function (error, response) {
                if (error) {
                    console.error('Error while userInfoRequest: ', error);
                    reject(error);
                } else {
                    console.log('userInfoRequest result: ', response.body);
                    let userInfo = JSON.parse(response.body);
                    userInfo.fb_id = userId;
                    resolve(userInfo);
                }
            });
    });
}
function takeAction(response) {
    let extractProfile = contexts => contexts
        .find(context => context.name === "userprofile").parameters;
    let updateProfile = response =>
        db.updateProfile(response.sessionId, extractProfile(response.result.contexts));
    let addProfile = response =>
        db.addProfile(response.sessionId, extractProfile(response.result.contexts));

    function addXP(sessionId, type, amount) {
        db.addXp(sessionId, {xp: amount}, type)
    }

    try {
        if (response && response.result && response.result.action) {
            let actionSplit = response.result.action.toLowerCase().split("_");
            switch (actionSplit[0]) {
                case "updateprofile":
                    return updateProfile(response);
                case "addprofile":
                    return addProfile(response);
                case "xp":
                    return addXP(response.sessionId, actionSplit[1], actionSplit[2]);
                case "notify":
                    return notify(actionSplit[1], response);
            }
        }
    } catch (err) {
        console.error("caught Error on takeAction(%s):", JSON.stringify(response), err);
    }
}

function notify(recipientId, response) {
    function sendMessage(recipientId, message) {
        sendGenericMessage(recipientId, message);
    }

    function makeMessage(title) {
        return {
            title: title,
            buttons: [
                {
                    text: "Pause",
                    postback: "PAUSE_" + response.sessionId
                },
                {
                    text: "Resume",
                    postback: "RESUME_" + response.sessionId
                }
            ]
        };
    }

    return userInfoRequest(response.sessionId)
        .then((userInfo) =>
            sendMessage(recipientId,
                makeMessage(userInfo.first_name + " " + userInfo.last_name + " requested you in HebBuddy")))
        .catch(err => {
            console.error(err);
            return sendMessage(recipientId,
                makeMessage(response.sessionId + " requested you in HeyBuddy"));
        });
    }

function sendApiAiRequest(request, senderID, url) {
    sendTypingOn(senderID);

    request.on('response', function (response) {
        console.log("ApiAi Response: ", JSON.stringify(response));
        takeAction(response);
        let messages = response.result.fulfillment.data && response.result.fulfillment.data.distributor ?
            response.result.fulfillment.data.distributor : response.result.fulfillment.messages;
        if (messages)
            sendMessages(senderID, messages, response, url);
        else sendSpeech(senderID, response.result.fulfillment.speech);
    });

    request.on('error', function (error) {
        console.error("Error on sendApiAiRequest", error);
        sendTextMessage(senderID, "Ups, something went wrong: \n" + error);
    });
    request.end();
}

function sendSpeech(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData);
}
function sendMessages(senderID, messages, response, url, reject = sendTextMessage, resolve) {
    resolve = resolve || function (mes, id, messages) {
            return console.log(mes, id, messages)
        };
    async.eachOfSeries(messages, (message, index, callback) => {
        var timeOut = index == messages.length - 1 ? -1 : 0;
        switch (message.type) {
            case -1:
                takeABreak(senderID, callback, message.rest);
                break;
            case 0:
                sendTextMessage(senderID, message.speech, callback, timeOut);
                break;
            case 1:
                sendGenericMessage(senderID, message, callback, timeOut, response, url);
                break;
            case 2:
                sendQuickReply(senderID, message, mapQickReplies, callback, timeOut);
                break;
            case 3:
                sendImageMessage(senderID, message.imageUrl, callback, timeOut);
                break;
            case 4:
                sendCustomPayload(senderID, message.payload.facebook, callback, timeOut);
                break;
        }
    }, error => {
        if (error) reject(senderID, "Ups, something went wrong: \n" + error);
        else resolve("Successful sendMessages", senderID, messages);
    });
}
/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */


function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;

    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            console.log("Received delivery confirmation for message ID: %s",
                messageID);
        });
    }

    console.log("All message before %d were delivered.", watermark);
}
/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event, url) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

    try {
        if (payload) {
            let actionSplit = payload.toUpperCase().split("_");
            switch (actionSplit[0]) {
                case "PROFILE":
                    return sendProfile(senderID, payload, url);
                case "PAUSE":
                    return pauseUser(actionSplit[1], true);
                case "RESUME":
                    return pauseUser(actionSplit[1], false);
                default:
                    sendEventRequest(senderID, payload, url);
            }
        }
    } catch (err) {
        console.error("caught Error on receivedPostback(%s, %s):",
            JSON.stringify(event), JSON.stringify(url), err);
    }
}

function sendProfile(senderID, payload, url) {
    return userInfoRequest(senderID)
        .then((userInfo) => profileBuilder(senderID)
            .then(userProfile => ({
                title: "Your Profile",
                subtitle: "share it now!",
                webview_share_button: "hide",
                buttons: [
                    {
                        text: "view Profile",
                        postback: "https://push2aim.github.io/profile/?userInfo="
                        + userInfo + "&userProfile=" + userProfile
                    }
                ]
            }))
        )
        .then(message => sendGenericMessage(senderID, message))
        .catch(err => {
            sendEventRequest(senderID, payload, url);
            return console.error(err);
        })
}
/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */

function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;

    console.log("Received message read event for watermark %d and sequence " +
        "number %d", watermark, sequenceNumber);

    wakeUp(process.env.ADDRESSES.split(","));
}
/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */

function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log("Received account link event with for user %d with status %s " +
        "and auth code %s ", senderID, status, authCode);
}
/*
 * Send an image using the Send API.
 *
 */

function sendImageMessage(recipientId, url, callback, timeOut) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: url
                }
            }
        }
    };

    callSendAPI(messageData, callback, timeOut);
}

function sendCustomPayload(recipientId, payload, callback, timeOut) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: payload.attachment
        }
    };

    callSendAPI(messageData, callback, timeOut);
}
/*
 * Send a Gif using the Send API.
 *
 */

function sendGifMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: SERVER_URL + "/assets/instagram_logo.gif"
                }
            }
        }
    };

    callSendAPI(messageData);
}
/*
 * Send audio using the Send API.
 *
 */

function sendAudioMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "audio",
                payload: {
                    url: SERVER_URL + "/assets/sample.mp3"
                }
            }
        }
    };

    callSendAPI(messageData);
}
/*
 * Send a video using the Send API.
 *
 */

function sendVideoMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "video",
                payload: {
                    url: SERVER_URL + "/assets/allofus480.mov"
                }
            }
        }
    };

    callSendAPI(messageData);
}
/*
 * Send a file using the Send API.
 *
 */

function sendFileMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "file",
                payload: {
                    url: SERVER_URL + "/assets/test.txt"
                }
            }
        }
    };

    callSendAPI(messageData);
}
/*
 * Send a text message using the Send API.
 *
 */

function sendTextMessage(recipientId, messageText, callback, timeOut) {
    messageText = messageText.split(" action: ")[0];
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText,
            metadata: "DEVELOPER_DEFINED_METADATA"
        }
    };

    callSendAPI(messageData, callback, timeOut);
}
/*
 * Send a button message using the Send API.
 *
 */

function sendButtonMessage(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "This is test text",
                    buttons: [{
                        type: "web_url",
                        url: "https://www.oculus.com/en-us/rift/",
                        title: "Open Web URL"
                    }, {
                        type: "postback",
                        title: "Trigger Postback",
                        payload: "DEVELOPER_DEFINED_PAYLOAD"
                    }, {
                        type: "phone_number",
                        title: "Call Phone Number",
                        payload: "+16505551234"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}
/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId, message, callback, timeOut, response, url) {
    let duration = response ? response.result.parameters.duration || 0 : 0;
    let amount = duration ? duration.amount : 30;
    let ratio = "compact";
    if (response && response.result && response.result.action) {
        let split = response.result.action.split(":");
        ratio = split[0] == "webview_height_ratio" ? split[1] : "compact";
    }

    function buildXpData() {
        return "&token=" + buildToken(recipientId, amount)
            + "&url=" + url;
    }

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    image_aspect_ratio: "square",
                    elements: [{
                        title: message.title.replace("$duration.amount", amount),
                        subtitle: message.subtitle,
                        // item_url: "https://push2aim.com",
                        image_url: message.imageUrl || "https://jspicgen.herokuapp.com/?type=WYN&duration=" + amount,
                        buttons: message.buttons.map(btn => {
                            if (btn.postback)
                            if (btn.postback.startsWith("+")) {
                                return ({
                                    type: "phone_number",
                                    title: btn.text,
                                    payload: btn.postback
                                });
                            } else if (btn.postback.startsWith("https://") || btn.postback.startsWith("http://")) {
                                let url = btn.postback.replace("http://", "https://");
                                if (url.startsWith("https://push2aim.github.io/webview/?duration="))
                                    url += buildXpData();

                                return ({
                                    type: "web_url",
                                    title: btn.text,
                                    url: url,
                                    webview_height_ratio: ratio,
                                    messenger_extensions: true,
                                });
                            }else if (!btn.postback || btn.postback.length === 0) {
                                return ({
                                    type: "web_url",
                                    title: btn.text,
                                    url: "https://push2aim.github.io/webview/?duration=" + amount + buildXpData(),
                                    webview_height_ratio: "compact",
                                    messenger_extensions: true,
                                });
                            } else if (btn.postback === "element_share") {
                                return ({
                                    type: "element_share"
                                });
                            }
                            return ({
                                type: "postback",
                                title: btn.text,
                                payload: btn.postback
                            });
                        })
                    }]
                }
            }
        }
    };

    callSendAPI(messageData, callback, timeOut);
}

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: "Peter Chang",
                    order_number: receiptId,
                    currency: "USD",
                    payment_method: "Visa 1234",
                    timestamp: "1428444852",
                    elements: [{
                        title: "Oculus Rift",
                        subtitle: "Includes: headset, sensor, remote",
                        quantity: 1,
                        price: 599.00,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/riftsq.png"
                    }, {
                        title: "Samsung Gear VR",
                        subtitle: "Frost White",
                        quantity: 1,
                        price: 99.99,
                        currency: "USD",
                        image_url: SERVER_URL + "/assets/gearvrsq.png"
                    }],
                    address: {
                        street_1: "1 Hacker Way",
                        street_2: "",
                        city: "Menlo Park",
                        postal_code: "94025",
                        state: "CA",
                        country: "US"
                    },
                    summary: {
                        subtotal: 698.99,
                        shipping_cost: 20.00,
                        total_tax: 57.67,
                        total_cost: 626.66
                    },
                    adjustments: [{
                        name: "New Customer Discount",
                        amount: -50
                    }, {
                        name: "$100 Off Coupon",
                        amount: -100
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId, message, map = mapQickReplies, callback = null, timeOut = -1) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: message.title,
            quick_replies: message.replies.map(map)
        }
    };

    callSendAPI(messageData, callback, timeOut);
}

function mapQickReplies(title, payload = "DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION") {
    let split = title.split("http");
    let url = split.length >= 2 ? "http" + split[1] : "";
    return ({
        "content_type": "text",
        "title": split[0],
        "payload": payload,
    });
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
    console.log("Sending a read receipt to mark message as seen");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
    console.log("Turning typing indicator on");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };

    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
    console.log("Turning typing indicator off");

    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "Welcome. Link your account.",
                    buttons: [{
                        type: "account_link",
                        url: SERVER_URL + "/authorize"
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
let takeABreak = function (senderID, callback, timeOut) {
    sendTypingOn(senderID);
    setTimeout(callback, timeOut);
};

let attachments = {};

function minimizeAttachment(messageData) {
    if (messageData.message && messageData.message.attachment && messageData.message.attachment.type !== "template") {
        if (messageData.message.attachment && attachments[messageData.message.attachment])
            messageData.message.attachment.payload =
            {
                attachment_id: attachments[JSON.stringify(messageData.message.attachment)]
            };
        else messageData.message.attachment.payload.is_reusable = true;
    }
    return messageData;
}

function callSendAPI(messageData, callback, timeOut) {
    let requestData = {
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: minimizeAttachment(messageData)
    };

    function fromPicgen() {
        try {
            console.log("fromPicgen url:",messageData.message.attachment.payload.url);
            return messageData.message.attachment.payload.url.includes("picgen");
        } catch (err) {
            return false;
        }
    }

    request(requestData, (error, response, body) => {
        dashbot.logOutgoing(requestData, response.body);

        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;
            var attachmentId = body.attachment_id;

            if (messageId) {
                console.log("Successfully sent message with id %s to recipient %s",
                    messageId, recipientId);
                if(attachmentId && !fromPicgen()){
                    console.log("save attachment_id:", attachmentId);
                    attachments[JSON.stringify(messageData)] = attachmentId;
                }

                if (timeOut >= 0) {
                    let senderID = messageData.recipient.id;
                    takeABreak(senderID, callback, timeOut);
                } else callback;

            } else {
                console.log("Successfully called Send API for recipient %s",
                    recipientId);
            }
        } else {
            try {
                callback(new Error("Failed calling Send API " + response.statusCode + " " +
                    response.statusMessage + " " + JSON.stringify(body.error) +
                    " messageData: " + JSON.stringify(messageData)));
            } catch (err) {
                callback;
            }
        }
    });
}

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid 
// certificate authority.
app.listen(app.get('port'), function () {
    console.log('Node app is running on port', app.get('port'));
});

module.exports = app;