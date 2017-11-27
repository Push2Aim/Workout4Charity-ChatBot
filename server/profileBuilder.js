const db = require("./db");

function toArray(object) {
    let array = [];
    for (let key in object)
        array.push(object[key]);
    return array;
}
function mergeWorkouts(workouts) {
    let week = {};
    workouts.forEach(w => {
        let day = w.created_at.toDateString();
        if (day) {
            week[day] = week[day] ||
                {duration: 0, amount: 0};
            week[day].duration += w.duration;
            week[day].amount++;
        }
    });
    return week;
}
function filterLastDays(arr, days = 7) {
    let aWeekAgo = new Date();
    aWeekAgo.setDate(new Date().getDate() - days);
    return arr.sort((a, b) => a.created_at - b.created_at)
        .filter(w => w.created_at >= aWeekAgo);
}
function buildStats(week, key) {
    console.log("week:", week)
    if (week.length <= 0) return [100, 100, 100, 100, 100, 100, 100];
    let max = week.map(w => w[key]).reduce((a, b) => Math.max(a, b));
    let out = week.map(w => 100 * w[key] / max);
    while (out.length < 7) out.push(0);
    return out
}
function getDurationLastDrill(workouts) {
    return workouts[workouts.length - 1] ?
        workouts[workouts.length - 1].duration : "Here is no Last Drill";
}
function getDaysBeingOnFitnessJourney(workouts) {
    let days = [];
    for (let date in mergeWorkouts(workouts))
        days.push(new Date(date))
    let out = 0;
    let lastDay = new Date();
    for (let i = days.length - 1; i >= 0; i--) {
        lastDay.setDate(lastDay.getDate() - 1);
        if (days[i] < lastDay) break;
        lastDay = days[i];
        out++;
    }
    return out;
}
function getMainStrength(strength) {
    strength.Started = 0;
    let max = "Started";
    for (let key in strength)
        if (strength[max] < strength[key]) max = key;

    return max;
}
function buildUserProfile(senderID) {
    return db.getProfile(senderID).then(profile => {
        let workouts = profile.workouts;
        let xplogs = profile.xplogs;
        return ({
            workout_level: profile.workout_level,
            xp: profile.xp,
            days_being_on_fitness_journey: getDaysBeingOnFitnessJourney(workouts),
            main_strength: getMainStrength({
                Knowledge: profile.xp_knowledge,
                Drill: profile.xp_drill,
                Sharing: profile.xp_sharing,
                Kindness: profile.xp_kindness,
                Activeness: profile.xp_activeness,
            }),
            user_goal: profile.user_goal,

            number_of_workouts: workouts.length,

            duration_avg_lifetime: average(workouts, "duration"),
            duration_max: max(toArray(mergeWorkouts(filterLastDays(workouts, 7))), "duration"),
            duration_heights: buildStats(toArray(mergeWorkouts(filterLastDays(workouts, 7))), "duration"), //the last 7 Day
            duration_last_drill: getDurationLastDrill(workouts),
            duration_week_avg: average(filterLastDays(workouts, 7), "duration"),
            duration_month_avg: average(filterLastDays(workouts, 30), "duration"),

            amount_avg_lifetime: 2.1,
            amount_max: 22, //max(mergeWorkouts(workouts), "amount"),
            amount_total: 23, //workouts.length,
            amount_this_week: 24, //filterLastDays(workouts,7).length,
            amount_avg_week: 25, //average(mergeWorkouts(workouts), "amount"),
            amount_heights: [10, 20, 30, 100], //the last 4 weeks

            xp_next_level: xpNextLevel(profile.workout_level),
            xp_max: max(filterLastDays(xplogs, 7), "xp"),
            xp_heights: buildStats(filterLastDays(xplogs, 7), "xp"), //the last 7 Day
            xp_knowledge: profile.xp_knowledge,
            xp_drill: profile.xp_drill,
            xp_sharing: profile.xp_sharing,
            xp_kindness: profile.xp_kindness,
            xp_activeness: profile.xp_activeness,
        })
    })
        .catch(err => console.error("buildUserProfile", err))
}
function xpNextLevel(level) {
    return Math.pow(5 * 1.2, level - 1);
}
function max(arr, key) {
    if (arr.length <= 0) return 0;
    return arr.map(a => a[key]).reduce((a, b) => Math.max(a, b));
}
function average(arr, key) {
    if (arr.length <= 0) return 0;
    let sum = arr.map(w => w[key]).reduce((a, b) => a + b);
    return sum / arr.length;
}
module.exports = buildUserProfile;