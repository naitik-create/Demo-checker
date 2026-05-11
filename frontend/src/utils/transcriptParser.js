/**
 * Parses transcript files into plain text for analysis.
 * Supported formats: .txt, .srt, .json, .docx / .doc
 */

function parseSrt(raw) {
  return raw
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.trim().split("\n");
      return lines
        .filter((l) => !/^\d+$/.test(l.trim()))                           // strip sequence numbers
        .filter((l) => !/\d{2}:\d{2}:\d{2}[,.:]\d{3}\s*-->/.test(l))    // strip timing lines
        .join(" ")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
}

function extractJsonLines(data) {
  const lines = [];

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object" || node === null) return;

    // Extract speaker + text from common transcript schemas
    const speaker =
      node.speaker ||
      node.name ||
      node.displayName ||
      node.from?.displayName ||
      node.participantName ||
      "";
    const body =
      node.text ||
      node.content ||
      node.body ||
      node.transcript ||
      node.message ||
      "";

    if (body) {
      lines.push(speaker ? `${speaker}: ${body}` : body);
      return;
    }

    // Recurse into common container keys
    for (const key of ["entries", "items", "transcripts", "content", "value", "messages", "utterances", "segments"]) {
      if (Array.isArray(node[key])) {
        node[key].forEach(walk);
        return;
      }
    }

    // Recurse all object values as a fallback
    Object.values(node).forEach((v) => {
      if (typeof v === "object") walk(v);
    });
  }

  walk(data);
  return lines;
}

function parseJson(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON — could not parse file.");
  }

  const lines = extractJsonLines(data);
  if (lines.length) return lines.join("\n");

  // Last resort: readable stringify
  return JSON.stringify(data, null, 2);
}

async function parseDocx(file) {
  // mammoth is dynamically imported so it's only bundled when needed
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  if (!result.value.trim()) throw new Error("No readable text found inside the DOCX file.");
  return result.value;
}

/**
 * @param {File} file
 * @returns {Promise<string>} extracted plain text
 */
export async function parseTranscriptFile(file) {
  const ext = (file.name || "").split(".").pop().toLowerCase();

  if (ext === "txt") {
    return file.text();
  }

  if (ext === "srt") {
    const raw = await file.text();
    const parsed = parseSrt(raw);
    if (!parsed.trim()) throw new Error("No subtitle text found in the SRT file.");
    return parsed;
  }

  if (ext === "json") {
    const raw = await file.text();
    const parsed = parseJson(raw);
    if (!parsed.trim()) throw new Error("No transcript text found in the JSON file.");
    return parsed;
  }

  if (ext === "docx" || ext === "doc") {
    return parseDocx(file);
  }

  throw new Error(`Unsupported format ".${ext}". Supported: .txt  .srt  .json  .docx`);
}
