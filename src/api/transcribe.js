import multer from "multer";
import FormData from "form-data";
import { Readable } from "stream";
import axios from "axios";
import express from "express";

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffmetadata from "ffmetadata";

import fs from "fs";

ffmpeg.setFfmpegPath(ffmpegPath);

const router = express.Router();

const bufferToStream = buffer => {
    return Readable.from(buffer);
};

/**
 * Convert a time string of the format 'mm:ss' into seconds.
 * @param {string} timeString - A time string in the format 'mm:ss'.
 * @return {number} - The time in seconds.
 */
const parseTimeStringToSeconds = timeString => {
    const [minutes, seconds] = timeString.split(":").map(tm => parseInt(tm));
    return minutes * 60 + seconds;
};

const upload = multer();

ffmpeg.setFfmpegPath(ffmpegPath);

router.post("/transcribe", upload.single("file"), async (req, res) => {
    const audioFile = req.file;
    const startTime = req.body.startTime;
    const endTime = req.body.endTime;

    if (!audioFile) {
        return res.status(400).json({ error: "No audio file provided" });
    }

    const audioStream = bufferToStream(audioFile.buffer);

    if (!startTime || !endTime) {
        res.status(400).json({ message: "Start and end times are required." });
        return;
    }

    // Parse and calculate the duration
    const startSeconds = parseTimeStringToSeconds(startTime);
    const endSeconds = parseTimeStringToSeconds(endTime);
    const timeDuration = endSeconds - startSeconds;

    try {
        const trimAudio = async (audioStream, endTime) => {
            const tempFileName = `temp-${Date.now()}.mp3`;
            const outputFileName = `output-${Date.now()}.mp3`;

            return new Promise((resolve, reject) => {
                audioStream
                    .pipe(fs.createWriteStream(tempFileName))
                    .on("finish", () => {
                        ffmetadata.read(tempFileName, (err, metadata) => {
                            if (err) reject(err);
                            const duration = parseFloat(metadata.duration);
                            if (endTime > duration) endTime = duration;

                            ffmpeg(tempFileName)
                                .setStartTime(startSeconds)
                                .setDuration(timeDuration)
                                .output(outputFileName)
                                .on("end", () => {
                                    fs.unlink(tempFileName, err => {
                                        if (err) console.error("Error deleting temp file:", err);
                                    });

                                    const trimmedAudioBuffer = fs.readFileSync(outputFileName);
                                    fs.unlink(outputFileName, err => {
                                        if (err) console.error("Error deleting output file:", err);
                                    });

                                    resolve(trimmedAudioBuffer);
                                })
                                .on("error", reject)
                                .run();
                        });
                    })
                    .on("error", reject);
            });
        };

        const trimmedAudioBuffer = await trimAudio(audioStream, endTime);

        // Call the OpenAI Whisper API to transcribe the audio file
        const formData = new FormData();
        formData.append("file", trimmedAudioBuffer, {
            filename: "audio.mp3",
            contentType: audioFile.mimetype,
        });
        formData.append("model", "whisper-1");
        formData.append("response_format", "json");

        const config = {
            headers: {
                "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
                Authorization: `Bearer ${process.env.OPEN_AI_API_KEY}`,
            },
        };

        const response = await axios.post(
            "https://api.openai.com/v1/audio/transcriptions",
            formData,
            config
        );
        const transcription = response.data.text;

        res.json({ transcription });
    } catch (error) {
        res.status(500).json({ error: "Error transcribing audio" });
    }
});

export default router;
