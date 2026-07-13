/* ============================================================
   quiz.js — self-check quizzes for lesson pages.
   Markup:
     <div class="quiz" data-answer="b">
       <p class="q">Question?</p>
       <button class="opt" data-k="a">…</button>
       <button class="opt" data-k="b">…</button>
       <p class="explain hidden">Why b is right.</p>
     </div>
   Wrong picks are marked and stay clickable; the right pick
   locks the quiz and reveals the explanation.
   ============================================================ */

document.querySelectorAll(".quiz").forEach(quiz => {
  const answer = quiz.dataset.answer;
  quiz.querySelectorAll("button.opt").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.k === answer) {
        btn.classList.add("right");
        btn.textContent = "✓ " + btn.textContent;
        quiz.querySelectorAll("button.opt").forEach(b => { b.disabled = true; });
        const ex = quiz.querySelector(".explain");
        if (ex) ex.classList.remove("hidden");
      } else {
        btn.classList.add("wrong");
        btn.disabled = true;
      }
    });
  });
});
