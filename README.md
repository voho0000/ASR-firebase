# Firebase Cloud Functions for Audio Transcription and GPT API Interaction

This project contains a collection of Firebase Cloud Functions that allow audio transcription through the OpenAI API and interaction with the GPT model.

## Features

- **uploadFile**: A function to transcribe audio files using the OpenAI API.
- **callGPTAPI**: A function to interact with a GPT model on OpenAI and receive a response.

## Prerequisites

- Node.js (Version as per your Firebase Functions configuration)
- Firebase CLI
- An OpenAI account with an API key

## Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/your-username/your-project.git
   cd your-project/functions
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Set up OpenAI API key in Firebase Functions configuration**:

   ```bash
   firebase functions:config:set openai.key="YOUR_OPENAI_API_KEY"
   ```

4. **Deploy Functions**:

   ```bash
   firebase deploy --only functions
   ```

## Functions

### uploadFile

- **Method**: POST
- **Description**: Transcribes an audio file using OpenAI's Whisper model.
- **URL**: [Firebase Function URL for uploadFile]

#### Request

- **Headers**: Standard multipart file upload headers.
- **Body**: Contains a file with the audio and optional prompt.

#### Response

- **Success**: JSON object containing the transcribed text.
- **Failure**: A 500 status code with a JSON error message.

### callGPTAPI

- **Method**: Callable Function
- **Description**: Sends text to a GPT model and receives a response.

#### Input

- `inputText`: Text to be processed by the model.
- `promptContent`: Prompt for the model.
- `gptModel`: The specific GPT model to be used.

#### Output

- **Success**: A message containing the response from the GPT model.
- **Failure**: A `functions.https.HttpsError` with an error message.

## Error Handling

Errors during the transcription or GPT model interaction are logged to the Firebase Functions log. If an error occurs, the client will receive a 500 status code and a JSON object describing the error.
