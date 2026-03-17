import News from "../models/News.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

/**
 * Submit quiz answers for an article
 * POST /api/quiz/submit
 * Protected: Requires authentication
 *
 * Logic:
 * 1. Validate input (articleId, answers array)
 * 2. Fetch article from database
 * 3. Verify quiz exists
 * 4. Compare user answers with correct answers
 * 5. Calculate score
 * 6. Return detailed results
 */
export const submitQuiz = asyncHandler(async (req, res, next) => {
  const { articleId, answers } = req.body;
  const userId = req.user?.userId;

  // Validation: articleId required
  if (!articleId) {
    throw new AppError("Please provide an article ID", 400);
  }

  // Validation: answers required
  if (!answers) {
    throw new AppError("Please provide answers", 400);
  }

  // Validation: answers must be an array
  if (!Array.isArray(answers)) {
    throw new AppError("Answers must be an array", 400);
  }

  // Validation: answers cannot be empty
  if (answers.length === 0) {
    throw new AppError("Please provide at least one answer", 400);
  }

  // Fetch article from database
  const article = await News.findById(articleId);

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  if (!article.quiz || article.quiz.length === 0) {
    throw new AppError("This article does not have a quiz", 400);
  }

  // Validate answer count matches quiz questions
  if (answers.length !== article.quiz.length) {
    throw new AppError(
      `Expected ${article.quiz.length} answers but received ${answers.length}`,
      400,
    );
  }

  // Validate each answer is A, B, C, or D
  const validAnswers = ["A", "B", "C", "D"];
  for (let i = 0; i < answers.length; i++) {
    if (!validAnswers.includes(answers[i])) {
      throw new AppError(
        `Question ${i + 1}: Answer must be A, B, C, or D. Received: ${answers[i]}`,
        400,
      );
    }
  }

  // Calculate results
  let correctCount = 0;
  const questionResults = [];

  for (let i = 0; i < article.quiz.length; i++) {
    const question = article.quiz[i];
    const userAnswer = answers[i];
    const isCorrect = userAnswer === question.answer;

    if (isCorrect) {
      correctCount++;
    }

    questionResults.push({
      questionNumber: i + 1,
      question: question.question,
      options: question.options,
      userAnswer: userAnswer,
      correctAnswer: question.answer,
      isCorrect: isCorrect,
    });
  }

  // Calculate percentage
  const totalQuestions = article.quiz.length;
  const scorePercentage = Math.round((correctCount / totalQuestions) * 100);

  // Determine result level
  let resultLevel = "Poor";
  if (scorePercentage >= 80) resultLevel = "Excellent";
  else if (scorePercentage >= 60) resultLevel = "Good";
  else if (scorePercentage >= 40) resultLevel = "Average";

  // Build response
  const response = {
    success: true,
    message: "Quiz submitted successfully",
    data: {
      articleId: article._id,
      headline: article.headline,
      score: correctCount,
      total: totalQuestions,
      percentage: scorePercentage,
      resultLevel: resultLevel,
      submittedAt: new Date(),
      questions: questionResults,
    },
  };

  // Add user ID if authenticated (optional for analytics)
  if (userId) {
    response.data.userId = userId;
  }

  res.status(200).json(response);
});

/**
 * Get quiz for an article (without answers)
 * GET /api/quiz/:articleId
 * Public: No authentication required
 *
 * Returns quiz questions with options but NOT answers
 * Used by frontend to display quiz
 */
export const getQuizForArticle = asyncHandler(async (req, res, next) => {
  const { articleId } = req.params;

  // Fetch article
  const article = await News.findById(articleId).select("headline quiz date");

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  if (!article.quiz || article.quiz.length === 0) {
    throw new AppError("This article does not have a quiz", 404);
  }

  // Format quiz without answers (for frontend display)
  const quizData = article.quiz.map((q, index) => ({
    questionNumber: index + 1,
    question: q.question,
    options: q.options,
    // Answer NOT included - user must submit to see results
  }));

  res.status(200).json({
    success: true,
    message: "Quiz retrieved successfully",
    data: {
      articleId: article._id,
      headline: article.headline,
      date: article.date,
      totalQuestions: article.quiz.length,
      questions: quizData,
    },
  });
});

/**
 * Get quiz answers (admin/review only)
 * GET /api/quiz/:articleId/answers
 * Protected: Requires admin authentication (future implementation)
 *
 * Returns quiz with correct answers
 * Used for reviewing/grading
 */
export const getQuizAnswers = asyncHandler(async (req, res, next) => {
  const { articleId } = req.params;

  // Fetch article
  const article = await News.findById(articleId).select("headline quiz date");

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  if (!article.quiz || article.quiz.length === 0) {
    throw new AppError("This article does not have a quiz", 404);
  }

  // Format quiz with answers
  const quizData = article.quiz.map((q, index) => ({
    questionNumber: index + 1,
    question: q.question,
    options: q.options,
    correctAnswer: q.answer, // Answer included
  }));

  res.status(200).json({
    success: true,
    message: "Quiz answers retrieved successfully",
    data: {
      articleId: article._id,
      headline: article.headline,
      date: article.date,
      totalQuestions: article.quiz.length,
      questions: quizData,
    },
  });
});

/**
 * Get quiz statistics for an article
 * GET /api/quiz/stats/:articleId
 * Public: Shows how many users attempted and average score
 *
 * Future enhancement: Track quiz submissions to database
 */
export const getQuizStats = asyncHandler(async (req, res, next) => {
  const { articleId } = req.params;

  // Fetch article
  const article = await News.findById(articleId).select("headline quiz");

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  if (!article.quiz || article.quiz.length === 0) {
    throw new AppError("This article does not have a quiz", 404);
  }

  // Future: Query quiz submissions from database
  // For now, return basic stats
  res.status(200).json({
    success: true,
    message: "Quiz statistics retrieved successfully",
    data: {
      articleId: article._id,
      headline: article.headline,
      totalQuestions: article.quiz.length,
      // Future fields:
      // totalAttempts: number,
      // averageScore: number,
      // passRate: percentage,
      // difficultyLevel: "Easy" | "Medium" | "Hard"
    },
  });
});

/**
 * Get quiz difficulty analysis
 * POST /api/quiz/analysis
 * Internal: Analyze quiz based on options (future ML feature)
 *
 * Could analyze:
 * - Question difficulty (based on plausibility of wrong answers)
 * - Average student performance
 * - Discriminative power (distinguishes high/low scorers)
 */
export const analyzeQuiz = asyncHandler(async (req, res, next) => {
  const { articleId } = req.params;

  const article = await News.findById(articleId).select("headline quiz");

  if (!article) {
    throw new AppError("Article not found", 404);
  }

  if (!article.quiz || article.quiz.length === 0) {
    throw new AppError("This article does not have a quiz", 404);
  }

  // Basic analysis (future: add ML-based difficulty assessment)
  const analysis = {
    articleId: article._id,
    headline: article.headline,
    totalQuestions: article.quiz.length,
    analysis: {
      avgQuestionLength: Math.round(
        article.quiz.reduce((sum, q) => sum + q.question.length, 0) /
          article.quiz.length,
      ),
      optionsFormat: "Always 4 options (A, B, C, D)",
      // Future metrics:
      // estimatedDifficulty: "Medium",
      // discriminativePower: 0.7,
      // suggestedTime: "10-15 minutes"
    },
  };

  res.status(200).json({
    success: true,
    message: "Quiz analysis completed",
    data: analysis,
  });
});
