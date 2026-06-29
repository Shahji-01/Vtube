
 import {v2 as cloudinary} from "cloudinary"
 import fs from "fs"  // node js file system library no need to install

          
 cloudinary.config ({ 
   cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
   api_key: process.env.CLOUDINARY_API_KEY, 
   api_secret: process.env.CLOUDINARY_API_SECRET 
  });

  const uploadOnCloudinary = async (localFilePath) => {
    try {
        if(!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            eager: [
                { streaming_profile: "hd", format: "m3u8" }
            ],
            eager_async: true
        });

        // Clean up the temp file after successful upload
        if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

        return response;

    } catch (error) {
        console.log("upload error I`m from cloudinaryfileUpload:", error?.message || error)

        // Safely clean up temp file — it may have already been deleted
        try {
            if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
        } catch (unlinkErr) {
            // ignore cleanup errors
        }

        return null;
    }
}//Upload file on cloudinary


 const deleteOnCloudinaryVideo = async (oldFilePublicId) => {
  try {
    if(!oldFilePublicId) return null;
    // delete the file on cloudinary.
    const public_id = oldFilePublicId.split("/").pop().split(".")[0]
    const response = await cloudinary.uploader.destroy(public_id, { invalidate: true, resource_type: 'video'});
    console.log("File deleted on cloudinary", oldFilePublicId, "public_id", public_id);
    return response;
  } 
  catch (error) {
    return error;
  }
};

const deleteOnCloudinaryImage = async (oldFilePublicId) => {
  try {
    if(!oldFilePublicId) return null;
    // delete the file on cloudinary.
    const public_id = oldFilePublicId.split("/").pop().split(".")[0]
    // Images are uploaded with resource_type "auto", which Cloudinary stores as
    // "image". Deleting them must use resource_type 'image' — 'raw' never
    // matches an image asset, so the old avatar/cover would silently leak.
    const response = await cloudinary.uploader.destroy(public_id, { invalidate: true, resource_type: 'image'});
    console.log("File deleted on cloudinary", oldFilePublicId, "public_id", public_id);
    return response;
  } 
  catch (error) {
    return error;
  }
};

// for image resource-type image
export {uploadOnCloudinary, deleteOnCloudinaryVideo, deleteOnCloudinaryImage}