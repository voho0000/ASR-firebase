import * as functions from "firebase-functions";
import * as logger from "firebase-functions/logger";
import * as Busboy from "busboy";
import { Stream } from "stream";
import * as FormData from "form-data"; // <-- make sure to import this
import axios from "axios";
import * as admin from "firebase-admin";
import * as cors from "cors";

admin.initializeApp();

type FileInfo = {
  filename: string;
  encoding: string;
  mimeType: string;
};

const OPENAI_API_KEY = functions.config().openai.key;

const corsHandler = cors({ origin: true });

export const uploadFile = functions.https.onRequest((req, res) => {
  // Use cors middleware
  corsHandler(req, res, () => {
    if (req.method !== "POST") {
      // Only allow POST
      res.status(405).send("Only allowed POST");
    } else {
      // eslint-disable-next-line new-cap
      const busboy = Busboy({ headers: req.headers });

      let prompt: string;
      // let patientId: string;
      // let userId: string;

      busboy.on("field", (fieldname, value) => {
        // Capture the fields
        if (fieldname === "prompt") {
          prompt = value;
        } // else if (fieldname === "patientId") {
        //   patientId = value;
        // } else if (fieldname === "userId") {
        //   userId = value;
        // }
      });

      busboy.on(
        "file",
        async (fieldname: string, file: Stream, fileinfo: FileInfo) => {
          const formData = new FormData();
          // Append the file to formData
          formData.append("file", file, {
            filename: fileinfo.filename,
            contentType: fileinfo.mimeType,
          });
          // Append the model
          formData.append("model", "whisper-1");
          if (prompt) {
            formData.append("prompt", prompt);
            logger.info("Prompt:", prompt);
          }
          const headers = { Authorization: `Bearer ${OPENAI_API_KEY}` };

          try {
            const response = await axios.post(
              "https://api.openai.com/v1/audio/transcriptions",
              formData,
              { headers: headers }
            );

            // Check for successful response status
            if (response.status !== 200) {
              console.error("Failed to transcribe audio:", response.data);
              throw new Error("Failed to transcribe audio");
            }

            if (response.data) {
              const newASRResponse = response.data.text;
              // console.log(`Audio transcription: ${response.data.text}`);
              res.status(200).json({
                transcript: newASRResponse,
              }); // Send back the transcribed text
              logger.info("transcript:", newASRResponse);

              // Next version
              // try {
              //   // Check user authentication
              //   if (!userId) {
              //     throw new Error("User not authenticated, please log in");
              //   }

              //   const db = admin.firestore();
              //   const patientRecordRef = db
              //     .collection("PatientRecords")
              //     .doc(userId)
              //     .collection("PatientRecord")
              //     .doc(patientId);

              //   // Fetch the existing data
              //   const patientRecordSnap = await patientRecordRef.get();

              //   if (!patientRecordSnap.exists) {
              //     throw new Error(`Fail to get patient record:${patientId}`);
              //   }

              //   const existingASRResponse =
              //     patientRecordSnap.data()?.asrResponse || "";

              //   // Concatenate the new response to the existing response
              //   const updatedASRResponse =
              //     existingASRResponse + " " + newASRResponse;

              //   // Update the document with the new asrResponse
              //   await patientRecordRef.update({
              //     asrResponse: updatedASRResponse,
              //   });
              // } catch (error) {
              //   console.error(error); // handle the error as needed
              //   throw error; // re-throw the error after handling it
              // }
            } else {
              console.log("Failed to transcribe audio:", response.data);
              res.status(500).json({
                error: "Failed to transcribe audio.",
              });
            } // eslint-disable-next-line  @typescript-eslint/no-explicit-any
          } catch (error: any) {
            handleError(error, res);
          }
        }
      );
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
      const handleError = (error: any, res: any) => {
        console.error("Error during transcription:", error);
        if (error.response) {
          console.error(error.response.data);
          console.error(error.response.status);
          console.error(error.response.headers);
        } else if (error.request) {
          console.error(error.request);
        } else {
          console.error("Error", error.message);
        }
        res.status(500).json({ error: "Error occurred while transcribing" });
      };

      busboy.end(req.rawBody);
    }
  });
});

export const callGPTAPI = functions.https.onCall(async (data, context) => {
  logger.info("Received data:", data);
  const { inputText, promptContent, gptModel } = data;
  const content = {
    model: gptModel,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: `${promptContent} ${inputText}` },
    ],
    temperature: 0.5,
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${OPENAI_API_KEY}`,
  };

  if (content) {
    const uid = context.auth?.uid;
    logger.info("User ID:", uid);
  }

  logger.info("gptModel:", gptModel);
  logger.info("inputText:", inputText);
  logger.info("promptContent:", promptContent);

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      content,
      { headers }
    );

    // Log the response from the API using the Firebase Functions logger
    logger.info("API Response:", response.data);

    // Extract the message from the response
    const message = response.data.choices[0]?.message?.content?.trim();
    logger.info("Response Message:", message);

    return { message };
  } catch (error) {
    logger.error("Failed to call GPT API:", error);
    throw new functions.https.HttpsError("internal", "Failed to call GPT API");
  }
});

export const addDefaultPrompts = functions.https.onCall(
  async (data, context) => {
    // Ensure that the user is authenticated
    const userId = context.auth?.uid;

    if (!userId) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The request does not have valid authentication credentials."
      );
    }

    const db = admin.firestore();

    try {
      // Create the default prompts for the authenticated user
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
