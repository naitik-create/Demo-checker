import sdk from "microsoft-cognitiveservices-speech-sdk";
import { readFileSync } from "fs";

function assertSpeechConfig() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    const err = new Error("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be configured.");
    err.status = 500;
    throw err;
  }
  return { key, region };
}

/**
 * Transcribe local audio file via Azure Speech SDK.
 * Notes:
 * - Diarization support depends on SDK/runtime/audio format.
 * - mp3/mp4 may require GStreamer on host; wav works most reliably.
 */
export async function transcribeAudioFile({ filePath, locale = "en-US" }) {
  const { key, region } = assertSpeechConfig();
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = locale;
  speechConfig.outputFormat = sdk.OutputFormat.Detailed;
  speechConfig.requestWordLevelTimestamps();

  // Enable punctuation + diarization hints (best effort).
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
    "TrueText"
  );
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults,
    "true"
  );

  const audioConfig = sdk.AudioConfig.fromWavFileInput(readFileSync(filePath));
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  const lines = [];
  const speakers = [];

  await new Promise((resolve, reject) => {
    recognizer.recognized = (_sender, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      const text = e.result.text?.trim();
      if (!text) return;
      lines.push(text);
      const json = e.result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
      if (json) {
        try {
          const parsed = JSON.parse(json);
          const speaker = parsed?.SpeakerId || parsed?.NBest?.[0]?.SpeakerId || null;
          if (speaker != null) speakers.push(String(speaker));
        } catch {
          // ignore parse issues
        }
      }
    };
    recognizer.canceled = (_sender, e) => {
      reject(new Error(e.errorDetails || "Azure Speech canceled"));
    };
    recognizer.sessionStopped = () => {
      resolve();
    };
    recognizer.startContinuousRecognitionAsync(
      () => {},
      (err) => reject(new Error(err))
    );
  }).finally(() => {
    recognizer.stopContinuousRecognitionAsync(
      () => recognizer.close(),
      () => recognizer.close()
    );
  });

  const transcript = lines.join("\n");
  return {
    transcript,
    speakerHints: [...new Set(speakers)]
  };
}

