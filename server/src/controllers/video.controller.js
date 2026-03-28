import mongoose, {isValidObjectId} from "mongoose"
import {v2 as cloudinary} from "cloudinary"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {Comment} from "../models/comment.model.js"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import asyncHandler from "../utils/asyncHandler.js"
import {uploadOnCloudinary, deleteOnCloudinaryVideo, deleteOnCloudinaryImage} from "../utils/cloudinary.fileupload.js"
 import axios from "axios";  // Importing the request module for HTTP requests
//  TODO: While deleting I am not deleting video/files from the cloudinary
/*--------------------GET ALL VIDEOS---------------- */


const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy = 'createdAt', sortType = 'desc' } = req.query
    const user_Id = req.user?._id  // optional — may be undefined for guests

    const pageNumber = parseInt(page)
    const pageLimit = parseInt(limit)
    const skip = (pageNumber - 1) * pageLimit

    try {
      // Build match stage — if query is provided use it, otherwise match all published
      const matchStage = {
        $match: {
          isPublished: true,
          ...(query && {
            $or: [
              { title: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } },
            ]
          }),
          ...(user_Id && !query && { owner: new mongoose.Types.ObjectId(user_Id) })
        }
      }

      const pipeline = [
        matchStage,
        {
          $lookup: {
            from: 'users',
            localField: 'owner',
            foreignField: '_id',
            as: 'owner',
            pipeline: [
              { $project: { username: 1, fullName: 1, avatar: 1 } }
            ]
          }
        },
        { $addFields: { owner: { $first: '$owner' } } },
        { $sort: { [sortBy]: sortType === 'desc' ? -1 : 1 } },
        { $skip: skip },
        { $limit: pageLimit }
      ]

      const videos = await Video.aggregate(pipeline)

      res.status(200).json(new ApiResponse(200, { docs: videos, page: pageNumber, limit: pageLimit }, 'Videos fetched successfully'))
    } catch (error) {
      // console.log('getAllVideos error:', error)
      throw new ApiError(500, 'Failed to load videos')
    }
})


/*------------------Publish Video------------------ */

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    // TODO: get video, upload to cloudinary, create video
    if (!(title || description )) {
        throw new ApiError(400, "Required fileds: title and description")
    }

    const videoLocalPath = req.files?.videoFile[0]?.path
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path

    // console.log(videoLocalPath,"----", thumbnailLocalPath, title, description, "FROM PUBLISH video")

    if (!(videoLocalPath || thumbnailLocalPath)) {
        throw new ApiError(400, "Video and thumbnail are required: please provide video and thumbanil")
    }
    
    try 
      {
        const videoUploaded = await uploadOnCloudinary(videoLocalPath)
        const thumbanilUploaded = await uploadOnCloudinary(thumbnailLocalPath)
        // console.log(videoUploaded, thumbanilUploaded, "1111")
        if (!(videoUploaded.url && thumbanilUploaded.url)) {
            throw new ApiError(400, "Video and thumbanil is required")
        }
        // console.log("22222")
        const newVideo = await Video.create(
            {
                title,
                description,
                duration: videoUploaded.duration,
                videoFile: videoUploaded.url,
                thumbnail: thumbanilUploaded.url,
                isPublished:true,
                owner: req.user?._id // bcz we have added useer object thoru veirfyjwt 
            }
        );

     if (!newVideo) {
          throw new ApiError(400, "Video couldn't be created")
        }
     
    const createdVideo = await Video.findById(newVideo._id);

    // console.log(createdVideo, "Video created")
      
    if (!createdVideo) {
        throw new ApiError(500, "Video couldn't be created")
    }
    res
    .status(201)
    .json(new ApiResponse(200, createdVideo, "Video uploaded successfully uploaded"))
      }catch (error) {
        throw new ApiError(500,error, "Some error occurred while publishing video")
    }
}) //DONE when use postman always upload files again again else undefined error come


/*-----------------GETVIDEOBYID----------------- */

