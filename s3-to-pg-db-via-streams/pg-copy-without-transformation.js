const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { pipeline: streamPipeline } = require("stream/promises");
const dotenv = require("dotenv");
const { pool } = require("./pgconnection.js");
const { from: CopyFrom } = require('pg-copy-streams')

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

        // Fetch CSV stream from Local
        // const csvStream = fs.createReadStream('dummycsv.csv');

        // Acquire a PostgreSQL client
        client = await pool.connect();
        await client.query('BEGIN'); // Start transaction

        // Create COPY command stream
        // Note - `HEADER TRUE` in the COPY command so psql automatically ignores the first row.
        const copyQuery = `COPY ${process.env.PG_TABLE} (id, name, age, city) FROM STDIN WITH (FORMAT csv, HEADER TRUE)`;
        const copyStream = client.query(CopyFrom(copyQuery));

        // Stream pipeline
        await streamPipeline(
            csvStream,
            copyStream
        );

        await client.query('COMMIT');
        console.log('CSV processing complete: All rows inserted via COPY');
    } catch (error) {
        console.error('Error processing CSV:', error.toString());
        if (client) await client.query('ROLLBACK');
    } finally {
        if (client) client.release();
    }
}

processCSVFromS3("kanish-awsbucket", "dummycsv.csv");