const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, ListPartsCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const app = express();
app.use(cors())

// Serve static files (e.g., JS, CSS) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));


const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
}); // Adjust region as needed
const BUCKET_NAME = 'kanish-awsbucket';

// Set up multer to handle form data
const upload = multer({ storage: multer.memoryStorage() });

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// upload file
const uploadedParts = []

app.post('/upload-file', upload.single('filePart'), async (req, res) => {
    try {
        const { fileName, uploadId, partNumber, totalParts } = req.body;

        // Check if file size is smaller than the part size (1MB in this case)
        const file = req.file;

        if (file.size < 1 * 1024 * 1024) { // File size smaller than 1MB
            // Use a regular upload for small files
            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: fileName,
                Body: file.buffer,  // Directly upload the file buffer
            };

            const result = await s3.send(new PutObjectCommand(uploadParams));
            return res.json({ message: 'File uploaded successfully!', result });
        }

        // Step 1: Start multipart upload (this happens only on the first chunk)
        if (uploadId === 'null' || !uploadId) {
            if (!fileName) {
                return res.status(400).json({ error: 'fileName is required' });
            }

            const createMultipartUploadParams = {
                Bucket: BUCKET_NAME,
                Key: fileName,
                ContentType: 'application/octet-stream',
            };

            const createCommand = new CreateMultipartUploadCommand(createMultipartUploadParams);
            const response = await s3.send(createCommand);

            if (!response.UploadId) {
                return res.status(500).json({ error: 'Failed to create multipart upload, no UploadId returned' });
            }

            return res.json({ uploadId: response.UploadId, partNumber: 1 });
        }

        // Step 2: Upload part (chunks of the file)
        if (!uploadId || !partNumber) {
            return res.status(400).json({ error: 'Missing uploadId or partNumber' });
        }

        const chunk = req.file.buffer; // The chunk uploaded by the client
        const uploadPartParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            UploadId: uploadId,
            PartNumber: Number(partNumber),
            Body: chunk,
        };

        const uploadPartCommand = new UploadPartCommand(uploadPartParams);
        const { ETag } = await s3.send(uploadPartCommand);

        // Add ETag to the list of uploaded parts
        uploadedParts.push({
            ETag: ETag,
            PartNumber: Number(partNumber),
        });

        console.log("Number(uploadedParts.length) === Number(totalParts)", Number(uploadedParts.length) === Number(totalParts))
        console.log("Number(uploadedParts.length)", Number(uploadedParts.length))
        console.log("Number(totalParts)", Number(totalParts))

        // Step 3: If all parts are uploaded, complete the upload
        if (Number(uploadedParts.length) === Number(totalParts)) {
            const completeParams = {
                Bucket: BUCKET_NAME,
                Key: fileName,
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: uploadedParts.map(part => ({
                        ETag: part.ETag,
                        PartNumber: part.PartNumber,
                    })),
                },
            };

            const completeCommand = new CompleteMultipartUploadCommand(completeParams);
            
            try {
                const result = await s3.send(completeCommand);
                return res.json({ message: 'Upload completed successfully!', result });
            } catch (error) {
                console.log("error", error.message)
                console.log("errorToString", error.toString())
                return res.status(500).json({ error: error.message || 'Error during file upload' });
            }

        }

        // If not all parts are uploaded, return the next partNumber for the client to upload
        return res.json({ partNumber: Number(partNumber) + 1 });

    } catch (error) {
        console.error('Error during file upload:', error);
        return res.status(500).json({ error: 'Error during file upload' });
    }
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});