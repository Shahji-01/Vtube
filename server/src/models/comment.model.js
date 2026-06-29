import mongoose, { Schema } from "mongoose";
 import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2"

 const commentSchema = new Schema(
    {
        content:{
            type:String,
            required:true,
        },
        video:
        {
            type:Schema.Types.ObjectId,
            ref:"Video"
        },
        owner:
        {
            type:Schema.Types.ObjectId,
            ref:"User"
        },
        parentComment:
        {
            type:Schema.Types.ObjectId,
            ref:"Comment",
            default:null
        },
        pinned:
        {
            type:Boolean,
            default:false
        },
        pinnedAt:
        {
            type:Date,
            default:null
        },
        isHidden:
        {
            type:Boolean,
            default:false
        }
    },{timestamps:true}
    )

commentSchema.plugin(mongooseAggregatePaginate);

// Index on hot query path
commentSchema.index({ video: 1 });

// Compound index for pinned-first read ordering
commentSchema.index({ video: 1, pinned: -1 });

export const Comment = mongoose.model("Comment", commentSchema);