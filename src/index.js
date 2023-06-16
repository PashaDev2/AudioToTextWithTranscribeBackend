import express from "express";
import cors from "cors";
import transcribeRouter from "./api/transcribe.js";
import dotenv from "dotenv";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/api/v1", transcribeRouter);
dotenv.config();

app.get("/", (req, res) => {
    res.send("Welcome to the Speech-to-Text API!");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

export default app;
