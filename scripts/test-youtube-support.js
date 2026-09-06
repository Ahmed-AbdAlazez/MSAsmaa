/**
 * test-youtube-support.js
 * ---------------------------------------------------------------------------
 * Quick automated test script to verify YouTube URL validation and ID extraction.
 */

const { extractYouTubeId, validateYouTubeUrl } = require("../src/services/youtube.service.js");

const testCases = [
  { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ", expectedValid: true },
  { url: "https://youtu.be/dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ", expectedValid: true },
  { url: "https://www.youtube.com/embed/dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ", expectedValid: true },
  { url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ", expectedValid: true },
  { url: "dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ", expectedValid: true },
  { url: "https://google.com", expectedId: null, expectedValid: false },
  { url: "https://vimeo.com/12345678", expectedId: null, expectedValid: false },
  { url: "not-a-valid-youtube-id!", expectedId: null, expectedValid: false },
  { url: "", expectedId: null, expectedValid: false }
];

console.log("=== Testing YouTube Service Validation ===");
let passed = 0;

testCases.forEach((tc, idx) => {
  const result = validateYouTubeUrl(tc.url);
  const extracted = extractYouTubeId(tc.url);
  
  const isValidMatches = result.valid === tc.expectedValid;
  const isIdMatches = extracted === tc.expectedId;

  if (isValidMatches && isIdMatches) {
    console.log(`[PASS] Case ${idx + 1}: "${tc.url}" -> VideoID: ${extracted}`);
    passed++;
  } else {
    console.error(`[FAIL] Case ${idx + 1}: "${tc.url}" -> Expected ID: ${tc.expectedId}, got: ${extracted}`);
  }
});

console.log(`\nResults: ${passed}/${testCases.length} tests passed!`);
if (passed === testCases.length) {
  console.log("✅ All YouTube service validation tests passed perfectly!");
} else {
  process.exit(1);
}
