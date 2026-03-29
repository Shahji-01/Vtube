import mongoose, {Schema} from "mongoose";

const likeSchema = new Schema(
    {
        comment:  // if we like a comment 
        {
            type:Schema.Types.ObjectId,
            ref:"Comment",
        },
        video: // if we like a video
        {
            type:Schema.Types.ObjectId,
            ref:"Video"
        },
        tweet: // if we like a tweet
        {
            type:Schema.Types.ObjectId,
            ref:"Tweet"
        },
        likedBy: // who liked
        {
            type:Schema.Types.ObjectId,
            ref:"User"
        },
        isDislike: {
            type: Boolean,
            default: false
        }

    },{timestamps:true})

likeSchema.index({ video: 1, likedBy: 1 });
likeSchema.index({ comment: 1, likedBy: 1 });
likeSchema.index({ tweet: 1, likedBy: 1 });

export const Like = mongoose.model("Like", likeSchema);