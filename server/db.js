const bookshelf = require('./bookshelf');
const User = require("./models/user");
const Profile = require("./models/profile");
const Workout = require("./models/workout");
const XpLog = require("./models/xplog");


module.exports = {
    updateProfile: updateProfile,
    addProfile: addProfile,
    getProfile: getProfile,
    getAllIDs: getAllIDs,
    addWorkout: addWorkout,
    getWorkouts: getWorkouts,
    addXp: addXp,
    getXps: getXps,
};
let addValues = function (from, to, keys) {
    keys.forEach(key => to[key] = from[key]);
    return to;
};
function getProfile(sessionId) {
    let parseUserProfile = function (profile = {}) {
        let userProfile = parsProfile(profile.attributes)
        userProfile = addValues(profile.attributes, userProfile, ["created_at", "updated_at"]);
        userProfile.workouts = profile.related("workout").toJSON();
        userProfile.xplogs = profile.related("xplog").toJSON();
        console.log("got Profile", userProfile);
        return userProfile
    };
    return fetchProfile(sessionId) //TODO catch required ERROR with addProfile
        .then(profile => profile === null ?
            addProfile(sessionId, {}).then(getProfile(sessionId)) :
            parseUserProfile(profile))
        .catch(err => console.error("getProfile", err));
}
function fetchProfile(sessionId, columns = '*') {
    return Profile.where({fb_id: sessionId})
        .fetch({withRelated: ['workout', 'xplog'], columns: columns}) //TODO Add require=true
        .catch(err => addProfile(sessionId));
}
function addProfile(sessionId, context) {
    if(!sessionId) return Promise.reject(new Error("no sessionID"));

    let info = parsProfile(context);
    info.fb_id = sessionId;
    return Profile.forge(info, {hasTimestamps: true}).save()
        .then(profile => console.log("added Profile", profile))
        .catch(err => console.error("addProfile", err))
}
function updateProfile(sessionId, context) {
    if (getValidationError(context))
        return Promise.reject(getValidationError(context));

    let buildUpdate = () => {
        let update = parsProfile(context);
        update.updated_at = new Date();
        return update;
    };

    return Profile.where({fb_id: sessionId}).fetch() //TODO add required and catch required ERROR with addProfile
        .then(profile => profile === null ?
            addProfile(sessionId, context) :
            profile.save(buildUpdate()))
        .then(profile => console.log("updated Profile", profile))
        .catch(err => console.error("updateProfile", err));
}
function parsProfile(context = {}) {
    return {
        "workout_level": context.workout_level,
        "xp": context.xp,
        "subscribed": context.subscribed,
        "user_goal": context.user_goal,

        xp_knowledge: context.xp_knowledge,
        xp_drill: context.xp_drill,
        xp_sharing: context.xp_sharing,
        xp_kindness: context.xp_kindness,
        xp_activeness: context.xp_activeness,
    }
}
function getValidationError(context) {
    if (Object.keys(context).length <= 0) return new Error("no Properties in context" + JSON.stringify(context));
    console.log("no ValidationError", context)
}
function whereWithArray(table, selector) {
    selector.forEach((cur) => cur.length === 2 ?
        table = table.where(cur[0], cur[1]) :
        table = table.where(cur[0], cur[1], cur[2])
    );
    return table;
}
function select(table, selector) {
    return (Array.isArray(selector) ?
        whereWithArray(table, selector) : table.where(selector));
}
function getAllIDs(selectors) {
    try {
        let out = selectors.map((selector) =>
            select(Profile, selector).fetchAll()
                .then(profiles => profiles.map(profile => profile.get("fb_id")))
        );

        return Promise.all(out).then(ids => {
            return ids.reduce((acc, cur) => {
                cur.forEach(id => acc.includes(id) ? acc : acc.push(id))
                return acc
            });
        }).catch(err => console.error("getAllIDs", err));
    } catch (err) {
        return Promise.reject("Error on getAllIDs: " + err)
    }
}

function parsWorkout(context = {}) {
    return {
        duration: context.duration || 30,
        location: context.location || "home",
    }
}
function addWorkout(sessionId, context) {
    if (!sessionId) return Promise.reject(new Error("no sessionID"));

    let info = parsWorkout(context);
    return fetchProfile(sessionId).then(profile => { //TODO catch required ERROR with addProfile
        info.profile_id = profile.id;
        return Workout.forge(info, {hasTimestamps: true}).save()
            .then(workout => console.log("added Workout", workout))
            .catch(err => console.error("addWorkout", err))
    })
}
function getWorkouts(sessionId) {
    if (!sessionId) return Promise.reject(new Error("no sessionID"));

    return Profile.where({fb_id: sessionId}).fetch({withRelated: ['workout']})
        .then(profile => profile.related('workout').toJSON());
}

