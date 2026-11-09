import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import * as Busboy from "busboy";
import { Stream } from "stream";
import * as FormData from "form-data"; // <-- make sure to import this
import axios, { isAxiosError } from "axios";
import * as admin from "firebase-admin";
import * as cors from "cors";

admin.initializeApp();

type FileInfo = {
  filename: string;
  encoding: string;
  mimeType: string;
};

const apiFunctions = functions.runWith({ secrets: ["OPENAI_API_KEY"] });

const corsHandler = cors({ origin: true });

export const uploadFile = apiFunctions.https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    if (req.method !== "POST") {
      res.status(405).send("Only allowed POST");
    } else {
      // eslint-disable-next-line new-cap
      const busboy = Busboy({ headers: req.headers });

      let prompt: string;

      busboy.on("field", (fieldname, value) => {
        if (fieldname === "prompt") {
          prompt = value;
        }
      });

      busboy.on(
        "file",
        async (fieldname: string, file: Stream, fileinfo: FileInfo) => {
          const formData = new FormData();
          formData.append("file", file, {
            filename: fileinfo.filename,
            contentType: fileinfo.mimeType,
          });
          formData.append("model", "gpt-transcribe");
          if (prompt) {
            formData.append("prompt", prompt);
          }
          const headers = {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          };

          try {
            const response = await axios.post(
              "https://api.openai.com/v1/audio/transcriptions",
              formData,
              { headers: headers }
            );

            if (response.status !== 200) {
              throw new Error("Failed to transcribe audio");
            }

            if (response.data) {
              const newASRResponse = response.data.text;
              res.status(200).json({
                transcript: newASRResponse,
              });
            } else {
              res.status(500).json({
                error: "Failed to transcribe audio.",
              });
            } // eslint-disable-next-line  @typescript-eslint/no-explicit-any
          } catch (error: unknown) {
            handleError(error, res);
          }
        }
      );
      const handleError = (error: unknown, res: functions.Response) => {
        logger.error("Transcription failed", {
          status: isAxiosError(error) ? error.response?.status : null,
        });
        res.status(502).json({ error: "Error occurred while transcribing" });
      };

      busboy.end(req.rawBody);
    }
  });
});

export const callGPTAPI = apiFunctions.https.onCall(async (data, context) => {
  const { inputText, promptContent, gptModel } = data;
  const content = {
    model: gptModel === "gpt-6.1-terra" ||
      gptModel === "gpt-4o" || gptModel === "gpt-4" ?
      "gpt-6.1-terra" : "gpt-6-luna",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: `${promptContent} ${inputText}` },
    ],
    reasoning_effort: "low",
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
  };

  if (content) {
    const uid = context.auth?.uid;
    logger.info("User ID:", uid);
  }

  logger.info("gptModel:", gptModel);

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      content,
      { headers }
    );

    const message = response.data.choices[0]?.message?.content?.trim();

    if (!message) {
      throw new Error("Empty GPT response");
    }
    return { message };
  } catch (error) {
    logger.error("GPT request failed", {
      status: isAxiosError(error) ? error.response?.status : null,
    });
    throw new functions.https.HttpsError("internal", "Failed to call GPT API");
  }
});

export const addDefaultPrompts = functions.https.onCall(
  async (data, context) => {
    const userId = context.auth?.uid;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The request does not have valid authentication credentials."
      );
    }

    const db = admin.firestore();

    try {
      await db.doc(`Prompts/${userId}/prompt/blank`).set({
        promptContent: "",
      });
      await db.doc(`Prompts/${userId}/prompt/present illness`).set({
        promptContent:
          "You are a doctor helper. The following text is oral history. " +
          "Please transform the following text as a professional medical note "+
          "of present illness of admission note in English.",
      });
      await db.doc(`Prompts/${userId}/prompt/take history`).set({
        promptContent:
          "The following texts is the conversation of a patient and a doctor. "+
          "please summary the history of this patient it as a present" +
          "illness part of admission note",
      });
      await db.doc(`Prompts/${userId}/prompt/ask medical`).set({
        promptContent:
          "You are a medical assistant. Please answer the question based on  " +
          "clinical research results and provide detailed explanations. " +
          "No need for disclaimers.",
      });
    } catch (error) {
      logger.error("Failed to create Prompts:", error);
      if (error instanceof Error) {
        throw new functions.https.HttpsError("unknown", error.message);
      }
    }
    return { success: true };
  }
);
