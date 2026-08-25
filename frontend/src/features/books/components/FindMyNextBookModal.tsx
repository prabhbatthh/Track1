import { ArrowRight, BookOpen, Check, PartyPopper, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { BookCard, ProgressBar } from '@/components/common';
import { LoadingState } from '@/components/feedback';
import { Button, EmptyState, Modal, Textarea } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import {
  useAuth,
  type RecommendationAnswers,
  type RecommendationQuiz,
  type RecommendationResult,
} from '@/providers/AuthProvider';

export interface FindMyNextBookModalProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'loading' | 'initial' | 'quiz' | 'submitting' | 'results' | 'load_error' | 'submit_error';
type SubmitMode = 'quiz' | 'describe';

const DESCRIBE_MAX_LENGTH = 500;

export function FindMyNextBookModal({ open, onClose }: FindMyNextBookModalProps) {
  const { t } = useTranslation();
  const { getRecommendationQuiz, submitRecommendationQuiz, describeRecommendation } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [quiz, setQuiz] = useState<RecommendationQuiz | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<RecommendationAnswers>({});
  const [description, setDescription] = useState('');
  const [submitMode, setSubmitMode] = useState<SubmitMode>('quiz');
  const [result, setResult] = useState<RecommendationResult | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPhase('loading');
      setQuiz(null);
      setQuestionIndex(0);
      setAnswers({});
      setDescription('');
      setResult(null);
    }
  }

  useEffect(() => {
    if (!open) return;

    let ignore = false;
    getRecommendationQuiz()
      .then((response) => {
        if (ignore) return;
        setQuiz(response);
        setQuestionIndex(0);
        setAnswers({});
        setResult(null);
        setPhase('initial');
      })
      .catch((error: unknown) => {
        if (ignore) return;
        toast.error(getErrorMessage(error, t('books.quiz.loadError')));
        setPhase('load_error');
      });

    return () => {
      ignore = true;
    };
  }, [open, getRecommendationQuiz, t]);

  async function loadQuiz() {
    setPhase('loading');
    try {
      const response = await getRecommendationQuiz();
      setQuiz(response);
      setPhase('initial');
    } catch (error) {
      toast.error(getErrorMessage(error, t('books.quiz.loadError')));
      setPhase('load_error');
    }
  }

  async function submit(finalAnswers: RecommendationAnswers) {
    setSubmitMode('quiz');
    setPhase('submitting');
    try {
      const response = await submitRecommendationQuiz(finalAnswers);
      setResult(response);
      setPhase('results');
    } catch (error) {
      toast.error(getErrorMessage(error, t('books.quiz.submitError')));
      setPhase('submit_error');
    }
  }

  async function submitDescription(text: string) {
    setSubmitMode('describe');
    setPhase('submitting');
    try {
      const response = await describeRecommendation(text);
      setResult(response);
      setPhase('results');
    } catch (error) {
      toast.error(getErrorMessage(error, t('books.quiz.submitError')));
      setPhase('submit_error');
    }
  }

  function retry() {
    if (submitMode === 'describe') {
      void submitDescription(description);
    } else {
      void submit(answers);
    }
  }

  function toggleOption(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const existing = prev[questionId as keyof RecommendationAnswers];
      let currentList: string[] = [];
      if (Array.isArray(existing)) {
        currentList = existing;
      } else if (typeof existing === 'string' && existing.length > 0) {
        currentList = [existing];
      }

      if (optionId === 'no_preference') {
        return { ...prev, [questionId]: ['no_preference'] };
      }

      const filtered = currentList.filter((id) => id !== 'no_preference');
      if (filtered.includes(optionId)) {
        const next = filtered.filter((id) => id !== optionId);
        return { ...prev, [questionId]: next.length > 0 ? next : ['no_preference'] };
      } else {
        return { ...prev, [questionId]: [...filtered, optionId] };
      }
    });
  }

  function goNext() {
    if (!quiz) return;
    const isLastQuestion = questionIndex === quiz.questions.length - 1;
    if (isLastQuestion) {
      void submit(answers);
      return;
    }
    setQuestionIndex((index) => index + 1);
  }

  function goBack() {
    if (questionIndex === 0) {
      setPhase('initial');
    } else {
      setQuestionIndex((index) => Math.max(0, index - 1));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('books.quiz.title')}
      blocking={phase === 'submitting'}
      className={phase === 'results' ? 'max-w-2xl' : undefined}
    >
      <div className="flex flex-col gap-4">
        {phase === 'loading' && <LoadingState variant="section" label={t('books.quiz.loading')} />}

        {phase === 'load_error' && (
          <EmptyState
            icon={Sparkles}
            title={t('books.quiz.loadError')}
            action={<Button onClick={() => void loadQuiz()}>{t('books.quiz.retry')}</Button>}
          />
        )}

        {phase === 'initial' && quiz && quiz.questions.length === 0 && (
          <>
            <EmptyState
              icon={BookOpen}
              title={t('books.quiz.notEnoughBooksTitle')}
              description={t('books.quiz.notEnoughBooksDescription')}
            />
            <Button onClick={onClose}>{t('books.quiz.done')}</Button>
          </>
        )}

        {phase === 'initial' && quiz && quiz.questions.length > 0 && (
          <div className="flex flex-col gap-5 py-1">
            <DescribeBox
              value={description}
              onChange={setDescription}
              onSubmit={() => void submitDescription(description)}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 px-1">
              <span className="text-sm text-muted-foreground font-medium">
                {t('books.quiz.moodPrompt', 'Not clear about your mood yet?')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuestionIndex(0);
                  setPhase('quiz');
                }}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors group"
              >
                <span>{t('books.quiz.takeQuizLink', 'Take the 30-sec Quiz')}</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        )}

        {phase === 'quiz' && quiz && quiz.questions.length > 0 && (
          <QuizStep
            quiz={quiz}
            questionIndex={questionIndex}
            answers={answers}
            onToggle={toggleOption}
            onBack={goBack}
            onNext={goNext}
          />
        )}

        {phase === 'submitting' && (
          <LoadingState variant="section" label={t('books.quiz.finding')} />
        )}

        {phase === 'submit_error' && (
          <EmptyState
            icon={Sparkles}
            title={t('books.quiz.submitError')}
            action={<Button onClick={retry}>{t('books.quiz.retry')}</Button>}
          />
        )}

        {phase === 'results' && result && <ResultsStep result={result} onClose={onClose} />}
      </div>
    </Modal>
  );
}

