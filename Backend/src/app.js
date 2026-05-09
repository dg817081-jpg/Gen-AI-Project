const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

const app = express()

app.use(express.json())
app.use(cookieParser())

app.use(cors({
    origin: "https://gen-ai-project-5-ela6.onrender.com",
    credentials: true
}))

// Root Route
app.get("/", (req, res) => {
    res.send("Gen AI Backend Running Successfully 🚀")
})

// Health Route
app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    })
})

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const { interviewRouter } = require("./routes/interview.routes")

/* using all the routes here */
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)

module.exports = app