function parsXp(context = {}) {
    return {
        xp: context.xp || 0,
    }
}
function getXps(sessionId) {
    if (!sessionId) return Promise.reject(new Error("no sessionID"));

    return Profile.where({fb_id: sessionId}).fetch({withRelated: ['xplog']})
        .then(profile => profile.related('xplog').toJSON());
}
function getDaysActive(sessionId) {
    return getXps(sessionId).then(log => {
        log = log.sort((a,b) => a.created_at - b.created_at);
        let i = 0;
        for (; i < log.length - 1; i++) {
            let index = log.length - 1 - i;
            let d = new Date(log[index - 1].created_at);
            d.setDate(d.getDate() + 7);
            if (d < log[(index)].created_at) break;
        }
        return i;
    });
}
function addXp(sessionId, context, type = "activeness") {
    if (!sessionId) return Promise.reject(new Error("no sessionID"));

    let buildUpdate = (old, profile) => {
        let update = parsXp(context);
        update.updated_at = new Date();
        update.xp += old.attributes.xp
            % xpNextLevel(profile.attributes.workout_level);
        return update;
    };

    function buildNew(context, profile) {
        let info = parsXp(context);
        info.profile_id = profile.id;
        return info;
    }

    function buildActivenessContext(daysActive) {
        return {xp: Math.floor(daysActive * 1.2)}
    }

    function buildProfileUpdate(profile) {
        let update = {};
        let additionalXP = parsXp(context).xp;

        function buildXpTypes(addKnowledge, addDrill, addSharing, addKindness, addActiveness) {
            let totalXp = profile.attributes.xp + xpLevel(profile.workout_level);
            let sum = totalXp + additionalXP;
            update.xp_knowledge = (profile.attributes.xp_knowledge * totalXp + addKnowledge) / sum;
            update.xp_drill = (profile.attributes.xp_drill * totalXp + addDrill) / sum;
            update.xp_sharing = (profile.attributes.xp_sharing * totalXp + addSharing) / sum;
            update.xp_kindness = (profile.attributes.xp_kindness * totalXp + addKindness) / sum;
            update.xp_activeness = (profile.attributes.xp_activeness * totalXp + addActiveness) / sum;
        }

        if (additionalXP > 0) {
            switch (type) {
                case "knowledge":
                    buildXpTypes(additionalXP, 0, 0, 0, 0);
                    break;
                case "drill":
                    buildXpTypes(0, additionalXP, 0, 0, 0);
                    break;
                case "sharing":
                    buildXpTypes(0, 0, additionalXP, 0, 0);
                    break;
                case "kindness":
                    buildXpTypes(0, 0, 0, additionalXP, 0);
                    break;
                case "activeness":
                    buildXpTypes(0, 0, 0, 0, additionalXP);
                    break;
            }
        }
        if (profile.attributes.xp + additionalXP
            >= xpNextLevel(profile.attributes.workout_level))
            update.workout_level = profile.attributes.workout_level + 1;
        update.updated_at = new Date();
        return update;
    }

    //TODO fetch id + xp
    return fetchProfile(sessionId, '*').then(profile => { //TODO catch required ERROR with addProfile
        profile.save(buildProfileUpdate(profile))
            .then(profile => XpLog.where({profile_id: profile.id})
                .orderBy('created_at', 'DESC')
                .fetch()
                .then(xpLog => xpLog && xpLog.attributes.created_at.toDateString()
                    == new Date().toDateString() ?
                        xpLog.save(buildUpdate(xpLog, profile)) :
                        XpLog.forge(buildNew(context, profile), {hasTimestamps: true}).save()
                            .then(xp => getDaysActive(sessionId))
                            .then(numDays =>
                                addXp(sessionId, buildActivenessContext(numDays), "activeness"))
                )
                .then(xp => console.log("added Xp", xp))
                .catch(err => console.error("addXp", err))
            )
    })
        .catch(err => console.error("buildProfileUpdate", err))

}
function xpNextLevel(level) {//TODO get from profileBuilder
    return Math.pow(5 * 1.2, level - 1);
}
function xpLevel(level) {
    let sum = 0;
    for (let i = 1; i < level; i++)
        sum += xpNextLevel(i);
    return sum;
}

