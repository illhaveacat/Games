export interface DialogueRequest {
  speakerId: string;
  text: string;
}

export interface DialogueResponse {
  speakerId: string;
  text: string;
  timestamp: number;
}

export function createDialogueRequest(input: { speakerId: string; text: string }): DialogueRequest {
  const { speakerId, text } = input;
  if (typeof speakerId !== "string" || speakerId === "") {
    throw new Error("speakerId 不能为空");
  }
  if (typeof text !== "string" || text === "") {
    throw new Error("text 不能为空");
  }
  return { speakerId, text };
}

export function createDialogueResponse(
  input: { speakerId: string; text: string; timestamp?: number },
): DialogueResponse {
  const { speakerId, text, timestamp = Date.now() } = input;
  if (typeof speakerId !== "string" || speakerId === "") {
    throw new Error("speakerId 不能为空");
  }
  if (typeof text !== "string" || text === "") {
    throw new Error("text 不能为空");
  }
  return { speakerId, text, timestamp };
}
