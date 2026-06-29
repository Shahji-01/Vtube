
 import mongoose, { Schema } from "mongoose";
 import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2"
 const videoSchema = new Schema(
  {
    videoFile: {
      type: String, // coudinary url
      required: [true, 'Videofile is required'],
    },
    thumbnail:{
      type:String,
      required:[true, "thumbnail is required"],
    },
    title:{
      type:String,
      required:[true, "title is required"],
    },
    description:{
      type:String,
      required:[true, "thumbnail is required"],
    },
    duration:{
      type:Number,
      required:true,
    }, 
    views:{
      type:Number,
      default:0,
    },
    isPublished:{
      type:Boolean,
      default:true,
    },
    isHidden:{
      type:Boolean,
      default:false,
      index:true,
    },
    owner:{
      type:Schema.Types.ObjectId,
      ref:"User",
    },
  },
  { 
    timestamps: true 
  }
);
videoSchema.plugin(mongooseAggregatePaginate);

// Indexes on hot query paths
videoSchema.index({ owner: 1, createdAt: -1 });
videoSchema.index({ title: "text", description: "text" });

export const Video = mongoose.model("Video", videoSchema);
