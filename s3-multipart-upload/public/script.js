const uploadFile = async () => {
    const file = document.getElementById('fileInput').files[0];
    if (!file) return alert('Please select a file!');

    const partSize = 1 * 1024 * 1024; // 1MB per part
    const totalParts = Math.ceil(file.size / partSize);
    let partNumber = 1;
    let offset = 0;
    let uploadId = null;

    console.log("file.size < partSize ", file.size < partSize)
    console.log("file.size ", file.size)
    console.log(" partSize ", partSize)

    // Check if file size is less than partSize, and use a regular upload
    if (file.size < partSize) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', file.name);

        const response = await fetch('/upload-file', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        console.log(data);
        alert('File uploaded successfully!');
        return;
    }

    // Function to upload parts in chunks
    const uploadPart = async (partNumber, chunk) => {
        const formData = new FormData();
        formData.append('filePart', chunk);
        formData.append('partNumber', partNumber);
        formData.append('totalParts', totalParts);
        formData.append('fileName', file.name);
        formData.append('uploadId', uploadId);  // Send uploadId if it's not the first chunk

        const response = await fetch('/upload-file', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.uploadId) {
            uploadId = data.uploadId; // Save the uploadId from the server
        }
        if (data.partNumber) {
            partNumber = data.partNumber; // Update part number if not all parts are uploaded
        }

        console.log("data   ", data)

        if (data.message) {
            console.log(data.message);
            return; // Finish uploading
        }

        offset += partSize;
        const nextChunk = file.slice(offset, offset + partSize);
        if (nextChunk.size > 0) {
            await uploadPart(partNumber, nextChunk);
        }
    };

    const firstChunk = file.slice(0, partSize);
    await uploadPart(partNumber, firstChunk);
}