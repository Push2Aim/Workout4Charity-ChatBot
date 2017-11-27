exports.up = function (knex, Promise) {
    return knex.schema.createTableIfNotExists("profile", function (table) {
        table.increments().primary();
        table.biginteger("fb_id").notNullable().unique();
        table.integer("workout_level").defaultTo(0);
        table.biginteger("xp").defaultTo(0);
        table.boolean("subscribed").defaultTo(false);
        table.string("user_goal").defaultTo("else");

        table.decimal("xp_knowledge").defaultTo(0);
        table.decimal("xp_drill").defaultTo(0);
        table.decimal("xp_sharing").defaultTo(0);
        table.decimal("xp_kindness").defaultTo(0);
        table.decimal("xp_activeness").defaultTo(0);

        table.timestamps();
    }).then(t => console.log("Table profile created", t));
};

exports.down = function (knex, Promise) {
    return knex.schema.dropTable("profile")
        .then(t => console.log("Table profile dropped", t));
};
