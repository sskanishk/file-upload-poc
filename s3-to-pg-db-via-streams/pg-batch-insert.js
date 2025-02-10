const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const csvParser = require("csv-parser");
const dotenv = require("dotenv");
const { pool } = require("./pgconnection.js");
dotenv.config()

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function processCSVFromS3(bucketName, fileName) {
    try {
        console.log(`Fetching CSV from S3: ${bucketName}/${fileName}`);

        const command = new GetObjectCommand({ Bucket: bucketName, Key: fileName });
        const { Body: csvStream } = await s3Client.send(command);
        if (!csvStream) throw new Error("Unable to get CSV file stream.");

        const batchSize = 2;
        let rows = [];

        csvStream
            .pipe(csvParser())
            .on("data", (row) => {
                const transformedRow = transformRow(row);
                // console.log("row ", row);
                // const transformedRow = row;
                if (validateRow(transformedRow)) {
                    rows.push(transformedRow);
                }
                if (rows.length >= batchSize) {
                    insertBatch(rows);
                    rows = [];
                }
            })
            .on("end", async () => {
                if (rows.length > 0) {
                    await insertBatch(rows);
                }
                console.log("CSV processing complete.");
            })
            .on("error", (err) => console.error("Stream error:", err));
    } catch (error) {
        console.error("Error processing CSV:", error);
    }
}


// Data Transformation
function transformRow(row) {
    return {
        id: row.id,
        name: row.name.trim(),
        age: Number(row.age),
        city: row.city.toLowerCase(),
        created_at: new Date().toISOString(),
    };
}

// Data Validation
function validateRow(row) {
    return row.id && row.name && row.age && row.city;
}

function insertBatch_(rows) {
    console.log("insertBatch_ ", rows)
}

// Bulk Insert into PostgreSQL
async function insertBatch(rows) {
    if (rows.length === 0) return;

    const client = await pool.connect();
    try {
        const keys = Object.keys(rows[0]).join(", ");
        const values = rows
            .map((row) => `('${Object.values(row).join("', '")}')`)
            .join(",");

        console.log("values ", values)

        await client.query(`INSERT INTO ${process.env.PG_TABLE} (${keys}) VALUES ${values}`);
        console.log(`Inserted ${rows.length} rows`);
    } catch (err) {
        console.error("Batch insert error:", err);
    } finally {
        client.release();
    }
}

// Run the function
processCSVFromS3("kanish-awsbucket", "dummycsv.csv");
