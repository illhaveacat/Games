/**
 * @typedef {Object} DialogueRequest
 * @property {string} speakerId
 * @property {string} text
 */

/**
 * @typedef {Object} DialogueResponse
 * @property {string} speakerId
 * @property {string} text
 * @property {number} timestamp
 */

/** @returns {DialogueRequest} */
export function createDialogueRequest({ speakerId, text }) {
  if (typeof speakerId !== "string" || speakerId === "") {
    throw new Error("speakerId 不能为空");
  }
  if (typeof text !== "string" || text === "") {
    throw new Error("text 不能为空");
  }
  return { speakerId, text };
}

/** @returns {DialogueResponse} */
export function createDialogueResponse({ speakerId, text, timestamp = Date.now() }) {
  if (typeof speakerId !== "string" || speakerId === "") {
    throw new Error("speakerId 不能为空");
  }
  if (typeof text !== "string" || text === "") {
    throw new Error("text 不能为空");
  }
  return { speakerId, text, timestamp };
}
