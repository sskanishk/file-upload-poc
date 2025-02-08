const fs = require('fs');
const pg = require('pg');
const dotenv = require("dotenv");
dotenv.config();

const CERTIFICATE = fs.readFileSync('./ca.pem').toString();

const config = {
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    ssl: {
        rejectUnauthorized: true,
        ca: CERTIFICATE
    },
};

const pool = new pg.Pool(config);
const client = new pg.Client(config);

client.connect(function (err) {
    if (err)
        throw err;
        client.query("SELECT VERSION()", [], function (err, result) {
        if (err)
            throw err;

        console.log(result.rows[0].version);
        client.end(function (err) {
            if (err)
                throw err;
        });
    });
});

module.exports = {
    pool
}