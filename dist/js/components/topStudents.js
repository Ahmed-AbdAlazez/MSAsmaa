/**
 * topStudents.js
 * ---------------------------------------------------------------------------
 * Renders the homepage "أوائل الطلاب على مر السنين" auto-scrolling marquee.
 *
 * Data comes from /js/topStudentsData.js (window.TOP_STUDENTS) — drop real
 * entries in there, this file never changes.
 *
 * How the loop works (performance-friendly):
 *   - The card list is duplicated once into a single flex track.
 *   - The track is animated purely with CSS (transform translateX 0 → -50%),
 *     so every frame stays on the compositor thread — no JS on every frame.
 *   - Because the track is exactly two identical halves, -50% snaps to the
 *     same visual position (seamless infinite loop, no visible jump).
 *   - Each card carries its own trailing margin so the two halves line up
 *     exactly at the -50% point.
 *
 * Pausing:
 *   - Desktop: CSS .top-students-marquee:hover pauses the animation.
 *   - Touch: pointerenter/pointerleave pause while the finger is down.
 *   - Reduced motion: CSS disables the animation and the strip becomes a
 *     normal touch-scrollable row.
 */
(function () {
  var marquee = document.getElementById("top-students-marquee");
  var data = window.TOP_STUDENTS;
  if (!marquee || !Array.isArray(data) || data.length === 0) return;

  function buildCard(student) {
    var card = document.createElement("div");
    card.className = "top-student-card";

    var avatar = document.createElement("div");
    avatar.className = "top-student-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = (student.name || "").trim().charAt(0) || "ط";

    var name = document.createElement("div");
    name.className = "top-student-name";
    name.textContent = student.name || "";

    var year = document.createElement("span");
    year.className = "top-student-year";
    year.textContent = student.year || "";

    var achievement = document.createElement("div");
    achievement.className = "top-student-achievement";
    achievement.textContent = student.achievement || "";

    card.appendChild(avatar);
    card.appendChild(name);
    card.appendChild(year);
    card.appendChild(achievement);
    return card;
  }

  var track = document.createElement("div");
  track.className = "top-students-track";

  data.forEach(function (student) {
    track.appendChild(buildCard(student));
  });

  // Second identical half, marked aria-hidden so screen readers only hear
  // each student once.
  data.forEach(function (student) {
    var card = buildCard(student);
    card.setAttribute("aria-hidden", "true");
    track.appendChild(card);
  });

  marquee.appendChild(track);

  // Pause while the pointer (mouse or finger) rests on the marquee.
  ["pointerenter", "pointerleave"].forEach(function (eventName) {
    marquee.addEventListener(eventName, function (event) {
      track.style.animationPlayState =
        event.type === "pointerenter" ? "paused" : "";
    });
  });
})();