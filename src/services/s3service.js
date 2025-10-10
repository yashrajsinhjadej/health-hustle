// services/s3Service.js
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const BUCKET = process.env.AWS_BUCKET_NAME;

const uploadToS3 = async (fileBuffer, fileName, mimetype) => {
  const params = {
    Bucket: BUCKET,
    Key: `uploads/${Date.now()}-${fileName}`,
    Body: fileBuffer,
    ContentType: mimetype,
  };
  const data = await s3.upload(params).promise();
  return data.Key; // Store this key in DB
};
const getKeyFromUrl = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // decode URI component to handle spaces and special characters
    return decodeURIComponent(urlObj.pathname.substring(1)); // remove leading "/"
  } catch {
    return null;
  }
};
const deleteFromS3 = async (key) => {
  const params = {
    Bucket: BUCKET,
    Key: key,
  };
  await s3.deleteObject(params).promise();
};



const healthCheck = async () => {
  try {
    // Try listing 1 object to verify access
    await s3
      .listObjectsV2({ Bucket: BUCKET, MaxKeys: 1 })
      .promise();
    return { status: 'healthy', message: 'S3 service is accessible' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  healthCheck,
  getKeyFromUrl,
};
