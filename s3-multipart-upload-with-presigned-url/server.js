const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const {
    S3Client,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post("/start-multipart-upload", upload.none(), async (req, res) => {
    try {
        const { fileName, fileType, Key } = req.body;

        // console.log("fileName ", fileName)
        // console.log("fileType ", fileType)
        // console.log("Key ", Key)

        const command = new CreateMultipartUploadCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            ContentType: fileType,
        });

        const response = await s3Client.send(command);

        res.json({ uploadId: response.UploadId, fileName });
    } catch (error) {
        console.error("Error starting multipart upload:", error);
        res.status(500).json({ error: "Failed to start multipart upload" });
    }
});

app.post("/get-presigned-urls", async (req, res) => {
    try {
        const { fileName, uploadId, parts } = req.body; 
        const presignedUrls = await Promise.all(
            parts.map(async (partNumber) => {
                const command = new UploadPartCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    UploadId: uploadId,
                    PartNumber: partNumber,
                });

                const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                return { partNumber, signedUrl };
            })
        );

        res.json({ presignedUrls });
    } catch (error) {
        console.error("Error generating pre-signed URLs:", error);
        res.status(500).json({ error: "Failed to generate pre-signed URLs" });
    }
});

app.post("/complete-multipart-upload", async (req, res) => {
    try {
        const { fileName, uploadId, parts } = req.body;

        const command = new CompleteMultipartUploadCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: parts.map(({ partNumber, ETag }) => ({
                    PartNumber: partNumber,
                    ETag,
                })),
            },
        });

        const response = await s3Client.send(command);
        res.json({ message: "Upload completed", location: response.Location });
    } catch (error) {
        console.error("Error completing multipart upload:", error);
        res.status(500).json({ error: "Failed to complete upload" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));