const getVideoById = asyncHandler(async (req, res) => {
    const { video_Id } = req.params
    if (!video_Id || !isValidObjectId(video_Id)) {
        throw new ApiError(400, 'Please enter a valid videoId')
    }
    try {
        const video = await Video.findById(video_Id).populate('owner', 'username fullName avatar')

        if (!video) {
            throw new ApiError(404, 'Video not found')
        }

        // Only block if unpublished AND viewer is not the owner
        const viewerId = req.user?._id?.toString()
        if (!video.isPublished && video.owner?._id?.toString() !== viewerId) {
            throw new ApiError(403, 'Video is not published')
        }

        // Increment view count (fire-and-forget)
        Video.updateOne({ _id: video_Id }, { $inc: { views: 1 } }).catch(() => {})

        // Add to watch history if user is logged in
        if (req.user?._id) {
            User.findByIdAndUpdate(req.user._id, {
                $addToSet: { watchHistory: video_Id }
            }).catch(() => {})
        }

        res.status(200).json(new ApiResponse(200, video, 'Video fetched successfully'))
    } catch (error) {
        if (error instanceof ApiError) throw error
        throw new ApiError(500, 'Some error occurred while getting video')
    }
})


/*----------------UPDATEVIDEO-----------------*/

const updateVideo = asyncHandler(async (req, res) => {
    const { video_Id } = req.params
    //TODO: update video details like title, description, thumbnail
    //console.log(video_Id, "update Video with id")

    if (!video_Id) {
        throw new ApiError(400, "Invalid video id: Cannot update video")
    }

    const {title, description} = req.body

    const thumbnailLocalPath = req.file?.path

    if (!title || !description || !thumbnailLocalPath) {
        throw new ApiError(400, "title, description and thumbnail are required ")
    } 
    
    try {
        const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    
        if (!thumbnail.url) {
            throw new ApiError(400, "Error while uploading thumbnail")
        }
        const deleteVideoThumbnail = await Video.findById(req.user?._id)
        // console.log("1" ,deleteVideoCoverImage)
        
        if (deleteVideoThumbnail) {
         // console.log("2", coverImage.url)
           await deleteOnCloudinaryImage(deleteVideoThumbnail.thumbnail);
        } 
    
        const video =  await Video.findByIdAndUpdate(
            video_Id, 
            {
                $set:
                {
                    title:title,
                    description:description,
                    thumbnail:thumbnail.url || ""
                }
            },
            {new:true, validateBeforeSave:false},
        )
    
        // console.log(video, "video updated")
        if (!video) {
             throw new ApiError(404, "Video can not be updated")
        }
        res
        .status(200)
        .json(new ApiResponse(200, video, "video updated successully"))
    } catch (error) {
        throw new ApiError(500, "Error updating video: please try again later")
    }
})//DONE , ENTER VALID VIDEOID AND ADD FORM DATA 


/*------------------DELETE---------------------*/

const deleteVideo = asyncHandler(async (req, res) => {
    const { video_Id } = req.params;
    
    if (!isValidObjectId(video_Id)) {
        throw new ApiError(400, "Enter a valid video id to delete video");
    }

    try {
        const video = await Video.findById(video_Id);

        if (!video) {
            throw new ApiError(404, "Video not found");
        }
            
        if (video.owner.toString() !== req.user?._id?.toString()) {
            throw new ApiError(403, "You are not authorized to delete this video");
        }

        const thumbnailUrl = video.thumbnail;
        const thumbnailName = thumbnailUrl.split("/").pop().split(".")[0];
        
        // 1. Delete dependent data first to prevent orphans
        const comments = await Comment.find({ video: video_Id });
        const commentsIds = comments.map(c => c._id);
        
        await Promise.all([
            Like.deleteMany({ video: video_Id }),
            Like.deleteMany({ comment: { $in: commentsIds } }),
            Comment.deleteMany({ video: video_Id })
        ]);

        // 2. Delete the primary document
        const deleteResult = await Video.findByIdAndDelete(video_Id);
        
        if (!deleteResult) {
            throw new ApiError(404, "Video was already deleted from the database");
        }

        // 3. Delete from Cloudinary (Soft fail check)
        deleteOnCloudinaryVideo(video.videoFile).catch(err => console.error("Cloudinary video delete failed:", err));
        cloudinary.uploader.destroy(thumbnailName, { invalidate: true }).catch(err => console.error("Cloudinary thumbnail delete failed:", err));

        return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video and all associated data deleted successfully"));

    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to delete video. Please try again later.");
    }
});


/*----------------TOGGLEPUBLISHSTATUS----------------*/

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { video_Id } = req.params
    console.log(video_Id, "video id")
    if (!video_Id) {
        throw new ApiError(404, "enter valid video id to know publish status") 
    }
    const video = await Video.findById(video_Id)
    console.log(video, "video")

    if (!video) {
        throw new ApiError(400, "Can not toggle publish status , Either video does no texist or already deleted")
    }

    video.isPublished = !video.isPublished
    await  video.save({ validateBeforeSave: false })

    res
    .status(200)
    .json(new ApiResponse(200, video_Id, "Video status is toggled successfully"))
}) // DONE if ispublished is true video will be shown in othersise not


