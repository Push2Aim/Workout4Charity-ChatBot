exports.up = function (knex, Promise) {
    return knex.schema.createTable("user", function (table) {
        table.biginteger("fb_id").primary();
        table.integer("profile_id").references("profile.id").notNullable().unique();

        table.timestamps();
    }).then(t => console.log("Table user created", t));
};

exports.down = function (knex, Promise) {
    return knex.schema.dropTable("user")
        .then(t => console.log("Table user dropped", t));
};