const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const csvParser = require("csv-parser");
const { Transform } = require("stream");
const { pipeline: streamPipeline } = require("stream/promises");
const dotenv = require("dotenv");
const { pool } = require("./pgconnection.js");
const { from: CopyFrom } = require('pg-copy-streams')
const { stringify } = require("csv-stringify");

dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function processCSVFromS3(bucketName, fileName) {
    let client;
    try {
        // Fetch CSV stream from S3
        const command = new GetObjectCommand({ Bucket: bucketName, Key: fileName });
        const { Body: csvStream } = await s3Client.send(command);

        // const transformer = new Transform({
        //     objectMode: true,
        //     transform(row, _, callback) {
        //         const transformed = transformRow(row);
        //         if (validateRow(transformed)) {
        //             callback(null, transformed);
        //         } else {
        //             callback(); // Skip invalid rows
        //         }
        //     }
        // });

        // const stringifier = stringify({
        //     delimiter: ','
        // });

        // csvStream
        //     // .setEncoding('utf8')
        //     .pipe(csvParser())
        //     .pipe(transformer)
        //     .pipe(stringifier)
        //     .on('data', (chunk) => console.log("chunk ", JSON.stringify(chunk)))

        // return 

        // Acquire a PostgreSQL client
        client = await pool.connect();
        await client.query('BEGIN'); // Start transaction

        // Create COPY command stream
        const copyQuery = `COPY ${process.env.PG_TABLE} (id, name, age, city, created_at) FROM STDIN WITH (FORMAT csv)`;
        const copyStream = client.query(CopyFrom(copyQuery));

        // Create processing streams
        const transformer = new Transform({
            objectMode: true,
            transform(row, _, callback) {
                const transformed = transformRow(row);
                if (validateRow(transformed)) {
                    callback(null, transformed);
                } else {
                    callback(); // Skip invalid rows
                }
            }
        });

        const csvStringifier = stringify({
            header: false,
            delimiter: ',',
            quoted: true,
            escape: '"',
            columns: ['id', 'name', 'age', 'city', 'created_at'],
        });

        // Stream pipeline
        await streamPipeline(
            csvStream,
            csvParser(),
            transformer,
            csvStringifier,
            copyStream
        );

        await client.query('COMMIT');
        console.log('CSV processing complete: All rows inserted via COPY');
    } catch (error) {
        console.error('Error processing CSV:', error);
        if (client) await client.query('ROLLBACK');
    } finally {
        if (client) client.release();
    }
}

function transformRow(row) {
    return {
        id: row.id,
        name: row.name.trim(),
        age: Number(row.age),
        city: row.city.toLowerCase(),
        created_at: new Date().toISOString(),
    };
}

function validateRow(row) {
    return row.id && row.name && row.age && row.city;
}

processCSVFromS3("kanish-awsbucket", "dummycsv.csv");