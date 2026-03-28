import express from "express";
import cors from "cors"; // Importing the 'cors' middleware
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1); // Trust first specific proxy (e.g. Render/Vercel)

// Adding the CORS middleware to your Express application

// Security middleware to set secure HTTP headers
app.use(helmet());

// Rate limiting to prevent brute-force and DDoS attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // Limit each IP to 200 requests per `window`
  standardHeaders: true, 
  legacyHeaders: false, 
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use("/api/v1/", limiter);

// Allow configured origin(s) plus the Vite dev server
const allowedOrigins = [
  process.env.COR_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter(Boolean)

app.use(
  cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin) || process.env.COR_ORIGIN === "*") {
        callback(null, true)
      } else {
        callback(new Error(`CORS: Origin '${origin}' not allowed`))
      }
    },
    credentials: true,
  })
);

// Adding middleware to parse incoming JSON requests with a maximum limit of 20KB

app.use(express.json({ limit: "20kb" })); //form bhara to data liya

// Adding middleware to parse incoming URL-encoded form data with extended option

app.use(express.urlencoded({ extended: true, limit: "20kb" })); // this will use will data come form url and it will encode special character like space = %20 and other

app.use(express.static("public")); // serve static content from static folder

// Serve static files from the React app
const clientBuildPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientBuildPath));

app.use(cookieParser()); // to perfomr CRUD OPER ON USER WEB COOKIES

// importing routes
import userRouter from "./routes/user.route.js";
import videoRouter from "./routes/video.route.js";
import commentRouter from "./routes/comment.route.js";
import tweetRouter from "./routes/tweet.route.js";
import likeRouter from "./routes/like.route.js";
import playlistRouter from "./routes/playlist.route.js"
import subscriptionRouter from "./routes/subscription.route.js"
import healthcheckRouter from "./routes/healthcheck.route.js"
import dashboardRouter from "./routes/dashboard.route.js"
import notificationRouter from "./routes/notification.route.js"


// route declarations

// Mounting the userRouter middleware at the "/api/v1/users" endpoint

app.use("/api/v1/users", userRouter);   // here api/v1/users routes will act as prefix and controll will go to userRegister

app.use("/api/v1/videos", videoRouter)

app.use("/api/v1/comments", commentRouter)

app.use("/api/v1/tweets", tweetRouter)
 
app.use("/api/v1/healthcheck", healthcheckRouter)

app.use("/api/v1/subscriptions", subscriptionRouter)

app.use("/api/v1/likes", likeRouter)

app.use("/api/v1/playlist", playlistRouter)

app.use("/api/v1/dashboard", dashboardRouter)
app.use("/api/v1/notifications", notificationRouter)


// ── Catch-all route ───────────────────────────────────────────────
// Any request that doesn't match an API route will serve the React app
app.get("*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"), (err) => {
    if (err) {
      res.status(500).send(err);
    }
  });
});


// http://localhost/api/v1/users/*
export { app };
