"use client";

import { useState } from "react";

const questions = [
  {
    question: "What exactly does Chroma do?",
    answer:
      "It turns a plain-English creative brief into a finished, coherent set of images. A planner builds a DAG, a scheduler runs it in parallel, image agents generate, a vision critic scores, and a composer assembles the final set.",
  },
  {
    question: "How is this different from a single image generator?",
    answer:
      "A single generator produces one image per prompt. Chroma produces a set that shares a visual language — same character, same palette, same lighting — by keeping the plan, the style, and the critique as first-class parts of the pipeline.",
  },
  {
    question: "What happens when an image scores below threshold?",
    answer:
      "The critic emits a regeneration event with specific feedback. The scheduler inserts a new image-generation node whose prompt appends the critic's issues as constraints. This is bounded at two attempts per node.",
  },
  {
    question: "Can I see how a result was reached?",
    answer:
      "Yes. Every node is inspectable on the canvas. Click a node to see its input, its output, its artifact, its score, and its timing. The full event log is replayable.",
  },
  {
    question: "Which models does it use?",
    answer:
      "Cloudflare Workers AI (FLUX schnell) for image generation, and Google Gemini for planning, style analysis, prompt writing, and vision critique. The provider layer is swappable.",
  },
  {
    question: "Is it open source?",
    answer: "Yes. The repo is public. Link in the header.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="faq-section section-space" id="faq">
      <div className="narrow-width">
        <header className="section-intro">
          <span className="eyebrow">FAQ</span>
          <h2 className="section-heading">Questions, answered</h2>
        </header>

        <div className="faq-list">
          {questions.map(({ question, answer }, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index + 1}`;

            return (
              <div
                className="faq-item"
                data-open={isOpen}
                key={question}
              >
                <button
                  className="faq-trigger"
                  id={`faq-question-${index + 1}`}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={answerId}
                  onClick={() =>
                    setOpenIndex((current) =>
                      current === index ? null : index,
                    )
                  }
                >
                  <span className="faq-question">{question}</span>
                  <svg
                    className="faq-chevron"
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </button>
                <div
                  className="faq-content"
                  id={answerId}
                  role="region"
                  aria-labelledby={`faq-question-${index + 1}`}
                  aria-hidden={!isOpen}
                >
                  <div className="faq-content-inner">
                    <p className="faq-answer">{answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
