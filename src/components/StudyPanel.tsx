import { useEffect, useState } from "react";
import type { ChatMessage, Flashcard, Quiz, QuizQuestion } from "@shared/types";
import { useActiveSession, useHesion } from "../lib/hesion";
import { MessageList } from "./MessageList";
import { LoadingDots } from "./LoadingDots";
import {
  IconArrowLeft,
  IconArrowRight,
  IconClose,
  IconQuiz,
} from "./Icons";
import type { StudyPanelView } from "./TaskModeSelect";
import logoUrl from "../../assets/logo.png";
import logoDarkUrl from "../../assets/logo-dark.png";

export function StudyWorkspace({
  messages,
  view,
  onViewChange,
}: {
  messages: ChatMessage[];
  view: StudyPanelView;
  onViewChange: (view: StudyPanelView) => void;
}) {
  const { state } = useHesion();
  const session = useActiveSession();

  const cards = session?.flashcards ?? [];
  const quiz = state.activeQuiz;
  const studyError = state.studyError;
  const studying = state.studying;
  const buildingQuiz = studying && view === "quiz" && !quiz;

  useEffect(() => {
    if (quiz) onViewChange("quiz");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open quiz when a new one arrives
  }, [quiz?.id]);

  return (
    <div className="study-workspace">
      {studyError && (
        <div className="study-error" role="alert">
          {studyError}
        </div>
      )}

      <div className="study-main">
        {view === "chat" && <MessageList messages={messages} />}
        {view === "deck" && (
          <DeckView cards={cards} onClose={() => onViewChange("chat")} />
        )}
        {buildingQuiz && (
          <div className="study-pane study-building">
            <LoadingDots label="Building quiz" />
          </div>
        )}
        {view === "quiz" && quiz && (
          <QuizView
            quiz={quiz}
            onClose={() => {
              void window.hesion.clearActiveQuiz();
              onViewChange("chat");
            }}
            onRetake={() => {
              onViewChange("quiz");
              void window.hesion.generateQuiz();
            }}
          />
        )}
      </div>
    </div>
  );
}

function DeckView({
  cards,
  onClose,
}: {
  cards: Flashcard[];
  onClose: () => void;
}) {
  const { state } = useHesion();
  const light = state.config.theme === "light";
  const mark = light ? logoDarkUrl : logoUrl;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [cards.length === 0 ? "empty" : cards[0]?.id]);

  useEffect(() => {
    setFlipped(false);
  }, [index]);

  useEffect(() => {
    if (cards.length === 0) return;
    if (index >= cards.length) setIndex(Math.max(0, cards.length - 1));
  }, [cards.length, index]);

  const card = cards[index];
  const total = cards.length;

  return (
    <div className="study-pane study-deck-pane">
      <div className="study-pane-head">
        <span className="study-toolbar-meta">
          {total === 0 ? "0" : `${index + 1} / ${total}`}
        </span>
        <button
          type="button"
          className="icon-btn"
          title="Close"
          onClick={onClose}
        >
          <IconClose size={12} />
        </button>
      </div>

      <div className="study-deck-center">
        {total === 0 || !card ? (
          <div className="study-deck-empty" />
        ) : (
          <div className="study-deck">
            <button
              type="button"
              className="icon-btn study-deck-side study-deck-prev"
              title="Previous"
              disabled={index <= 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <IconArrowLeft size={14} />
            </button>

            <div className="study-deck-stage">
              <div className="study-deck-stack" aria-hidden>
                <div className="study-deck-stack-card" />
                <div className="study-deck-stack-card" />
              </div>
              <button
                type="button"
                className={`study-deck-card ${flipped ? "is-flipped" : ""}`}
                onClick={() => setFlipped((v) => !v)}
              >
                <img
                  className="study-deck-mark"
                  src={mark}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                />
                <span className="study-deck-card-face study-deck-card-front">
                  {card.front}
                </span>
                <span className="study-deck-card-face study-deck-card-back">
                  {card.back}
                </span>
              </button>
            </div>

            <button
              type="button"
              className="icon-btn study-deck-side study-deck-next"
              title="Next"
              disabled={index >= total - 1}
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            >
              <IconArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizView({
  quiz,
  onClose,
  onRetake,
}: {
  quiz: Quiz;
  onClose: () => void;
  onRetake: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const question: QuizQuestion | undefined = quiz.questions[index];
  const total = quiz.questions.length;

  useEffect(() => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  }, [quiz.id]);

  if (done) {
    return (
      <div className="study-pane">
        <div className="study-pane-head">
          <span className="study-quiz-summary">
            {score} / {total}
          </span>
          <button
            type="button"
            className="icon-btn"
            title="Close"
            onClick={onClose}
          >
            <IconClose size={12} />
          </button>
        </div>
        <div className="study-quiz-actions">
          <button
            type="button"
            className="icon-btn"
            title="New quiz"
            onClick={onRetake}
          >
            <IconQuiz size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (!question) return null;

  const revealed = picked !== null;

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (i === question!.correctIndex) setScore((s) => s + 1);
  }

  function next() {
    if (index + 1 >= total) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  return (
    <div className="study-pane">
      <div className="study-pane-head">
        <span className="study-toolbar-meta">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          className="icon-btn"
          title="Close"
          onClick={onClose}
        >
          <IconClose size={12} />
        </button>
      </div>
      <p className="study-quiz-prompt">{question.prompt}</p>
      <div className="study-quiz-choices">
        {question.choices.map((choice, i) => {
          let cls = "study-quiz-choice";
          if (revealed) {
            if (i === question.correctIndex) cls += " is-correct";
            else if (i === picked) cls += " is-wrong";
          } else if (picked === i) {
            cls += " is-active";
          }
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={revealed}
              onClick={() => choose(i)}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="study-quiz-feedback">
          {question.explanation && <p>{question.explanation}</p>}
          <button
            type="button"
            className="icon-btn"
            title={index + 1 >= total ? "See score" : "Next"}
            onClick={next}
          >
            <IconArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
