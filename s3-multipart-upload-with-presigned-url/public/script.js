const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per part
let uploadedParts = [];

async function uploadFile() {

    let file = document.getElementById("uplodFileInput").files[0];
    if (!file) return alert('Please select a file!');

    const { uploadId, fileName } = await startMultiPartUpload(file);

    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    console.log("here")

    const presignedUrls = await getPresignedUrls(fileName, uploadId, totalParts);
    console.log("presignedUrls ", presignedUrls)

    await uploadChunks(presignedUrls, file);

    const result = await completeMultipartUpload(fileName, uploadId);
    return result;
}


const startMultiPartUpload = async (file) => {

    const formData = new FormData();
    formData.append('fileName', file.name);
    formData.append('fileType', file.type);

    // log the FormData entries
    // console.log("formData ----- ", formData)
    // formData.forEach((value, key) => {
    //     console.log(key, value);
    // });

    const startResponse = await fetch("/start-multipart-upload", {
        method: "POST",
        body: formData,
    });
    const { uploadId, fileName } = await startResponse.json();
    return { uploadId, fileName };
}

const getPresignedUrls = async (fileName, uploadId, totalParts) => {
    const partsArray = Array.from({ length: totalParts }, (_, i) => i + 1);
    const urlResponse = await fetch("/get-presigned-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, uploadId, parts: partsArray }),
    });
    const { presignedUrls } = await urlResponse.json();
    return presignedUrls;
}

const uploadChunks = async (presignedUrls, file) => {
    for (const { partNumber, signedUrl } of presignedUrls) {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const fileChunk = file.slice(start, end);

        const uploadResponse = await fetch(signedUrl, {
            method: "PUT",
            body: fileChunk,
            headers: { "Content-Type": "application/octet-stream" },
        });

        const ETag = uploadResponse.headers.get("ETag");
        uploadedParts.push({ partNumber, ETag });
    }
}

const completeMultipartUpload = async (fileName, uploadId) => {
    const completeResponse = await fetch("/complete-multipart-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, uploadId, parts: uploadedParts }),
    });

    const result = await completeResponse.json();
    console.log("Upload Complete:", result);
    return result;
}