interface QuizStepProps {
  quiz: RecommendationQuiz;
  questionIndex: number;
  answers: RecommendationAnswers;
  onToggle: (questionId: string, optionId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function QuizStep({ quiz, questionIndex, answers, onToggle, onBack, onNext }: QuizStepProps) {
  const { t } = useTranslation();
  const question = quiz.questions[questionIndex];
  const total = quiz.questions.length;
  const isLastQuestion = questionIndex === total - 1;

  const rawSelected = answers[question.id as keyof RecommendationAnswers];
  const selectedList: string[] = Array.isArray(rawSelected)
    ? rawSelected
    : typeof rawSelected === 'string'
    ? [rawSelected]
    : [];

  return (
    <>
      <ProgressBar
        percent={((questionIndex + 1) / total) * 100}
        label={t('books.quiz.questionProgress', { current: questionIndex + 1, total })}
      />
      <div>
        <p className="text-sm font-medium text-foreground">{question.prompt}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('books.quiz.multiSelectHint', 'Select one or more options')}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {question.options.map((option) => {
          const isSelected = selectedList.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              data-testid="quiz-option"
              onClick={() => onToggle(question.id, option.id)}
              className={
                'flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ' +
                (isSelected
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-foreground hover:bg-secondary')
              }
            >
              <span>{option.label}</span>
              <div
                className={
                  'flex size-5 shrink-0 items-center justify-center rounded border transition-colors ' +
                  (isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background')
                }
              >
                {isSelected && <Check className="size-3.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onBack}>
          {t('books.quiz.back')}
        </Button>
        <Button onClick={onNext}>
          {isLastQuestion ? t('books.quiz.seeRecommendations') : t('books.quiz.next')}
        </Button>
      </div>
    </>
  );
}

interface DescribeBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

function DescribeBox({ value, onChange, onSubmit }: DescribeBoxProps) {
  const { t } = useTranslation();
  const canSubmit = value.trim().length > 0;

  const SAMPLE_PROMPTS = [
    'Cozy mystery, short read',
    'Fast-paced sci-fi adventure',
    'Heartwarming classic',
  ];

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Wand2 className="size-5 text-primary" />
        <span>{t('books.quiz.describe.heading', 'Describe what you want')}</span>
      </div>

      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={DESCRIBE_MAX_LENGTH}
        rows={4}
        placeholder={t(
          'books.quiz.describe.placeholder',
          'e.g. something like a cozy mystery, older, not too long',
        )}
        className="resize-none text-sm bg-background border-border min-h-[110px]"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {SAMPLE_PROMPTS.map((promptText) => (
            <button
              key={promptText}
              type="button"
              onClick={() => onChange(promptText)}
              className="rounded-full border border-primary/30 bg-background px-2.5 py-1 text-xs font-medium text-foreground/80 transition-colors hover:border-primary hover:text-primary hover:bg-primary/5"
            >
              + {promptText}
            </button>
          ))}
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="shrink-0 gap-1.5"
        >
          <Sparkles className="size-4" />
          <span>{t('books.quiz.describe.submit', 'Find Books')}</span>
        </Button>
      </div>
    </div>
  );
}

interface ResultsStepProps {
  result: RecommendationResult;
  onClose: () => void;
}

function ResultsStep({ result, onClose }: ResultsStepProps) {
  const { t } = useTranslation();

  if (result.items.length === 0) {
    return (
      <>
        <EmptyState icon={BookOpen} title={t('books.quiz.notEnoughBooksTitle')} description={result.message} />
        <Button onClick={onClose}>{t('books.quiz.done')}</Button>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <PartyPopper className="size-5 text-primary" />
        <p className="text-lg font-semibold text-foreground">{t('books.quiz.resultsTitle')}</p>
      </div>
      <p className="text-sm text-muted-foreground">{result.message}</p>
      <div className="grid max-h-[50vh] gap-4 overflow-y-auto sm:grid-cols-2">
        {result.items.map((item) => (
          <BookCard
            key={item.book.id}
            bookId={item.book.id}
            title={item.book.title}
            author={item.book.author}
            category={item.book.category}
            available={item.book.available}
            averageRating={item.book.average_rating}
            reviewCount={item.book.review_count}
            description={item.book.description}
            href={ROUTES.BOOK_DETAILS.replace(':bookId', item.book.id)}
          />
        ))}
      </div>
      <Button onClick={onClose}>{t('books.quiz.done')}</Button>
    </>
  );
}