/*----------------STREAMVIDEO-----------------*/
const streamVideo = asyncHandler(async (req, res) => {
    const { video_Id } = req.params;
    // console.log("1")
    if (!mongoose.Types.ObjectId.isValid(video_Id)) {
        throw new ApiError(400, 'Invalid video ID');
    }

    const video = await Video.findById(video_Id);
    if (!video) {
        throw new ApiError(404, 'Video not found');
    }

    const videoUrl = video.videoFile;

    axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream'
    }).then(videoRes => {
        if (videoRes.status !== 200) {
            throw new ApiError(500, 'Error fetching video from Cloudinary');
        }

        res.writeHead(videoRes.status, videoRes.headers);
        let totalBytes = 0;
        const startTime = Date.now();

        videoRes.data.on('data', chunk => {
            totalBytes += chunk.length;
            const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
            const rate = (totalBytes / elapsedTime).toFixed(2); // bytes per second

            console.log(`Chunk Size: ${chunk.length} bytes`);
            console.log(`Total Bytes: ${totalBytes} bytes`);
            console.log(`Streaming Rate: ${rate} bytes/sec`);
        });
        // console.log("\n =>", videoRes.data , "tv \n")
        videoRes.data.pipe(res);
    }).catch(err => {
        throw new ApiError(500, 'Error streaming video');
    });
});




export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
    streamVideo
}





// ------------------------------------------DEFINATION--------------------------------
 
/* ---------------------------REQ.PARAMS AND REQ.BODY---------------------*/
  /*
In HTTP requests, both request parameters (accessed via req.params) and 
request body data (accessed via req.body) can be sent simultaneously.
This is useful for providing additional information in the request body 
while specifying the primary identifier in the URL path.
For instance, when updating a user's profile, the user ID can be
 in the URL path and updated data in the request body.
*/

/*-----------------------------------------FINDBYIDANDDELETE-------------------------*/
/*
The findByIdAndDelete method in Mongoose returns the document that was
 deleted from the database.
 If no document matched the provided ID, it returns null
 */


 /*---------------------PAGINATION-----------------------*/
 /*
Pagination refers to the practice of dividing a large dataset into 
smaller,more manageable chunks or pages.
It is commonly used in applications where presenting a large amount of data all at once would be impractical 
or overwhelming, such as search results, product listings, or social media feeds.
Pagination typically involves specifying parameters such as the number of 
items per page and the current page number to retrieve a subset of data 
from the entire dataset.
Users can navigate through the pages to view different portions 
of the dataset.
*/

/*------------------limit page sort--------------------*/
/*
-------------------$skip:
Functionality: Allows skipping a specified number of documents in the pipeline.
Usage: Typically used for implementing pagination by skipping a certain number of documents to retrieve subsequent pages of results.
Example: { $skip: (pageNumber - 1) * pageSize } skips (pageNumber - 1) * pageSize documents.

-------------------------$limit:
Functionality: Limits the number of documents passed to the next stage in the pipeline.
Usage: Useful for restricting the number of results returned, especially when combined with $skip for pagination.
Example: { $limit: pageSize } limits the number of documents to pageSize.
--------------------------$sort:
Functionality: Sorts documents in the pipeline based on specified fields and sort orders.
Usage: Allows ordering the documents before passing them to the next stage.
Example: { $sort: { field1: 1, field2: -1 } } sorts documents by field1 in ascending order and field2 in descending order.
-*/

/*-------------------------DELETING FILES FROM CLOUDINARY ----------------
STEPS TO FOLLOW
1> the method which cloudinary suggest to delete files from cloudinary using nodeJs is destroy [cloudinary.v2.uploader.destroy(public_id, options).then(callback);] for nodeJs
destroy takes three arguments which are PUBLIC_ID, options and callback
PUBLIC_ID: this is not the url that you get from cloudinary server, this requires name of file (which is given by either u or cloudinary itself) which is to be extracted as above 
Options:type of files to be deleted from cloudinary, default is image but for other u need to define resource_type of files like video raw etc
callback: function to be called after success or failure of delete operation on cloudinary which return a reuslt as promise with status code 
*/