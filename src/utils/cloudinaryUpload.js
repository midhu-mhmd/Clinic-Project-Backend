import cloudinary from "../config/cloudinary.js";

export const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder,
          resource_type: "image",
          transformation: [
            {
              width: 500,
              height: 500,
              crop: "fill",
              gravity: "face",
              quality: "auto",
              fetch_format: "auto",
            },
          ],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      )
      .end(buffer);
  });
};

export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId);
};
