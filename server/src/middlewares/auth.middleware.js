
// ----importing required modules and mehtod
import asyncHandler from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import  jwt  from "jsonwebtoken";
import { User } from "../models/user.model.js";
/* ---------- creating middle ware to get user info  */


export const verifyJWT = asyncHandler(async (req, _, next) => {
   try {
     const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

     if (!token) {
         throw new ApiError(401, "Unauthorized Request")
     }

     const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
     const user = await User.findById(decodedToken?._id).select("-password -refreshToken");
     if (!user) {
         throw new ApiError(401, "Invalid access token")
     }
 
     req.user = user;  
     next();
   } 
   catch (error) {
     throw new ApiError(401, error?.message || "Invalid access token");
   } 
})


// Optional JWT — attaches req.user if a valid token is present, but NEVER blocks the request.
// Use this on public routes that also need to track the authenticated user (e.g. views/history).
export const optionalJWT = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")
    if (token) {
      const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
      const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
      if (user) req.user = user
    }
  } catch {
    // Token invalid or expired — just continue as a guest, don't throw.
  }
  next()
}