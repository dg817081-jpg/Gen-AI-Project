require("dotenv").config()
const app = require("./src/app")
const connectToDB = require("./src/config/database")

connectToDB()

// process.on("unhandledRejection", (err) => {
//     console.error("Unhandled Rejection:", err.message);
// });

// process.on("uncaughtException", (err) => {
//     console.error("Uncaught Exception:", err.message);
// });

app.listen(3000, () => {
    console.log("Server is running on port 3000")
})
